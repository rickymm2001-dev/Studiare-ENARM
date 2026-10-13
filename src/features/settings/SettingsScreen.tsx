// Configuración (pantalla 27, D-065). Separada de Perfil. En secciones con pestañas (D-078). Estudio
// con metas y repaso, Apariencia con tema y estilo, Pomodoro, Privacidad con los consentimientos y el
// puntaje oficial, y Cuenta con la base activa, el modo de IA, exportar y borrar.
import { FlaskConical, UserRound } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useSearchParams } from 'react-router';
import { AiModeBadge } from '@/ai/AiModeBadge';
import { useAiStatus } from '@/ai/useAiStatus';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useRepositories } from '@/data/context';
import { DATABASE_NAMES } from '@/data/databases';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { RadioCards } from '@/ui/components/radio-cards';
import { segmentedItem, segmentedList } from '@/ui/components/segmented';
import { useSession } from '@/app/session';
import { DataSection, PomodoroSection, StudySection } from '../profile/AccountSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { PrivacySection } from './PrivacySection';
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

const SECTIONS = ['study', 'appearance', 'pomodoro', 'privacy', 'account'] as const;
type SectionKey = (typeof SECTIONS)[number];
const isSection = (value: string | null): value is SectionKey =>
  SECTIONS.includes(value as SectionKey);

export function SettingsScreen() {
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
  const aiStatus = useAiStatus();
  const session = useSession();
  // La sección abierta vive en la dirección, para volver a ella o enlazarla (D-078)
  const [params, setParams] = useSearchParams();
  const requested = params.get('seccion');
  const ready = session.status === 'ready' ? session : null;
  const available = SECTIONS.filter(
    (key) => ready !== null || key === 'appearance' || key === 'account',
  );
  const section: SectionKey =
    isSection(requested) && available.includes(requested) ? requested : (available[0] ?? 'account');

  return (
    <>
      <ScreenHeader
        title={t.screens.settings.title}
        description={t.screens.settings.description}
        stats={false}
      />

      <Tabs.Root
        value={section}
        onValueChange={(value) => {
          setParams({ seccion: value }, { replace: true });
        }}
        className="flex flex-col gap-3"
      >
        {/* Misma forma que el control segmentado (H01 de B2). Radix marca la pestaña activa con
            data-state, así que la activa se pinta con esa variante y no con segmentedItem(true) */}
        <Tabs.List
          aria-label={t.settings.sectionsLabel}
          className={cn(segmentedList, 'self-start')}
        >
          {available.map((key) => (
            <Tabs.Trigger
              key={key}
              value={key}
              className={segmentedItem(
                false,
                'whitespace-nowrap data-[state=active]:border-line data-[state=active]:bg-surface data-[state=active]:text-fg',
              )}
            >
              {t.settings.sections[key]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {ready ? (
          <Tabs.Content value="study">
            <StudySection session={ready} />
          </Tabs.Content>
        ) : null}

        <Tabs.Content value="appearance">
          <AppearanceSettings />
        </Tabs.Content>

        {ready ? (
          <Tabs.Content value="pomodoro">
            <PomodoroSection session={ready} />
          </Tabs.Content>
        ) : null}

        {ready ? (
          <Tabs.Content value="privacy">
            <PrivacySection session={ready} />
          </Tabs.Content>
        ) : null}

        {/* En computadora las tarjetas van en dos columnas (D-057) */}
        <Tabs.Content value="account" className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
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

          {ready ? <DataSection session={ready} /> : null}
        </Tabs.Content>
      </Tabs.Root>
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
  // La base y el conteo van en dos renglones a propósito. En una fila con salto, el conteo bajaba
  // solo y el renglón empezaba con el punto medio en el teléfono (H21 de la revisión de B2)
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
