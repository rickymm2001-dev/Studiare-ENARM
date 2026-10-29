// Retoma el cierre pendiente de un examen al arrancar la app, desde cualquier pantalla (V5-B0,
// defecto importante 1 del diagnóstico de la beta). Antes el cierre solo corría en Resultados, así que
// si el alumno salía mientras decía Guardando tus respuestas, o el teléfono cerraba la pestaña a la
// mitad, el XP, Mis errores y Progreso se quedaban sin registrar hasta volver a abrir Resultados.
// No pinta nada. Corre una vez por alumno al abrir la sesión y solo si el examen guardado terminó y
// le falta algo por registrar. El cierre es el mismo de Resultados, closeExam, que avanza por pasos
// anotados en el estado y pide IDs fijos a la bitácora, así correr dos veces, o a la vez que
// Resultados, no duplica nada. El código del cierre se baja aparte solo cuando hay algo que cerrar,
// para no pesar en el JavaScript inicial (14.4). Un fallo aquí no tumba la app ni avisa. Resultados
// sigue mostrando el error con su botón de reintentar, y la siguiente apertura lo vuelve a intentar.
import { useEffect, useEffectEvent } from 'react';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { loadPendingClose } from './pendingClose';

export function PendingExamClose() {
  const api = useDataApi();
  const session = useSession();
  const userId = session.status === 'ready' ? session.user.id : null;
  const resume = useEffectEvent(() => {
    if (session.status !== 'ready') return;
    const { user, settings } = session;
    const state = loadPendingClose(user.id);
    if (!state) return;
    void import('./examSession')
      .then(async ({ closeExam, loadExamBundles }) => {
        const [bundles, events] = await Promise.all([
          loadExamBundles(api, state.questionIds),
          api.repos.events.query({ userId: user.id }),
        ]);
        await closeExam({ api, user, settings, state, bundles, events });
      })
      .catch(() => undefined);
  });
  useEffect(() => {
    if (userId) resume();
  }, [userId]);
  return null;
}
