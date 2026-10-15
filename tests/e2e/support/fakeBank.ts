// El banco en la nube del lado del alumno para el Supabase simulado de Playwright (B11, paquete B, 6.3
// del plan de B11). Atiende catalog_changes, fetch_questions con las reglas de 2.2 y 2.3, bank_quota,
// report_question, bias_agreement_summary, deck_catalog_list, record_deck_download y la bajada de
// Storage del bucket deck-catalog, sobre el modelo único de fakeBankStore.ts. Imita
// supabase/migrations/20261023000002_bank_core.sql y 20261023000005_deck_catalog.sql con sus mismos
// códigos de error. Lo del médico y el admin vive en fakeEditorial.ts (paquete C).
//
// Todo el texto que siembra lleva [Prueba] y es simulado, nunca contenido médico (CLAUDE.md). Las
// lecturas solo se agregan, como bank_reads.
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';
import { zipSync } from 'fflate';
import type {
  BankStudentRpc,
  FakeBankCaller,
  FakeBankReply,
  FakeBankStore,
  FakeBankVersion,
  FakeDeck,
} from './fakeBankStore';
import {
  DECK_CATALOG_BUCKET,
  FAKE_BANK_TEXT_MARK,
  bankOpen,
  fakeStudyDay,
  fakeStudyDayResetsAt,
  isTeam,
  seedQuestions,
} from './fakeBankStore';
import { CLOUD_PREVIEW_URL } from './fakeSupabaseConfig';

export { advanceStudyDay } from './fakeBankStore';

type Args = Record<string, unknown>;

const ok = (json: unknown): FakeBankReply => ({ status: 200, json });

/** El error como lo contesta PostgREST, con el estado HTTP que le toca a cada SQLSTATE */
function pgError(code: string, message: string): FakeBankReply {
  const status = code === '28000' ? 401 : code === '42501' ? 403 : 400;
  return { status, json: { code, message, details: null, hint: null } };
}

const NOT_ACTIVE = pgError('42501', 'Este dispositivo no es el activo de la cuenta');
const iso = (ms: number) => new Date(ms).toISOString();
const listOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];

/** El plan que ve la base: el rol del equipo o el de user_plan */
const planOf = (caller: FakeBankCaller) => (isTeam(caller) ? caller.role : caller.plan);
const isFree = (caller: FakeBankCaller) => !isTeam(caller) && caller.plan === 'free';
const canDownloadDecks = (caller: FakeBankCaller) => isTeam(caller) || caller.plan !== 'free';

// ===================================================================== Cuota y lecturas

/** Preguntas distintas que el alumno abrió en el día de estudio */
function readsToday(store: FakeBankStore, caller: FakeBankCaller): Set<string> {
  const day = fakeStudyDay(store);
  return new Set(
    store.reads
      .filter((read) => read.userId === caller.userId && read.day === day)
      .map((read) => read.questionId),
  );
}

/** La cuota con la forma de bank_quota_json */
export function quotaOf(store: FakeBankStore, caller: FakeBankCaller, retryAt: number | null) {
  const used = readsToday(store, caller).size;
  const limit = isFree(caller) ? store.settings.freeDaily : null;
  return {
    open: isTeam(caller) || bankOpen(caller),
    plan: planOf(caller),
    limit,
    used,
    left: limit === null ? null : Math.max(limit - used, 0),
    day: fakeStudyDay(store),
    resetsAt: fakeStudyDayResetsAt(store),
    brake: { retryAt: retryAt === null ? null : iso(retryAt) },
  };
}

/** El cuerpo de una versión con la forma de bank_body_json */
export function bodyOf(version: FakeBankVersion) {
  return {
    questionId: version.questionId,
    versionId: version.id,
    version: version.version,
    branch: version.branch,
    topic: version.topic,
    subtopic: version.subtopic,
    caseId: version.caseId,
    caseOrder: version.caseOrder,
    vignette: version.vignette,
    prompt: version.prompt,
    structure: {
      polarity: version.polarity,
      task: version.task,
      format: version.format,
      source: version.structureSource,
    },
    explanation: version.explanation,
    gpcRefs: version.gpcRefs,
    itemKinds: version.itemKinds,
    clues: version.clues,
    physicianDifficulty: version.difficulty,
    variantOf: version.variantOf,
    canonicalOptionIds: version.canonicalOptionIds,
    language: version.language,
    createdAt: version.createdAt,
    options: [...version.options]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        id: option.id,
        optionId: option.optionId,
        position: option.position,
        text: option.text,
        isCorrect: option.isCorrect,
        biasTag: option.biasTag,
        secondaryBiasTags: option.secondaryBiasTags,
        rationale: option.rationale,
      })),
  };
}

