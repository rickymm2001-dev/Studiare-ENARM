// Pone el perfil de este dispositivo de acuerdo con la bitácora (B14, 2.2, 2.3 y 2.7 del plan de B14,
// respuesta 93 y hallazgo H06). Los ajustes del alumno, sus permisos y su puntaje oficial no viajan en
// sync_records. Viajan como los eventos settings_changed, consent_changed y official_score_submitted
// que ya subían, y aquí se vuelven a aplicar en cada dispositivo. Corre en runSync después de bajar los
// registros y la bitácora, y antes de subir, así lo que cree sube en la misma corrida.
//
// Escribe sin crear eventos, porque los eventos ya existen. La única excepción es la línea base (2.3),
// que la primera vez que corre en un dispositivo deja un settings_changed por cada ajuste distinto del de
// fábrica que no tenga ninguno, por ejemplo la meta diaria del registro de antes de B14. Corre después de
// bajar toda la bitácora, así nunca pisa un cambio que otro dispositivo ya registró.
//
// El puntaje oficial no viaja. El número no entra a la bitácora (D-101) y vive solo en el navegador donde
// se capturó. Lo único que se rearma es que retirar el permiso de mejora anónima, en el dispositivo que
// sea, también lo borra en los demás.
import { createEvent } from '../events/createEvent';
import {
  applySettingValues,
  isProfileEventType,
  localValueOf,
  planBaseline,
  planProfile,
  replayProfile,
  sameSettingValue,
  PROFILE_EVENT_TYPES,
  type LocalProfile,
} from '@/engines/profileReplay';
import type { DataApi } from '../context';
import { ConsentSchema } from '../schemas/people';
import { reconcileErrorDecks } from './reconcileErrorDecks';
import type { AppEvent } from '../schemas/events';
import type { SyncState } from '../schemas/sync';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;

export interface ReconcileDeps {
  api: Api;
  /** El perfil de este navegador */
  userId: string;
  /** La cuenta de la nube. Es la clave del dueño de Mis errores (2.6) */
  authId: string;
  now: () => Date;
}

/** Si un evento que acaba de bajar puede cambiar el perfil */
export const touchesProfile = (event: Pick<AppEvent, 'type'>) => isProfileEventType(event.type);

export interface ReconcileCounts {
  settings: number;
  consents: number;
  scoreRemoved: boolean;
  baseline: number;
}

/**
 * Los ajustes, permisos y puntaje de este dispositivo según la bitácora, con la línea base de la primera
 * vez. Devuelve null si no hay perfil local, y entonces no hay nada que reconciliar
 */
async function reconcileSettings(
  deps: ReconcileDeps,
  first: boolean,
): Promise<ReconcileCounts | null> {
  const { repos } = deps.api;
  const counts: ReconcileCounts = { settings: 0, consents: 0, scoreRemoved: false, baseline: 0 };
  const user = await repos.users.get(deps.userId);
  if (!user) return null;

  const events = await repos.events.query({ userId: deps.userId, types: PROFILE_EVENT_TYPES });
  const replay = replayProfile(events);

  if (first) {
    for (const { key, value } of planBaseline(replay, user)) {
      await deps.api.recordEvent(
        createEvent(
          'settings_changed',
          { key, value: value as never },
          { userId: deps.userId, tz: user.timeZone, clock: { now: deps.now } },
        ),
      );
      counts.baseline += 1;
    }
  }

  const consents = (await repos.consents.list()).filter(
    (consent) => consent.userId === deps.userId,
  );
  const score = await repos.officialScores.get(deps.userId);
  const local: LocalProfile = {
    settings: user.settings,
    examDate: user.examDate,
    dailyMinutes: user.dailyMinutes,
    consents,
    officialScoreSubmittedAt: score?.submittedAt ?? null,
  };
  const plan = planProfile(replay, local);

  if (plan.settingChanges.length > 0) {
    // Se vuelve a leer justo antes de escribir. Si el alumno cambió una de estas claves mientras tanto,
    // su cambio es más nuevo que la bitácora que se leyó y se queda. La siguiente corrida lo reconcilia
    const fresh = await repos.users.get(deps.userId);
    if (fresh) {
      const accepted = plan.settingChanges.filter((change) =>
        sameSettingValue(localValueOf(fresh, change.key), change.from),
      );
      if (accepted.length > 0) {
        const patched = applySettingValues(
          fresh,
          accepted.map((change) => ({ key: change.key, value: change.to })),
        );
        await repos.users.put({
          ...fresh,
          settings: patched.settings,
          examDate: patched.examDate,
          dailyMinutes: patched.dailyMinutes,
        });
        counts.settings = accepted.length;
      }
    }
  }

  if (plan.consentRows.length > 0) {
    await repos.consents.putMany(
      plan.consentRows.map((row) =>
        ConsentSchema.parse({
          id: row.id,
          userId: deps.userId,
          purpose: row.purpose,
          noticeVersion: row.noticeVersion,
          status: row.status,
          decidedAt: row.decidedAt,
        }),
      ),
    );
    counts.consents = plan.consentRows.length;
  }

  if (plan.removeOfficialScore) {
    // Si el alumno capturó otro puntaje mientras tanto, es posterior al retiro y se queda
    const current = await repos.officialScores.get(deps.userId);
    if (
      current &&
      replay.lastScoreRevocationAt !== null &&
      replay.lastScoreRevocationAt >= current.submittedAt
    ) {
      await repos.officialScores.remove(deps.userId);
      counts.scoreRemoved = true;
    }
  }
  return counts;
}

/**
 * Reconcilia el perfil con la bitácora y une Mis errores. Corre la primera vez en un dispositivo, cuando
 * bajó algún evento de ajustes, de permisos o de puntaje, y cuando bajaron mazos, notas o tarjetas. Eso
 * último no se decide con lo que bajó en esta corrida sino con las marcas profilePending y recordsPending
 * del avance, que la bajada deja escritas antes de guardar. Así un corte a la mitad no deja ajustes ni
 * permisos sin aplicar para siempre (revisión de B14, hallazgo 1).
 *
 * Las marcas y baselineAt se escriben hasta el final, cuando todo se aplicó. Si algo se corta antes, la
 * siguiente corrida lo repite, y repetirlo es seguro porque la reconciliación es idempotente.
 * Devuelve el avance con baselineAt si era la primera vez y sin las marcas
 */
export async function reconcileProfile(deps: ReconcileDeps, state: SyncState): Promise<SyncState> {
  const first = state.baselineAt === undefined;
  let markBaseline = first;
  if (first || state.profilePending === true) {
    const counts = await reconcileSettings(deps, first);
    // Sin perfil local no hay línea base que dejar. Se intenta de nuevo cuando exista
    if (counts === null) markBaseline = false;
  }
  // Bajaron mazos, notas o tarjetas, o es la primera vez. Se une Mis errores en uno solo (2.6)
  if (first || state.recordsPending === true) await reconcileErrorDecks(deps);

  const { profilePending, recordsPending, ...rest } = state;
  if (profilePending === undefined && recordsPending === undefined && !markBaseline) return state;
  const next: SyncState = markBaseline ? { ...rest, baselineAt: deps.now().toISOString() } : rest;
  await deps.api.repos.syncState.put(next);
  return next;
}
