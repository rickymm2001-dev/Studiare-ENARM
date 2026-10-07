import { describe, expect, it } from 'vitest';
import { describeRetryTime } from './device';

// Todas las horas son locales, así la prueba no depende de la zona horaria de quien la corre
const local = (month: number, day: number, hour: number, minute: number, second = 0) =>
  new Date(2030, month - 1, day, hour, minute, second).getTime();

describe('describeRetryTime', () => {
  const now = local(1, 1, 20, 0);

  it('el mismo día dice hoy', () => {
    expect(describeRetryTime(local(1, 1, 23, 45), now)).toBe('a partir de hoy a las 23:45 h');
  });

  it('al día siguiente dice mañana, aunque falten pocas horas', () => {
    expect(describeRetryTime(local(1, 2, 9, 5), now)).toBe('a partir de mañana a las 09:05 h');
    expect(describeRetryTime(local(1, 2, 0, 10), now)).toBe('a partir de mañana a las 00:10 h');
  });

  it('más adelante dice el día y el mes', () => {
    expect(describeRetryTime(local(1, 5, 18, 0), now)).toBe(
      'a partir del 5 de enero a las 18:00 h',
    );
    expect(describeRetryTime(local(12, 31, 8, 0), now)).toBe(
      'a partir del 31 de diciembre a las 08:00 h',
    );
  });

  it('redondea hacia arriba al minuto, para que llegar justo a la hora no sea rechazado', () => {
    expect(describeRetryTime(local(1, 2, 9, 30, 1), now)).toBe('a partir de mañana a las 09:31 h');
    expect(describeRetryTime(local(1, 2, 9, 30, 0), now)).toBe('a partir de mañana a las 09:30 h');
    expect(describeRetryTime(local(1, 1, 23, 59, 30), now)).toBe(
      'a partir de mañana a las 00:00 h',
    );
  });

  it('sin hora conocida dice más tarde', () => {
    expect(describeRetryTime(null, now)).toBe('más tarde');
    expect(describeRetryTime(Number.NaN, now)).toBe('más tarde');
  });

  it('si la hora ya pasó dice en unos momentos', () => {
    expect(describeRetryTime(now, now)).toBe('en unos momentos');
    expect(describeRetryTime(now - 60_000, now)).toBe('en unos momentos');
  });

  it('sin segundo argumento usa la hora actual', () => {
    expect(describeRetryTime(Date.now() + 3 * 86_400_000)).toMatch(
      /^a partir del \d+ de \w+ a las \d{2}:\d{2} h$/,
    );
  });
});
