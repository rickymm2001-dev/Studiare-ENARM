// @vitest-environment jsdom
// Sección Modelo del alumno y calibración de Plataforma (pantalla 25, 1.5 y 7.2 del plan de B14). Sin la
// nube no se cambia nada. Con la nube lee los ajustes guardados con los de fábrica donde faltan, guarda solo
// lo que cambió sin perder la calibración ni las llaves que no conoce, y nunca deja minGroupSize ni
// populationMinStudents por debajo de 30.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { FACTORY_MODEL_SETTINGS, readModelSettings } from '@/config/modelSettings';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { ModelSettingsForm } from './ModelSettingsForm';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = calibrationAdminTexts.settings;
const fields = text.fields;

interface FakeState {
  upserts: { key: string; value: unknown }[];
  reads: string[];
}

function fakeCloud(stored: unknown, writeError?: string): FakeState {
  const state: FakeState = { upserts: [], reads: [] };
  holder.cloud = {
    from: () => {
      const query = {
        select: () => query,
        eq: (_column: string, key: string) => {
          state.reads.push(key);
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({ data: stored === undefined ? null : { value: stored }, error: null }),
        upsert: (row: { key: string; value: unknown }) => {
          state.upserts.push({ key: row.key, value: row.value });
          return Promise.resolve({ error: writeError === undefined ? null : { code: writeError } });
        },
      };
      return query;
    },
  };
  return state;
}

const showForm = () =>
  render(
    <MemoryRouter>
      <ModelSettingsForm />
    </MemoryRouter>,
  );

beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('Modelo del alumno y calibración (Plataforma)', () => {
  it('sin la nube explica que viven en el servidor y no deja guardar', () => {
    useCloud.setState({ state: { status: 'off' } });
    showForm();
    expect(screen.getByText(text.needsCloud)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.save })).not.toBeInTheDocument();
  });

  it('sin la clave guardada enseña los valores de fábrica y la clave que se lee es model_settings', async () => {
    const state = fakeCloud(undefined);
    showForm();
    expect(await screen.findByLabelText(fields.minGroupSize?.label ?? '')).toHaveValue(30);
    expect(screen.getByLabelText(fields.comparisonWindowDays?.label ?? '')).toHaveValue(30);
    expect(screen.getByLabelText(fields.minBranchAnswers?.label ?? '')).toHaveValue(20);
    expect(screen.getByLabelText(fields['fatigue.minSplitHalfKappa']?.label ?? '')).toHaveValue(
      0.4,
    );
    expect(screen.getByRole('checkbox', { name: text.features.comparison.label })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: text.features.adaptive.label })).toBeChecked();
    expect(state.reads).toEqual(['model_settings']);
    // Sin cambios no hay nada que guardar
    expect(screen.getByRole('button', { name: text.save })).toBeDisabled();
  });

  it('lee lo guardado y cada campo dice cuál es el de fábrica', async () => {
    fakeCloud({ thresholds: { minBranchAnswers: 25 }, features: { adaptive: false } });
    showForm();
    expect(await screen.findByLabelText(fields.minBranchAnswers?.label ?? '')).toHaveValue(25);
    expect(screen.getByRole('checkbox', { name: text.features.adaptive.label })).not.toBeChecked();
    expect(screen.getAllByText(/De fábrica 20\./).length).toBeGreaterThan(0);
    // Dice qué versión del aviso cuenta para la calibración
    expect(
      screen.getByText(text.noticeVersion(FACTORY_MODEL_SETTINGS.calibration.minNoticeVersion)),
    ).toBeVisible();
  });

  it('guarda solo lo que cambió y no pierde la calibración ni las llaves que no conoce', async () => {
    const stored = {
      calibration: { enabled: true, mode: 'apply', minNoticeVersion: '2026-10-15b' },
      features: { comparison: true, adaptive: true },
      thresholds: { minGroupSize: 30 },
      futuro: { a: 1 },
    };
    const state = fakeCloud(stored);
    const typing = userEvent.setup();
    showForm();
    const answers = await screen.findByLabelText(fields.minBranchAnswers?.label ?? '');
    await typing.clear(answers);
    await typing.type(answers, '25');
    await typing.click(screen.getByRole('checkbox', { name: text.features.adaptive.label }));
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.saved)).toBeVisible();
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]?.key).toBe('model_settings');
    expect(state.upserts[0]?.value).toEqual({
      calibration: stored.calibration,
      features: { comparison: true, adaptive: false },
      thresholds: { minGroupSize: 30, minBranchAnswers: 25 },
      futuro: { a: 1 },
    });
    // Lo que queda guardado es lo que la app va a leer
    expect(readModelSettings(state.upserts[0]?.value).thresholds.minBranchAnswers).toBe(25);
  });

  it('minGroupSize no baja de 30 y no se guarda nada', async () => {
    const state = fakeCloud({});
    const typing = userEvent.setup();
    showForm();
    const group = await screen.findByLabelText(fields.minGroupSize?.label ?? '');
    await typing.clear(group);
    await typing.type(group, '10');
    expect(await screen.findByText(text.errors.floor)).toBeVisible();
    expect(group).toHaveAttribute('aria-invalid', 'true');
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.invalid)).toBeVisible();
    await waitFor(() => {
      expect(state.upserts).toEqual([]);
    });
    // Con 30 exactos sí se puede
    await typing.clear(group);
    await typing.type(group, '30');
    expect(screen.queryByText(text.errors.floor)).toBeNull();
  });

  it('populationMinStudents tampoco baja de 30', async () => {
    fakeCloud({});
    const typing = userEvent.setup();
    showForm();
    const population = await screen.findByLabelText(fields.populationMinStudents?.label ?? '');
    await typing.clear(population);
    await typing.type(population, '12');
    expect(await screen.findByText(text.errors.floor)).toBeVisible();
  });

  it('el error estándar de calibrada tiene que ser menor que el de provisional', async () => {
    const state = fakeCloud({});
    const typing = userEvent.setup();
    showForm();
    const calibrated = await screen.findByLabelText(fields.calibratedMaxSe?.label ?? '');
    await typing.clear(calibrated);
    await typing.type(calibrated, '0.6');
    expect(await screen.findByText(text.errors.seOrder)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(state.upserts).toEqual([]);
  });

  it('volver a lo de fábrica escribe los valores de fábrica y conserva la calibración', async () => {
    const stored = {
      calibration: { enabled: true, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
      thresholds: { minBranchAnswers: 40, fatigue: { minStudents: 80 } },
      features: { comparison: false },
    };
    const state = fakeCloud(stored);
    const typing = userEvent.setup();
    showForm();
    await screen.findByLabelText(fields.minBranchAnswers?.label ?? '');
    await typing.click(screen.getByRole('button', { name: text.restore }));
    expect(await screen.findByText(text.restored)).toBeVisible();
    const written = readModelSettings(state.upserts[0]?.value);
    expect(written.thresholds).toEqual(FACTORY_MODEL_SETTINGS.thresholds);
    expect(written.features).toEqual(FACTORY_MODEL_SETTINGS.features);
    expect(written.calibration).toEqual({
      enabled: true,
      mode: 'dry_run',
      minNoticeVersion: '2026-10-15b',
    });
    expect(screen.getByLabelText(fields.minBranchAnswers?.label ?? '')).toHaveValue(20);
  });

  it('si la base niega el cambio dice que no se pudo guardar y deja lo escrito', async () => {
    fakeCloud({}, '42501');
    const typing = userEvent.setup();
    showForm();
    const answers = await screen.findByLabelText(fields.minBranchAnswers?.label ?? '');
    await typing.clear(answers);
    await typing.type(answers, '25');
    await typing.click(screen.getByRole('button', { name: text.save }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(text.failed);
    });
    expect(answers).toHaveValue(25);
  });

  it('enlaza a la pantalla Calibración y a los umbrales de arriba', async () => {
    fakeCloud({});
    showForm();
    await screen.findByLabelText(fields.minGroupSize?.label ?? '');
    expect(screen.getByRole('link', { name: text.calibrationOpen })).toHaveAttribute(
      'href',
      '/admin/calibracion',
    );
    expect(screen.getByText(text.responsesLink)).toBeVisible();
  });
});
