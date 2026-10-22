// @vitest-environment jsdom
// La tarjeta de nivel cognitivo de Progreso (V4-B5). Cada grupo calibra hasta tener respuestas
// suficientes y después da su exactitud. Sin preguntas con nivel todo queda calibrando.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cognitiveRows } from '@/engines/bloom';
import { t } from '@/i18n/es-MX';
import { CognitiveCard } from './CognitiveCard';

afterEach(() => {
  cleanup();
});

const answers = (
  level: 'knowledge' | 'application' | 'evaluation',
  correct: number,
  total: number,
) => Array.from({ length: total }, (_, i) => ({ cognitiveLevel: level, correct: i < correct }));

describe('CognitiveCard', () => {
  it('sin preguntas con nivel los tres grupos calibran y dicen cuántas respuestas faltan', () => {
    render(<CognitiveCard rows={cognitiveRows({ responses: [], minResponses: 10 })} />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(3);
    for (const status of statuses) expect(status).toHaveTextContent(t.cognitive.calibrating(10));
  });

  it('con respuestas suficientes da el porcentaje de cada grupo y su cuenta', () => {
    const rows = cognitiveRows({
      responses: [...answers('knowledge', 8, 10), ...answers('application', 5, 10)],
      minResponses: 10,
    });
    render(<CognitiveCard rows={rows} />);
    const low = screen.getByText(t.cognitive.groups.low).closest('li') as HTMLElement;
    expect(within(low).getByText('80%')).toBeTruthy();
    expect(within(low).getByText(t.cognitive.of(8, 10))).toBeTruthy();
    const medium = screen.getByText(t.cognitive.groups.medium).closest('li') as HTMLElement;
    expect(within(medium).getByText('50%')).toBeTruthy();
    // El alto sigue calibrando porque no tiene respuestas
    const high = screen.getByText(t.cognitive.groups.high).closest('li') as HTMLElement;
    expect(within(high).getByRole('status')).toHaveTextContent(t.cognitive.calibrating(10));
  });
});
