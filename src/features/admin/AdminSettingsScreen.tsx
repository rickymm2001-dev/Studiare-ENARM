// Configuración de la plataforma (pantalla 25). Umbrales de calibración, pesos del ENARM, los ajustes del
// banco en la nube (B11), los del modelo del alumno y la calibración (B14) y, con el proxy de IA, modelos,
// precios y límites por motor. Solo admin y dueño.
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { AiConfigForm } from './AiConfigForm';
import { BankSettingsForm } from './BankSettingsForm';
import { ClientErrorsCard } from './ClientErrorsCard';
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
      <ClientErrorsCard />
    </>
  );
}
