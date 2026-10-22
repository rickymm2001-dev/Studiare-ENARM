// @vitest-environment jsdom
// Etiqueta en el nombre (WCAG 2.5.3, B18, hallazgo 6 de la revisión). Quien usa control por voz dice "clic en No quiero
// contestarla", y eso solo funciona si el nombre accesible del botón contiene su texto visible. El aria-label de No quiero
// contestarla decía "No quiero contestar la encuesta", que no lo contiene. Aquí se comparan el nombre y el texto visible de
// todo lo que se pulsa en la franja y en el formulario, y la e2e lo repite en el navegador con la regla
// label-content-name-mismatch de axe.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { surveyTexts } from '@/i18n/survey';
import { SurveyForm } from './SurveyForm';
import { SurveyNotice } from './SurveyNotice';
import { forgetSurveyStatus } from './surveyStatus';
import { createFakeSurveyState, fakeSurveyCloud } from './testing/fakeSurveyCloud';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = surveyTexts;

beforeEach(() => {
  localStorage.clear();
  forgetSurveyStatus();
  holder.cloud = fakeSurveyCloud(createFakeSurveyState());
});

afterEach(() => {
  cleanup();
  holder.cloud = null;
});

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

/** El texto que se ve de un control, sin los íconos ni lo que solo lee el lector de pantalla */
function visibleText(element: Element): string {
  let result = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) result += node.textContent ?? '';
    else if (
      node instanceof Element &&
      node.getAttribute('aria-hidden') !== 'true' &&
      !node.classList.contains('sr-only')
    ) {
      result += visibleText(node);
    }
  }
  return normalize(result);
}

/**
 * Todo lo que se pulsa dentro de root con un aria-label debe tener un nombre que contenga el texto que se ve. Sin
 * aria-label, el nombre sale del texto visible y no hay nada que comparar. Devuelve cuántos controles revisó
 */
function expectLabelInName(root: HTMLElement): number {
  let checked = 0;
  for (const control of root.querySelectorAll('button, a[href], [role="button"], [role="link"]')) {
    const visible = visibleText(control);
    const label = control.getAttribute('aria-label');
    if (label === null || visible === '') continue;
    checked += 1;
    expect(normalize(label), `el nombre de "${visible}" debe contener su texto visible`).toContain(
      visible,
    );
  }
  return checked;
}

describe('etiqueta en el nombre', () => {
  it('los nombres accesibles de la franja empiezan con el texto de su botón', () => {
    expect(text.notice.laterLabel.startsWith(text.actions.later)).toBe(true);
    expect(text.notice.neverLabel.startsWith(text.actions.never)).toBe(true);
    // El texto de antes ("No quiero contestar la encuesta") no contenía el visible
    expect(text.notice.neverLabel).not.toMatch(/contestar la encuesta/);
  });

  it('la franja: Contestar, Ahora no y No quiero contestarla', async () => {
    render(
      <MemoryRouter>
        <SurveyNotice userId="ana" />
      </MemoryRouter>,
    );
    const region = await screen.findByRole('region', { name: text.notice.region });
    // Dos botones con aria-label (Ahora no y No quiero contestarla), y Contestar sin él
    await waitFor(() => {
      expect(expectLabelInName(region)).toBe(2);
    });
    for (const [visible, label] of [
      [text.actions.later, text.notice.laterLabel],
      [text.actions.never, text.notice.neverLabel],
    ] as const) {
      // Con el nombre accesible completo se encuentra el botón, y el nombre empieza con lo que se ve
      expect(screen.getByRole('button', { name: label })).toHaveTextContent(visible);
    }
    // Y quien dice lo que ve ("No quiero contestarla") encuentra el botón por una parte del nombre
    expect(screen.getByRole('button', { name: new RegExp(text.actions.never) })).toBeVisible();
  });

  it('el formulario: ningún control con aria-label pierde su texto visible', () => {
    const { container } = render(<SurveyForm userId="ana" onDone={vi.fn()} />);
    expectLabelInName(container);
    // Enviar mis respuestas se llama como se ve
    expect(screen.getByRole('button', { name: text.actions.send })).toBeVisible();
  });
});
