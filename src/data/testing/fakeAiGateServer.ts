// La compuerta 1 de la IA en memoria, para las pruebas (B12, 5 y 6.3). Imita las funciones de
// supabase/migrations/20261026000003_ai_gate.sql con sus mismas respuestas, sus códigos de error y las
// mismas reglas de 5.4 para decidir si un motor pasa, y la bandera ai_gate de platform_settings. Lo usan
// el doble de la nube de las pruebas unitarias y el Supabase simulado de las e2e (tests/e2e/support/
// fakeSupabase.ts), así las dos imitan exactamente lo mismo. Quién llama, con su rol y su dispositivo
// activo, lo revisa quien lo usa y lo pasa en cada llamada. Solo lo usan las pruebas.
import type { AiEngine, AiGateReview, AiGateState } from '@/engines/aiContracts';

type Json = Record<string, unknown>;

export type FakeGateReply = { data: unknown; error: null } | { data: null; error: GateError };
interface GateError {
  code: string;
  message: string;
}

export interface FakeGateCaller {
  userId: string;
  role: 'student' | 'physician' | 'admin' | 'owner';
  /** Con false, ai_gate_* contestan que este no es el dispositivo activo */
  activeDevice?: boolean;
  /** Con false, un admin_* contesta 42501, como un admin sin el segundo factor */
  isAdmin?: boolean;
}

interface Item {
  id: string;
  engine: AiEngine;
  model: string;
  effort: string | null;
  thinking: string | null;
  promptVersion: string;
  promptHash: string;
  sourceKind: string;
  input: unknown;
  output: unknown;
  position: number;
}

interface Sample {
  id: string;
  createdAt: string;
  createdBy: string;
  reviewers: [string, string];
  status: 'open' | 'closed';
  closedAt: string | null;
  verdict: Json | null;
  items: Item[];
}

export interface FakeAiGateServer {
  /** Atiende una función de la compuerta. null si el nombre no es de aquí */
  call(name: string, caller: FakeGateCaller, args: Readonly<Json>): FakeGateReply | null;
  /** La bandera ai_gate de platform_settings */
  readonly state: AiGateState;
  /** Cambia la bandera como lo haría un admin, sin pasar por las reglas, para armar un escenario */
  setState(next: AiGateState): void;
  /** Las reseñas de un médico, por id de texto */
  reviewsOf(userId: string): Map<string, AiGateReview>;
  sampleIds(): string[];
  /** Lo que ve cada cambio de la bandera, para que quien la sirva a /health la actualice */
  onStateChange: ((state: AiGateState) => void) | null;
}

const fail = (code: string, message: string): FakeGateReply => ({
  data: null,
  error: { code, message },
});
const ok = (data: unknown): FakeGateReply => ({ data, error: null });

const TEAM = new Set(['physician', 'admin', 'owner']);
const ENGINES: readonly AiEngine[] = [
  'forgetting',
  'weekly_report',
  'flashcards',
  'bias_tips',
  'restructure',
];