interface Asked {
  id: string;
  questionId: string | null;
  versionId: string | null;
  caseId: string | null;
  reason: string | null;
}

/** fetch_questions. Lo concedido gasta del tope de Gratis o del freno, lo demás sale en denied */
function fetchQuestions(store: FakeBankStore, caller: FakeBankCaller, args: Args): FakeBankReply {
  const purpose = typeof args.p_purpose === 'string' ? args.p_purpose : 'practice';
  if (!['practice', 'exam', 'duel', 'review', 'other'].includes(purpose)) {
    return pgError('22023', 'Propósito de lectura desconocido');
  }
  const byQuestion = listOf(args.p_question_ids);
  const byVersion = listOf(args.p_version_ids);
  if (byQuestion.length + byVersion.length > store.settings.bankLimits.maxFetch) {
    return pgError('22023', 'Se piden demasiadas preguntas a la vez');
  }
  const open = isTeam(caller) || bankOpen(caller);
  const asked: Asked[] = [];
  for (const id of byQuestion) {
    const question = store.questions.get(id);
    const version = question?.publishedVersionId
      ? store.versions.get(question.publishedVersionId)
      : undefined;
    asked.push({
      id,
      questionId: question?.questionId ?? null,
      versionId: version?.id ?? null,
      caseId: version?.caseId ?? null,
      reason: !open
        ? 'closed'
        : !question || !version
          ? 'not_found'
          : question.status === 'retired'
            ? 'retired'
            : null,
    });
  }
  for (const id of byVersion) {
    const version = store.versions.get(id);
    const question = version ? store.questions.get(version.questionId) : undefined;
    asked.push({
      id,
      questionId: question?.questionId ?? null,
      versionId: version?.id ?? null,
      caseId: version?.caseId ?? null,
      reason: !open
        ? 'closed'
        : !version || !question || version.status !== 'approved'
          ? 'not_found'
          : question.status === 'retired'
            ? 'retired'
            : null,
    });
  }

  const now = store.now();
  const day = fakeStudyDay(store);
  const today = readsToday(store, caller);
  let left = isFree(caller) ? store.settings.freeDaily - today.size : Number.POSITIVE_INFINITY;
  let retryAt: number | null = null;
  const done = new Set<number>();
  const granted: string[] = [];
  asked.forEach((item, index) => {
    if (done.has(index) || item.reason !== null) return;
    // La unidad es la pregunta, o todo lo pedido de su caso seriado
    const unit = asked
      .map((other, otherIndex) => ({ other, otherIndex }))
      .filter(
        ({ other, otherIndex }) =>
          otherIndex === index ||
          (item.caseId !== null &&
            otherIndex > index &&
            !done.has(otherIndex) &&
            other.reason === null &&
            other.caseId === item.caseId),
      );
    const fresh = new Set(
      unit
        .map(({ other }) => other.questionId as string)
        .filter((questionId) => !today.has(questionId)),
    ).size;
    if (isFree(caller)) {
      if (fresh > left) {
        for (const { other } of unit) other.reason = 'daily_limit';
        return;
      }
      left -= fresh;
    } else if (!isTeam(caller) && fresh > 0) {
      const mine = store.reads.filter(
        (read) => read.userId === caller.userId && Date.parse(read.createdAt) > now - 3_600_000,
      );
      const minute = mine.filter((read) => Date.parse(read.createdAt) > now - 60_000);
      const limits = store.settings.bankLimits;
      if (minute.length + fresh > limits.perMinute || mine.length + fresh > limits.perHour) {
        const oldest = (reads: typeof mine) =>
          Math.min(...reads.map((read) => Date.parse(read.createdAt)), now);
        const until = Math.max(
          minute.length + fresh > limits.perMinute ? oldest(minute) + 60_000 : now,
          mine.length + fresh > limits.perHour ? oldest(mine) + 3_600_000 : now,
        );
        retryAt = Math.max(retryAt ?? now, until);
        for (const { other } of unit) other.reason = 'brake';
        if (
          !store.readAlerts.some(
            (alert) =>
              alert.userId === caller.userId && alert.day === day && alert.kind === 'brake',
          )
        ) {
          store.readAlerts.push({
            userId: caller.userId,
            day,
            kind: 'brake',
            value: minute.length,
            createdAt: iso(now),
          });
        }
        return;
      }
    }
    for (const { other, otherIndex } of unit) {
      done.add(otherIndex);
      const questionId = other.questionId as string;
      if (!today.has(questionId)) {
        store.reads.push({
          userId: caller.userId,
          questionId,
          versionId: other.versionId as string,
          day,
          plan: planOf(caller),
          purpose: purpose as 'practice',
          createdAt: iso(now),
        });
        today.add(questionId);
      }
      if (!granted.includes(other.versionId as string)) granted.push(other.versionId as string);
    }
  });

  // Aviso al admin por volumen del día, sin bloquear (PC 4.10)
  if (!isTeam(caller) && today.size >= store.settings.bankLimits.alertDaily) {
    if (
      !store.readAlerts.some(
        (alert) =>
          alert.userId === caller.userId && alert.day === day && alert.kind === 'daily_volume',
      )
    ) {
      store.readAlerts.push({
        userId: caller.userId,
        day,
        kind: 'daily_volume',
        value: today.size,
        createdAt: iso(now),
      });
    }
  }

  const versions = granted.map((id) => store.versions.get(id) as FakeBankVersion);
  const caseIds = [
    ...new Set(versions.flatMap((version) => (version.caseId ? [version.caseId] : []))),
  ];
  return ok({
    questions: versions.map(bodyOf),
    cases: caseIds.flatMap((id) => {
      const clinicalCase = store.cases.get(id);
      return clinicalCase
        ? [
            {
              id: clinicalCase.id,
              vignette: clinicalCase.vignette,
              createdAt: clinicalCase.createdAt,
            },
          ]
        : [];
    }),
    denied: asked
      .filter((item) => item.reason !== null)
      .map((item) => ({ id: item.id, reason: item.reason })),
    quota: quotaOf(store, caller, retryAt),
  });
}

