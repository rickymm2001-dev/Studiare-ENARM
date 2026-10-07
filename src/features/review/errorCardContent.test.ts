import { describe, expect, it } from 'vitest';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import { escapeHtml } from '@/data/content/plainText';
import { errorCardContent } from './errorCardContent';

function bundle() {
  const { question, options } = makeQuestionWithOptions();
  return { question, options, vignette: 'Hombre de 60 años con dolor torácico.' };
}

describe('tarjeta de una pregunta fallada', () => {
  it('al frente lleva la viñeta y la frase, y atrás la clave con su explicación', () => {
    const data = bundle();
    const content = errorCardContent(data, null);
    expect(content?.front).toBe(
      '<p>Hombre de 60 años con dolor torácico.</p><p><strong>¿Cuál es el diagnóstico más probable?</strong></p>',
    );
    expect(content?.back).toContain('<strong>Respuesta correcta.</strong> Opción 1');
    expect(content?.back).toContain('<p>Explicación de prueba</p>');
    expect(content?.quote).toBe('Explicación de prueba');
  });

  it('con una opción incorrecta agrega lo que eligió y por qué atrae', () => {
    const data = bundle();
    const wrong = data.options[2];
    const content = errorCardContent(data, wrong?.id ?? null);
    expect(content?.back).toContain('<strong>Elegiste.</strong> Opción 3');
    expect(content?.back).toContain('<em>Por qué atrae.</em> Justificación de prueba');
    expect(content?.back).not.toContain('La dejaste en blanco');
  });

  it('en blanco lo dice y no inventa una elección', () => {
    const content = errorCardContent(bundle(), null);
    expect(content?.back).toContain('La dejaste en blanco.');
    expect(content?.back).not.toContain('Elegiste');
  });

  it('sin explicación cita el porqué de la clave', () => {
    const data = bundle();
    data.question.explanation = '   ';
    const correct = data.options.find((option) => option.isCorrect);
    if (correct) correct.rationale = 'Por eso es la clave';
    const content = errorCardContent(data, null);
    expect(content?.quote).toBe('Por eso es la clave');
    expect(content?.back).toContain('<p>Por eso es la clave</p>');
  });

  it('escapa el texto del banco para que no se meta HTML a la tarjeta', () => {
    const data = bundle();
    data.question.prompt = '¿Cuál es <b>mayor</b> & "mejor"?';
    data.vignette = 'Línea 1\nLínea 2\n\n<script>alert(1)</script>';
    const content = errorCardContent(data, null);
    expect(content?.front).toContain('<p>Línea 1<br>Línea 2</p>');
    expect(content?.front).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(content?.front).toContain('¿Cuál es &lt;b&gt;mayor&lt;/b&gt; &amp; &quot;mejor&quot;?');
    expect(content?.front).not.toContain('<script>');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('sin viñeta ni clave regresa lo que se puede o nada', () => {
    const data = bundle();
    data.vignette = '';
    expect(errorCardContent(data, null)?.front).toBe(
      '<p><strong>¿Cuál es el diagnóstico más probable?</strong></p>',
    );
    data.options = data.options.map((option) => ({ ...option, isCorrect: false }));
    expect(errorCardContent(data, null)).toBeNull();
  });
});
