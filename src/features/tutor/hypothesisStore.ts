// Lo que el alumno hace con una hipótesis del tutor (8.2). Cada hipótesis tiene un artefacto de
// modo plantilla con un ID estable por alumno y regla y área, así su respuesta y las acciones que
// aplica quedan ligadas a ella. Me sirve la aprueba, No me ayuda la descarta y las dos quedan en la
// bitácora con hypothesis_feedback. La IA de la Fase D usará el mismo artefacto.
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import type { AiArtifact } from '@/data/schemas/activity';
import type { User } from '@/data/schemas/people';
import { stableUlid } from '@/demo/stableId';
import type { Hypothesis, TutorAction } from './tutorModel';

const ID_TIME = Date.UTC(2026, 0, 1);
const MODEL = 'reglas';
const PROMPT_VERSION = 'plantilla-1';

export const hypothesisArtifactId = (userId: string, key: string) =>
  stableUlid(`hypothesis|${userId}|${key}`, ID_TIME);

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
const context = (user: Pick<User, 'id' | 'timeZone'>) => ({ userId: user.id, tz: user.timeZone });

/** Crea el artefacto de la hipótesis la primera vez que el alumno interactúa con ella */
export async function ensureHypothesisArtifact(
  api: Api,
  user: Pick<User, 'id' | 'timeZone'>,
  hypothesis: Hypothesis,
  now: Date = new Date(),
): Promise<AiArtifact> {
  const id = hypothesisArtifactId(user.id, hypothesis.key);
  const existing = await api.repos.aiArtifacts.get(id);
  if (existing) return existing;
  const artifact: AiArtifact = {
    id,
    userId: user.id,
    kind: 'hypothesis',
    status: 'draft',
    mode: 'template',
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    content: {
      rule: hypothesis.rule,
      area: hypothesis.area,
      confidence: hypothesis.confidence,
      recentFindings: hypothesis.recentFindings,
    },
    // Es una plantilla anclada a los errores del propio alumno, así que pasa el validador
    validatorResult: { passed: true, issues: [] },
    sourceIds: [...new Set(hypothesis.items.map((item) => item.itemId))].slice(0, 50),
    createdAt: now.toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  await api.repos.aiArtifacts.put(artifact);
  await api.recordEvent(
    createEvent(
      'ai_artifact_created',
      { artifactId: id, kind: 'hypothesis', model: MODEL, promptVersion: PROMPT_VERSION },
      context(user),
    ),
  );
  return artifact;
}

/** Me sirve la aprueba y No me ayuda la descarta. Las dos quedan guardadas */
export async function respondToHypothesis(
  api: Api,
  user: Pick<User, 'id' | 'timeZone'>,
  hypothesis: Hypothesis,
  helpful: boolean,
  now: Date = new Date(),
): Promise<void> {
  const artifact = await ensureHypothesisArtifact(api, user, hypothesis, now);
  await api.repos.aiArtifacts.put({
    ...artifact,
    status: helpful ? 'approved' : 'rejected',
    decidedAt: now.toISOString(),
    decidedBy: user.id,
  });
  await api.recordEvent(
    createEvent(
      helpful ? 'ai_artifact_approved' : 'ai_artifact_rejected',
      { artifactId: artifact.id, kind: 'hypothesis' },
      context(user),
    ),
  );
  await api.recordEvent(
    createEvent('hypothesis_feedback', { artifactId: artifact.id, helpful }, context(user)),
  );
}

/** Vuelve a mostrar una hipótesis que el alumno descartó. Su respuesta anterior queda en la bitácora */
export async function reopenHypothesis(
  api: Api,
  user: Pick<User, 'id'>,
  hypothesis: Pick<Hypothesis, 'key'>,
): Promise<void> {
  const artifact = await api.repos.aiArtifacts.get(hypothesisArtifactId(user.id, hypothesis.key));
  if (!artifact) return;
  await api.repos.aiArtifacts.put({
    ...artifact,
    status: 'draft',
    decidedAt: null,
    decidedBy: null,
  });
}

export async function recordHypothesisAction(
  api: Api,
  user: Pick<User, 'id' | 'timeZone'>,
  hypothesis: Hypothesis,
  action: TutorAction,
  now: Date = new Date(),
): Promise<void> {
  const artifact = await ensureHypothesisArtifact(api, user, hypothesis, now);
  await api.recordEvent(
    createEvent('action_applied', { artifactId: artifact.id, action }, context(user)),
  );
}
