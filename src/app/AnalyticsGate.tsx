// Le dice a la analítica lo que sabe la sesión (B15, 1.2, 1.3 y 1.4). No pinta nada. Lee el permiso Medición de
// uso del alumno y la base, y se lo pasa a control.ts, que con la tabla de gate.ts decide si junta y si manda.
// Solo se monta si la bandera, la llave y el entorno dejan medir alguna vez (analyticsPossible), y va en su
// propio archivo, fuera del JavaScript inicial. Cuando el permiso está prendido y la cuenta de la nube está conectada,
// pide al servidor el identificador seudónimo (analytics_identity) y le avisa del permiso (set_analytics_consent)
// para los eventos de dinero. Va junto a ErrorReportingGate. En la demostración, en desarrollo, sin llave o sin
// permiso no sale nada, y el identificador vive solo en memoria.
import { useEffect, useMemo, useRef } from 'react';
import { getCloud } from '@/data/cloud/client';
import { planKindOf } from '@/data/analytics/context';
import { staticInputs, updateAnalytics } from '@/data/analytics/control';
import { collectBlock } from '@/data/analytics/gate';
import { fetchAnalyticsIdentity, sendAnalyticsConsent } from '@/data/analytics/identity';
import { useDataApi } from '@/data/context';
import { useLiveDataFor } from '@/data/hooks';
import { useCloud } from './cloudState';
import { usePreferences } from './preferences';

/** Cuánto se espera para reintentar el identificador o el aviso al servidor, y cuántas veces */
export const IDENTITY_RETRY_MS = 30_000;
export const IDENTITY_MAX_RETRIES = 4;

/** Lo que dice la bitácora de permisos de Medición de uso: el permiso de ahora y si alguna vez se dio */
interface UsageConsent {
  granted: boolean;
  everGranted: boolean;
}

