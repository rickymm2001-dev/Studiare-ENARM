// De la ruta a las anclas del recorrido (B15, 4.3 y 7.5 del plan de B15)
import { describe, expect, it } from 'vitest';
import { NAV_BY_ROLE, topBarItems } from '@/app/navigation';
import { SCREEN_KEYS, SCREENS } from '@/app/screens';
import { NAV_MORE_ANCHOR, NAV_TOP_MORE_ANCHOR, navAnchorOfPath, screenKeyOfPath } from './anchors';
import { STEP_SPECS } from './tourMachine';

describe('anclas del recorrido', () => {
  it('cada ruta de las pantallas da su clave, y ninguna se repite', () => {
    for (const key of SCREEN_KEYS) expect(screenKeyOfPath(SCREENS[key].path), key).toBe(key);
    expect(new Set(SCREEN_KEYS.map((key) => SCREENS[key].path)).size).toBe(SCREEN_KEYS.length);
  });

  it('tolera la diagonal final y no inventa pantallas', () => {
    expect(screenKeyOfPath('/repasar/')).toBe('review');
    expect(screenKeyOfPath('/')).toBe('home');
    expect(screenKeyOfPath('/no-existe')).toBeUndefined();
    expect(screenKeyOfPath('')).toBeUndefined();
  });

  it('la sección del menú se llama nav- y la clave de su pantalla', () => {
    expect(navAnchorOfPath(SCREENS.review.path)).toBe('nav-review');
    expect(navAnchorOfPath(SCREENS.simulatorSetup.path)).toBe('nav-simulatorSetup');
    expect(navAnchorOfPath('/otra-cosa')).toBeUndefined();
    expect(NAV_MORE_ANCHOR).toBe('nav-more');
  });

  it('todo lo que señala un paso existe en el menú del alumno, en la barra en línea o en Más', () => {
    const nav = NAV_BY_ROLE.student;
    const inRail = new Set([
      NAV_TOP_MORE_ANCHOR,
      ...topBarItems(nav).map((item) => navAnchorOfPath(item.path)),
    ]);
    const inBar = new Set([
      NAV_MORE_ANCHOR,
      ...nav.main.filter((item) => item.bar === true).map((item) => navAnchorOfPath(item.path)),
    ]);
    for (const spec of Object.values(STEP_SPECS)) {
      if (spec.anchor.rail !== null) expect(inRail).toContain(spec.anchor.rail);
      if (spec.anchor.bar !== null) expect(inBar).toContain(spec.anchor.bar);
    }
  });
});
