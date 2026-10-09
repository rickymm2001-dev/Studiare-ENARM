// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import {
  CalibratingNote,
  CalibratingState,
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineState,
} from './states';

afterEach(cleanup);

describe('estados reutilizables (10.4)', () => {
  it('vacío lleva título y descripción propios o los de siempre', () => {
    render(<EmptyState />);
    expect(screen.getByText(t.states.empty.title)).toBeVisible();
    cleanup();
    render(<EmptyState title="Sin nada" description="Todavía no hay datos" />);
    expect(screen.getByText('Sin nada')).toBeVisible();
    expect(screen.getByText('Todavía no hay datos')).toBeVisible();
  });

  it('cargando se anuncia como estado para el lector de pantalla', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getAllByText(t.states.loading.label).length).toBeGreaterThan(0);
  });

  it('error avisa y deja intentar de nuevo', async () => {
    const retry = vi.fn();
    render(<ErrorState onRetry={retry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: t.states.error.retry }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('sin conexión explica qué sigue funcionando', () => {
    render(<OfflineState />);
    expect(screen.getByText(t.states.offline.title)).toBeVisible();
    expect(screen.getByText(t.states.offline.description)).toBeVisible();
  });

  it('calibrando dice cuántos datos lleva, cuántos pide y cuántos faltan', () => {
    render(<CalibratingState current={12} target={40} unit="errores etiquetados" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.getAllByText(t.states.calibrating.progress(12, 40, 'errores etiquetados')).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(t.states.calibrating.remaining(28, 'errores etiquetados')),
    ).toBeVisible();
  });

  it('la versión corta de calibrando cabe en una tarjeta y nunca pasa del umbral', () => {
    render(<CalibratingNote current={55} target={40} unit="pares" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      t.states.calibrating.progress(40, 40, 'pares'),
    );
  });
});
