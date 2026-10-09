// Guardar lo que escribe la IA del tutor (8.1, 8.2, 8.3, 8.5). Cada llamada deja su renglón en la
// bitácora de costo, con lo que gastó aunque haya fallado. Si salió bien, el resultado se guarda en
// el artefacto de la hipótesis, del informe o del consejo, siempre en borrador, con el modelo, la
// versión del prompt y lo que revisaron las guardas. Nada de esto toca los eventos de repaso y
// respuesta, que solo se agregan.
import type { CallMeta } from '../../ai/engines';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import { newId } from '../ids';
import type { AiArtifact, AiCallLog } from '../schemas/activity';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Person = Pick<User, 'id' | 'timeZone'>;

/** Un renglón en la bitácora de costo por llamada al proxy. Sin llamada hecha no hay renglón */
export async function logAiCall(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  meta: CallMeta,
  now: Date = new Date(),
): Promise<AiCallLog> {
  const call: AiCallLog = {
    id: newId(),
    userId: user.id,
    engine: meta.engine,
    mode: meta.mode,
    model: meta.model,
    at: now.toISOString(),
    inputTokens: meta.inputTokens,
    outputTokens: meta.outputTokens,
    cacheWriteTokens: meta.cacheWriteTokens,
    cacheReadTokens: meta.cacheReadTokens,
    estimatedCostUsd: meta.estimatedCostUsd,
    latencyMs: meta.latencyMs,
    outcome: meta.outcome,
  };
  await api.repos.aiCallLog.put(call);
  return call;
}

export interface StoreAiResult {
  id: string;
  kind: AiArtifact['kind'];
  /** El artefacto que ya existe para este elemento, si existe */
  existing: AiArtifact | undefined;
  meta: CallMeta;
  /** Contenido nuevo. Se mezcla con el que ya tenía y lo que trae reemplaza lo anterior */
  content: AiArtifact['content'];
  sourceIds: readonly string[];
}

/**
 * Guarda el resultado de la IA en el artefacto, que sigue en borrador si no lo había decidido ya el
 * alumno. Lo que decidió antes, como aprobar o descartar, se conserva
 */
export async function storeAiResult(
  api: Api,
  user: Person,
  input: StoreAiResult,
  now: Date = new Date(),
): Promise<AiArtifact> {
  const { existing, meta } = input;
  const artifact: AiArtifact = {
    id: input.id,
    userId: user.id,
    kind: input.kind,
    status: existing?.status ?? 'draft',
    mode: meta.mode,
    model: meta.model,
    promptVersion: meta.promptVersion,
    content: { ...existing?.content, ...input.content },
    validatorResult: { passed: meta.validator.passed, issues: meta.validator.issues.slice(0, 50) },
    sourceIds: [...new Set(input.sourceIds)].slice(0, 50),
    createdAt: existing?.createdAt ?? now.toISOString(),
    decidedAt: existing?.decidedAt ?? null,
    decidedBy: existing?.decidedBy ?? null,
  };
  await api.repos.aiArtifacts.put(artifact);
  if (!existing) {
    await api.recordEvent(
      createEvent(
        'ai_artifact_created',
        {
          artifactId: artifact.id,
          kind: artifact.kind,
          model: artifact.model,
          promptVersion: artifact.promptVersion,
        },
        { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
      ),
    );
  }
  return artifact;
}