/** catalog_changes. Con el banco cerrado, open false y sin filas */
function catalogChanges(store: FakeBankStore, caller: FakeBankCaller, args: Args): FakeBankReply {
  const since = Math.max(typeof args.p_since === 'number' ? args.p_since : 0, 0);
  const limit = Math.min(Math.max(typeof args.p_limit === 'number' ? args.p_limit : 1000, 1), 1000);
  if (!(isTeam(caller) || bankOpen(caller))) {
    return ok({ open: false, rows: [], nextSince: since, done: true });
  }
  const after = [...store.catalog.values()]
    .filter((row) => row.seq > since)
    .sort((a, b) => a.seq - b.seq);
  const page = after.slice(0, limit);
  return ok({
    open: true,
    rows: page,
    nextSince: page.at(-1)?.seq ?? since,
    done: page.length === after.length,
  });
}

/** report_question. Solo motivos cerrados. Repetido abierto, tope del día y correo al médico */
function reportQuestion(store: FakeBankStore, caller: FakeBankCaller, args: Args): FakeBankReply {
  const reasons = ['clinical_error', 'wrong_key', 'typo', 'outdated', 'other'] as const;
  const reason = reasons.find((value) => value === args.p_reason);
  const versionId = typeof args.p_version_id === 'string' ? args.p_version_id : '';
  if (!reason) return pgError('22023', 'Motivo de reporte desconocido');
  const version = store.versions.get(versionId);
  if (!version) return ok({ status: 'not_found', reportId: null });
  const duplicate = store.reports.find(
    (report) =>
      report.reporterId === caller.userId &&
      report.versionId === versionId &&
      report.reason === reason &&
      report.status === 'open',
  );
  if (duplicate) return ok({ status: 'duplicate', reportId: duplicate.id });
  const day = fakeStudyDay(store);
  const todayReports = store.reports.filter(
    (report) =>
      report.reporterId === caller.userId &&
      fakeStudyDayOf(store, Date.parse(report.createdAt)) === day,
  );
  if (todayReports.length >= store.settings.bankLimits.reportsPerDay) {
    return ok({ status: 'limit', reportId: null });
  }
  const id = randomUUID();
  store.reports.push({
    id,
    reporterId: caller.userId,
    versionId,
    questionId: version.questionId,
    reason,
    status: 'open',
    createdAt: iso(store.now()),
    resolvedAt: null,
    resolvedBy: null,
  });
  // Un correo por pregunta y día al médico asignado: el revisor activo, el autor o el equipo (4.6)
  const active = store.assignments.filter(
    (assignment) => assignment.questionId === version.questionId && assignment.revokedAt === null,
  );
  const physician =
    active.find((assignment) => assignment.role === 'reviewer') ??
    active.find((assignment) => assignment.role === 'author');
  const dedupeKey = `content_report:${version.questionId}:${day}`;
  if (!store.outbox.some((email) => email.dedupeKey === dedupeKey)) {
    const question = store.questions.get(version.questionId);
    store.outbox.push({
      kind: 'content_report',
      recipientUser: physician?.physicianId ?? null,
      recipientRole: physician ? null : 'team',
      dedupeKey,
      data: {
        questionKey: question?.sourceKey?.replace(/^sheet:/, '') ?? version.questionId.slice(0, 8),
        reason,
        openReports: store.reports.filter(
          (report) => report.questionId === version.questionId && report.status === 'open',
        ).length,
      },
      createdAt: iso(store.now()),
    });
  }
  return ok({ status: 'created', reportId: id });
}

