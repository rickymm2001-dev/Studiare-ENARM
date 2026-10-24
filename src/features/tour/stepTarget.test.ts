// @vitest-environment jsdom
// Cómo encuentra el recorrido lo que señala cada paso (B15, 4.2 del plan de B15)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANCHOR_WAIT_MS, isShown, probeStep, stepIsReady, targetOf } from './stepTarget';

/** jsdom no calcula el diseño, así que lo que "se ve" se declara con este atributo */
function shownByAttribute() {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.hasAttribute('data-hidden')
      ? []
      : [new DOMRect(0, 0, 10, 10)]) as unknown as DOMRectList;
  });
}

beforeEach(shownByAttribute);
afterEach(() => {
  document.body.replaceChildren();
});

function page(html: string) {
  document.body.innerHTML = html;
}

describe('qué hay de lo que pide un paso', () => {
  it('la bienvenida no lleva ancla, solo espera la pantalla', () => {
    expect(probeStep('welcome', 'rail', 'student')).toEqual({
      anchor: 'none',
      element: null,
      screenReady: false,
    });
    page('<header data-tour-screen="home"></header>');
    expect(probeStep('welcome', 'rail', 'student').screenReady).toBe(true);
  });

  it('encuentra el elemento del menú del paso y la pantalla ya pintada', () => {
    page(`<header data-tour-screen="review"></header>
      <nav><a data-tour="nav-review">Repasar</a></nav>`);
    const probe = probeStep('review', 'rail', 'student');
    expect(probe.anchor).toBe('found');
    expect(probe.element?.textContent).toBe('Repasar');
    expect(probe.screenReady).toBe(true);
    expect(targetOf(probe)).toBe(probe.element);
  });

  it('usa el ancla del teléfono, Más, para lo que no cabe en la barra', () => {
    page(`<a data-tour="nav-outlines">Apuntes</a><button data-tour="nav-more">Más</button>`);
    expect(probeStep('outlines', 'rail', 'student').element?.textContent).toBe('Apuntes');
    expect(probeStep('outlines', 'bar', 'student').element?.textContent).toBe('Más');
  });

  it('un ancla escondida, como un menú que no se ve, no se resalta y no se espera', () => {
    page(`<header data-tour-screen="settings"></header>
      <a data-tour="nav-more-top" data-hidden>Más</a>`);
    const probe = probeStep('settings', 'rail', 'student');
    expect(probe.anchor).toBe('hidden');
    expect(targetOf(probe)).toBeNull();
    expect(stepIsReady(probe, 0)).toBe(true);
  });

  it('sin el ancla en la página, espera, y al pasar 3 segundos sigue sin romperse, al centro', () => {
    page('<header data-tour-screen="party"></header>');
    const probe = probeStep('party', 'rail', 'student');
    expect(probe.anchor).toBe('missing');
    expect(stepIsReady(probe, 0)).toBe(false);
    expect(stepIsReady(probe, ANCHOR_WAIT_MS - 1)).toBe(false);
    expect(stepIsReady(probe, ANCHOR_WAIT_MS)).toBe(true);
    expect(targetOf(probe)).toBeNull();
  });

  it('espera a la pantalla aunque el menú ya esté, y al pasar 3 segundos muestra el paso igual', () => {
    page('<a data-tour="nav-progress">Progreso</a>');
    const probe = probeStep('progress', 'bar', 'student');
    expect(probe.anchor).toBe('found');
    expect(stepIsReady(probe, 100)).toBe(false);
    expect(stepIsReady(probe, ANCHOR_WAIT_MS)).toBe(true);
  });

  it('un médico no tiene estas secciones en su menú, así que va al centro', () => {
    page('<header data-tour-screen="review"></header><a data-tour="nav-review">Repasar</a>');
    const probe = probeStep('review', 'rail', 'physician');
    expect(probe.anchor).toBe('none');
    expect(targetOf(probe)).toBeNull();
  });

  it('isShown descarta lo que no ocupa lugar o está oculto con visibility', () => {
    page('<a id="a">a</a><a id="b" data-hidden>b</a><a id="c" style="visibility: hidden">c</a>');
    expect(isShown(document.getElementById('a') as HTMLElement)).toBe(true);
    expect(isShown(document.getElementById('b') as HTMLElement)).toBe(false);
    expect(isShown(document.getElementById('c') as HTMLElement)).toBe(false);
  });
});
