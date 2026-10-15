// @vitest-environment jsdom
// Facturas del alumno en Perfil (B10, respuesta 12, 3.2). Lista sus solicitudes, valida cada campo
// junto a él, manda la solicitud, dice a qué correo llegará y explica IV003.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { longDate } from '@/features/billing/planState';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import { InvoiceRequestCard } from './InvoiceRequestCard';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = invoicesText.student;
const AUTH = '11111111-1111-4111-8111-111111111111';
const PAID_AT = '2026-10-14T15:00:00.000Z';

interface Server {
  payments: Record<string, unknown>[];
  requests: Record<string, unknown>[];
  rpc: { data?: unknown; error?: unknown };
  rpcCalls: unknown[];
}

function fakeCloud(patch: Partial<Server> = {}): Server {
  const server: Server = {
    payments: [
      {
        id: 'pago-1',
        amount_mxn: 79,
        status: 'paid',
        created_at: PAID_AT,
        paid_at: PAID_AT,
        plan: 'founder',
        purpose: 'subscription',
        method: 'card',
      },
    ],
    requests: [],
    rpc: { data: 'solicitud-1' },
    rpcCalls: [],
    ...patch,
  };
  holder.cloud = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () =>
          Promise.resolve({
            data: table === 'payments' ? server.payments : server.requests,
            error: null,
          }),
      };
      return query;
    },
    rpc: (_name: string, args: unknown) => {
      server.rpcCalls.push(args);
      return Promise.resolve({ data: server.rpc.data ?? null, error: server.rpc.error ?? null });
    },
  };
  return server;
}

afterEach(() => {
  cleanup();
  holder.cloud = null;
});

const show = () => render(<InvoiceRequestCard authId={AUTH} accountEmail="ana@ejemplo.mx" />);

async function fillValid(typing: ReturnType<typeof userEvent.setup>) {
  await typing.type(screen.getByLabelText(text.form.rfc), 'xaxx010101000');
  await typing.type(screen.getByLabelText(text.form.legalName), 'Ana López');
  await typing.selectOptions(screen.getByLabelText(text.form.taxRegime), '612');
  await typing.type(screen.getByLabelText(text.form.postalCode), '97000');
}

