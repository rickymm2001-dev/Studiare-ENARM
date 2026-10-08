// Apuntes (D-092, D-085 fila 2). Cuarta pestaña de Repasar, Mazos y Explorar. Sin parámetros muestra
// la lista de apuntes y con ?apunte=ID abre ese apunte en el editor. Así hay una sola pantalla en el
// registro y los enlaces entre apuntes son direcciones normales.
import { useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { EmptyState, LoadingState } from '@/ui/states/states';
import { Link } from 'react-router';
import { StudyTabs } from '../review/StudyTabs';
import { FeatureGate } from '../shared/FeatureGate';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { OutlinePage } from './OutlinePage';
import { OutlinesList } from './OutlinesList';

export function OutlinesScreen() {
  return (
    <RequireSession screen="outlines">
      {(session) => (
        <FeatureGate userId={session.user.id} feature="outlines">
          <Outlines session={session} />
        </FeatureGate>
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

  return (
    <>
      <ScreenHeader title={t.screens.outlines.title} description={t.screens.outlines.description} />
      <StudyTabs />
      {data === undefined ? (
        <LoadingState label={t.outlines.loading} />
      ) : openId && !opened ? (
        <EmptyState
          title={t.outlines.notFound}
          action={
            <Button asChild variant="secondary">
              <Link to={screenPath('outlines')}>{t.outlines.backToList}</Link>
            </Button>
          }
        />
      ) : opened ? (
        <OutlinePage
          // Cada apunte arma su propio editor y su propio guardado
          key={opened.id}
          session={session}
          outline={opened}
          outlines={data.outlines}
          decks={data.decks}
        />
      ) : (
        <OutlinesList session={session} outlines={data.outlines} />
      )}
    </>
  );
}
