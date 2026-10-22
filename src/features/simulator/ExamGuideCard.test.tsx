// @vitest-environment jsdom
// Cómo es el examen (V4-B5). Una sola región con nombre, sin encabezados sueltos ni regiones anidadas, y con
// sus fuentes a la vista (V4-B10).
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import { ExamGuideCard } from './ExamGuideCard';

afterEach(() => {
  cleanup();
});

describe('Cómo es el examen', () => {
  it('es una región con su nombre y no trae regiones anidadas ni encabezados sueltos', async () => {
    render(<ExamGuideCard />);
    await userEvent.click(screen.getByText(t.examGuide.title));
    const card = screen.getByRole('region', { name: t.examGuide.title });
    expect(within(card).queryAllByRole('region')).toHaveLength(0);
    expect(within(card).queryAllByRole('heading')).toHaveLength(0);
  });

  it('cada lista lleva el título de su parte como nombre', () => {
    render(<ExamGuideCard />);
    expect(screen.getByRole('list', { name: t.examGuide.structureTitle })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: t.examGuide.feelTitle })).toBeInTheDocument();
  });

  it('cita sus fuentes y dice que lo que cuentan quienes lo presentaron no es oficial', () => {
    render(<ExamGuideCard />);
    expect(screen.getByText(t.examGuide.sources)).toBeInTheDocument();
    expect(t.examGuide.sources).toMatch(/CIFRHS/);
    expect(t.examGuide.sources).toMatch(/no es un dato oficial/);
  });
});
