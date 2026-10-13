// Apuntes (D-092, D-085 fila 2). Tiene su propio lugar en el menú y ya no es pestaña de Repasar
// (comentario 12, B3). Sin parámetros muestra la lista de apuntes y con ?apunte=ID abre ese apunte en
// el editor. Así hay una sola pantalla en el registro y los enlaces entre apuntes son direcciones
// normales. ?linea=ID deja el cursor en esa línea, por ejemplo al abrir un resultado de la búsqueda,
// y ?modo=clase abre el editor solo, para escribir rápido en clase (B6 del plan del cambio).
//
// En el plan Gratis la pantalla conserva su título y muestra su vista previa con candado y el botón
// de los candados de Gratis, que dice Prueba 7 días gratis cuando B10 prende la bandera freeTrial y
// Ver planes mientras tanto (respuesta 20). El candado del servidor llega en B8 (ver
// src/config/billing.ts).
//
// ANALÍTICA B15. Aquí se medirá el uso de Apuntes cuando llegue la analítica con permiso del bloque
// B15 (respuesta 78). Solo conteos y claves, nunca el texto del alumno. Apunte creado, con su
// plantilla y si es modo clase. Línea vuelta tarjeta con el botón, con su tipo. Mazo o tema cambiado.
// Búsqueda hecha y resultado abierto. Salto desde el esquema. Tarjetas con IA propuestas, aceptadas,
// editadas y descartadas. Vista previa de Gratis vista y su botón tocado.
import { Link, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { EmptyState, LoadingState } from '@/ui/states/states';
import { FeatureGate } from '../shared/FeatureGate';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { OutlinePage } from './OutlinePage';
import { OutlinesList } from './OutlinesList';
import { OutlinesLocked } from './OutlinesLocked';

export function OutlinesScreen() {
  return (
    <RequireSession screen="outlines">
      {(session) => (
        <>
          <ScreenHeader
            title={t.screens.outlines.title}
            description={t.screens.outlines.description}
          />
          <FeatureGate userId={session.user.id} feature="outlines" locked={<OutlinesLocked />}>
            <Outlines session={session} />
          </FeatureGate>
        </>
      )}
    </RequireSession>
  );
}

function Outlines({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const [params] = useSearchParams();
  const openId = params.get('apunte');
  const data = useLiveData(async () => {
    const [outlines, decks] = await Promise.all([
      api.repos.outlines.list(),
      api.repos.decks.list(),
    ]);
    return { outlines: outlines.filter((outline) => outline.ownerId === session.user.id), decks };
  }, [api.repos, session.user.id]);

  const opened =
    openId && data ? data.outlines.find((outline) => outline.id === openId) : undefined;

  if (data === undefined) return <LoadingState label={t.outlines.loading} />;
  if (openId && !opened) {
    return (
      <EmptyState
        title={t.outlines.notFound}
        action={
          <Button asChild variant="secondary">
            <Link to={screenPath('outlines')}>{t.outlines.backToList}</Link>
          </Button>
        }
      />
    );
  }
  if (opened) {
    return (
      <OutlinePage
        // Cada apunte arma su propio editor y su propio guardado
        key={opened.id}
        session={session}
        outline={opened}
        outlines={data.outlines}
        decks={data.decks}
        initialLine={params.get('linea')}
      />
    );
  }
  return <OutlinesList session={session} outlines={data.outlines} decks={data.decks} />;
}
