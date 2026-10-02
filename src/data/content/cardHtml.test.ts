// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createCardSanitizer } from './cardHtml';

const sanitizer = createCardSanitizer(window);
const media = (file: string) => (file === 'foto 1.jpg' ? 'demo-media/x/m-0001.jpg' : null);

describe('saneado del HTML de tarjetas (14.3)', () => {
  it('conserva el formato permitido y quita estilos y atributos', () => {
    const html = sanitizer.sanitize(
      '<span style="color: red" class="x"><b>Hola</b></span>&nbsp;<u>mundo</u><font color="red">rojo</font>',
      media,
    );
    expect(html).toBe('<span><b>Hola</b></span> <u>mundo</u>rojo');
  });

  it('quita scripts, eventos y enlaces', () => {
    const html = sanitizer.sanitize(
      '<img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">liga</a><iframe src="https://x"></iframe>',
      media,
    );
    expect(html).toBe('liga');
  });

  it('reescribe las imágenes que existen y quita las demás', () => {
    expect(sanitizer.sanitize('<img src="foto%201.jpg">', media)).toBe(
      '<img src="demo-media/x/m-0001.jpg" alt="">',
    );
    expect(sanitizer.sanitize('<img src="https://evil.example/a.png">', media)).toBe('');
    expect(sanitizer.sanitize('<img src="no-existe.png" alt="a">', media)).toBe('');
  });
});
