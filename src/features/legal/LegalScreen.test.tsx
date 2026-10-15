// @vitest-environment jsdom
// El aviso de privacidad y los términos se leen sin sesión, dicen que son un borrador y llevan el
// correo del responsable como enlace cuando está configurado.
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { legalText } from '@/i18n/legal';
import { t } from '@/i18n/es-MX';
import { PrivacyNoticeScreen, TermsScreen } from './LegalScreen';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function open(path: string) {
  const router = createMemoryRouter(
    [
      { path: SCREENS.privacyNotice.path, Component: PrivacyNoticeScreen },
      { path: SCREENS.terms.path, Component: TermsScreen },
      { path: '/', element: <p>inicio</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe('páginas legales', () => {
  it('el aviso se lee sin sesión, con el borrador a la vista y todas sus secciones', () => {
    open(SCREENS.privacyNotice.path);
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.privacyNotice.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(legalText.draftNotice);
    for (const section of legalText.privacy.sections) {
      expect(screen.getByRole('heading', { level: 2, name: section.title })).toBeInTheDocument();
    }
    // El índice lleva a cada sección
    const index = screen.getByRole('navigation', { name: legalText.links.contents });
    expect(within(index).getAllByRole('link')).toHaveLength(legalText.privacy.sections.length);
  });

  it('sin datos del responsable no muestra marcas de pendiente ni inventa nada (B16)', () => {
    for (const name of [
      'VITE_LEGAL_NAME',
      'VITE_LEGAL_ADDRESS',
      'VITE_PRIVACY_EMAIL',
      'VITE_SUPPORT_EMAIL',
    ]) {
      vi.stubEnv(name, '');
    }
    for (const path of [SCREENS.privacyNotice.path, SCREENS.terms.path]) {
      open(path);
      const page = document.body.textContent;
      expect(page).not.toMatch(/[[\]{}]/);
      expect(page).not.toMatch(/\bpendiente/i);
      expect(page).not.toMatch(/Plexus/i);
      expect(page).not.toContain('@');
      expect(page).toContain('la empresa que opera Studiare');
      expect(page).toContain('al equipo de Studiare por el medio donde te dieron acceso');
      // El borrador sigue a la vista
      expect(screen.getByRole('note')).toHaveTextContent(legalText.draftNotice);
      cleanup();
    }
  });

  it('con VITE_LEGAL_NAME, el domicilio y los dos correos, cada uno va en su lugar (respuestas 42 y 43)', () => {
    vi.stubEnv('VITE_LEGAL_NAME', 'Plexus Medica S. de R.L. de C.V.');
    vi.stubEnv('VITE_LEGAL_ADDRESS', 'Calle 60 número 100, Centro, 97000 Mérida, Yucatán');
    vi.stubEnv('VITE_PRIVACY_EMAIL', 'privacidad@studiare.mx');
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'soporte@studiare.mx');
    open(SCREENS.privacyNotice.path);
    const responsible = screen.getByRole('heading', { level: 2, name: 'Quién es el responsable' });
    const card = responsible.parentElement ?? document.body;
    expect(card).toHaveTextContent(
      'El responsable de tus datos personales es Plexus Medica S. de R.L. de C.V.',
    );
    expect(card).toHaveTextContent(
      'Su domicilio es Calle 60 número 100, Centro, 97000 Mérida, Yucatán.',
    );
    expect(within(card).getByRole('link', { name: 'privacidad@studiare.mx' })).toHaveAttribute(
      'href',
      'mailto:privacidad@studiare.mx',
    );
    expect(screen.queryByRole('link', { name: 'soporte@studiare.mx' })).toBeNull();
    cleanup();

    open(SCREENS.terms.path);
    expect(screen.getAllByText(/Plexus Medica S\. de R\.L\. de C\.V\./).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'soporte@studiare.mx' })[0]).toHaveAttribute(
      'href',
      'mailto:soporte@studiare.mx',
    );
  });

  it('con el correo configurado lo muestra como enlace para escribir', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'privacidad@studiare.mx');
    vi.stubEnv('VITE_LEGAL_NAME', 'Studiare Educación SA de CV');
    open(SCREENS.privacyNotice.path);
    const links = screen.getAllByRole('link', { name: 'privacidad@studiare.mx' });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', 'mailto:privacidad@studiare.mx');
    expect(screen.getAllByText(/Studiare Educación SA de CV/).length).toBeGreaterThan(0);
  });

  it('los términos llevan su propio encabezado y se enlazan con el aviso', () => {
    open(SCREENS.terms.path);
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.terms.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: legalText.links.privacy })).toHaveAttribute(
      'href',
      SCREENS.privacyNotice.path,
    );
  });
});
