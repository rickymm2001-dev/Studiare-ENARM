// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { StudentModel } from '@/data/model/contracts';
import { t } from '@/i18n/es-MX';
import { modelTexts } from '@/i18n/model';
import type { FocusItem } from '../progress/focusItems';
import type { ReportAi } from './aiContent';
import { BiasTipsCard, FatigueCard, WeeklyReportCard } from './TutorSections';
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

  it('un consejo que un médico revisó sale sin la marca de borrador', () => {
    render(
      <BiasTipsCard
        tips={[
          {
            tag: 'anchoring',
            name: 'Sesgo de anclaje',
            tip: 'Texto revisado.',
            level: 'focus',
            examples: [],
            reviewed: true,
          },
        ]}
        calibration={null}
      />,
    );
    expect(screen.getByText(t.tutor.biasTips.reviewedLabel)).toBeVisible();
    expect(screen.queryByText(t.tutor.biasTips.draftLabel)).toBeNull();
  });

  it('la trampa a la que es propenso lleva su etiqueta y las demás no', () => {
    const tip = (tag: string, prone: boolean) => ({
      tag,
      name: `Trampa ${tag}`,
      tip: 'Texto.',
      level: 'focus' as const,
      examples: [],
      prone,
    });
    render(<BiasTipsCard tips={[tip('a', true), tip('b', false)]} calibration={null} />);
    expect(screen.getAllByText(modelTexts.bias.prone)).toHaveLength(1);
    expect(screen.getByText('Trampa a').parentElement).toHaveTextContent(modelTexts.bias.prone);
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

  it('el encabezado dice si el resumen es de plantilla fija o lo redactó la IA, sin prometer una fase que ya llegó', () => {
    const report = ready([item({ key: 'negation', title: 'Negaciones' })]);
    const written: ReportAi = {
      summary: 'Esta semana respondiste 48 preguntas.',
      priorities: [{ ref: 'negation', text: 'Practica las negaciones.' }],
      habit: null,
      challenge: null,
      generatedAt: '2026-10-15T12:00:00.000Z',
      mode: 'real',
      week: '2026-10-12',
    };
    const { rerender } = render(
      <MemoryRouter>
        <WeeklyReportCard report={report} />
      </MemoryRouter>,
    );
    expect(screen.getByText(t.tutor.report.hint)).toBeVisible();
    expect(screen.queryByText(t.tutor.report.hintAi)).toBeNull();
    rerender(
      <MemoryRouter>
        <WeeklyReportCard report={report} ai={written} />
      </MemoryRouter>,
    );
    expect(screen.getByText(t.tutor.report.hintAi)).toBeVisible();
    expect(screen.queryByText(t.tutor.report.hint)).toBeNull();
    // Ninguno habla de una fase futura, porque la IA ya redacta el resumen cuando el motor está abierto
    expect(t.tutor.report.hint).not.toMatch(/fase/i);
    expect(t.tutor.report.hintAi).not.toMatch(/fase/i);
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

describe('fatiga con el estado global del detector (B14, 3.6)', () => {
  const text = modelTexts.fatigue;
  const calibratingWith = (
    validation: StudentModel['fatigue']['validation'],
    have = 5,
  ): StudentModel['fatigue'] => ({ state: 'calibrating', have, need: 3, validation });

  it('mientras el detector no esté validado dice calibrando, aunque ya tenga sus sesiones largas', () => {
    render(<FatigueCard fatigue={calibratingWith('calibrating')} />);
    expect(screen.getByRole('heading', { name: text.title })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(text.validating);
    // No le inventa un conteo de sesiones que no es lo que falta
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(text.detected)).toBeNull();
    expect(screen.queryByText(text.notDetected)).toBeNull();
  });

  it('si el detector no resultó confiable lo dice y tampoco le dice si tiene fatiga', () => {
    render(<FatigueCard fatigue={calibratingWith('not_valid')} />);
    expect(screen.getByRole('status')).toHaveTextContent(text.notValid);
  });

  it('con el detector validado pide las sesiones largas que le faltan', () => {
    render(<FatigueCard fatigue={calibratingWith('validated', 1)} />);
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(`1 de 3 ${text.unit}`);
    expect(note).toHaveTextContent(t.states.calibrating.remaining(2, text.unit));
  });

  it('con el detector validado y sus sesiones dice si detecta la caída o no', () => {
    const { rerender } = render(
      <FatigueCard
        fatigue={{ state: 'ready', value: { detected: true }, validation: 'validated' }}
      />,
    );
    expect(screen.getByText(text.detected)).toBeVisible();
    rerender(
      <FatigueCard
        fatigue={{ state: 'ready', value: { detected: false }, validation: 'validated' }}
      />,
    );
    expect(screen.getByText(text.notDetected)).toBeVisible();
    expect(screen.queryByText(text.detected)).toBeNull();
  });
});
