// @vitest-environment jsdom
// Admin, Pagos (B10, 3.3). Solo para admin. Resumen de lugares Fundador, solicitudes de factura con su
// filtro y sus acciones, códigos de influencer con la columna Registros de B9 y pagos recientes con
// Marcar como devuelto para OXXO.
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { DataProvider } from '@/data/DataProvider';
import { longDate } from '@/features/billing/planState';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import { BillingAdminScreen } from './BillingAdminScreen';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = invoicesText.admin;
const AT = '2026-10-14T15:00:00.000Z';

const REQUEST = {
  id: 'r1',
  user_id: 'u1',
  alias: 'Ana',
  account_email: 'ana@ejemplo.mx',
  payment_id: 'p1',
  amount_mxn: 79,
  paid_at: AT,
  plan: 'founder',
  method: 'card',
  rfc: 'XAXX010101000',
  legal_name: 'ANA LÓPEZ',
  tax_regime: '612',
  postal_code: '97000',
  cfdi_use: 'G03',
  email: 'facturas@ejemplo.mx',
  status: 'pending',
  admin_note: null,
  created_at: AT,
  issued_at: null,
  total: 1,
};

const PAYMENT = (patch: Record<string, unknown>) => ({
  id: 'p1',
  user_id: 'u1',
  alias: 'Ana',
  plan: 'monthly',
  purpose: 'pass',
  method: 'oxxo',
  provider: 'stripe',
  amount_mxn: 149,
  discount_mxn: null,
  promotion_code: null,
  status: 'paid',
  paid_at: AT,
  created_at: AT,
  total: 2,
  ...patch,
});

function fakeCloud(options: { influencer?: boolean; denied?: boolean } = {}) {
  const calls: [string, unknown][] = [];
  const state: { requests: Record<string, unknown>[]; refunded: boolean } = {
    requests: [REQUEST],
    refunded: false,
  };
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      if (options.denied) {
        return Promise.resolve({ data: null, error: { code: '42501', message: 'no' } });
      }
      const data: Record<string, unknown> = {
        admin_billing_summary: {
          founder: { total: 100, held: 3, confirmed: 34, open: true },
          activeTrials: 3,
          activePasses: 5,
          needsRefund: 1,
          pendingActions: 0,
          failedActions: 2,
          pendingInvoices: 1,
        },
        admin_invoice_requests: state.requests,
        admin_set_invoice_status: null,
        admin_promotion_code_stats: [
          { code: 'PRUEBA10', trials: 1, payments: 2, paying_users: 2, revenue_mxn: 142.2 },
        ],
        admin_recent_payments: [
          PAYMENT({ status: state.refunded ? 'refunded' : 'paid' }),
          PAYMENT({
            id: 'p2',
            purpose: 'subscription',
            plan: 'founder',
            method: 'card',
            amount_mxn: 71.1,
            discount_mxn: 7.9,
            promotion_code: 'PRUEBA10',
          }),
        ],
        admin_mark_payment_refunded: 'refunded',
      };
      if (name === 'admin_influencer_code_counts') {
        return Promise.resolve(
          options.influencer
            ? { data: [{ code: 'PRUEBA10', total: 7 }], error: null }
            : { data: null, error: { code: 'PGRST202', message: 'no existe' } },
        );
      }
      if (name === 'admin_mark_payment_refunded') state.refunded = true;
      if (name === 'admin_set_invoice_status') {
        state.requests = [{ ...REQUEST, status: 'issued', issued_at: AT }];
      }
      return Promise.resolve({ data: data[name] ?? null, error: null });
    },
  };
  return calls;
}

function linkAs(role: 'admin' | 'student') {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role, alias: null },
    },
  });
}

const showScreen = () =>
  render(
    <DataProvider kind="real">
      <MemoryRouter>
        <BillingAdminScreen />
      </MemoryRouter>
    </DataProvider>,
  );

