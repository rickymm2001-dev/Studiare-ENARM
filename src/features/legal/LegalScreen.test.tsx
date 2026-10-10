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

  it('sin datos del responsable dice que faltan y no inventa nada', () => {
    open(SCREENS.privacyNotice.path);
    expect(
      screen.getAllByText(new RegExp(legalText.pending.replace(/[[\]]/g, '\\$&'))).length,
    ).toBeGreaterThan(0);
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
