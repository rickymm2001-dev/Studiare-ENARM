// Lo que se puede hacer con un mazo desde su pantalla (V4-B3). Repasar y Estudiar un tema abren Repasar
// con el mazo ya elegido y lo piden por el estado de la ruta (DeckActions.tsx y
// ../review/reviewPreset.ts), sin tocar la selección que Repasar recuerda. Buscar tarjetas recibe el
// mazo por la dirección, con ?mazo=.
import { screenPath } from '@/app/screens';

/** La dirección de Buscar tarjetas con el mazo puesto, y si se pide con solo las sanguijuelas */
export function searchPathOfDeck(unitId: string, options: { leechesOnly?: boolean } = {}): string {
  const params = new URLSearchParams({ mazo: unitId });
  if (options.leechesOnly) params.set('estado', 'sanguijuelas');
  return `${screenPath('explore')}?${params.toString()}`;
}
