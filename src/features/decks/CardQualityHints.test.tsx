// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CardQualityIssue } from '@/engines/cardQuality';
import type { DuplicateMatch, DuplicateResult } from '@/engines/duplicates';
import { t } from '@/i18n/es-MX';
import { CardQualityHints } from './CardQualityHints';

const text = t.cardQuality;

const longBack: CardQualityIssue = {
  code: 'back_too_long',
  severity: 'note',
  words: 31,
  limit: 25,
};
const leak: CardQualityIssue = {
  code: 'answer_in_question',
  severity: 'warning',
  direction: 'forward',
};
const questions: CardQualityIssue = { code: 'multiple_questions', severity: 'note', questions: 2 };

const match = (id: string, similarity: number, preview = '¿Qué es la FEVI?'): DuplicateMatch => ({
  id,
  kind: 'basic',
  similarity,
  preview,
});
const noDuplicates: DuplicateResult = { exact: [], near: [], totalExact: 0, totalNear: 0 };

describe('CardQualityHints', () => {
  it('sin avisos deja una región de estado vacía que no ocupa lugar', () => {
    render(<CardQualityHints issues={[]} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('sin avisos y con duplicados vacíos o nulos tampoco muestra nada', () => {
    const { rerender } = render(<CardQualityHints issues={[]} duplicates={noDuplicates} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    rerender(<CardQualityHints issues={[]} duplicates={null} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('muestra cada aviso como un elemento de una lista dentro de la región de estado', () => {
    render(<CardQualityHints issues={[longBack, questions]} />);
    const region = screen.getByRole('status');
    expect(within(region).getByText(text.title)).toBeVisible();
    const items = within(within(region).getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(text.issue(longBack));
    expect(items[1]).toHaveTextContent(text.issue(questions));
  });

  it('pone primero los avisos y después las sugerencias, con la gravedad dicha para el lector de pantalla', () => {
    render(<CardQualityHints issues={[longBack, leak]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(text.issue(leak));
    expect(within(items[0] as HTMLElement).getByText(/^Aviso\./)).toBeInTheDocument();
    expect(items[1]).toHaveTextContent(text.issue(longBack));
    expect(within(items[1] as HTMLElement).getByText(/^Sugerencia\./)).toBeInTheDocument();
  });

  it('no bloquea nada y recuerda que se puede guardar como está', () => {
    render(
      <CardQualityHints
        issues={[leak, longBack]}
        duplicates={{ ...noDuplicates, exact: [match('a', 1)], totalExact: 1 }}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(text.footer)).toBeVisible();
  });

  it('avisa de un duplicado exacto con la vista previa de la tarjeta', () => {
    const duplicates: DuplicateResult = {
      ...noDuplicates,
      exact: [match('a', 1, '¿Qué es la FEVI?')],
      totalExact: 1,
    };
    render(<CardQualityHints issues={[]} duplicates={duplicates} />);
    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Ya tienes una tarjeta con este mismo texto');
    expect(item).toHaveTextContent('“¿Qué es la FEVI?”');
    expect(within(item).getByText(/^Aviso\./)).toBeInTheDocument();
  });

  it('con varios exactos dice cuántos son', () => {
    const duplicates: DuplicateResult = {
      ...noDuplicates,
      exact: [match('a', 1), match('b', 1)],
      totalExact: 12,
    };
    render(<CardQualityHints issues={[]} duplicates={duplicates} />);
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Ya tienes 12 tarjetas con este mismo texto',
    );
  });

  it('avisa de los casi iguales como sugerencia, sin redondear a 100%', () => {
    const one: DuplicateResult = { ...noDuplicates, near: [match('n', 0.9166)], totalNear: 1 };
    const { rerender } = render(<CardQualityHints issues={[]} duplicates={one} />);
    let item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Hay una tarjeta casi igual, con 91% de coincidencia');
    expect(within(item).getByText(/^Sugerencia\./)).toBeInTheDocument();

    const many: DuplicateResult = {
      ...noDuplicates,
      near: [match('n', 1), match('m', 0.86)],
      totalNear: 2,
    };
    rerender(<CardQualityHints issues={[]} duplicates={many} />);
    item = screen.getByRole('listitem');
    expect(item).toHaveTextContent(
      'Hay 2 tarjetas casi iguales, la más parecida con 99% de coincidencia',
    );
  });

  it('pone el duplicado exacto antes que los demás avisos y el casi igual antes que las sugerencias', () => {
    const duplicates: DuplicateResult = {
      exact: [match('a', 1)],
      near: [match('n', 0.9)],
      totalExact: 1,
      totalNear: 1,
    };
    render(<CardQualityHints issues={[questions, leak]} duplicates={duplicates} />);
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items[0]).toContain('Ya tienes una tarjeta');
    expect(items[1]).toContain(text.issue(leak));
    expect(items[2]).toContain('casi igual');
    expect(items[3]).toContain(text.issue(questions));
  });

  it('muestra solo los primeros avisos y resume cuántos faltan', () => {
    const many: CardQualityIssue[] = [
      leak,
      longBack,
      questions,
      { ...longBack, code: 'front_too_long' },
    ];
    render(<CardQualityHints issues={many} maxVisible={2} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Y 2 más.')).toBeVisible();
  });

  it('muestra hasta cuatro avisos por defecto', () => {
    const five: CardQualityIssue[] = [
      leak,
      longBack,
      questions,
      { code: 'front_too_long', severity: 'note', words: 31, limit: 30 },
      { code: 'text_too_long', severity: 'note', words: 36, limit: 35 },
    ];
    render(<CardQualityHints issues={five} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Y 1 más.')).toBeVisible();
  });

  it('la misma región sigue en la página cuando cambian los avisos, para que se anuncien', () => {
    const { rerender } = render(<CardQualityHints issues={[]} />);
    const region = screen.getByRole('status');
    rerender(<CardQualityHints issues={[leak]} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    rerender(<CardQualityHints issues={[]} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it('acepta una clase para acomodarse en el editor', () => {
    render(<CardQualityHints issues={[]} className="mt-2" />);
    expect(screen.getByRole('status')).toHaveClass('mt-2');
  });

  it('los íconos son decorativos y no se leen', () => {
    const { container } = render(<CardQualityHints issues={[leak, longBack]} />);
    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
