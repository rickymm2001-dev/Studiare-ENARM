// Configuración de la plataforma (pantalla 25). Umbrales de calibración, pesos del ENARM, los ajustes del
// banco en la nube (B11) y, con el proxy de IA, modelos, precios y límites por motor. Solo admin y dueño.
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { t } from '@/i18n/es-MX';
import { AiConfigForm } from './AiConfigForm';
import { BankSettingsForm } from './BankSettingsForm';
import { ClientErrorsCard } from './ClientErrorsCard';
import { ThresholdsForm } from './ThresholdsForm';
import { WeightsForm } from './WeightsForm';
import { useAiAdmin } from './useAiAdmin';

export function AdminSettingsScreen() {
  const admin = useAiAdmin();
  return (
    <>
      <ScreenHeader
        title={t.screens.adminSettings.title}
        description={t.screens.adminSettings.description}
      />
      <ThresholdsForm />
      <WeightsForm />
      <BankSettingsForm />
      <AiConfigForm admin={admin} />
      <ClientErrorsCard />
    </>
  );
}
