// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataContext, type DataApi } from '@/data/context';
import { CardHtml } from './CardHtml';
import { deckMediaPathsIn, withDeckMedia } from './deckMediaUrls';

const IMAGE = '/deck-media/paco-mi/infectologia/m-0001.png';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithMedia(html: string, stored: Record<string, Blob>) {
  const created: string[] = [];
  const revoked: string[] = [];
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:http://localhost/${created.length + 1}-${blob.size}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
  });
  const api = {
    repos: {
      deckMedia: {
        get: (path: string) =>
          Promise.resolve(stored[path] ? { path, blob: stored[path] } : undefined),
      },
    },
  } as unknown as DataApi;
  const view = render(
    <DataContext value={api}>
      <CardHtml html={html} />
    </DataContext>,
  );
  return { ...view, created, revoked };
}

describe('imágenes del catálogo de mazos en las tarjetas (B11, 5.8)', () => {
  it('muestra la imagen guardada en el navegador con una dirección blob y la suelta al salir', async () => {
    const { container, created, revoked, unmount } = renderWithMedia(
      `<p>[Prueba] Frente</p><img src="${IMAGE}" alt="Imagen">`,
      { [IMAGE]: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
    );
    // Mientras carga, la imagen no se pide al sitio
    expect(container.querySelector('img')?.getAttribute('src') ?? null).toBeNull();
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe(created[0]);
    });
    unmount();
    expect(revoked).toEqual(created);
  });

  it('una imagen que no se bajó queda sin src y una ruta ajena se quita', async () => {
    const { container } = renderWithMedia(
      `<img src="${IMAGE}" alt="Falta"><img src="https://otro.sitio/x.png" alt="Ajena">`,
      {},
    );
    await waitFor(() => {
      expect(container.querySelectorAll('img')).toHaveLength(1);
    });
    expect(container.querySelector('img')?.getAttribute('src') ?? null).toBeNull();
    expect(container.innerHTML).not.toContain('otro.sitio');
  });

  it('las imágenes de los mazos de la demo siguen saliendo del sitio', () => {
    const { container } = renderWithMedia('<img src="/demo-media/paco-mi/m-0001.jpg">', {});
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/demo-media/paco-mi/m-0001.jpg',
    );
  });

  it('encuentra las rutas sin repetir y solo cambia el src de una imagen del catálogo', () => {
    expect(
      deckMediaPathsIn(`<img src="${IMAGE}"><img src="${IMAGE}"> /deck-media/x/y/z.exe`),
    ).toEqual([IMAGE]);
    const urls = new Map([[IMAGE, 'blob:http://localhost/1']]);
    expect(withDeckMedia(`<img alt="a" src="${IMAGE}">`, urls)).toBe(
      '<img alt="a" src="blob:http://localhost/1">',
    );
    expect(withDeckMedia('<p>/deck-media/no/es/img.png</p>', urls)).toBe(
      '<p>/deck-media/no/es/img.png</p>',
    );
  });
});
