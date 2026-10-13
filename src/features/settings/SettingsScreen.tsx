// Configuración (pantalla 27, D-065). Separada de Perfil.
// Rediseñada en B3: una sola página sin pestañas, con exactamente tres secciones
// (Perfil, Apariencia, Privacidad) separadas por una línea horizontal (D-078).
// Herramientas de demo/admin se muestran al final únicamente para administradores o dueños.
import { FlaskConical, UserRound } from 'lucide-react';
import { AiModeBadge } from '@/ai/AiModeBadge';
import { useAiStatus } from '@/ai/useAiStatus';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useRepositories } from '@/data/context';
import { DATABASE_NAMES } from '@/data/databases';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { RadioCards } from '@/ui/components/radio-cards';
import { useSession } from '@/app/session';
import { isFeatureEnabled } from '@/config/featureFlags';
import { AppearanceSettings } from './AppearanceSettings';
import { PrivacySection } from './PrivacySection';
import { ProfileSection } from './ProfileSection';
import { DemoDataPanel } from './DemoDataPanel';

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

export function SettingsScreen() {
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
  const role = usePreferences((state) => state.role);
  const aiStatus = useAiStatus();
  const session = useSession();
  const ready = session.status === 'ready' ? session : null;
  const isAdmin = role === 'admin' || role === 'owner';
  const showDemoTools = isFeatureEnabled('demoTools') || isAdmin;

  return (
    <>
      <ScreenHeader
        title={t.screens.settings.title}
        description={t.screens.settings.description}
        stats={false}
      />

      <div className="flex flex-col gap-8">
        {/* Sección 1: Perfil */}
        <section
          id="seccion-perfil"
          aria-labelledby="perfil-seccion-titulo"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 id="perfil-seccion-titulo" className="text-xl font-bold">
              {t.settings.sections.profile}
            </h2>
            <p className="text-sm text-fg-muted">{t.screens.profile.description}</p>
          </div>
          {ready ? <ProfileSection session={ready} /> : null}
        </section>

        <hr className="border-line" />

        {/* Sección 2: Apariencia */}
        <section
          id="seccion-apariencia"
          aria-labelledby="apariencia-seccion-titulo"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 id="apariencia-seccion-titulo" className="text-xl font-bold">
              {t.settings.sections.appearance}
            </h2>
            <p className="text-sm text-fg-muted">{t.appearance.description}</p>
          </div>
          <AppearanceSettings />
        </section>

        <hr className="border-line" />

        {/* Sección 3: Privacidad */}
        <section
          id="seccion-privacidad"
          aria-labelledby="privacidad-seccion-titulo"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 id="privacidad-seccion-titulo" className="text-xl font-bold">
              {t.settings.sections.privacy}
            </h2>
            <p className="text-sm text-fg-muted">{t.settings.privacy.consentsDescription}</p>
          </div>
          {ready ? <PrivacySection session={ready} /> : null}
        </section>

        {/* Herramientas de desarrollo / demo para administradores */}
        {showDemoTools ? (
          <>
            <hr className="border-line" />
            <section
              id="seccion-demo"
              aria-labelledby="demo-herramientas-titulo"
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h2 id="demo-herramientas-titulo" className="text-xl font-bold">
                  {isAdmin ? t.navItems.admin : t.database.demo}
                </h2>
                <p className="text-sm text-fg-muted">{t.database.description}</p>
              </div>
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
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

                <Card aria-labelledby="ia-titulo">
                  <CardHeader className="mb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle id="ia-titulo">{t.ai.cardTitle}</CardTitle>
                      <AiModeBadge status={aiStatus} />
                    </div>
                    <CardDescription>{t.ai.detail[aiStatus.kind]}</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </section>
          </>
        ) : null}
      </div>
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
    <div className="mt-3 flex flex-col gap-1 text-sm text-fg-muted" aria-live="polite">
      <span className="font-mono">{t.database.storedIn(DATABASE_NAMES[repos.kind])}</span>
      <div className="flex flex-wrap items-center gap-2">
        {result === undefined ? null : result.ok ? (
          <span>{t.database.users(result.count)}</span>
        ) : (
          <span className="text-danger">{t.database.openError}</span>
        )}
        {repos.kind === 'demo' ? <SimulatedDataLabel /> : null}
      </div>
    </div>
  );
}
