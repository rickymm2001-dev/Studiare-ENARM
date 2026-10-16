import { describe, expect, it } from 'vitest';
import { AI_ENGINES } from '@/engines/aiContracts';
import type { AiStatus } from './client';
import { engineAccess, engineOpenFor, featureAccess } from './gate';

const engines = {
  forgetting: 'open',
  weekly_report: 'gated',
  flashcards: 'gated',
  bias_tips: 'open',
  restructure: 'gated',
} as const;
const real: AiStatus = { kind: 'real', engines };

describe('compuerta de la IA en la app', () => {
  it('un alumno solo ve los motores abiertos', () => {
    expect(engineOpenFor(real, 'forgetting', 'student')).toBe(true);
    expect(engineOpenFor(real, 'bias_tips', 'student')).toBe(true);
    expect(engineAccess(real, 'weekly_report', 'student')).toBe('gated');
    expect(engineAccess(real, 'flashcards', 'student')).toBe('gated');
  });

  it('un motor que falta en la lista cuenta como cerrado', () => {
    const partial: AiStatus = { kind: 'mock', engines: { forgetting: 'open' } };
    expect(engineAccess(partial, 'bias_tips', 'student')).toBe('gated');
  });

  it('la compuerta solo aplica a alumnos. Médicos, admins y dueño usan todo', () => {
    for (const role of ['physician', 'admin', 'owner'] as const) {
      for (const engine of AI_ENGINES) {
        expect(engineOpenFor(real, engine, role)).toBe(true);
      }
    }
  });

  it('las reestructuradas son solo del equipo, aunque el proxy diga abierto', () => {
    const open: AiStatus = { kind: 'real', engines: { ...engines, restructure: 'open' } };
    expect(engineAccess(open, 'restructure', 'student')).toBe('staff_only');
    expect(engineOpenFor(open, 'restructure', 'physician')).toBe(true);
  });

  it('un proxy de desarrollo, que no manda engines, lo deja todo abierto', () => {
    for (const kind of ['real', 'mock'] as const) {
      expect(engineOpenFor({ kind }, 'flashcards', 'student')).toBe(true);
    }
  });

  it('las respuestas fijas del cliente no tienen compuerta que cuidar', () => {
    expect(engineOpenFor({ kind: 'no-proxy' }, 'flashcards', 'student')).toBe(true);
  });

  it('sin IA, sin conexión o sin saber todavía, no se ofrece y se dice por qué', () => {
    expect(engineAccess({ kind: 'unavailable', reachable: true }, 'forgetting', 'admin')).toBe(
      'unavailable',
    );
    expect(engineAccess({ kind: 'offline' }, 'forgetting', 'student')).toBe('offline');
    expect(engineAccess({ kind: 'checking' }, 'forgetting', 'student')).toBe('checking');
    expect(engineOpenFor({ kind: 'checking' }, 'forgetting', 'physician')).toBe(false);
  });

  it('una función con varios motores está abierta si alguno lo está', () => {
    const tutor = ['forgetting', 'weekly_report', 'bias_tips'] as const;
    expect(featureAccess(real, tutor, 'student')).toBe('open');
    const closed: AiStatus = { kind: 'real', engines: {} };
    expect(featureAccess(closed, tutor, 'student')).toBe('gated');
    expect(featureAccess({ kind: 'unavailable', reachable: false }, tutor, 'student')).toBe(
      'unavailable',
    );
    expect(featureAccess(closed, tutor, 'physician')).toBe('open');
  });
});
