// Configuración de la plataforma (pantalla 25). Umbrales de calibración, pesos del ENARM, los ajustes del
// banco en la nube (B11), los del modelo del alumno y la calibración (B14), con el proxy de IA modelos,
// precios y límites por motor, y los correos y alertas (B15). Solo admin y dueño.
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { sendBrowserTestAlert } from '@/app/sentrySink';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { AiConfigForm } from './AiConfigForm';
import { BankSettingsForm } from './BankSettingsForm';
import { ClientErrorsCard } from './ClientErrorsCard';
import { EngagementSettings } from './EngagementSettings';
import { ModelSettingsForm } from './ModelSettingsForm';
import { ThresholdsForm } from './ThresholdsForm';
import { WeightsForm } from './WeightsForm';
import { useAiAdmin } from './useAiAdmin';

export function AdminSettingsScreen() {
  const admin = useAiAdmin();
  return (
    <>
      <ScreenHeader
        title={t.screens.adminSettings.title}
        description={adminText.descriptions.adminSettings}
      />
      <ThresholdsForm />
      <WeightsForm />
      <BankSettingsForm />
      <ModelSettingsForm />
      <AiConfigForm admin={admin} />
      <EngagementSettings sendBrowserTest={sendBrowserTestAlert} />
      <ClientErrorsCard />
    </>
  );
}
