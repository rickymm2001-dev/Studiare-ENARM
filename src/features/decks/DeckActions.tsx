// Qué hacer con un mazo desde su pantalla (V4-B3). Repasar este mazo y Estudiar un tema abren Repasar
// con el mazo ya elegido. Buscar tarjetas abre el buscador con el filtro del mazo puesto.
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { deckStatsText } from '@/i18n/deckStats';
import { Button } from '@/ui/components/button';
import type { ReviewMode } from '../review/selection';
import { presetReviewSelection, searchPathOfDeck } from './deckActions';

export function DeckActions({
  unitId,
  name,
  allUnitIds,
}: {
  /** El mazo por el que Repasar elige y cuenta */
  unitId: string;
  name: string;
  allUnitIds: readonly string[];
}) {
  const navigate = useNavigate();
  const text = deckStatsText.actions;
  const open = (mode: ReviewMode) => {
    presetReviewSelection(mode, unitId, allUnitIds);
    void navigate(screenPath('review'));
  };
  return (
    <div role="group" aria-label={text.label(name)} className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        className="max-sm:min-h-touch"
        onClick={() => {
          open('today');
        }}
      >
        {text.review}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="max-sm:min-h-touch"
        onClick={() => {
          open('topic');
        }}
      >
        {text.topic}
      </Button>
      <Button asChild size="sm" variant="secondary" className="max-sm:min-h-touch">
        <Link to={searchPathOfDeck(unitId)}>{text.search}</Link>
      </Button>
    </div>
  );
}
