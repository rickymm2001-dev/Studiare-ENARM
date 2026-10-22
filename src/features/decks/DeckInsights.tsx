// Lo que se ve y se hace con un mazo que el alumno sigue (V4-B3). Los botones a Repasar, a Estudiar un
// tema y a Buscar tarjetas, y debajo sus estadísticas plegadas. Lo usan la fila de cada precargado y la
// lista de mazos en cifras, que sirve a los de la nube y a los propios.
import type { FsrsCardState } from '@/data/schemas/common';
import { DeckActions } from './DeckActions';
import { searchPathOfDeck } from './deckActions';
import { DeckStatsPanel } from './DeckStatsPanel';

export function DeckInsights({
  unitId,
  name,
  states,
  suspendedStates,
  timeZone,
  leechLapses,
}: {
  /** El mazo por el que Repasar elige y cuenta */
  unitId: string;
  name: string;
  /** El estado de cada tarjeta que Repasar ofrece del mazo, sin las suspendidas */
  states: readonly (FsrsCardState | null)[];
  /** El estado de las suspendidas del mazo, que solo cuentan en las sanguijuelas y la última vez */
  suspendedStates: readonly (FsrsCardState | null)[];
  timeZone: string;
  leechLapses: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {states.length > 0 ? <DeckActions unitId={unitId} name={name} /> : null}
      <DeckStatsPanel
        states={states}
        suspendedStates={suspendedStates}
        timeZone={timeZone}
        leechLapses={leechLapses}
        leechHref={searchPathOfDeck(unitId, { leechesOnly: true })}
      />
    </div>
  );
}