export function AnalyticsGate({ retryMs = IDENTITY_RETRY_MS }: { retryMs?: number }) {
  const api = useDataApi();
  const userId = usePreferences((state) => state.sessionUserId);
  const role = usePreferences((state) => state.role);
  const cloudState = useCloud((store) => store.state);
  const authId = cloudState.status === 'linked' ? cloudState.identity.authId : null;

  // null es que no hay sesión y undefined es que todavía se está leyendo. Los dos resultados van atados al
  // alumno que los produjo: en un cambio directo de cuenta (A a B sin pasar por sin sesión), useLiveQuery
  // conserva lo de A mientras llega lo de B, y con eso el permiso de A se le aplicaría a B
  const consent = useLiveDataFor<UsageConsent | null>(userId, async () => {
    if (!userId) return null;
    const decisions = (await api.repos.consents.list())
      .filter((item) => item.userId === userId && item.purpose === 'product_analytics')
      .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
    return {
      granted: decisions.at(-1)?.status === 'granted',
      everGranted: decisions.some((item) => item.status === 'granted'),
    };
  }, [api.repos]);
  const subscription = useLiveDataFor(
    userId,
    async () => (userId ? ((await api.repos.subscriptions.get(userId)) ?? null) : null),
    [api.repos],
  );

  // La base cambia con la preferencia del dispositivo. Lo demás que no cambia (bandera, llave, entorno y nube)
  // lo lee control.ts. La bandera llega del servidor y se aplica al recargar
  const database = api.repos.kind;
  useEffect(() => {
    updateAnalytics({ database });
  }, [database]);
  // Sin bandera, sin llave, en desarrollo o en la demostración no se le pregunta nada al servidor
  const serverTalks = useMemo(
    () => collectBlock({ ...staticInputs(), database, consent: true }) === null,
    [database],
  );

  // Un cambio directo de cuenta no hereda nada de la anterior: ni su permiso, ni su identificador, ni los
  // eventos que esperaban. Pasar por sin sesión (valor null) ya lo deja así, y un primer inicio de sesión
  // tampoco se toca, porque el registro pudo fijar el permiso antes de que hubiera sesión
  const lastUser = useRef(userId);
  useEffect(() => {
    const before = lastUser.current;
    lastUser.current = userId;
    if (before !== null && before !== userId) updateAnalytics({ consent: null, analyticsId: null });
  }, [userId]);

  // El permiso. Mientras se lee no se toca nada, para no pisar el que el registro acaba de fijar
  const granted = consent === undefined ? undefined : (consent?.granted ?? null);
  const everGranted = consent?.everGranted === true;
  useEffect(() => {
    if (granted !== undefined) updateAnalytics({ consent: granted });
  }, [granted]);

  // El plan y el rol viajan en los eventos como rangos
  const planKind = planKindOf(subscription);
  useEffect(() => {
    updateAnalytics({ context: { plan_kind: planKind, role } });
  }, [planKind, role]);

  // El identificador y el aviso al servidor. Solo con la cuenta de la nube conectada y la base real. Cada corrida
  // de este efecto es una decisión nueva (dar, retirar o cambiar de cuenta) y lleva su propia cuenta de reintentos,
  // así un dar que se quedó sin intentos no deja sin ellos al retiro que viene después. Lo que sigue sin avisarse
  // cuando se acaban los intentos se vuelve a intentar al recuperar la conexión, y si la pestaña se cierra, al
  // abrir la siguiente: este efecto corre en cuanto hay sesión y vuelve a revisar al servidor
  useEffect(() => {
    if (granted === undefined || authId === null || !serverTalks) return;
    const cloud = getCloud();
    if (!cloud) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    // Lo que falta por avisar. Vale null mientras corre, para que volver a tener red no lo corra dos veces
    let pending: (() => Promise<void>) | null = null;
    const later = (run: () => Promise<void>) => {
      pending = run;
      if (cancelled || attempts >= IDENTITY_MAX_RETRIES) return;
      attempts += 1;
      timer = setTimeout(() => {
        pending = null;
        void run();
      }, retryMs);
    };
    const done = () => {
      pending = null;
      attempts = 0;
    };

    const give = async (): Promise<void> => {
      // El identificador viejo no sirve mientras llega el nuevo
      let identity = await fetchAnalyticsIdentity(cloud);
      // Otro dispositivo no avisó, o se retiró y se volvió a dar: el servidor tiene que saberlo
      if (identity && !identity.consent) identity = await sendAnalyticsConsent(cloud, true);
      if (cancelled) return;
      if (identity?.consent) {
        done();
        updateAnalytics({ analyticsId: identity.analyticsId });
      } else later(give);
    };

    const withdraw = async (): Promise<void> => {
      // Solo se avisa si el servidor cree que hay permiso. Retirarlo cambia el identificador
      const identity = await fetchAnalyticsIdentity(cloud);
      if (cancelled) return;
      if (identity === null) {
        later(withdraw);
        return;
      }
      if (!identity.consent) {
        done();
        return;
      }
      if ((await sendAnalyticsConsent(cloud, false)) === null) later(withdraw);
      else done();
    };

    // Volvió la red con algo sin avisar: se intenta ya, con la cuenta de reintentos en cero
    const onOnline = () => {
      const run = pending;
      if (cancelled || run === null) return;
      if (timer) clearTimeout(timer);
      pending = null;
      attempts = 0;
      void run();
    };
    window.addEventListener('online', onOnline);

    if (granted === true) {
      void give();
    } else {
      // Sin permiso, o sin sesión, no hay identificador. Solo quien alguna vez dio el permiso puede haberle
      // dejado un sí al servidor, y a nadie más se le crea una fila
      updateAnalytics({ analyticsId: null });
      if (everGranted) void withdraw();
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [granted, everGranted, authId, serverTalks, retryMs]);

  // Sin cuenta conectada no hay identificador. Si la sesión se cierra o cambia de cuenta, el anterior se olvida
  useEffect(() => {
    updateAnalytics({ analyticsId: null });
  }, [authId]);

  return null;
}
