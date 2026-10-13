// En qué modo está la IA, real con clave en el proxy, simulada o sin conexión (8.1). Va en Costos de
// IA y se ve siempre, con o sin las herramientas de demostración, porque el admin necesita saber si
// los motores llaman al modelo de verdad (B3 del plan del cambio). Antes vivía en Datos de
// demostración y, antes, en Configuración.
import { AiModeBadge } from '@/ai/AiModeBadge';
import { useAiStatus } from '@/ai/useAiStatus';
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';

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