/** El día de estudio de un instante, con el corte de las 4 a. m. de Mérida */
function fakeStudyDayOf(store: FakeBankStore, at: number): string {
  return fakeStudyDay({ ...store, now: () => at });
}

/** bias_agreement_summary. Kappa de Cohen sobre los pares con la etiqueta del autor (4.4) */
export function agreementSummary(store: FakeBankStore) {
  const pairs = store.labels.filter((label) => label.authorTag !== null);
  const n = pairs.length;
  let kappa: number | null = null;
  if (n > 0) {
    const observed = pairs.filter((label) => label.authorTag === label.tag).length / n;
    const tags = new Set(pairs.flatMap((label) => [label.tag, label.authorTag as string]));
    let expected = 0;
    for (const tag of tags) {
      const author = pairs.filter((label) => label.authorTag === tag).length / n;
      const reviewer = pairs.filter((label) => label.tag === tag).length / n;
      expected += author * reviewer;
    }
    kappa = expected >= 1 ? (observed >= 1 ? 1 : 0) : (observed - expected) / (1 - expected);
  }
  const minPairs = 30;
  const minKappa = 0.4;
  const calibrating = n < minPairs;
  return {
    pairs: n,
    kappa: kappa === null ? null : Math.round(kappa * 10_000) / 10_000,
    vocabulary: !calibrating && kappa !== null && kappa >= minKappa ? 'bias' : 'trap',
    calibrating,
    minPairs,
    minKappa,
  };
}

// ===================================================================== Catálogo de mazos

/** deck_catalog_list. Gratis ve los mazos con canDownload en false y su vista previa */
function deckCatalogList(store: FakeBankStore, caller: FakeBankCaller): FakeBankReply {
  const decks = [...store.decks.values()]
    .filter((deck) => deck.status === 'published' && deck.publishedVersion !== null)
    .sort((a, b) => a.name.localeCompare(b.name) || a.deckKey.localeCompare(b.deckKey))
    .map((deck) => {
      const version = deck.versions.find((item) => item.version === deck.publishedVersion);
      const subjects = [...(version?.subjects ?? [])].sort(
        (a, b) => a.name.localeCompare(b.name) || a.subjectKey.localeCompare(b.subjectKey),
      );
      return {
        deckKey: deck.deckKey,
        name: deck.name,
        author: deck.author,
        description: deck.description,
        version: deck.publishedVersion,
        notes: subjects.reduce((sum, subject) => sum + subject.notes, 0),
        cards: subjects.reduce((sum, subject) => sum + subject.cards, 0),
        bytes: subjects.reduce((sum, subject) => sum + subject.jsonBytes + subject.mediaBytes, 0),
        subjects: subjects.map((subject) => ({
          subjectKey: subject.subjectKey,
          name: subject.name,
          branch: subject.branch,
          topic: subject.topic,
          notes: subject.notes,
          cards: subject.cards,
          bytes: subject.jsonBytes + subject.mediaBytes,
          mediaParts: subject.mediaParts,
          sha256: subject.sha256,
        })),
        preview: deck.preview,
      };
    });
  return ok({ canDownload: canDownloadDecks(caller), decks });
}

