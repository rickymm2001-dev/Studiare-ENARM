// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { movedTexts } from '@/i18n/moved';
import { MovedNotice } from './MovedNotice';
import { MOVED_NOTICE_STORAGE_KEY } from './movedNotice';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 11, 1, 12));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  localStorage.clear();
});

const stubMove = () => {
  vi.stubEnv('VITE_MOVED_TO', 'https://tudominio.mx');
  vi.stubEnv('VITE_MOVED_ON', '2026-12-15');
};

describe('aviso de la mudanza (B17, 3.4)', () => {
  it('dice el día, a dónde y qué hacer con cuenta y sin ella', () => {
    stubMove();
    render(<MovedNotice />);
    const region = screen.getByRole('region', { name: movedTexts.title });
    expect(region).toHaveTextContent(
      'Studiare se muda a tudominio.mx el 15 de diciembre. Con cuenta, toca Sincronizar ahora en Configuración y entra allá con tu correo, y tu estudio se sincroniza. Sin cuenta, descarga tus datos en Configuración, Privacidad antes de esa fecha.',
    );
    const link = screen.getByRole('link', { name: movedTexts.go('tudominio.mx') });
    expect(link).toHaveAttribute('href', 'https://tudominio.mx');
    expect(link).toHaveAttribute('rel', 'noopener');
    // Un aviso del marco no usa dos puntos ni signos de exclamación en su prosa
    expect(region.textContent).not.toMatch(/[:!¡]/);
  });

  it('desde el día de la mudanza dice que ya se mudó', () => {
    stubMove();
    vi.setSystemTime(new Date(2026, 11, 15, 8));
    render(<MovedNotice />);
    expect(screen.getByRole('region', { name: movedTexts.title })).toHaveTextContent(
      movedTexts.after('tudominio.mx'),
    );
  });

  it('se puede cerrar por el día y no vuelve a salir hasta mañana', async () => {
    stubMove();
    const user = userEvent.setup({ advanceTimers: () => undefined });
    const { unmount } = render(<MovedNotice />);
    await user.click(screen.getByRole('button', { name: movedTexts.dismissLabel }));
    expect(screen.queryByRole('region', { name: movedTexts.title })).toBeNull();
    expect(localStorage.getItem(MOVED_NOTICE_STORAGE_KEY)).toBe('2026-12-01');
    unmount();
    // Hoy, otra vez: sigue cerrado
    render(<MovedNotice />);
    expect(screen.queryByRole('region', { name: movedTexts.title })).toBeNull();
    cleanup();
    // Mañana vuelve
    vi.setSystemTime(new Date(2026, 11, 2, 9));
    render(<MovedNotice />);
    expect(screen.getByRole('region', { name: movedTexts.title })).toBeInTheDocument();
  });

  it('con el almacenamiento bloqueado el aviso se ve y se cierra sin romperse', async () => {
    stubMove();
    const user = userEvent.setup({ advanceTimers: () => undefined });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    render(<MovedNotice />);
    await user.click(screen.getByRole('button', { name: movedTexts.dismissLabel }));
    expect(screen.queryByRole('region', { name: movedTexts.title })).toBeNull();
  });

  it('con variables mal escritas no pinta nada', () => {
    vi.stubEnv('VITE_MOVED_TO', 'http://tudominio.mx');
    vi.stubEnv('VITE_MOVED_ON', '2026-12-15');
    const { container } = render(<MovedNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('lanzador del aviso', () => {
  // El lanzador decide al importarlo, porque en el build las dos variables son constantes. Cada caso lo importa de
  // nuevo con su propio entorno
  async function freshLauncher() {
    vi.resetModules();
    return (await import('./MovedNoticeLauncher')).MovedNoticeLauncher;
  }

  it('sin las variables del build no pinta nada', async () => {
    const Launcher = await freshLauncher();
    const { container } = render(<Launcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('con una sola de las dos tampoco', async () => {
    vi.stubEnv('VITE_MOVED_TO', 'https://tudominio.mx');
    const Launcher = await freshLauncher();
    const { container } = render(<Launcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('con las dos baja el aviso y lo muestra', async () => {
    stubMove();
    const Launcher = await freshLauncher();
    render(<Launcher className="lg:pl-rail" />);
    const region = await screen.findByRole('region', { name: movedTexts.title });
    expect(region).toHaveClass('lg:pl-rail');
  });
});
