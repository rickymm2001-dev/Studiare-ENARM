// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { AvatarPicker } from './AvatarPicker';
import { initialFrame, moveBy, NUDGE_PX, sourceRect, zoomTo, type Rect } from './avatarCrop';

const IMAGE = { width: 800, height: 600 };
const VIEWPORT = 224;
const JPEG = 'data:image/jpeg;base64,QUJD';
const crop = t.account.avatarCrop;

// jsdom no decodifica imágenes, no dibuja en canvas ni captura el puntero. Se simulan el tamaño
// natural de la foto, el contexto 2D, la salida JPEG y la captura, y el evento load de la imagen se
// dispara a mano. Todo se restaura al terminar
const drawImage = vi.fn();
const canvases: [number, number][] = [];
const patched: [target: object, key: string][] = [
  [HTMLCanvasElement.prototype, 'getContext'],
  [HTMLCanvasElement.prototype, 'toDataURL'],
  [HTMLImageElement.prototype, 'naturalWidth'],
  [HTMLImageElement.prototype, 'naturalHeight'],
  [Element.prototype, 'setPointerCapture'],
];
const originals = patched.map(
  ([target, key]) => [target, key, Object.getOwnPropertyDescriptor(target, key)] as const,
);

function define(target: object, key: string, descriptor: PropertyDescriptor) {
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

beforeAll(() => {
  define(HTMLCanvasElement.prototype, 'getContext', {
    value: function getContext(this: HTMLCanvasElement) {
      canvases.push([this.width, this.height]);
      return { drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
    },
  });
  define(HTMLCanvasElement.prototype, 'toDataURL', { value: () => JPEG });
  define(HTMLImageElement.prototype, 'naturalWidth', { get: () => IMAGE.width });
  define(HTMLImageElement.prototype, 'naturalHeight', { get: () => IMAGE.height });
  define(Element.prototype, 'setPointerCapture', { value: () => undefined });
});

afterAll(() => {
  for (const [target, key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

afterEach(() => {
  cleanup();
  drawImage.mockClear();
  canvases.length = 0;
});

const pngFile = () =>
  new File([new Uint8Array([137, 80, 78, 71])], 'foto.png', { type: 'image/png' });

function show(value: Parameters<typeof AvatarPicker>[0]['value'] = { kind: 'initials' }) {
  const onChange = vi.fn();
  render(<AvatarPicker name="Ricardo Medina" value={value} onChange={onChange} />);
  return { onChange, input: screen.getByLabelText(t.account.uploadPhoto) };
}

/** Elige una foto, espera el recortador (se carga aparte) y avisa que la imagen ya cargó */
async function openCropper(input: HTMLElement) {
  await userEvent.upload(input, pngFile());
  const use = await screen.findByRole('button', { name: crop.use });
  const image = await waitFor(() => {
    const element = document.querySelector('img');
    if (!element) throw new Error('la foto todavía no se abrió');
    return element;
  });
  fireEvent.load(image);
  await waitFor(() => {
    expect(use).toBeEnabled();
  });
  return { use, image };
}

/** La zona de la foto original que se dibujó en el canvas, con la misma forma que sourceRect */
function drawnRect(): Rect {
  const call = drawImage.mock.calls[0] as unknown[] | undefined;
  if (!call) throw new Error('no se dibujó nada');
  const [, x, y, width, height] = call as [unknown, number, number, number, number];
  return { x, y, width, height };
}

function expectRect(actual: Rect, expected: Rect) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.width).toBeCloseTo(expected.width);
  expect(actual.height).toBeCloseTo(expected.height);
}

describe('elegir la foto de perfil', () => {
  it('ofrece solo las iniciales y, sin foto, ningún avatar generado', () => {
    show();
    const initials = screen.getByRole('button', { name: t.account.avatarInitials });
    expect(initials).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: t.account.avatarPhoto })).toBeNull();
    expect(screen.queryByRole('button', { name: /avatar médico/i })).toBeNull();
    expect(screen.getByRole('button', { name: t.account.uploadPhoto })).toBeVisible();
    expect(screen.getByText(t.account.avatarNote)).toBeVisible();
  });

  it('una cuenta vieja con avatar generado se trata como iniciales', () => {
    show({ kind: 'generated', seed: 'studiare-3' });
    expect(screen.getByRole('button', { name: t.account.avatarInitials })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('con foto la muestra elegida y ofrece cambiarla o volver a las iniciales', async () => {
    const { onChange } = show({ kind: 'photo', dataUrl: JPEG });
    expect(screen.getByRole('button', { name: t.account.avatarPhoto })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: t.account.avatarChangePhoto })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: t.account.avatarInitials }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'initials' });
  });

  it('un archivo que no es imagen avisa y no abre el recortador', async () => {
    const { input, onChange } = show();
    const text = new File(['hola'], 'notas.txt', { type: 'text/plain' });
    await userEvent.upload(input, text, { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.account.avatarOpenError);
    expect(screen.queryByRole('button', { name: crop.use })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Cancelar cierra el recortador sin guardar nada', async () => {
    const { input, onChange } = show();
    await openCropper(input);
    await userEvent.click(screen.getByRole('button', { name: crop.cancel }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: crop.use })).toBeNull();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Usar foto guarda un JPEG de 256 por 256 con el centro de la foto', async () => {
    const { input, onChange } = show();
    const { use, image } = await openCropper(input);
    await userEvent.click(use);
    expect(onChange).toHaveBeenCalledWith({ kind: 'photo', dataUrl: JPEG });
    expect(canvases).toEqual([[256, 256]]);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0]?.[0]).toBe(image);
    expectRect(drawnRect(), sourceRect(IMAGE, initialFrame(VIEWPORT)));
    expect(drawImage.mock.calls[0]?.slice(5)).toEqual([0, 0, 256, 256]);
  });

  it('el control de acercamiento y los botones de mover cambian el encuadre', async () => {
    const { input } = show();
    const { use } = await openCropper(input);
    const zoom = screen.getByRole('slider', { name: crop.zoom });
    fireEvent.change(zoom, { target: { value: '2' } });
    expect(zoom).toHaveAttribute('aria-valuetext', crop.zoomValue(2));
    await userEvent.click(screen.getByRole('button', { name: crop.moveRight }));
    await userEvent.click(use);
    const expected = moveBy(IMAGE, zoomTo(IMAGE, initialFrame(VIEWPORT), 2), NUDGE_PX, 0);
    expectRect(drawnRect(), sourceRect(IMAGE, expected));
  });

  it('las flechas del teclado mueven la foto desde la vista previa', async () => {
    const { input } = show();
    const { use } = await openCropper(input);
    const preview = screen.getByRole('img', { name: crop.preview });
    preview.focus();
    fireEvent.keyDown(preview, { key: 'ArrowLeft' });
    fireEvent.keyDown(preview, { key: 'ArrowUp' });
    await userEvent.click(use);
    const expected = moveBy(IMAGE, initialFrame(VIEWPORT), -NUDGE_PX, -NUDGE_PX);
    expectRect(drawnRect(), sourceRect(IMAGE, expected));
  });

  it('arrastrar con el puntero mueve la foto', async () => {
    const { input } = show();
    const { use } = await openCropper(input);
    const preview = screen.getByRole('img', { name: crop.preview });
    fireEvent.pointerDown(preview, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(preview, { pointerId: 1, clientX: 130, clientY: 100 });
    fireEvent.pointerUp(preview, { pointerId: 1, clientX: 130, clientY: 100 });
    // Después de soltar, mover el puntero ya no arrastra
    fireEvent.pointerMove(preview, { pointerId: 1, clientX: 200, clientY: 100 });
    await userEvent.click(use);
    const expected = moveBy(IMAGE, initialFrame(VIEWPORT), 30, 0);
    expectRect(drawnRect(), sourceRect(IMAGE, expected));
  });
});
