// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import type { FocusItem } from '../progress/focusItems';
import { BiasTipsCard, WeeklyReportCard } from './TutorSections';
import type { WeeklyReport } from './weeklyReport';

describe('consejos por sesgo', () => {
  it('mientras faltan errores con trampa etiquetada dice cuántos lleva y cuántos pide', () => {
    render(<BiasTipsCard tips={[]} calibration={{ have: 10, need: 40 }} />);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(t.states.calibrating.title);
    expect(note).toHaveTextContent(`10 de 40 ${t.tutor.biasTips.unit}`);
    expect(note).toHaveTextContent(t.states.calibrating.remaining(30, t.tutor.biasTips.unit));
    // No dice que ninguna trampa se repita, porque todavía no se sabe
    expect(screen.queryByText(t.tutor.biasTips.none)).toBeNull();
  });

  it('el título dice trampas por defecto y sesgos cuando los médicos coinciden', () => {
    const { rerender } = render(<BiasTipsCard tips={[]} calibration={null} />);
    expect(screen.getByRole('heading', { name: 'Consejos por trampa' })).toBeVisible();
    rerender(<BiasTipsCard tips={[]} calibration={null} vocabulary="bias" />);
    expect(screen.getByRole('heading', { name: 'Consejos por sesgo' })).toBeVisible();
  });

  it('con datos suficientes y sin trampas repetidas lo dice', () => {
    render(<BiasTipsCard tips={[]} calibration={null} />);
    expect(screen.getByText(t.tutor.biasTips.none)).toBeVisible();
  });

  it('cada consejo va marcado como borrador pendiente de revisión médica', () => {
    render(
      <BiasTipsCard
        tips={[
          {
            tag: 'anchoring',
            name: 'Sesgo de anclaje',
            tip: 'Nombra el dato.',
            level: 'focus',
            examples: [],
          },
        ]}
        calibration={null}
      />,
    );
    expect(screen.getByText('Sesgo de anclaje')).toBeVisible();
    expect(screen.getByText(t.tutor.biasTips.draftLabel)).toBeVisible();
  });
});

describe('resumen del tutor', () => {
  const item = (overrides: Partial<FocusItem>): FocusItem => ({
    key: 'k',
    kind: 'Técnica',
    title: 'Título',
    action: 'Qué hacer',
    draft: false,
    to: '/simular',
    review: false,
    ...overrides,
  });
  const ready = (priorities: FocusItem[]): WeeklyReport => ({
    ready: true,
    priorities,
    habit: null,
    challenge: null,
  });

  it('marca como borrador la prioridad que viene de un consejo por sesgo y no las demás', () => {
    render(
      <MemoryRouter>
        <WeeklyReportCard
          report={ready([
            item({ key: 'bias:anchoring', title: 'Sesgo de anclaje', draft: true }),
            item({ key: 'negation', title: 'Negaciones' }),
          ])}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(t.tutor.biasTips.draftLabel)).toHaveLength(1);
  });

  it('antes de las respuestas mínimas calibra con cuántas lleva', () => {
    render(
      <MemoryRouter>
        <WeeklyReportCard report={{ ready: false, have: 7, need: 20 }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('7 de 20');
  });
});
