// @vitest-environment jsdom
// El globo del recorrido guiado y su fondo (B15, 4.3 y 4.4 del plan de B15). jsdom no calcula el diseño,
// así que las medidas del elemento señalado se declaran a mano
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { tourTexts } from '@/i18n/tour';
import { TOUR_STEPS } from './steps';
import { TOUR_LENGTH, type NavLayout } from './tourMachine';
import { TourOverlay, type TourOverlayProps } from './TourOverlay';

function handlers() {
  return { onNext: vi.fn(), onBack: vi.fn(), onSkip: vi.fn() };
}

/** Un elemento que "está" en esas coordenadas de la ventana */
function targetAt(box: { left: number; top: number; width: number; height: number }) {
  const element = document.createElement('a');
  element.textContent = 'Repasar';
  document.body.append(element);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(box.left, box.top, box.width, box.height),
  );
  return element;
}

async function open(props: Partial<TourOverlayProps> = {}) {
  const calls = handlers();
  render(
    <TourOverlay
      index={2}
      target={null}
      layout={'rail' satisfies NavLayout}
      phone={false}
      {...calls}
      {...props}
    />,
  );
  const dialog = await screen.findByRole('dialog');
  return { dialog, ...calls };
}

describe('el globo es un diálogo accesible', () => {
  it('es un diálogo modal con el contador y el título como nombre y el texto como descripción', async () => {
    const { dialog } = await open({ index: 2 });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Paso 3 de 8 Repasar');
    expect(dialog).toHaveAccessibleDescription(tourTexts.steps.review.text);
    expect(screen.getByRole('heading', { name: 'Paso 3 de 8 Repasar' })).toBeVisible();
  });

  it('abre con el foco en el título, que no es un botón, y no se pierde fuera del globo', async () => {
    await open({ index: 4 });
    const title = screen.getByRole('heading', { name: /Paso 5 de 8/ });
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('tabindex', '-1');
  });

  it('al cambiar de paso el foco vuelve al título del paso nuevo', async () => {
    const calls = handlers();
    const view = render(
      <TourOverlay index={1} target={null} layout="rail" phone={false} {...calls} />,
    );
    await screen.findByRole('dialog');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: tourTexts.skip })).toHaveFocus();
    view.rerender(<TourOverlay index={2} target={null} layout="rail" phone={false} {...calls} />);
    expect(screen.getByRole('heading', { name: /Paso 3 de 8/ })).toHaveFocus();
  });

  it('Tab recorre solo Saltar introducción, Atrás y Siguiente, y da la vuelta sin salir del globo', async () => {
    await open({ index: 3 });
    const order = [tourTexts.skip, tourTexts.back, tourTexts.next];
    const focused: (string | null)[] = [];
    for (let press = 0; press < 7; press += 1) {
      await userEvent.tab();
      focused.push(document.activeElement?.textContent ?? null);
    }
    expect(focused).toEqual([...order, ...order, order[0]]);
    // Con Mayús desde el primero da la vuelta al último, y sigue hacia atrás sin salir del globo
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toHaveTextContent(tourTexts.next);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toHaveTextContent(tourTexts.back);
  });

  it('el primer paso no tiene Atrás, así que solo hay dos botones', async () => {
    await open({ index: 0 });
    expect(screen.queryByRole('button', { name: tourTexts.back })).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      tourTexts.skip,
      tourTexts.next,
    ]);
  });

  it('Saltar introducción está en los ocho pasos, también en el último, y Siguiente dice Terminar solo ahí', async () => {
    for (let index = 0; index < TOUR_LENGTH; index += 1) {
      const calls = handlers();
      const view = render(
        <TourOverlay index={index} target={null} layout="rail" phone={false} {...calls} />,
      );
      await screen.findByRole('dialog');
      expect(screen.getByRole('button', { name: tourTexts.skip }), String(index)).toBeVisible();
      const last = index === TOUR_LENGTH - 1;
      expect(
        screen.getByRole('button', { name: last ? tourTexts.finish : tourTexts.next }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: last ? tourTexts.next : tourTexts.finish }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: tourTexts.back }) !== null).toBe(index > 0);
      // Cada paso con su título del plan
      expect(screen.getByRole('dialog')).toHaveAccessibleName(
        `${tourTexts.counter(index + 1, TOUR_LENGTH)} ${tourTexts.steps[TOUR_STEPS[index] ?? 'welcome'].title}`,
      );
      view.unmount();
    }
  });

  it('los botones son de 44 px de alto como mínimo', async () => {
    await open({ index: 5 });
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toMatch(/min-h-touch/);
    }
  });
});

