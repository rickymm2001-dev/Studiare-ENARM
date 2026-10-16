// Calibración (pantalla 39, 7.2 del plan de B14). Para el admin y el dueño. Dice si la calibración
// nocturna está al día y cómo terminó la última corrida, avisa si pasaron más de 48 horas sin una buena y
// cómo volver a prenderla, deja encenderla o apagarla y elegir entre Solo reporte y Publicar, lista las
// últimas 30 corridas con sus conteos y su enlace a GitHub, y enseña lo que publica la última buena. Todo
// son cifras de todos juntos, y con la cuenta de la nube conectada como admin y, con B9, el segundo factor.
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { readCalibrationRuns } from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { bankCodeText } from './bankErrors';
import { CalibrationControlCard } from './CalibrationControlCard';
import { CalibrationOverviewCard } from './CalibrationOverviewCard';
import { CalibrationRunsCard } from './CalibrationRunsCard';
import { CalibrationStatusCard } from './CalibrationStatusCard';
import { useBankAdminQuery } from './useBankAdminQuery';

export function CalibrationAdminScreen() {
  const linked = useCloud((store) => store.state.status === 'linked');
  return (
    <>
      <ScreenHeader
        title={t.screens.calibrationAdmin.title}
        description={calibrationAdminTexts.description}
      />
      {linked ? (
        <CalibrationBody />
      ) : (
        <Card>
          <p className="text-sm text-fg-muted">{calibrationAdminTexts.needsCloud}</p>
        </Card>
      )}
    </>
  );
}

function CalibrationBody() {
  // El reloj se toma cuando llega cada lectura, así hace cuánto no se mueve solo entre lecturas
  const { state, reload } = useBankAdminQuery(async (cloud, onForbidden) => {
    const data = await readCalibrationRuns(cloud, onForbidden);
    return { data, now: new Date() };
  }, 'calibration-runs');

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'failed') {
    return <ErrorState description={bankCodeText(state.code)} onRetry={reload} />;
  }
  const { data, now } = state.value;
  return (
    <>
      <div>
        <Button variant="secondary" size="sm" onClick={reload}>
          {calibrationAdminTexts.refresh}
        </Button>
      </div>
      <CalibrationStatusCard data={data} now={now} />
      <CalibrationControlCard settings={data.settings.calibration} onChanged={reload} />
      <CalibrationRunsCard runs={data.runs} />
      <CalibrationOverviewCard data={data} />
    </>
  );
}