/** Un orden que cambia con el médico, como order by md5(uid || id). Lo único que importa es que difiera */
function seeded(userId: string, itemId: string): string {
  let hash = 2166136261;
  for (const char of `${userId}${itemId}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function createFakeAiGateServer(
  options: {
    now?: () => string;
    /** El rol de una cuenta, para revisar que los dos médicos sean del equipo */
    roleOf?: (userId: string) => string | undefined;
  } = {},
): FakeAiGateServer {
  const now = options.now ?? (() => new Date().toISOString());
  let state: AiGateState = { paused: false, engines: {} };
  const samples = new Map<string, Sample>();
  /** itemId|reviewerId a su reseña */
  const reviews = new Map<string, AiGateReview>();
  const key = (itemId: string, reviewerId: string) => `${itemId}|${reviewerId}`;

  const server: FakeAiGateServer = {
    get state() {
      return state;
    },
    setState(next) {
      state = next;
      server.onStateChange?.(state);
    },
    onStateChange: null,
    reviewsOf(userId) {
      const own = new Map<string, AiGateReview>();
      for (const [pair, review] of reviews) {
        const [itemId, reviewer] = pair.split('|');
        if (reviewer === userId && itemId) own.set(itemId, review);
      }
      return own;
    },
    sampleIds: () => [...samples.keys()],
    call(name, caller, args) {
      const handler = HANDLERS[name];
      return handler ? handler(caller, args) : null;
    },
  };

  const needsSession = (caller: FakeGateCaller): FakeGateReply | null =>
    caller.userId === '' ? fail('28000', 'Hace falta iniciar sesión') : null;
  const admin = (caller: FakeGateCaller, message: string): FakeGateReply | null =>
    caller.role === 'admin' || caller.role === 'owner'
      ? caller.isAdmin === false
        ? fail('42501', message)
        : null
      : fail('42501', message);
  const teamDevice = (caller: FakeGateCaller): FakeGateReply | null => {
    const session = needsSession(caller);
    if (session) return session;
    if (caller.activeDevice === false || !TEAM.has(caller.role)) {
      return fail('42501', 'La auditoría de la IA es del equipo médico');
    }
    return null;
  };

  /** El médico asignado de una muestra, o la respuesta con el error */
  function assertReviewer(
    caller: FakeGateCaller,
    sampleId: string,
  ): { sample: Sample } | { reply: FakeGateReply } {
    const denied = teamDevice(caller);
    if (denied) return { reply: denied };
    const sample = samples.get(sampleId);
    if (!sample) return { reply: fail('22023', 'Esa muestra no existe') };
    if (!sample.reviewers.includes(caller.userId)) {
      return { reply: fail('42501', 'Esta muestra no te toca calificarla') };
    }
    return { sample };
  }

  /** El veredicto por motor de 5.4, con las mismas cuentas que ai_gate_verdict */
  function verdictOf(sample: Sample): Json {
    const [first, second] = sample.reviewers;
    const engines: Json = {};
    for (const engine of ENGINES) {
      const items = sample.items.filter((item) => item.engine === engine);
      if (items.length === 0) continue;
      const n = items.length;
      const per = (reviewer: string) => {
        const own = items.flatMap((item) => reviews.get(key(item.id, reviewer)) ?? []);
        return {
          reviewed: own.length,
          grounded: own.filter((review) => review.grounded).length / n,
          approved: own.filter((review) => review.verdict !== 'rejected').length / n,
        };
      };
      const r1 = per(first);
      const r2 = per(second);
      const all = items.flatMap((item) =>
        sample.reviewers.flatMap((reviewer) => reviews.get(key(item.id, reviewer)) ?? []),
      );
      const severe = all.filter((review) => review.accuracy === 'severe').length;
      const safety = all.filter((review) => review.safetyIssue).length;
      const mean = (pick: (review: AiGateReview) => number) =>
        all.length === 0 ? 0 : all.reduce((sum, review) => sum + pick(review), 0) / all.length;
      const usefulness = mean((review) => review.usefulness);
      const clarity = mean((review) => review.clarity);

      const both = items.flatMap((item) => {
        const a = reviews.get(key(item.id, first));
        const b = reviews.get(key(item.id, second));
        return a && b ? [[a.verdict, b.verdict] as const] : [];
      });
      const agreement =
        both.length === 0 ? 0 : both.filter(([a, b]) => a === b).length / both.length;
      let kappa: number | null = null;
      if (both.length > 0) {
        const verdicts = ['approved', 'minor_changes', 'rejected'] as const;
        const pe = verdicts.reduce(
          (sum, verdict) =>
            sum +
            (both.filter(([a]) => a === verdict).length / both.length) *
              (both.filter(([, b]) => b === verdict).length / both.length),
          0,
        );
        if (pe < 1) kappa = round((agreement - pe) / (1 - pe), 4);
      }

      const reasons: string[] = [];
      if (r1.reviewed < n || r2.reviewed < n) reasons.push('incomplete');
      if (severe > 0) reasons.push('severe');
      if (safety > 0) reasons.push('safety');
      if (Math.min(r1.grounded, r2.grounded) < 0.97) reasons.push('grounded');
      if (Math.min(r1.approved, r2.approved) < 0.9) reasons.push('approved');
      if (usefulness < 3) reasons.push('usefulness');
      if (clarity < 3) reasons.push('clarity');
      if (agreement < 0.85) reasons.push('agreement');

      engines[engine] = {
        items: n,
        passed: reasons.length === 0,
        reasons,
        severe,
        safetyIssues: safety,
        groundedMin: round(Math.min(r1.grounded, r2.grounded), 4),
        approvedMin: round(Math.min(r1.approved, r2.approved), 4),
        usefulnessMean: round(usefulness, 2),
        clarityMean: round(clarity, 2),
        agreement: round(agreement, 4),
        kappa,
        reviewers: [
          {
            reviewerId: first,
            reviewed: r1.reviewed,
            grounded: round(r1.grounded, 4),
            approved: round(r1.approved, 4),
          },
          {
            reviewerId: second,
            reviewed: r2.reviewed,
            grounded: round(r2.grounded, 4),
            approved: round(r2.approved, 4),
          },
        ],
      };
    }
    return { sampleId: sample.id, engines };
  }

  const HANDLERS: Record<string, (caller: FakeGateCaller, args: Readonly<Json>) => FakeGateReply> =
    {
      ai_gate_my_samples(caller) {
        const denied = teamDevice(caller);
        if (denied) return denied;
        return ok(
          [...samples.values()]
            .filter(
              (sample) => sample.status === 'open' && sample.reviewers.includes(caller.userId),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((sample) => ({
              sampleId: sample.id,
              status: sample.status,
              createdAt: sample.createdAt,
            })),
        );
      },

      ai_gate_my_items(caller, args) {
        const found = assertReviewer(caller, String(args.p_sample));
        if ('reply' in found) return found.reply;
        const { sample } = found;
        const mine = server.reviewsOf(caller.userId);
        const items = [...sample.items].sort((a, b) =>
          seeded(caller.userId, a.id).localeCompare(seeded(caller.userId, b.id)),
        );
        return ok({
          sampleId: sample.id,
          status: sample.status,
          total: sample.items.length,
          reviewed: sample.items.filter((item) => mine.has(item.id)).length,
          items: items.map((item) => ({
            id: item.id,
            engine: item.engine,
            sourceKind: item.sourceKind,
            input: item.input,
            output: item.output,
            review: mine.get(item.id) ?? null,
          })),
        });
      },

      ai_gate_review(caller, args) {
        const itemId = String(args.p_item);
        const sample = [...samples.values()].find((entry) =>
          entry.items.some((item) => item.id === itemId),
        );
        if (!sample) return fail('22023', 'Ese texto no existe');
        const found = assertReviewer(caller, sample.id);
        if ('reply' in found) return found.reply;
        if (found.sample.status !== 'open') return fail('55000', 'La muestra ya se cerró');
        const review = args.p_review as AiGateReview | null;
        const valid =
          review !== null &&
          typeof review === 'object' &&
          ['correct', 'minor', 'severe'].includes(review.accuracy) &&
          typeof review.grounded === 'boolean' &&
          typeof review.safetyIssue === 'boolean' &&
          [1, 2, 3, 4].includes(review.usefulness) &&
          [1, 2, 3, 4].includes(review.clarity) &&
          ['approved', 'minor_changes', 'rejected'].includes(review.verdict) &&
          (review.comment === null ||
            (typeof review.comment === 'string' && review.comment.length <= 500)) &&
          Object.keys(review).every((field) =>
            [
              'accuracy',
              'grounded',
              'safetyIssue',
              'usefulness',
              'clarity',
              'verdict',
              'comment',
            ].includes(field),
          );
        if (!valid) return fail('22023', 'La reseña no tiene la forma de la rúbrica');
        const comment = review.comment?.trim();
        reviews.set(key(itemId, caller.userId), {
          ...review,
          comment: comment === undefined || comment === '' ? null : comment,
        });
        return ok(null);
      },

      admin_ai_gate_samples(caller) {
        const denied = admin(caller, 'Solo un administrador ve las muestras');
        if (denied) return denied;
        return ok(
          [...samples.values()]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((sample) => ({
              sampleId: sample.id,
              status: sample.status,
              createdAt: sample.createdAt,
              closedAt: sample.closedAt,
              reviewers: sample.reviewers,
              total: sample.items.length,
            })),
        );
      },

      admin_ai_gate_progress(caller, args) {
        const denied = admin(caller, 'Solo un administrador ve el avance');
        if (denied) return denied;
        const sample = samples.get(String(args.p_sample));
        if (!sample) return fail('22023', 'Esa muestra no existe');
        return ok({
          sampleId: sample.id,
          status: sample.status,
          total: sample.items.length,
          reviewers: sample.reviewers.map((reviewer) => {
            const own = sample.items.flatMap((item) => reviews.get(key(item.id, reviewer)) ?? []);
            return {
              reviewerId: reviewer,
              reviewed: own.length,
              severe: own.filter((review) => review.accuracy === 'severe').length,
            };
          }),
          closedAt: sample.closedAt,
          verdict: sample.verdict,
        });
      },

      admin_ai_gate_sample_create(caller, args) {
        const denied = admin(caller, 'Solo un administrador importa una muestra');
        if (denied) return denied;
        const file = args.p_sample as { version?: unknown; id?: unknown; items?: Item[] } | null;
        const reviewers = args.p_reviewers as string[] | null;
        const id = typeof file?.id === 'string' ? file.id : '';
        const sampleItems = Array.isArray(file?.items) ? file.items : [];
        if (
          file?.version !== 1 ||
          !/^[a-z0-9_-]{4,64}$/.test(id) ||
          sampleItems.length < 1 ||
          sampleItems.length > 400
        ) {
          return fail('22023', 'El archivo de la muestra no es válido');
        }
        if (
          reviewers?.length !== 2 ||
          !reviewers[0] ||
          !reviewers[1] ||
          reviewers[0] === reviewers[1]
        ) {
          return fail('22023', 'La muestra lleva exactamente dos médicos distintos');
        }
        const team = reviewers.every((reviewer) => {
          const role = options.roleOf?.(reviewer);
          return role === undefined ? true : TEAM.has(role);
        });
        if (!team) return fail('22023', 'Los dos revisores tienen que ser del equipo médico');
        if (samples.has(id)) return fail('23505', 'Esa muestra ya existe');
        samples.set(id, {
          id,
          createdAt: now(),
          createdBy: caller.userId,
          reviewers: [reviewers[0], reviewers[1]],
          status: 'open',
          closedAt: null,
          verdict: null,
          items: sampleItems.map((item, position) => ({ ...item, position })),
        });
        return ok(id);
      },

      admin_ai_gate_close(caller, args) {
        const denied = admin(caller, 'Solo un administrador cierra una muestra');
        if (denied) return denied;
        const sample = samples.get(String(args.p_sample));
        if (!sample) return fail('22023', 'Esa muestra no existe');
        if (sample.status === 'closed') return ok(sample.verdict);
        sample.verdict = { ...verdictOf(sample), closedAt: now() };
        sample.status = 'closed';
        sample.closedAt = now();
        return ok(sample.verdict);
      },

      admin_ai_gate_set(caller, args) {
        const denied = admin(caller, 'Solo un administrador abre o cierra un motor');
        if (denied) return denied;
        const engine = String(args.p_engine) as AiEngine;
        if (!ENGINES.includes(engine)) return fail('22023', 'Ese motor no existe');
        if (typeof args.p_open !== 'boolean') {
          return fail('22023', 'Falta decir si se abre o se cierra');
        }
        if (!args.p_open) {
          const current = state.engines[engine];
          if (current) {
            server.setState({
              ...state,
              engines: { ...state.engines, [engine]: { ...current, open: false, at: now() } },
            });
          }
          return ok(state);
        }
        const sample = samples.get(String(args.p_sample));
        const verdict = sample?.verdict as {
          engines?: Record<string, { passed?: boolean }>;
        } | null;
        if (sample?.status !== 'closed' || verdict?.engines?.[engine]?.passed !== true) {
          return fail('55000', 'El motor no pasó en esa muestra cerrada');
        }
        const versions = new Set(
          sample.items
            .filter((item) => item.engine === engine)
            .map((item) =>
              [item.model, item.effort, item.thinking, item.promptVersion, item.promptHash].join(
                '|',
              ),
            ),
        );
        if (versions.size !== 1) {
          return fail(
            '22023',
            'Los textos del motor no salieron de un solo modelo y un solo prompt',
          );
        }
        const item = sample.items.find((entry) => entry.engine === engine);
        if (!item) return fail('22023', 'Ese motor no está en la muestra');
        server.setState({
          ...state,
          engines: {
            ...state.engines,
            [engine]: {
              open: true,
              model: item.model,
              effort: item.effort as never,
              thinking: item.thinking as never,
              promptVersion: item.promptVersion,
              promptHash: item.promptHash,
              sampleId: sample.id,
              at: now(),
            },
          },
        });
        return ok(state);
      },

      admin_ai_pause(caller, args) {
        const denied = admin(caller, 'Solo un administrador pausa la IA');
        if (denied) return denied;
        if (typeof args.p_paused !== 'boolean') return fail('22023', 'Falta decir si se pausa');
        server.setState({ ...state, paused: args.p_paused });
        return ok(state);
      },
    };

  return server;
}
