import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { nextTimeAlerts, type TimeAlertInput } from './timeAlerts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Examen de 280 preguntas a 77 segundos cada una */
const FULL = 280 * 77_000;

const input = (overrides: Partial<TimeAlertInput> = {}): TimeAlertInput => ({
  totalMs: FULL,
  elapsedMs: 0,
  totalQuestions: 280,
  answeredQuestions: 0,
  fired: new Set(),
  ...overrides,
});

describe('alertas de tiempo (D-080)', () => {
  it('al empezar no avisa nada', () => {
    expect(nextTimeAlerts(input())).toEqual({ show: null, consumed: [] });
  });

  it('avisa la mitad del tiempo una sola vez', () => {
    const first = nextTimeAlerts(
      input({
        elapsedMs: FULL * 0.5,
        answeredQuestions: 140,
        fired: new Set(['pace-20', 'pace-40']),
      }),
    );
    expect(first.show?.kind).toBe('halfway');
    expect(first.show?.severity).toBe('info');
    expect(first.consumed).toEqual(['half']);
    const again = nextTimeAlerts(
      input({
        elapsedMs: FULL * 0.5 + 1000,
        answeredQuestions: 141,
        fired: new Set(['pace-20', 'pace-40', ...first.consumed]),
      }),
    );
    expect(again).toEqual({ show: null, consumed: [] });
  });

  it('avisa los minutos que quedan y el último minuto es crítico', () => {
    const fired = new Set(['half', 'quarter', 'pace-20', 'pace-40', 'pace-60', 'pace-80']);
    const ten = nextTimeAlerts(
      input({ elapsedMs: FULL - 10 * MINUTE, answeredQuestions: 250, fired }),
    );
    expect(ten.show).toMatchObject({ kind: 'minutes_left', minutesLeft: 10, severity: 'warning' });
    const one = nextTimeAlerts(
      input({
        elapsedMs: FULL - MINUTE,
        answeredQuestions: 270,
        fired: new Set([...fired, 'min-10', 'min-5']),
      }),
    );
    expect(one.show).toMatchObject({ kind: 'minutes_left', minutesLeft: 1, severity: 'critical' });
  });

  it('al llegar a cero avisa que se acabó el tiempo', () => {
    const fired = new Set(['half', 'quarter', 'min-10', 'min-5', 'min-1']);
    const result = nextTimeAlerts(input({ elapsedMs: FULL, answeredQuestions: 200, fired }));
    expect(result.show).toMatchObject({ kind: 'time_up', severity: 'critical', remainingMs: 0 });
  });

  it('un examen corto no avisa umbrales que no le caben', () => {
    const total = 8 * MINUTE;
    const start = nextTimeAlerts(input({ totalMs: total, totalQuestions: 6, elapsedMs: 0 }));
    expect(start.show).toBeNull();
    // Faltan 9 minutos no existe. Con 5 sí aparece el aviso de minutos
    const five = nextTimeAlerts(
      input({
        totalMs: total,
        totalQuestions: 6,
        elapsedMs: 3 * MINUTE,
        answeredQuestions: 3,
        fired: new Set(['half', 'pace-20', 'pace-40']),
      }),
    );
    expect(five.show).toMatchObject({ kind: 'minutes_left', minutesLeft: 5 });
  });

  it('avisa del ritmo solo si va atrasado y sugiere segundos por pregunta', () => {
    const behind = nextTimeAlerts(input({ elapsedMs: FULL * 0.2, answeredQuestions: 20 }));
    expect(behind.show).toMatchObject({
      kind: 'behind_pace',
      behindBy: 56 - 20,
      unanswered: 260,
    });
    // Le quedan 80% del tiempo para 260 preguntas
    expect(behind.show?.suggestedSecondsPerQuestion).toBe(Math.floor((FULL * 0.8) / 1000 / 260));
    // Al día no avisa, pero consume el checkpoint
    const onPace = nextTimeAlerts(input({ elapsedMs: FULL * 0.2, answeredQuestions: 56 }));
    expect(onPace).toEqual({ show: null, consumed: ['pace-20'] });
  });

  it('la tolerancia de ritmo es de 5% de las preguntas con mínimo de 2', () => {
    // 280 preguntas, tolerancia 14. Un atraso de 14 no avisa y de 15 sí
    expect(
      nextTimeAlerts(input({ elapsedMs: FULL * 0.2, answeredQuestions: 56 - 14 })).show,
    ).toBeNull();
    expect(
      nextTimeAlerts(input({ elapsedMs: FULL * 0.2, answeredQuestions: 56 - 15 })).show?.kind,
    ).toBe('behind_pace');
    // 20 preguntas, tolerancia mínima de 2. Al 40% se esperan 8
    const total = 20 * 77_000;
    const small = (answered: number) =>
      nextTimeAlerts({
        totalMs: total,
        elapsedMs: total * 0.4,
        totalQuestions: 20,
        answeredQuestions: answered,
        fired: new Set(['pace-20']),
      }).show;
    expect(small(6)).toBeNull();
    expect(small(5)?.kind).toBe('behind_pace');
  });

  it('si se cruzaron varios de golpe muestra el más urgente y consume todos', () => {
    // La pestaña estuvo dormida y se vuelve con 4 minutos restantes
    const result = nextTimeAlerts(input({ elapsedMs: FULL - 4 * MINUTE, answeredQuestions: 100 }));
    expect(result.show).toMatchObject({ kind: 'minutes_left', minutesLeft: 5 });
    expect(result.consumed).toEqual(
      expect.arrayContaining(['half', 'quarter', 'min-10', 'min-5', 'pace-20', 'pace-80']),
    );
    expect(result.consumed).not.toContain('min-1');
  });

  it('ignora tiempos fuera de rango y totales vacíos', () => {
    expect(nextTimeAlerts(input({ totalMs: 0 }))).toEqual({ show: null, consumed: [] });
    expect(nextTimeAlerts(input({ elapsedMs: -5000 })).show).toBeNull();
    const over = nextTimeAlerts(input({ elapsedMs: FULL + HOUR, answeredQuestions: 280 }));
    expect(over.show?.kind).toBe('time_up');
  });

  it('propiedad. Recorriendo el reloj cada aviso sale una sola vez y el fin del tiempo es el último', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 280 }),
        fc.array(fc.integer({ min: 1, max: 20 * MINUTE }), { minLength: 1, maxLength: 60 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (questions, steps, speed) => {
          const total = questions * 77_000;
          const fired = new Set<string>();
          const shown: string[] = [];
          let elapsed = 0;
          const run = (at: number) => {
            const answered = Math.min(questions, Math.floor(questions * (at / total) * speed));
            const result = nextTimeAlerts({
              totalMs: total,
              elapsedMs: at,
              totalQuestions: questions,
              answeredQuestions: answered,
              fired,
            });
            for (const id of result.consumed) {
              expect(fired.has(id)).toBe(false);
              fired.add(id);
            }
            if (result.show) {
              expect(result.consumed).toContain(result.show.id);
              shown.push(result.show.id);
            }
          };
          for (const step of steps) {
            elapsed = Math.min(total, elapsed + step);
            run(elapsed);
          }
          run(total);
          expect(new Set(shown).size).toBe(shown.length);
          expect(shown.at(-1)).toBe('time-up');
        },
      ),
    );
  });
});