describe('Facturas en Perfil', () => {
  it('sin pagos dice que podrá pedirla cuando pague y no ofrece el botón', async () => {
    fakeCloud({ payments: [] });
    show();
    expect(await screen.findByText(text.noPayments)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.request })).toBeNull();
  });

  it('lista sus solicitudes con su pago y su estado', async () => {
    fakeCloud({
      payments: [
        ...fakeCloud().payments,
        { id: 'pago-2', amount_mxn: 749, status: 'paid', created_at: PAID_AT, paid_at: PAID_AT },
      ],
      requests: [
        {
          id: 'r1',
          payment_id: 'pago-1',
          status: 'issued',
          admin_note: null,
          email: 'ana@ejemplo.mx',
          created_at: PAID_AT,
          issued_at: '2026-10-15T15:00:00.000Z',
        },
        {
          id: 'r2',
          payment_id: 'pago-2',
          status: 'rejected',
          admin_note: 'El RFC no coincide con la constancia.',
          email: 'ana@ejemplo.mx',
          created_at: PAID_AT,
          issued_at: null,
        },
      ],
    });
    show();
    const list = await screen.findByRole('list', { name: text.listLabel });
    const date = longDate(PAID_AT);
    expect(
      within(list).getByText(
        `${text.paymentLine(date, t.billing.price(79))} ${text.issued(longDate('2026-10-15T15:00:00.000Z'))}`,
      ),
    ).toBeVisible();
    expect(
      within(list).getByText(
        `${text.paymentLine(date, t.billing.price(749))} ${text.rejected('El RFC no coincide con la constancia.')}`,
      ),
    ).toBeVisible();
    // Una rechazada deja pedirla otra vez
    expect(screen.getByRole('button', { name: text.request })).toBeVisible();
  });

  it('revisa cada campo junto a él antes de mandar nada', async () => {
    const server = fakeCloud();
    const typing = userEvent.setup();
    show();
    await typing.click(await screen.findByRole('button', { name: text.request }));
    // El correo de la cuenta ya va escrito y Gastos en general es el uso de omisión
    expect(screen.getByLabelText(text.form.email)).toHaveValue('ana@ejemplo.mx');
    expect(screen.getByLabelText(text.form.cfdiUse)).toHaveValue('G03');
    await typing.type(screen.getByLabelText(text.form.rfc), 'XAXX0101');
    await typing.type(screen.getByLabelText(text.form.postalCode), '970');
    await typing.click(screen.getByRole('button', { name: text.form.save }));
    expect(screen.getByLabelText(text.form.rfc)).toHaveAccessibleDescription(text.errors.rfc);
    expect(screen.getByLabelText(text.form.legalName)).toHaveAccessibleDescription(
      `${text.form.legalNameHint} ${text.errors.legal_name}`,
    );
    expect(screen.getByLabelText(text.form.postalCode)).toHaveAccessibleDescription(
      text.errors.postal_code,
    );
    expect(screen.getByText(text.errors.tax_regime)).toBeVisible();
    expect(server.rpcCalls).toEqual([]);
    // Al corregir el campo su error se va
    await typing.clear(screen.getByLabelText(text.form.rfc));
    await typing.type(screen.getByLabelText(text.form.rfc), 'XAXX010101000');
    expect(screen.queryByText(text.errors.rfc)).toBeNull();
  });

  it('manda la solicitud, dice a qué correo llegará y la lista como pendiente', async () => {
    const server = fakeCloud();
    const typing = userEvent.setup();
    show();
    await typing.click(await screen.findByRole('button', { name: text.request }));
    await fillValid(typing);
    server.requests = [
      {
        id: 'solicitud-1',
        payment_id: 'pago-1',
        status: 'pending',
        admin_note: null,
        email: 'ana@ejemplo.mx',
        created_at: PAID_AT,
        issued_at: null,
      },
    ];
    await typing.click(screen.getByRole('button', { name: text.form.save }));
    expect(await screen.findByText(text.sent('ana@ejemplo.mx'))).toBeVisible();
    expect(server.rpcCalls).toEqual([
      {
        p_payment: 'pago-1',
        p_rfc: 'XAXX010101000',
        p_legal_name: 'Ana López',
        p_tax_regime: '612',
        p_postal_code: '97000',
        p_cfdi_use: 'G03',
        p_email: 'ana@ejemplo.mx',
      },
    ]);
    const list = await screen.findByRole('list', { name: text.listLabel });
    expect(within(list).getByText(new RegExp(text.pending))).toBeVisible();
    // Ya pidió factura de su único pago
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: text.request })).toBeNull();
    });
  });

  it('si ya la pidió lo dice con IV003, y un dato que la base rechaza va junto a su campo', async () => {
    fakeCloud({ rpc: { error: { code: 'IV003', message: 'Ya pediste factura de este pago' } } });
    const typing = userEvent.setup();
    show();
    await typing.click(await screen.findByRole('button', { name: text.request }));
    await fillValid(typing);
    await typing.click(screen.getByRole('button', { name: text.form.save }));
    expect(await screen.findByText(text.duplicate)).toBeVisible();
    cleanup();

    fakeCloud({ rpc: { error: { code: 'IV001', details: 'postal_code' } } });
    show();
    await typing.click(await screen.findByRole('button', { name: text.request }));
    await fillValid(typing);
    await typing.click(screen.getByRole('button', { name: text.form.save }));
    expect(await screen.findByText(text.errors.postal_code)).toBeVisible();
  });

  it('Cancelar cierra el formulario sin mandar nada', async () => {
    const server = fakeCloud();
    const typing = userEvent.setup();
    show();
    await typing.click(await screen.findByRole('button', { name: text.request }));
    await typing.click(screen.getByRole('button', { name: text.form.cancel }));
    expect(screen.getByText(text.canceled)).toBeVisible();
    expect(screen.queryByLabelText(text.form.rfc)).toBeNull();
    expect(server.rpcCalls).toEqual([]);
  });
});
