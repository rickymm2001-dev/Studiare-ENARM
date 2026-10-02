// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import { routes } from './router';
import { SCREEN_KEYS, SCREENS } from './screens';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe('rutas', () => {
  it('registra las 26 pantallas de la sección 10 con rutas únicas', () => {
    expect(SCREEN_KEYS).toHaveLength(26);
    const paths = SCREEN_KEYS.map((key) => SCREENS[key].path);
    expect(new Set(paths).size).toBe(26);
    const numbers = SCREEN_KEYS.map((key) => SCREENS[key].number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 26 }, (_, index) => index + 1));
  });

  it('muestra Inicio con la navegación de 5 secciones', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.home.title }),
    ).toBeVisible();
    const nav = screen.getByRole('navigation', { name: t.nav.label });
    expect(nav.querySelectorAll('a')).toHaveLength(5);
  });

  it('muestra la pantalla de no encontrada en una ruta desconocida', async () => {
    renderAt('/no-existe');
    expect(await screen.findByRole('heading', { level: 1, name: t.notFound.title })).toBeVisible();
  });

  it('carga el área del médico de forma diferida', async () => {
    renderAt(SCREENS.questionBank.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.questionBank.title }),
    ).toBeVisible();
  });
});