let app: RenderedApp | undefined;
beforeEach(() => {
  linkAs('admin');
});
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('Admin, Pagos', () => {
  it('es del área de admin. Un alumno no entra', async () => {
    fakeCloud();
    linkAs('student');
    usePreferences.setState({ role: 'student' });
    app = await renderApp(SCREENS.adminBilling.path);
    expect(await screen.findByText(t.access.adminTitle)).toBeVisible();
    expect(screen.queryByRole('heading', { name: text.summary.title })).toBeNull();
  });

  it('sin la nube dice que necesita la cuenta de un admin', () => {
    useCloud.setState({ state: { status: 'off' } });
    showScreen();
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.adminBilling.title }),
    ).toBeVisible();
    expect(screen.getByText(text.needsCloud)).toBeVisible();
  });

  it('un 42501 del servidor dice que solo un admin puede ver los pagos', async () => {
    fakeCloud({ denied: true });
    showScreen();
    const alerts = await screen.findAllByText(text.failed.not_admin);
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('el resumen dice los lugares Fundador ocupados y apartados, y las cifras de pagos', async () => {
    fakeCloud();
    showScreen();
    expect(await screen.findByText(text.summary.founderSeats(37, 100, 3))).toBeVisible();
    // Con un solo lugar apartado la frase va en singular
    expect(text.summary.founderSeats(1, 100, 1)).toBe(
      'Lugares Fundador ocupados 1 de 100, 1 apartado por una prueba.',
    );
    expect(text.summary.founderSeats(37, 100, 3)).toContain('3 apartados por pruebas.');
    const summary = screen.getByRole('region', { name: text.summary.title });
    expect(within(summary).getByText(text.summary.failedActions).nextSibling).toHaveTextContent(
      '2',
    );
    expect(within(summary).getByText(text.summary.activeTrials).nextSibling).toHaveTextContent('3');
  });

  it('marca emitida una solicitud de factura y filtra por estado', async () => {
    const calls = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const card = await screen.findByRole('region', { name: text.invoices.title });
    expect(await within(card).findByText('ANA LÓPEZ')).toBeVisible();
    expect(within(card).getByText(text.invoices.rfc('XAXX010101000'))).toBeVisible();
    await typing.click(within(card).getByRole('button', { name: text.invoices.markIssued }));
    expect(await within(card).findByText(text.invoices.markedIssued('Ana'))).toBeVisible();
    expect(calls).toContainEqual([
      'admin_set_invoice_status',
      { p_id: 'r1', p_status: 'issued', p_note: null },
    ]);
    await typing.click(within(card).getByRole('button', { name: text.invoices.filters.all }));
    await waitFor(() => {
      expect(calls).toContainEqual([
        'admin_invoice_requests',
        { p_status: null, p_limit: 50, p_offset: 0 },
      ]);
    });
  });

  it('rechazar pide una nota antes de mandar', async () => {
    const calls = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const card = await screen.findByRole('region', { name: text.invoices.title });
    await typing.click(await within(card).findByRole('button', { name: text.invoices.reject }));
    await typing.click(within(card).getByRole('button', { name: text.invoices.rejectConfirm }));
    expect(within(card).getByText(text.invoices.noteNeeded)).toBeVisible();
    expect(calls.filter(([name]) => name === 'admin_set_invoice_status')).toEqual([]);
    await typing.type(within(card).getByLabelText(text.invoices.rejectNote), 'RFC distinto');
    await typing.click(within(card).getByRole('button', { name: text.invoices.rejectConfirm }));
    await waitFor(() => {
      expect(calls).toContainEqual([
        'admin_set_invoice_status',
        { p_id: 'r1', p_status: 'rejected', p_note: 'RFC distinto' },
      ]);
    });
  });

  it('los códigos traen Registros solo si existe la función de B9', async () => {
    fakeCloud({ influencer: true });
    showScreen();
    let card = await screen.findByRole('region', { name: text.codes.title });
    expect(
      await within(card).findByRole('columnheader', { name: text.codes.columns.signups }),
    ).toBeVisible();
    expect(within(card).getByRole('rowheader', { name: 'PRUEBA10' })).toBeVisible();
    expect(within(card).getByText(t.billing.price(142.2))).toBeVisible();
    cleanup();

    fakeCloud({ influencer: false });
    showScreen();
    card = await screen.findByRole('region', { name: text.codes.title });
    await within(card).findByRole('rowheader', { name: 'PRUEBA10' });
    expect(
      within(card).queryByRole('columnheader', { name: text.codes.columns.signups }),
    ).toBeNull();
  });

  it('los pagos recientes dicen el descuento con su código y dejan marcar devuelto un OXXO con nota', async () => {
    const calls = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const card = await screen.findByRole('region', { name: text.payments.title });
    expect(
      await within(card).findByText(
        new RegExp(text.payments.discount(t.billing.price(7.9), 'PRUEBA10').replace('$', '\\$')),
      ),
    ).toBeVisible();
    expect(within(card).getAllByText(new RegExp(longDate(AT))).length).toBe(2);
    // Solo el pago con OXXO se marca a mano
    const buttons = within(card).getAllByRole('button', { name: text.payments.markRefunded });
    expect(buttons).toHaveLength(1);
    await typing.click(buttons[0] as HTMLElement);
    await typing.type(within(card).getByLabelText(text.payments.refundNote), 'Transferencia 123');
    await typing.click(within(card).getByRole('button', { name: text.payments.refundConfirm }));
    expect(await within(card).findByText(text.payments.refunded)).toBeVisible();
    expect(calls).toContainEqual([
      'admin_mark_payment_refunded',
      { p_payment: 'p1', p_note: 'Transferencia 123' },
    ]);
    await waitFor(() => {
      expect(within(card).queryByRole('button', { name: text.payments.markRefunded })).toBeNull();
    });
  });
});
