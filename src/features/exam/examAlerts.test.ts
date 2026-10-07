import { describe, expect, it } from 'vitest';
import { nextTimeAlerts, type TimeAlert } from '@/engines/timeAlerts';
import { alertMessage, alertVisibleMs } from './examAlerts';

const MINUTE = 60_000;
const TOTAL = 100 * 77_000;
const progress = { answered: 30, total: 100 };

const fired = (...ids: string[]) => new Set(ids);

describe('texto de los avisos del examen', () => {
  it('dice cada aviso con sus cifras', () => {
    const half = nextTimeAlerts({
      totalMs: TOTAL,
      elapsedMs: TOTAL / 2,
      totalQuestions: 100,
      answeredQuestions: 50,
      fired: fired('pace-20', 'pace-40'),
    }).show as TimeAlert;
    expect(alertMessage(half, { answered: 50, total: 100 })).toBe(
      'Va la mitad del tiempo. Llevas 50 de 100 contestadas.',
    );

    const ten = nextTimeAlerts({
      totalMs: TOTAL,
      elapsedMs: TOTAL - 10 * MINUTE,
      totalQuestions: 100,
      answeredQuestions: 90,
      fired: fired('half', 'quarter', 'pace-20', 'pace-40', 'pace-60', 'pace-80'),
    }).show as TimeAlert;
    expect(alertMessage(ten, progress)).toBe('Quedan 10 minutos.');

    const one = nextTimeAlerts({
      totalMs: TOTAL,
      elapsedMs: TOTAL - MINUTE,
      totalQuestions: 100,
      answeredQuestions: 95,
      fired: fired(
        'half',
        'quarter',
        'min-10',
        'min-5',
        'pace-20',
        'pace-40',
        'pace-60',
        'pace-80',
      ),
    }).show as TimeAlert;
    expect(alertMessage(one, progress)).toBe('Queda 1 minuto.');

    const behind = nextTimeAlerts({
      totalMs: TOTAL,
      elapsedMs: TOTAL * 0.2,
      totalQuestions: 100,
      answeredQuestions: 5,
      fired: fired(),
    }).show as TimeAlert;
    expect(alertMessage(behind, { answered: 5, total: 100 })).toMatch(
      /^Vas 15 preguntas atrás del ritmo\. .* unos \d+ segundos por pregunta en las 95 que faltan\.$/,
    );

    const up = nextTimeAlerts({
      totalMs: TOTAL,
      elapsedMs: TOTAL,
      totalQuestions: 100,
      answeredQuestions: 80,
      fired: fired('half', 'quarter', 'min-10', 'min-5', 'min-1'),
    }).show as TimeAlert;
    expect(alertMessage(up, progress)).toBe('Se acabó el tiempo.');
  });

  it('un cuarto del tiempo se dice en minutos redondeados', () => {
    expect(
      alertMessage(
        { id: 'quarter', kind: 'quarter_left', severity: 'warning', remainingMs: 2_000_000 },
        progress,
      ),
    ).toBe('Queda un cuarto del tiempo, unos 33 minutos.');
  });

  it('los avisos críticos se quedan más tiempo', () => {
    expect(alertVisibleMs({ severity: 'info' })).toBeLessThan(
      alertVisibleMs({ severity: 'critical' }),
    );
  });
});
