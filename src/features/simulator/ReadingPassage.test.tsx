// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishText } from '@/i18n/english';
import { PassageSourceLine, PassageTimeAdvice, ReadingPassage } from './ReadingPassage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TEAM = [
  { title: 'Fuente del texto. [Prueba] Texto simulado. Texto propio del equipo Studiare.' },
];
const PUBLIC_DOMAIN = [
  {
    title:
      'Fuente del texto. Heart Attack, MedlinePlus.gov (NLM). Dominio público. https://medlineplus.gov/heartattack.html',
  },
];

/** Una pantalla ancha, como una computadora (lg de Tailwind) */
function desktop() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('la línea de la fuente del texto', () => {
  it('dice el título, la licencia y, si la licencia pide enlace, abre el enlace en otra pestaña', () => {
    render(<PassageSourceLine refs={PUBLIC_DOMAIN} />);
    const line = screen.getByText(/Fuente del texto\./);
    expect(line).toHaveTextContent(
      'Fuente del texto. Heart Attack, MedlinePlus.gov (NLM). Dominio público. https://medlineplus.gov/heartattack.html',
    );
    const link = screen.getByRole('link', { name: /medlineplus\.gov\/heartattack\.html/ });
    expect(link).toHaveAttribute('href', 'https://medlineplus.gov/heartattack.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    // Quien usa lector de pantalla oye que se abre en otra pestaña
    expect(link).toHaveTextContent(englishText.reading.newTab);
  });

  it('el texto propio del equipo no lleva enlace y respeta su título', () => {
    render(<PassageSourceLine refs={TEAM} />);
    expect(screen.getByText(/Fuente del texto\./)).toHaveTextContent(
      'Fuente del texto. [Prueba] Texto simulado. Texto propio del equipo Studiare.',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('toma la fuente aunque no sea la primera referencia', () => {
    render(
      <PassageSourceLine
        refs={[{ title: '[Prueba] Guía de práctica clínica simulada' }, ...TEAM]}
      />,
    );
    expect(screen.getByText(/Fuente del texto\./)).toBeVisible();
  });

  it('sin una fuente válida no pone nada, y un enlace que no es https nunca se abre', () => {
    const { container } = render(
      <>
        <PassageSourceLine refs={[]} />
        <PassageSourceLine refs={[{ title: '[Prueba] Guía de práctica clínica simulada' }]} />
        <PassageSourceLine
          refs={[
            {
              title: 'Fuente del texto. Artículo simulado. CC BY. http://example.org/articulo',
            },
          ]}
        />
        <PassageSourceLine
          refs={[
            {
              title: 'Fuente del texto. Artículo simulado. CC BY-NC. https://example.org/articulo',
            },
          ]}
        />
      </>,
    );
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('el texto de lectura', () => {
  it('va en inglés, con su etiqueta y su fuente, y sin botón si no se pliega', () => {
    render(<ReadingPassage text="[Prueba] A short text." refs={TEAM} fold="never" />);
    expect(screen.getByText('[Prueba] A short text.')).toHaveAttribute('lang', 'en');
    expect(screen.getByText(englishText.reading.label)).toBeVisible();
    expect(screen.getByText('[Prueba] A short text.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('en el teléfono se pliega y se vuelve a abrir, sin esconder nunca la fuente', async () => {
    const typing = userEvent.setup();
    render(<ReadingPassage text="[Prueba] A short text." refs={TEAM} fold="phone" />);
    const text = screen.getByText('[Prueba] A short text.');
    expect(text).not.toBeVisible();
    expect(screen.getByText(/Fuente del texto\./)).toBeVisible();
    const toggle = screen.getByRole('button', { name: englishText.reading.show });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', text.parentElement?.id);
    await typing.click(toggle);
    expect(text).toBeVisible();
    await typing.click(screen.getByRole('button', { name: englishText.reading.hide }));
    expect(text).not.toBeVisible();
  });

  it('en computadora el texto queda fijo, aunque en el teléfono se plegara', () => {
    desktop();
    render(<ReadingPassage text="[Prueba] A short text." refs={TEAM} fold="phone" />);
    expect(screen.getByText('[Prueba] A short text.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('en la retroalimentación se pliega en cualquier pantalla', () => {
    desktop();
    render(<ReadingPassage text="[Prueba] A short text." refs={TEAM} fold="always" />);
    expect(screen.getByText('[Prueba] A short text.')).not.toBeVisible();
    expect(screen.getByRole('button', { name: englishText.reading.show })).toBeVisible();
  });

  it('un texto largo con desplazamiento se puede recorrer con el teclado', () => {
    render(<ReadingPassage text="[Prueba] Long text." refs={TEAM} fold="never" scrollable />);
    const region = screen.getByRole('region', { name: englishText.reading.label });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveTextContent('[Prueba] Long text.');
    // Sin desplazamiento no es una región enfocable
    cleanup();
    render(<ReadingPassage text="[Prueba] Long text." refs={TEAM} fold="never" />);
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('el tiempo sugerido del texto', () => {
  it('dice el tiempo sugerido y cuánto lleva, sin aviso mientras no se pasa', () => {
    render(
      <PassageTimeAdvice
        position={0}
        size={3}
        suggestedSeconds={270}
        onTextSeconds={65}
        overSeconds={0}
      />,
    );
    expect(screen.getByText(englishText.reading.position(1, 3))).toBeVisible();
    expect(
      screen.getByText(/Tiempo sugerido para este texto 4:30 · Llevas 1:05 en este texto/),
    ).toBeVisible();
    expect(screen.queryByText(/arriba del tiempo sugerido/)).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('al pasarse dice los segundos de más, o los minutos cuando son varios', () => {
    const { rerender } = render(
      <PassageTimeAdvice
        position={1}
        size={2}
        suggestedSeconds={180}
        onTextSeconds={220}
        overSeconds={40}
      />,
    );
    expect(screen.getByText('Vas 40 segundos arriba del tiempo sugerido')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(englishText.reading.overAnnounce);
    rerender(
      <PassageTimeAdvice
        position={1}
        size={2}
        suggestedSeconds={180}
        onTextSeconds={310}
        overSeconds={130}
      />,
    );
    expect(screen.getByText('Vas 2 min 10 s arriba del tiempo sugerido')).toBeVisible();
    rerender(
      <PassageTimeAdvice
        position={0}
        size={1}
        suggestedSeconds={90}
        onTextSeconds={91}
        overSeconds={1}
      />,
    );
    expect(screen.getByText('Vas 1 segundo arriba del tiempo sugerido')).toBeVisible();
    expect(screen.queryByText(/Pregunta \d+ de \d+ de este texto/)).toBeNull();
  });
});