function recordDeckDownload(
  store: FakeBankStore,
  caller: FakeBankCaller,
  args: Args,
): FakeBankReply {
  if (!canDownloadDecks(caller)) return pgError('42501', 'Bajar mazos es de los planes de pago');
  const deck = typeof args.p_deck_key === 'string' ? store.decks.get(args.p_deck_key) : undefined;
  const version = deck?.versions.find((item) => item.version === args.p_version);
  const subject = version?.subjects.find((item) => item.subjectKey === args.p_subject_key);
  if (!deck || !version || !subject || typeof args.p_bytes !== 'number' || args.p_bytes < 0) {
    return pgError('22023', 'Bajada de mazo inválida');
  }
  store.deckDownloads.push({
    userId: caller.userId,
    deckKey: deck.deckKey,
    version: version.version,
    subjectKey: subject.subjectKey,
    bytes: args.p_bytes,
    createdAt: iso(store.now()),
  });
  return ok(null);
}

/** Las rpc del alumno. Todas piden el dispositivo activo, salvo el acuerdo, que no lo pide */
export function fakeBankRpc(
  store: FakeBankStore,
  name: BankStudentRpc,
  caller: FakeBankCaller,
  args: Args,
): FakeBankReply {
  if (name === 'bias_agreement_summary') return ok(agreementSummary(store));
  if (!caller.activeDevice) return NOT_ACTIVE;
  switch (name) {
    case 'catalog_changes':
      return catalogChanges(store, caller, args);
    case 'fetch_questions':
      return fetchQuestions(store, caller, args);
    case 'bank_quota':
      return ok(quotaOf(store, caller, null));
    case 'report_question':
      return reportQuestion(store, caller, args);
    case 'deck_catalog_list':
      return deckCatalogList(store, caller);
    case 'record_deck_download':
      return recordDeckDownload(store, caller, args);
  }
}

/** El error de Storage con la forma de su API */
const storageReply = (status: number, error: string, message: string): FakeBankReply => ({
  status,
  json: { statusCode: String(status), error, message },
});

/**
 * Bajar un objeto del bucket deck-catalog, como la política deck_catalog_select: plan de pago o
 * equipo, dispositivo activo y la versión publicada del mazo. Lo que no se ve responde como no
 * encontrado, igual que Storage
 */
export function fakeBankDownload(
  store: FakeBankStore,
  caller: FakeBankCaller | null,
  objectName: string,
): FakeBankReply {
  const notFound = storageReply(400, 'not_found', 'Object not found');
  if (!caller?.activeDevice || !canDownloadDecks(caller)) return notFound;
  const match = /^([a-z0-9-]{3,48})\/v([1-9][0-9]*)\//.exec(objectName);
  const deck = match ? store.decks.get(match[1] as string) : undefined;
  if (deck?.status !== 'published' || deck.publishedVersion !== Number(match?.[2])) {
    return notFound;
  }
  const object = store.objects.get(objectName);
  return object ? { status: 200, bytes: object.bytes, contentType: object.contentType } : notFound;
}

// ===================================================================== Ayudas para las specs

/** Abre el banco a los alumnos como lo hará Ricardo, con cloudBank en platform_settings.feature_flags */
export function openBank(server: { setFeatureFlags(flags: Record<string, boolean>): void }): void {
  server.setFeatureFlags({ cloudBank: true });
}

/** La carpeta del build de nube que sirve el proyecto de Playwright */
const CLOUD_DIST = fileURLToPath(new URL('../../../dist-cloud/', import.meta.url));

/**
 * Corta la red como un teléfono sin señal, con la página ya cargada. En los proyectos de nube el
 * service worker está bloqueado, así que sin red nadie serviría los íconos de la raíz, como el de la
 * pestaña y el logo del marco, que en producción salen del precache. El navegador los vuelve a pedir
 * al cambiar de pantalla y escribiría "Failed to load resource" en la consola. Aquí salen del build,
 * como lo haría el precache. Lo de Supabase sigue pasando por el servidor simulado
 */
export async function goOffline(context: BrowserContext): Promise<void> {
  await context.route(`${CLOUD_PREVIEW_URL}/*.png`, (route) =>
    route.fulfill({ path: join(CLOUD_DIST, new URL(route.request().url()).pathname) }),
  );
  await context.setOffline(true);
}

/** Siembra n preguntas simuladas aprobadas y publicadas en el catálogo */
export function seedBank(store: FakeBankStore, count: number) {
  return seedQuestions(store, count, { status: 'approved' });
}