describe('teclado y ratón', () => {
  it('Escape salta la introducción y no cierra el globo por su cuenta', async () => {
    const { dialog, onSkip, onNext, onBack } = await open({ index: 3 });
    await userEvent.keyboard('{Escape}');
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('las flechas cambian de paso y no pasan del primero ni del último', async () => {
    const middle = await open({ index: 3 });
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}');
    expect(middle.onNext).toHaveBeenCalledTimes(2);
    expect(middle.onBack).toHaveBeenCalledTimes(1);
    cleanup();

    const first = await open({ index: 0 });
    await userEvent.keyboard('{ArrowLeft}');
    expect(first.onBack).not.toHaveBeenCalled();
    cleanup();

    // En el último, la flecha no termina el recorrido por accidente. Terminar es un botón
    const last = await open({ index: TOUR_LENGTH - 1 });
    await userEvent.keyboard('{ArrowRight}');
    expect(last.onNext).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: tourTexts.finish }));
    expect(last.onNext).toHaveBeenCalledTimes(1);
  });

  it('los botones llaman a su acción', async () => {
    const { onNext, onBack, onSkip } = await open({ index: 4 });
    await userEvent.click(screen.getByRole('button', { name: tourTexts.back }));
    await userEvent.click(screen.getByRole('button', { name: tourTexts.next }));
    await userEvent.click(screen.getByRole('button', { name: tourTexts.skip }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('un clic fuera del globo no hace nada, para no saltar por accidente', async () => {
    const { dialog, onSkip, onNext, onBack } = await open({ index: 3 });
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    expect(onSkip).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });
});

describe('fondo y forma del globo', () => {
  it('sin elemento oscurece toda la pantalla con un solo rectángulo y va al centro', async () => {
    const { dialog } = await open({ index: 0, target: null });
    expect(dialog).toHaveAttribute('data-tour-mode', 'center');
    const backdrop = document.querySelector('[data-tour-backdrop]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.children).toHaveLength(1);
    expect(backdrop?.firstElementChild?.className).toMatch(/bg-black\/50/);
  });

  it('con un elemento deja el resalte sin oscurecer, con el borde del token indicator', async () => {
    const target = targetAt({ left: 8, top: 120, width: 80, height: 56 });
    const { dialog } = await open({ index: 2, target });
    expect(dialog).toHaveAttribute('data-tour-mode', 'anchored');
    const backdrop = document.querySelector('[data-tour-backdrop]');
    // Cuatro rectángulos oscuros y el borde
    expect(backdrop?.children).toHaveLength(5);
    const hole = backdrop?.lastElementChild as HTMLElement;
    expect(hole.className).toMatch(/border-2/);
    expect(hole.className).toMatch(/border-indicator/);
    expect(hole.className).not.toMatch(/bg-/);
    // El resalte lleva 4 px de aire alrededor del elemento
    expect(hole).toHaveStyle({ top: '116px', left: '4px', width: '88px', height: '64px' });
    const dim = [...(backdrop?.children ?? [])].slice(0, 4);
    for (const rectangle of dim) expect(rectangle.className).toMatch(/bg-black\/50/);
  });

  it('el fondo es decorativo, no tiene nada que se pueda enfocar ni texto que leer', async () => {
    const target = targetAt({ left: 8, top: 120, width: 80, height: 56 });
    await open({ index: 2, target });
    const backdrop = document.querySelector('[data-tour-backdrop]');
    expect(backdrop?.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
    expect(backdrop?.textContent).toBe('');
  });

  it('junto al elemento el globo queda dentro de la pantalla', async () => {
    const target = targetAt({ left: 8, top: 120, width: 80, height: 56 });
    const { dialog } = await open({ index: 2, target });
    const left = Number.parseFloat(dialog.style.left);
    const top = Number.parseFloat(dialog.style.top);
    expect(left).toBeGreaterThanOrEqual(12);
    expect(top).toBeGreaterThanOrEqual(12);
    expect(dialog.style.opacity).toBe('');
  });

  it('en menos de 640 px es una hoja abajo, aunque haya elemento, y el resalte sigue', async () => {
    const target = targetAt({ left: 100, top: 790, width: 90, height: 50 });
    const { dialog } = await open({ index: 2, target, phone: true, layout: 'bar' });
    expect(dialog).toHaveAttribute('data-tour-mode', 'sheet');
    // Flota encima de la barra de abajo, que es lo que señala
    expect(dialog.className).toMatch(/bottom-\[calc\(var\(--spacing-nav\)/);
    expect(document.querySelector('[data-tour-backdrop]')?.children).toHaveLength(5);
  });

  it('un elemento sin tamaño, como uno escondido, cuenta como si no hubiera y va al centro', async () => {
    const target = targetAt({ left: 0, top: 0, width: 0, height: 0 });
    const { dialog } = await open({ index: 2, target });
    expect(dialog).toHaveAttribute('data-tour-mode', 'center');
  });

  it('no anima nada, así que respeta prefers-reduced-motion sin más', async () => {
    const target = targetAt({ left: 8, top: 120, width: 80, height: 56 });
    const { dialog } = await open({ index: 2, target });
    const everything = [dialog, ...document.querySelectorAll('[aria-hidden="true"] *')];
    for (const element of everything) {
      expect(element.className).not.toMatch(/animate-|transition|duration-|scroll-smooth/);
    }
  });
});
