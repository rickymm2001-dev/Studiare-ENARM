// Quién puede generar la demostración en este dispositivo (5.4 del plan del cambio). Solo el admin y
// el dueño, y solo con la bandera demoTools prendida, que en producción está apagada.
import { isFeatureEnabled } from '@/config/featureFlags';
import type { Role } from '@/data/schemas/common';

export function canGenerateDemo(role: Role, demoTools = isFeatureEnabled('demoTools')): boolean {
  return demoTools && (role === 'admin' || role === 'owner');
}
