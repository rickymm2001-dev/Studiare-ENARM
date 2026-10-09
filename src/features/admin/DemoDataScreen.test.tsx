// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataContext, type DataApi, type DemoDataActions } from '@/data/context';
import { makeUser, testApi } from '@/data/testing/fixtures';
import { DEMO_STUDENT_ALIAS } from '@/demo/constants';
import { t } from '@/i18n/es-MX';
import { DemoDataScreen } from './DemoDataScreen';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  cleanup();
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const SUMMARY = { questions: 60, users: 11, events: 1234, cards: 200 };

function setup(options: { seeded?: boolean; demo?: boolean; failWith?: Error } = {}) {
  const api = testApi('demo');
  disposers.push(api.dispose);
  const seed = async () => {
    await api.repos.users.put(makeUser({ alias: DEMO_STUDENT_ALIAS }));
  };
  const fail = options.failWith;
  const actions: DemoDataActions = {
    generate: vi.fn(async () => {
      if (fail) throw fail;
      await seed();
      return SUMMARY;
    }),
    regenerate: vi.fn(() => (fail ? Promise.reject(fail) : Promise.resolve(SUMMARY))),
    clear: vi.fn(async () => {
      for (const user of await api.repos.users.list()) await api.repos.users.remove(user.id);
    }),
  };
  const value: DataApi = {
    repos: api.repos,
    recordEvent: api.recordEvent,
    rebuildDerivedState: () => Promise.resolve(),
    demo: options.demo === false ? null : actions,
    deleteAllData: null,
  };
  const ready = options.seeded ? seed() : Promise.resolve();
  void ready.then(() => {
    render(
      <MemoryRouter>
        <DataContext.Provider value={value}>
          <DemoDataScreen />
        </DataContext.Provider>
      </MemoryRouter>,
    );
  });
  return { actions, api, ready };
}

const text = t.adminDemo;

describe('datos de demostración (pantalla 24)', () => {
  it('en Mi cuenta explica que la demostración es otra base y lleva a cambiarla', async () => {
    setup({ demo: false });
    expect(await screen.findByText(text.notDemo.title)).toBeVisible();
    expect(screen.getByRole('link', { name: text.notDemo.go })).toHaveAttribute(
      'href',
      '/configuracion?seccion=account',
    );
    expect(screen.queryByRole('button', { name: text.generate })).toBeNull();
  });

  it('vacía ofrece generar con los ajustes de fábrica y deja un mensaje al terminar', async () => {
    const typing = userEvent.setup();
    const { actions } = setup();
    await typing.click(await screen.findByRole('button', { name: text.generate }));
    await waitFor(() => {
      expect(actions.generate).toHaveBeenCalledWith({ cohortSize: 300, seed: 'enarm-demo-1' });
    });
    expect(await screen.findByText(text.done.generate(1234))).toBeVisible();
    // Con datos aparece regenerar y borrar
    expect(await screen.findByRole('button', { name: text.regenerate })).toBeVisible();
    expect(screen.getByRole('button', { name: text.clear })).toBeVisible();
  });

  it('manda al generador lo que el admin ajusta', async () => {
    const typing = userEvent.setup();
    const { actions } = setup();
    const cohort = await screen.findByLabelText(text.fields.cohort);
    fireEvent.change(cohort, { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText(text.fields.seed), {
      target: { value: 'otra-semilla' },
    });
    fireEvent.change(screen.getByLabelText(text.fields.examDate), {
      target: { value: '2027-09-13' },
    });
    await typing.click(screen.getByRole('button', { name: text.generate }));
    await waitFor(() => {
      expect(actions.generate).toHaveBeenCalledWith({
        cohortSize: 50,
        seed: 'otra-semilla',
        examDate: '2027-09-13',
      });
    });
  });

  it('un ajuste inválido muestra su error y no deja generar', async () => {
    const { actions } = setup();
    const cohort = await screen.findByLabelText(text.fields.cohort);
    fireEvent.change(cohort, { target: { value: '3' } });
    expect(await screen.findByText(text.fields.cohortError(10, 300))).toBeVisible();
    expect(screen.getByRole('button', { name: text.generate })).toBeDisabled();
    fireEvent.change(cohort, { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(text.fields.seed), { target: { value: 'con espacio' } });
    expect(await screen.findByText(text.fields.seedError)).toBeVisible();
    expect(actions.generate).not.toHaveBeenCalled();
  });

  it('regenerar pide confirmación, se puede cancelar y al confirmar usa los ajustes', async () => {
    const typing = userEvent.setup();
    const { actions } = setup({ seeded: true });
    await typing.click(await screen.findByRole('button', { name: text.regenerate }));
    expect(screen.getByText(text.confirmRegenerate)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.cancel }));
    expect(actions.regenerate).not.toHaveBeenCalled();

    await typing.click(screen.getByRole('button', { name: text.regenerate }));
    await typing.click(screen.getByRole('button', { name: text.confirmRegenerateYes }));
    await waitFor(() => {
      expect(actions.regenerate).toHaveBeenCalledWith({ cohortSize: 300, seed: 'enarm-demo-1' });
    });
    expect(await screen.findByText(text.done.regenerate(1234))).toBeVisible();
  });

  it('borrar todo pide confirmación y deja la demostración vacía', async () => {
    const typing = userEvent.setup();
    const { actions } = setup({ seeded: true });
    await typing.click(await screen.findByRole('button', { name: text.clear }));
    expect(screen.getByText(text.confirmClear)).toBeVisible();
    expect(actions.clear).not.toHaveBeenCalled();
    await typing.click(screen.getByRole('button', { name: text.confirmClearYes }));
    await waitFor(() => {
      expect(actions.clear).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(text.done.clear(0))).toBeVisible();
    expect(await screen.findByRole('button', { name: text.generate })).toBeVisible();
  });

  it('si falla, lo dice y deja intentar de nuevo', async () => {
    const typing = userEvent.setup();
    setup({ failWith: new Error('sin espacio') });
    await typing.click(await screen.findByRole('button', { name: text.generate }));
    expect(await screen.findByText(text.error)).toBeVisible();
    expect(screen.getByRole('button', { name: text.generate })).toBeEnabled();
  });

  it('lo marca como datos simulados y cuenta alumnos y al de la demo', async () => {
    setup({ seeded: true });
    expect(await screen.findByText(t.labels.simulatedData)).toBeVisible();
    expect(screen.getByText(text.stats.yes)).toBeVisible();
  });
});
