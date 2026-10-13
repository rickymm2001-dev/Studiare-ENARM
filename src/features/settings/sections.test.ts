// Anclas de Configuración y enlaces viejos con ?seccion= (B3 del plan del cambio, comentario 5)
import { describe, expect, it } from 'vitest';
import { SCREENS } from '@/app/screens';
import { legacyRedirect, requestedSection, settingsPath } from './sections';

describe('secciones de Configuración', () => {
  it('cada sección tiene su ancla en español', () => {
    expect(settingsPath()).toBe(SCREENS.settings.path);
    expect(settingsPath('privacidad')).toBe(`${SCREENS.settings.path}#privacidad`);
  });

  it('las pestañas de antes llevan a su sección y el ancla manda sobre ellas', () => {
    expect(requestedSection('', 'account')).toBe('perfil');
    expect(requestedSection('', 'appearance')).toBe('apariencia');
    expect(requestedSection('', 'privacy')).toBe('privacidad');
    expect(requestedSection('#apariencia', 'privacy')).toBe('apariencia');
    expect(requestedSection('#perfil', null)).toBe('perfil');
    expect(requestedSection('', null)).toBeNull();
    expect(requestedSection('#otra', 'nada')).toBeNull();
  });

  it('Estudio manda a Ajustes del repaso, Pomodoro a su parte del panel y lo demás se queda', () => {
    expect(legacyRedirect('study')).toBe(`${SCREENS.review.path}?ajustes=1`);
    expect(legacyRedirect('pomodoro')).toBe(`${SCREENS.review.path}?ajustes=pomodoro`);
    expect(legacyRedirect('account')).toBeNull();
    expect(legacyRedirect(null)).toBeNull();
    // Un nombre que existe en cualquier objeto no es una pestaña de antes
    expect(legacyRedirect('constructor')).toBeNull();
    expect(requestedSection('', 'constructor')).toBeNull();
  });
});
