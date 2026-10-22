// @vitest-environment jsdom
// Sección Correos y alertas de Plataforma (pantalla 25, B15). Sin la nube no se cambia nada. Con la nube lee
// los interruptores y los conteos, prende y pausa, y manda el error de prueba. Todo se imita en memoria.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { adminEngagementText as text } from '@/i18n/adminEngagement';
import { EngagementSettings } from './EngagementSettings';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const KINDS = [
  'content_report',
  'daily_review_reminder',
  'distractor_flags',
  'invoice_requested',
  'pass_expiring',
  'trial_ending',
];

interface Options {
  settings?: Record<string, unknown>;
  overview?: Record<string, { queued: number; sent: number; skipped: number; failed: number }>;
  failUpserts?: boolean;
  failRead?: boolean;
  invoke?: () => Promise<{ data: unknown; error: unknown }>;
  overviewError?: string;
}

interface FakeState {
  upserts: { key: string; value: unknown }[];
  rpc: [string, unknown][];
  invoked: string[];
}

function fakeCloud(options: Options = {}): FakeState {
  const state: FakeState = { upserts: [], rpc: [], invoked: [] };
  const settings: Record<string, unknown> = {
    email_delivery: { enabled: false, paused: [] },
    analytics: { enabled: false },
    ...options.settings,
  };
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      state.rpc.push([name, args]);
      if (options.overviewError) {
        return Promise.resolve({ data: null, error: { code: options.overviewError } });
      }
      return Promise.resolve({
        data: {
          days: 7,
          kinds: KINDS.map((kind) => ({
            kind,
            queued: 0,
            sent: 0,
            skipped: 0,
            failed: 0,
            ...options.overview?.[kind],
          })),
        },
        error: null,
      });
    },
    from: () => {
      let key = '';
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          key = value;
          return query;
        },
        maybeSingle: () =>
          Promise.resolve(
            options.failRead
              ? { data: null, error: { code: '500' } }
              : { data: { value: settings[key] }, error: null },
          ),
        upsert: (row: { key: string; value: unknown }) => {
          state.upserts.push({ key: row.key, value: row.value });
          if (options.failUpserts) return Promise.resolve({ error: { code: '42501' } });
          settings[row.key] = row.value;
          return Promise.resolve({ error: null });
        },
      };
      return query;
    },
    functions: {
      invoke: (name: string) => {
        state.invoked.push(name);
        return (
          options.invoke ?? (() => Promise.resolve({ data: { result: 'sent' }, error: null }))
        )();
      },
    },
  };
  return state;
}

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

const row = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

describe('Correos y alertas, sin la nube', () => {
  it('explica que los interruptores viven en el servidor y no ofrece cambiar nada', () => {
    useCloud.setState({ state: { status: 'off' } });
    render(<EngagementSettings />);
    expect(screen.getByRole('heading', { name: text.title })).toBeVisible();
    expect(screen.getByText(text.needsCloud)).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: text.alerts.button })).not.toBeInTheDocument();
  });
});