/** Cambia el tope de Gratis y el freno de los planes de pago, como platform_settings.bank_limits */
export function setQuota(
  store: FakeBankStore,
  limits: { freeDaily?: number; perMinute?: number; perHour?: number },
): void {
  if (limits.freeDaily !== undefined) store.settings.freeDaily = limits.freeDaily;
  if (limits.perMinute !== undefined) store.settings.bankLimits.perMinute = limits.perMinute;
  if (limits.perHour !== undefined) store.settings.bankLimits.perHour = limits.perHour;
}

/** Una imagen PNG de 1 por 1 píxel, para las notas simuladas */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface SeededCatalogDeck {
  deck: FakeDeck;
  /** Textos de las notas simuladas, para buscarlas en Repasar */
  fronts: string[];
  /** Ruta de la imagen de la primera nota */
  image: string;
}

/**
 * Un mazo publicado en el catálogo con una materia, sus notas simuladas y un paquete de imágenes en
 * Storage, como lo deja el admin al subir y publicar (4.8). La parte del admin la recorre
 * deck-catalog.spec.ts con fakeEditorial.ts. Esta siembra deja lo mismo para las pruebas del alumno
 */
export function seedCatalogDeck(
  store: FakeBankStore,
  options: { deckKey?: string; subjectKey?: string; notes?: number; version?: number } = {},
): SeededCatalogDeck {
  const deckKey = options.deckKey ?? 'prueba-catalogo';
  const subjectKey = options.subjectKey ?? 'materia-simulada';
  const version = options.version ?? 1;
  const count = options.notes ?? 3;
  const image = `/deck-media/${deckKey}/${subjectKey}/m-0001.png`;
  const fronts = Array.from(
    { length: count },
    (_, index) => `[Prueba] Frente simulado ${index + 1}`,
  );
  const file = {
    version: 1,
    deckKey,
    deckVersion: version,
    subjectKey,
    name: 'Materia simulada',
    branch: 'internal_medicine',
    topic: 'cardiology',
    author: 'Autor simulado',
    status: 'pending_physician_review',
    media: [image],
    notes: fronts.map((front, index) => ({
      key: `${deckKey}-${String(index + 1).padStart(12, '0')}`,
      sourceTag: 'Prueba::Materia-simulada::Tema',
      tags: ['Prueba'],
      branch: 'internal_medicine',
      topic: 'cardiology',
      kind: 'basic',
      front: index === 0 ? `${front} <img src="${image}" alt="Imagen simulada">` : front,
      back: `${FAKE_BANK_TEXT_MARK} Reverso ${index + 1}`,
    })),
  };
  const json = Buffer.from(JSON.stringify(file));
  const zip = Buffer.from(zipSync({ 'm-0001.png': new Uint8Array(PIXEL) }));
  const at = iso(store.now());
  const base = `${deckKey}/v${version}/${subjectKey}`;
  store.objects.set(`${base}.json`, {
    bucket: DECK_CATALOG_BUCKET,
    name: `${base}.json`,
    bytes: json,
    contentType: 'application/json',
    createdAt: at,
  });
  store.objects.set(`${base}.media-1.zip`, {
    bucket: DECK_CATALOG_BUCKET,
    name: `${base}.media-1.zip`,
    bytes: zip,
    contentType: 'application/zip',
    createdAt: at,
  });
  const deck: FakeDeck = {
    deckKey,
    name: '[Prueba] Mazo simulado del catálogo',
    description: `${FAKE_BANK_TEXT_MARK} Mazo para las pruebas.`,
    author: 'Autor simulado',
    license: 'own',
    authorizationNote: null,
    authorizationConfirmedAt: null,
    status: 'published',
    publishedVersion: version,
    preview: [{ kind: 'basic', front: '[Prueba] Nota de muestra', back: 'Reverso de muestra' }],
    versions: [
      {
        version,
        status: 'published',
        subjects: [
          {
            subjectKey,
            name: 'Materia simulada',
            branch: 'internal_medicine',
            topic: 'cardiology',
            notes: count,
            cards: count,
            jsonBytes: json.length,
            mediaBytes: zip.length,
            mediaParts: 1,
            sha256: createHash('sha256').update(json).digest('hex'),
          },
        ],
        createdAt: at,
        publishedAt: at,
      },
    ],
  };
  store.decks.set(deckKey, deck);
  return { deck, fronts, image };
}
