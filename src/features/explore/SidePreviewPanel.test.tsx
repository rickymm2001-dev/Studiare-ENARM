// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExploreRow } from '@/engines/explore';
import { SidePreviewPanel } from './SidePreviewPanel';
import { t } from '@/i18n/es-MX';

afterEach(cleanup);

const MANUAL_CARD: ExploreRow = {
  cardId: 'c1',
  noteId: 'n1',
  deckId: 'd1',
  deckName: 'Mi Mazo Propio',
  topic: 'Nefrología',
  front: 'Causa frecuente de IRA intrínseca',
  back: 'Necrosis tubular aguda',
  interval: 5,
  kind: 'basic',
  ordinal: 0,
  tags: ['renal'],
  suspended: false,
  due: '2026-10-15T12:00:00.000Z',
  lapses: 2,
  origin: 'manual',
  fsrs: 'review',
  leech: false,
  controversy: null,
  aiDraft: false,
  search: 'ira intrinseca',
  isDemo: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const PRELOADED_CARD: ExploreRow = {
  cardId: 'c2',
  noteId: 'n2',
  deckId: 'd2',
  deckName: 'Medicina interna (Paco)',
  topic: 'Reumatología',
  front: 'Anticuerpo específico en lupus',
  back: 'Anti-Sm y anti-DNA doble cadena',
  interval: 30,
  kind: 'basic',
  ordinal: 0,
  tags: ['reuma'],
  suspended: true,
  due: '2026-11-01T12:00:00.000Z',
  lapses: 0,
  origin: 'preloaded',
  fsrs: 'review',
  leech: false,
  controversy: null,
  aiDraft: false,
  search: 'anticuerpo lupus',
  isDemo: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('SidePreviewPanel', () => {
  it('muestra mensaje cuando no hay tarjeta seleccionada', () => {
    render(
      <SidePreviewPanel
        card={null}
        faces={null}
        onClose={vi.fn()}
        timeZone="America/Mexico_City"
      />,
    );

    expect(screen.getByText(/selecciona una tarjeta/i)).toBeInTheDocument();
  });

  it('muestra detalles de la tarjeta y metadatos FSRS', () => {
    render(
      <SidePreviewPanel
        card={MANUAL_CARD}
        faces={{ front: MANUAL_CARD.front, back: MANUAL_CARD.back }}
        onClose={vi.fn()}
        timeZone="America/Mexico_City"
      />,
    );

    expect(screen.getByText('Mi Mazo Propio')).toBeInTheDocument();
    expect(screen.getByText('Nefrología')).toBeInTheDocument();
    expect(screen.getByText('Causa frecuente de IRA intrínseca')).toBeInTheDocument();
    expect(screen.getByText('Necrosis tubular aguda')).toBeInTheDocument();
    expect(screen.getByText(/5 días/i)).toBeInTheDocument();
    expect(screen.getByText('Propia')).toBeInTheDocument();
  });

  it('permite editar frente y reverso en notas propias y guardar', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <SidePreviewPanel
        card={MANUAL_CARD}
        faces={{ front: MANUAL_CARD.front, back: MANUAL_CARD.back }}
        onClose={vi.fn()}
        onSaveNote={onSave}
        timeZone="America/Mexico_City"
      />,
    );

    const editBtn = screen.getByRole('button', { name: t.explore.sidePanel.edit });
    fireEvent.click(editBtn);

    const frontInput = screen.getByLabelText(t.explore.sidePanel.frontLabel);
    const backInput = screen.getByLabelText(t.explore.sidePanel.backLabel);

    fireEvent.change(frontInput, { target: { value: 'Nueva pregunta de nefrología' } });
    fireEvent.change(backInput, { target: { value: 'Nueva respuesta actualizada' } });

    const saveBtn = screen.getByRole('button', { name: t.explore.sidePanel.save });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'n1',
        'Nueva pregunta de nefrología',
        'Nueva respuesta actualizada',
      );
    });
  });

  it('muestra aviso de solo lectura en notas precargadas y permite suspender/reanudar', () => {
    const onToggleSuspend = vi.fn().mockResolvedValue(undefined);

    render(
      <SidePreviewPanel
        card={PRELOADED_CARD}
        faces={{ front: PRELOADED_CARD.front, back: PRELOADED_CARD.back }}
        onClose={vi.fn()}
        onToggleSuspend={onToggleSuspend}
        timeZone="America/Mexico_City"
      />,
    );

    expect(screen.getByText(t.explore.sidePanel.readOnly)).toBeInTheDocument();
    expect(screen.getByText(t.explore.statusOne.suspended)).toBeInTheDocument();

    const unsuspendBtn = screen.getByRole('button', { name: t.explore.actions.unsuspend });
    fireEvent.click(unsuspendBtn);
    expect(onToggleSuspend).toHaveBeenCalledWith('c2', false);
  });
});
