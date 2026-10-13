// Herramientas de la demostración que antes vivían en Configuración, en la pestaña Cuenta, y no son
// del alumno (5.4 y B3 del plan del cambio). El selector de base real o de demostración, que dice
// dónde se guardan los datos y cuántos perfiles hay, y el modo de la IA. Solo con la bandera
// demoTools, que en producción está apagada.
import { FlaskConical, UserRound } from 'lucide-react';
import { AiModeBadge } from '@/ai/AiModeBadge';
import { useAiStatus } from '@/ai/useAiStatus';
import { usePreferences } from '@/app/preferences';
import { useRepositories } from '@/data/context';
import { DATABASE_NAMES } from '@/data/databases';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { RadioCards } from '@/ui/components/radio-cards';

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

/** Elige la base activa de este dispositivo, la real o la de demostración */
export function DatabaseCard() {
  const database = usePreferences((state) => state.database);
  const setDatabase = usePreferences((state) => state.setDatabase);
  return (
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

/** En qué modo está la IA, real con clave en el proxy, simulada o sin conexión */
export function AiModeCard() {
  const aiStatus = useAiStatus();
  return (
    <Card aria-labelledby="ia-titulo">
      <CardHeader className="mb-0">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle id="ia-titulo">{t.ai.cardTitle}</CardTitle>
          <AiModeBadge status={aiStatus} />
        </div>
        <CardDescription>{t.ai.detail[aiStatus.kind]}</CardDescription>
      </CardHeader>
    </Card>
  );
}