describe('Correos y alertas, envío de correos', () => {
  it('muestra los dos interruptores apagados de fábrica y los conteos por tipo y estado', async () => {
    const state = fakeCloud({
      overview: { daily_review_reminder: { queued: 3, sent: 40, skipped: 5, failed: 2 } },
    });
    render(<EngagementSettings />);
    expect(
      await screen.findByRole('checkbox', { name: text.delivery.switchLabel }),
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: text.analytics.switchLabel })).not.toBeChecked();
    expect(screen.getByText(text.counts.caption(7))).toBeVisible();
    const reminder = within(row(text.kinds.daily_review_reminder as string));
    expect(reminder.getByText(text.counts.queued).nextSibling).toHaveTextContent('3');
    expect(reminder.getByText(text.counts.sent).nextSibling).toHaveTextContent('40');
    expect(reminder.getByText(text.counts.skipped).nextSibling).toHaveTextContent('5');
    expect(reminder.getByText(text.counts.failed).nextSibling).toHaveTextContent('2');
    // Todos los tipos, también los que están en cero, y ninguno con un destinatario
    for (const kind of KINDS) expect(screen.getByText(text.kinds[kind] as string)).toBeVisible();
    expect(document.body).not.toHaveTextContent('@');
    expect(state.rpc).toEqual([['admin_email_overview', { p_days: 7 }]]);
  });

  it('prende el envío en el servidor y vuelve a leer', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    render(<EngagementSettings />);
    await typing.click(await screen.findByRole('checkbox', { name: text.delivery.switchLabel }));
    expect(await screen.findByText(text.saved)).toBeVisible();
    expect(state.upserts).toEqual([
      { key: 'email_delivery', value: { enabled: true, paused: [] } },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: text.delivery.switchLabel })).toBeChecked(),
    );
    expect(state.rpc.length).toBeGreaterThanOrEqual(2);
  });

  it('pausa y reanuda un tipo sin tocar el interruptor ni los demás tipos', async () => {
    const state = fakeCloud({
      settings: { email_delivery: { enabled: true, paused: ['trial_ending'] } },
    });
    const typing = userEvent.setup();
    render(<EngagementSettings />);
    await screen.findByRole('checkbox', { name: text.delivery.switchLabel });
    expect(
      within(row(text.kinds.trial_ending as string)).getByText(text.delivery.paused),
    ).toBeVisible();
    expect(
      within(row(text.kinds.daily_review_reminder as string)).queryByText(text.delivery.paused),
    ).not.toBeInTheDocument();
    await typing.click(
      screen.getByRole('button', {
        name: text.pauseLabel(text.kinds.daily_review_reminder as string),
      }),
    );
    await screen.findByText(text.saved);
    expect(state.upserts.at(-1)).toEqual({
      key: 'email_delivery',
      value: { enabled: true, paused: ['trial_ending', 'daily_review_reminder'] },
    });
    await typing.click(
      await screen.findByRole('button', {
        name: text.resumeLabel(text.kinds.trial_ending as string),
      }),
    );
    await waitFor(() => {
      expect(state.upserts.at(-1)).toEqual({
        key: 'email_delivery',
        value: { enabled: true, paused: ['daily_review_reminder'] },
      });
    });
  });

  it('prende los eventos de dinero de la analítica', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    render(<EngagementSettings />);
    await typing.click(await screen.findByRole('checkbox', { name: text.analytics.switchLabel }));
    expect(await screen.findByText(text.saved)).toBeVisible();
    expect(state.upserts).toEqual([{ key: 'analytics', value: { enabled: true } }]);
  });

  it('si la base rechaza el cambio lo dice y no finge que se guardó', async () => {
    const state = fakeCloud({ failUpserts: true });
    const typing = userEvent.setup();
    render(<EngagementSettings />);
    await typing.click(await screen.findByRole('checkbox', { name: text.delivery.switchLabel }));
    expect(await screen.findByText(text.saveFailed)).toBeVisible();
    expect(screen.queryByText(text.saved)).not.toBeInTheDocument();
    expect(state.upserts).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: text.delivery.switchLabel })).not.toBeChecked();
  });

  it('si no se pueden leer los interruptores no los muestra apagados', async () => {
    fakeCloud({ failRead: true });
    render(<EngagementSettings />);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('si la base no deja leer los conteos (otro rol o falta la migración) muestra el error', async () => {
    fakeCloud({ overviewError: '42501' });
    render(<EngagementSettings />);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('Correos y alertas, error de prueba', () => {
  it('manda el del navegador y llama a monitoring-test, y dice cómo le fue a cada uno', async () => {
    const state = fakeCloud();
    const sendBrowserTest = vi.fn(() => Promise.resolve('sent' as const));
    const typing = userEvent.setup();
    render(<EngagementSettings sendBrowserTest={sendBrowserTest} />);
    await typing.click(await screen.findByRole('button', { name: text.alerts.button }));
    expect(await screen.findByText(text.alerts.browser.sent)).toBeVisible();
    expect(screen.getByText(text.alerts.server.sent)).toBeVisible();
    expect(sendBrowserTest).toHaveBeenCalledTimes(1);
    expect(state.invoked).toEqual(['monitoring-test']);
  });

  it('sin SENTRY_DSN en las funciones lo dice, y sin destino de Sentry en el navegador también', async () => {
    fakeCloud({ invoke: () => Promise.resolve({ data: { result: 'missing_dsn' }, error: null }) });
    const typing = userEvent.setup();
    render(<EngagementSettings />);
    await typing.click(await screen.findByRole('button', { name: text.alerts.button }));
    expect(await screen.findByText(text.alerts.server.missing_dsn)).toBeVisible();
    expect(screen.getByText(text.alerts.browser.unavailable)).toBeVisible();
  });

  it('si el navegador no pudo mandar o lanza, la prueba de las funciones sigue', async () => {
    const state = fakeCloud();
    const typing = userEvent.setup();
    render(<EngagementSettings sendBrowserTest={() => Promise.reject(new Error('sin red'))} />);
    await typing.click(await screen.findByRole('button', { name: text.alerts.button }));
    expect(await screen.findByText(text.alerts.browser.blocked)).toBeVisible();
    expect(screen.getByText(text.alerts.server.sent)).toBeVisible();
    expect(state.invoked).toEqual(['monitoring-test']);
  });

  it('un 401 de la función es que la sesión no es de admin con segundo factor', async () => {
    fakeCloud({
      invoke: () =>
        Promise.resolve({ data: null, error: { context: new Response('{}', { status: 401 }) } }),
    });
    const typing = userEvent.setup();
    render(<EngagementSettings sendBrowserTest={() => Promise.resolve('sent')} />);
    await typing.click(await screen.findByRole('button', { name: text.alerts.button }));
    expect(await screen.findByText(text.alerts.server.forbidden)).toBeVisible();
  });

  it('una función caída o sin desplegar se dice, sin lanzar', async () => {
    fakeCloud({ invoke: () => Promise.reject(new Error('sin red')) });
    const typing = userEvent.setup();
    render(<EngagementSettings sendBrowserTest={() => Promise.resolve('sent')} />);
    await typing.click(await screen.findByRole('button', { name: text.alerts.button }));
    expect(await screen.findByText(text.alerts.server.failed)).toBeVisible();
  });

  it('el mensaje de la prueba no lleva datos de nadie, solo el botón y los avisos', async () => {
    fakeCloud();
    render(<EngagementSettings sendBrowserTest={() => Promise.resolve('sent')} />);
    await screen.findByRole('button', { name: text.alerts.button });
    expect(document.body).not.toHaveTextContent(/yo@ejemplo\.mx|authId/);
  });
});
