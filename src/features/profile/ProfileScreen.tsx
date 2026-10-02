// Perfil (pantalla 15). En la Fase A trae cuenta activa, rol, tema visual y modo de IA.
// El resto de los ajustes llega en la Fase C, y exportar, borrar y puntaje oficial en la Fase E.
import { FlaskConical, Monitor, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AiModeBadge } from '@/ai/AiModeBadge';
import { useAiStatus } from '@/ai/useAiStatus';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useRepositories } from '@/data/context';
import { DATABASE_NAMES } from '@/data/databases';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { RadioCards } from '@/ui/components/radio-cards';
import type { ThemePreference } from '@/ui/theme';
import { useSession } from '@/app/session';
import { AccountSettings } from './AccountSettings';
import { DemoDataPanel } from './DemoDataPanel';

const THEME_OPTIONS = [
  { value: 'system', label: t.theme.system, icon: <Monitor /> },
  { value: 'light', label: t.theme.light, icon: <Sun /> },
  { value: 'dark', label: t.theme.dark, icon: <Moon /> },
] as const satisfies readonly { value: ThemePreference; label: string; icon: ReactNode }[];

const DATABASE_OPTIONS = [
  {
    value: 'real',
    label: t.database.real,
    description: t.database.realDescription,
    icon: <UserRound />,
  },
  {
    value: 'demo',
    label: t.database.demo,
    description: t.database.demoDescription,
    icon: <FlaskConical />,
  },
] as const;

export function ProfileScreen() {
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
  const aiStatus = useAiStatus();
  const session = useSession();

  return (
    <>
      <ScreenHeader title={t.screens.profile.title} description={t.screens.profile.description} />

      <Card>
        <RadioCards
          legend={t.database.legend}
          description={t.database.description}
          value={database}
          options={DATABASE_OPTIONS}
          onValueChange={setDatabase}
        />
        <DatabaseStatus />
      </Card>

      {database === 'demo' ? <DemoDataPanel /> : null}

      {session.status === 'ready' ? <AccountSettings session={session} /> : null}

      <Card aria-labelledby="rol-titulo">
        <CardHeader>
          <CardTitle id="rol-titulo">{t.roles.cardTitle}</CardTitle>
          <CardDescription>{t.roles.current(t.roles.names[role])}</CardDescription>
        </CardHeader>
        <Button asChild variant="secondary" className="self-start">
          <Link to={screenPath('roleSelector')}>
            <ShieldCheck aria-hidden />
            {t.roles.change}
          </Link>
        </Button>
      </Card>

      <Card>
        <RadioCards
          legend={t.theme.legend}
          value={theme}
          options={THEME_OPTIONS}
          onValueChange={setTheme}
        />
      </Card>

      <Card aria-labelledby="ia-titulo">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="ia-titulo">{t.ai.cardTitle}</CardTitle>
            <AiModeBadge status={aiStatus} />
          </div>
          <CardDescription>{t.ai.detail[aiStatus.kind]}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}

/** Abre la base activa en el navegador y dice cuántos perfiles tiene. Prueba que IndexedDB funciona */
function DatabaseStatus() {
  const repos = useRepositories();
  const result = useLiveData(
    () =>
      repos.users.list().then(
        (users) => ({ ok: true as const, count: users.length }),
        () => ({ ok: false as const, count: 0 }),
      ),
    [repos],
  );
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-muted"
      aria-live="polite"
    >
      <span className="font-mono">{t.database.storedIn(DATABASE_NAMES[repos.kind])}</span>
      {result === undefined ? null : result.ok ? (
        <span>· {t.database.users(result.count)}</span>
      ) : (
        <span className="text-danger">{t.database.openError}</span>
      )}
      {repos.kind === 'demo' ? <SimulatedDataLabel /> : null}
    </div>
  );
}
