// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { StudentModel } from '@/data/model/contracts';
import { t } from '@/i18n/es-MX';
import { TargetedSamplingField } from './TargetedSamplingField';

const text = t.simulator.targeted;
const modelWith = (bias: Partial<StudentModel['bias']>): StudentModel =>
  ({
    bias: { vocabulary: 'trap', prone: [], baseline: 'chance', byTag: {}, ...bias },
  }) as unknown as StudentModel;

describe('dirigir las opciones a tus trampas', () => {
  it('mientras carga el modelo lo dice y no ofrece nada', () => {
    render(<TargetedSamplingField model={undefined} checked={false} onChange={() => undefined} />);
    expect(screen.getByText(text.loading)).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('calibrando dice cuántos errores con trampa etiquetada lleva y cuántos pide', () => {
    render(
      <TargetedSamplingField
        model={modelWith({
          byTag: { anchoring: { state: 'calibrating', have: 10, need: 40 } },
        })}
        checked={false}
        onChange={() => undefined}
      />,
    );
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(`10 de 40 ${text.unit}`);
    expect(screen.getByText(text.calibrating)).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('un alumno nuevo empieza en cero de los errores que pide el motor', () => {
    render(
      <TargetedSamplingField model={modelWith({})} checked={false} onChange={() => undefined} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `0 de ${DEFAULT_THRESHOLDS.bias.minTaggedErrors} ${text.unit}`,
    );
  });

  it('sin trampas propensas lo dice y no ofrece la casilla', () => {
    render(
      <TargetedSamplingField
        model={modelWith({ byTag: { anchoring: { state: 'ready', value: 0.2 } } })}
        checked={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText(text.none)).toBeVisible();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('con trampas propensas ofrece la casilla con sus nombres y avisa al cambiarla', async () => {
    const onChange = vi.fn();
    render(
      <TargetedSamplingField
        model={modelWith({
          byTag: { anchoring: { state: 'ready', value: 0.6 } },
          prone: ['anchoring'],
        })}
        checked={false}
        onChange={onChange}
      />,
    );
    const box = screen.getByRole('checkbox', { name: new RegExp(text.label) });
    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('sigue valiendo con el informe de Conócete mientras otros no pasan el modelo', () => {
    render(
      <TargetedSamplingField
        report={{
          insights: [
            {
              id: 'biases',
              area: 'traps',
              weight: 1,
              state: { kind: 'calibrating', have: 5, need: 40, unit: 'tagged_errors' },
            },
          ],
          strengths: [],
          focus: [],
          totals: { answers: 0, reviews: 0, taggedErrors: 5, sessions: 0 },
        }}
        checked={false}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(`5 de 40 ${text.unit}`);
  });
});
