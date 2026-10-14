// Los grupos del alumno en la nube, al día (B7 del plan del cambio). Al abrir Party o Inicio pide el
// resumen al servidor, manda los resultados de los duelos que el alumno ya jugó en este dispositivo,
// salvo el que tiene a medias en esta pestaña, y publica su XP de la semana y sus aportes a los retos
// si cambiaron. Cada cifra sale de su bitácora. Mientras recarga después de una acción, la pantalla
// sigue mostrando lo que ya tenía. Si el servidor contesta que Party ya no está abierta (PT001), el plan
// de este navegador se quedó atrás, así que pide una sincronización, que vuelve a preguntar el plan y
// pone los candados de Gratis (B8).
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useSyncStatus } from '@/app/syncState';
import { getCloud } from '@/data/cloud/client';
import {
  fetchPartyOverview,
  type PartyFailure,
  type PartyOverview,
  type PartyReply,
} from '@/data/cloud/party';
import type { AppEvent } from '@/data/schemas/events';
import { publishMyNumbers, submitPlayedDuels } from '@/data/usecases/partyCloud';
import { weekStartOf } from '@/engines/studyDay';
import type { Snapshot } from '../home/snapshot';
import { usePractice } from '../simulator/practice';
import { myPartyNumbers, playedDuelsToSubmit } from './cloudNumbers';
import { activeDuelSessionOf } from './duelActions';

export type CloudPartyState =
  | { status: 'loading' }
  | { status: 'failed'; reason: PartyFailure }
  | { status: 'ready'; overview: PartyOverview };

export function useCloudParty(input: {
  /** false mientras falte el permiso de Party. Entonces no pide nada */
  enabled: boolean;
  /** El alumno, para saber qué duelo tiene a medias en esta pestaña */
  userId: string;
  snapshot: Snapshot;
  events: readonly AppEvent[];
  timeZone: string;
}): { state: CloudPartyState; reload: () => void } {
  const [state, setState] = useState<CloudPartyState>({ status: 'loading' });
  const [token, setToken] = useState(0);
  const weekStart = weekStartOf(input.snapshot.today);
  // Un resultado de duelo se manda una vez por visita. Si falla, se intenta en la siguiente
  const attempted = useRef(new Set<string>());

  // Lo que sigue a la primera lectura. Corre siempre después de una respuesta del servidor
  const settle = useEffectEvent(
    async (loaded: PartyReply<PartyOverview> | null, stopped: () => boolean) => {
      const cloud = getCloud();
      if (!loaded || !cloud) {
        setState({ status: 'failed', reason: 'network' });
        return;
      }
      if (!loaded.ok) {
        setState({ status: 'failed', reason: loaded.reason });
        if (loaded.reason === 'closed') void useSyncStatus.getState().syncNow?.();
        return;
      }
      let overview = loaded.value;
      setState({ status: 'ready', overview });

      const playing = activeDuelSessionOf(usePractice.getState(), input.userId);
      const played = playedDuelsToSubmit(overview, input.events, playing).filter(
        (duel) => !attempted.current.has(duel.duelId),
      );
      for (const duel of played) attempted.current.add(duel.duelId);
      if (played.length > 0 && (await submitPlayedDuels(cloud, played)) > 0) {
        // Con el resultado propio guardado, el servidor ya deja ver el del rival
        const again = await fetchPartyOverview(cloud, weekStart);
        if (stopped()) return;
        if (again.ok) overview = again.value;
      }

      const published = await publishMyNumbers(
        cloud,
        overview,
        myPartyNumbers(overview, input.snapshot, input.timeZone, new Date()),
      );
      if (stopped()) return;
      setState({ status: 'ready', overview: published.ok ? published.value : overview });
    },
  );

  useEffect(() => {
    if (!input.enabled) return;
    let stopped = false;
    const cloud = getCloud();
    void (cloud ? fetchPartyOverview(cloud, weekStart) : Promise.resolve(null)).then((loaded) => {
      if (!stopped) void settle(loaded, () => stopped);
    });
    return () => {
      stopped = true;
    };
  }, [input.enabled, weekStart, token]);

  const reload = useCallback(() => {
    setToken((value) => value + 1);
  }, []);
  return { state, reload };
}
