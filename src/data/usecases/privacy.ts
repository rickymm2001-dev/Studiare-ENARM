// Consentimientos y puntaje oficial voluntario (4.5, Fase E bloque E6). El puntaje oficial del ENARM
// solo se guarda con el consentimiento de mejora anonimizada, y retirar ese consentimiento lo borra.
// Es uno por alumno, el más reciente, y nunca entra a ninguna predicción (la plataforma no predice el
// puntaje). Sirve para medir con datos reales si lo que se estudió se parece al examen.
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import type { OfficialScore, User } from '../schemas/people';
import { OfficialScoreSchema } from '../schemas/people';
import { currentConsents, setConsent } from './profile';
import type { ConsentPurposeSchema } from '../schemas/common';
import type { z } from 'zod';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Purpose = z.infer<typeof ConsentPurposeSchema>;

export class OfficialScoreError extends Error {
  readonly reason: 'no_consent' | 'invalid_year' | 'invalid_score';
  constructor(reason: 'no_consent' | 'invalid_year' | 'invalid_score') {
    super(reason);
    this.name = 'OfficialScoreError';
    this.reason = reason;
  }
}

/**
 * Da o retira un consentimiento. Retirar el de mejora anonimizada borra el puntaje oficial que se
 * había capturado con él, porque ya no hay en qué apoyarlo
 */
export async function changeConsent(
  api: Api,
  user: User,
  purpose: Purpose,
  granted: boolean,
): Promise<void> {
  await setConsent(api, user, purpose, granted);
  if (!granted && purpose === 'anonymized_improvement') {
    await api.repos.officialScores.remove(user.id);
  }
}

/** Guarda el puntaje oficial. Pide el consentimiento vigente y reemplaza el que hubiera */
export async function submitOfficialScore(
  api: Api,
  user: User,
  input: { year: number; score: number },
  now: Date = new Date(),
): Promise<OfficialScore> {
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    throw new OfficialScoreError('invalid_year');
  }
  // Hasta dos decimales, como lo publica la convocatoria
  const score = Math.round(input.score * 100) / 100;
  if (!Number.isFinite(input.score) || score < 0 || score > 100) {
    throw new OfficialScoreError('invalid_score');
  }
  const consents = await currentConsents(api, user.id);
  if (!consents.anonymized_improvement) throw new OfficialScoreError('no_consent');
  const granted = (await api.repos.consents.list())
    .filter(
      (consent) =>
        consent.userId === user.id &&
        consent.purpose === 'anonymized_improvement' &&
        consent.status === 'granted',
    )
    .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
    .at(-1);
  if (!granted) throw new OfficialScoreError('no_consent');
  const saved = await api.repos.officialScores.put(
    OfficialScoreSchema.parse({
      userId: user.id,
      year: input.year,
      score,
      consentId: granted.id,
      submittedAt: now.toISOString(),
    }),
  );
  await api.recordEvent(
    createEvent(
      'official_score_submitted',
      { year: input.year, score },
      { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
    ),
  );
  return saved;
}

/** Quita el puntaje oficial sin tocar el consentimiento */
export async function removeOfficialScore(api: Pick<DataApi, 'repos'>, userId: string) {
  await api.repos.officialScores.remove(userId);
}
