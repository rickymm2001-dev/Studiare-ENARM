// El apunte como texto para la IA y la cita de vuelta a su línea (B6, D-085).
import { describe, expect, it } from 'vitest';
import { checkCard, simulateCards, splitSections } from './cardGen';
import type { OutlineNode } from './outline';
import { anchorQuote, literalSlice, outlineSource } from './outlineSource';

const node = (id: string, text: string, ...children: OutlineNode[]): OutlineNode => ({
  id,
  text,
  children,
});

const nodes = [
  node(
    'h',
    'Diabetes mellitus tipo 2',
    node('m', 'La metformina es el tratamiento de primera línea de la diabetes tipo 2 #Endocrino'),
    node('d', 'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos.'),
    // Ya es tarjeta, no se manda
    node('c', 'Meta de HbA1c >> Menor de 7%'),
    // Una con >>> y su respuesta tampoco
    node('x', 'Efectos adversos >>>', node('x1', 'Acidosis láctica en insuficiencia renal grave')),
  ),
];

describe('outlineSource', () => {
  it('manda las líneas sin marca, sin etiquetas, con el título de sección y un punto al final', () => {
    const source = outlineSource(nodes);
    expect(source.text).toBe(
      [
        'Diabetes mellitus tipo 2',
        'La metformina es el tratamiento de primera línea de la diabetes tipo 2.',
        'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos.',
      ].join('\n\n'),
    );
    expect(source.lines.map((line) => line.nodeId)).toEqual(['h', 'm', 'd']);
    expect(source.lines[1]?.original).toBe(
      'La metformina es el tratamiento de primera línea de la diabetes tipo 2',
    );
  });

  it('el divisor de secciones toma el título y no confunde las líneas con títulos', () => {
    const [section, ...rest] = splitSections(outlineSource(nodes).text);
    expect(rest).toEqual([]);
    expect(section?.title).toBe('Diabetes mellitus tipo 2');
    expect(section?.text).toContain('metformina');
    expect(section?.text).toContain('500 mg');
  });
});

describe('anchorQuote y literalSlice', () => {
  const source = outlineSource(nodes);

  it('ancla la cita a su línea y devuelve la frase del alumno, sin el punto agregado', () => {
    expect(
      anchorQuote(
        source,
        'La metformina es el tratamiento de primera línea de la diabetes tipo 2.',
      ),
    ).toEqual({
      nodeId: 'm',
      quote: 'La metformina es el tratamiento de primera línea de la diabetes tipo 2',
    });
  });

  it('una cita con otras mayúsculas, acentos o espacios regresa el texto exacto de la línea', () => {
    expect(anchorQuote(source, 'LA DOSIS inicial  habitual es de 500 MG')).toEqual({
      nodeId: 'd',
      quote: 'La dosis inicial habitual es de 500 mg',
    });
    expect(literalSlice('Él   está  en el área', 'el esta en el AREA')).toBe(
      'Él   está  en el área',
    );
  });

  it('una cita que no está en ninguna línea no se ancla', () => {
    expect(anchorQuote(source, 'La insulina es el tratamiento de primera línea')).toBeNull();
    // Lo que ya era tarjeta no se mandó, así que tampoco ancla
    expect(anchorQuote(source, 'Acidosis láctica en insuficiencia renal grave')).toBeNull();
    expect(anchorQuote(source, '   ')).toBeNull();
    expect(literalSlice('texto', '')).toBeNull();
  });

  it('las tarjetas del generador simulado pasan el validador y anclan a una línea', () => {
    const [section] = splitSections(source.text);
    if (!section) throw new Error('Sin sección');
    const cards = simulateCards(section);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(checkCard(card, section.text)).toEqual([]);
      const anchored = anchorQuote(source, card.quote);
      expect(anchored?.nodeId).toMatch(/^[md]$/);
      // La frase guardada está tal cual en la línea del alumno
      const line = source.lines.find((entry) => entry.nodeId === anchored?.nodeId);
      expect(line?.original).toContain(anchored?.quote ?? '∅');
    }
  });
});
