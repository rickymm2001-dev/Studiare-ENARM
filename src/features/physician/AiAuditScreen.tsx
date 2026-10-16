// Auditoría de la IA (pantalla 38, B12, 5.3). La compuerta 1 de la IA. Dos médicos califican, cada uno
// sin ver al otro, una muestra de textos que escribió la IA, y la base calcula si cada motor pasa. El
// médico asignado califica sus textos. El administrador, en la misma pantalla, importa la muestra,
// asigna a los dos médicos, ve el avance, la cierra, ve el veredicto y abre o cierra cada motor para
// los alumnos. Vive en el área del médico, con segundo factor (B9), y necesita la cuenta de la nube.
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { t } from '@/i18n/es-MX';
import { aiAuditText } from '@/i18n/aiAudit';
import { Card } from '@/ui/components/card';
import { AdminSection } from './AiAuditAdmin';
import { ReviewerSection } from './AiAuditReviewer';
import { useAuditLinked } from './useAuditQuery';

export function AiAuditScreen() {
  const role = usePreferences((state) => state.role);
  const linked = useAuditLinked();
  const admin = role === 'admin' || role === 'owner';
  return (
    <>
      <ScreenHeader
        title={t.screens.aiAudit.title}
        description={admin ? aiAuditText.descriptionAdmin : aiAuditText.description}
      />
      {linked ? (
        <>
          {admin ? <AdminSection /> : null}
          <ReviewerSection />
        </>
      ) : (
        <Card>
          <p className="text-sm text-fg-muted">{aiAuditText.needsCloud}</p>
        </Card>
      )}
    </>
  );
}
