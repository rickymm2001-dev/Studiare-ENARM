// Facturas del alumno, en Configuración, sección Perfil, justo después de Tu plan (B10 del plan del
// cambio, respuesta 12, 3.2). Solo con la cuenta de la nube conectada, porque los pagos viven ahí. Lista
// sus solicitudes con su estado y deja pedir la factura de un pago pagado con el formulario de Guardar
// y Cancelar, como Editar perfil. La app revisa el formato junto a cada campo y la base lo vuelve a
// revisar con request_invoice. La factura la emite Ricardo a mano y llega por correo.
import { FileText } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { CFDI_USES, TAX_REGIMES, catalogLabel } from '@/config/cfdi';
import { loadCloud } from '@/data/cloud/client';
import {
  invalidInvoiceFields,
  invoiceablePayments,
  listMyInvoiceRequests,
  listMyPayments,
  requestInvoice,
  type InvoiceDraft,
  type InvoiceField,
  type MyInvoiceRequest,
  type MyPayment,
} from '@/data/payments/invoices';
import { longDate } from '@/features/billing/planState';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';

const text = invoicesText.student;

type State =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; payments: MyPayment[]; requests: MyInvoiceRequest[] };

const emptyDraft = (email: string): InvoiceDraft => ({
  paymentId: '',
  rfc: '',
  legalName: '',
  taxRegime: '',
  postalCode: '',
  cfdiUse: 'G03',
  email,
});

const paymentDate = (payment: MyPayment) => longDate(payment.paidAt ?? payment.createdAt);

/** Un pago que todavía no tiene una solicitud viva. Una rechazada deja pedirla otra vez */
function requestablePayments(payments: MyPayment[], requests: MyInvoiceRequest[]): MyPayment[] {
  const taken = new Set(
    requests.filter((item) => item.status !== 'rejected').map((item) => item.paymentId),
  );
  return invoiceablePayments(payments).filter((payment) => !taken.has(payment.id));
}

export function InvoiceRequestCard({
  authId,
  accountEmail,
}: {
  /** La cuenta de la nube, para leer solo lo propio aunque sea admin */
  authId: string;
  /** El correo de la cuenta, que ya va escrito en el formulario */
  accountEmail: string | null;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InvoiceDraft>(() => emptyDraft(accountEmail ?? ''));
  const [errors, setErrors] = useState<Partial<Record<InvoiceField, string>>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const requestButton = useRef<HTMLButtonElement>(null);
  // Al salir del formulario el foco vuelve a Pedir factura para no perder el lugar con el teclado
  const returnFocus = useRef(false);
  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    requestButton.current?.focus();
  }, [editing]);

  useEffect(() => {
    let stopped = false;
    void loadCloud().then(async (cloud) => {
      if (!cloud) {
        if (!stopped) setState({ status: 'failed' });
        return;
      }
      const [payments, requests] = await Promise.all([
        listMyPayments(cloud, authId),
        listMyInvoiceRequests(cloud, authId),
      ]);
      if (stopped) return;
      setState(
        payments.ok && requests.ok
          ? { status: 'ready', payments: payments.payments, requests: requests.requests }
          : { status: 'failed' },
      );
    });
    return () => {
      stopped = true;
    };
  }, [authId, reload]);

  const ready = state.status === 'ready' ? state : null;
  const available = ready ? requestablePayments(ready.payments, ready.requests) : [];
  const paymentOf = new Map((ready?.payments ?? []).map((payment) => [payment.id, payment]));

  const change = (patch: Partial<InvoiceDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    const fields = Object.keys(patch).map((key) =>
      key === 'paymentId'
        ? 'payment'
        : key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    );
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([field]) => !fields.includes(field))),
    );
  };

  const leave = (status: string) => {
    returnFocus.current = true;
    setEditing(false);
    setErrors({});
    setMessage(status);
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (saving) return;
    const invalid = invalidInvoiceFields(draft);
    if (invalid.length > 0) {
      setErrors(Object.fromEntries(invalid.map((field) => [field, text.errors[field]])));
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const cloud = await loadCloud();
      const result = cloud
        ? await requestInvoice(cloud, draft)
        : ({ ok: false, reason: 'network' } as const);
      if (result.ok) {
        leave(text.sent(draft.email.trim().toLowerCase()));
        setReload((value) => value + 1);
        return;
      }
      switch (result.reason) {
        case 'invalid':
          setErrors({ [result.field]: text.errors[result.field] });
          return;
        case 'not_payable':
          setErrors({ payment: text.notPayable });
          return;
        case 'duplicate':
          leave(text.duplicate);
          setReload((value) => value + 1);
          return;
        case 'not_active_device':
          setMessage(text.notActiveDevice);
          return;
        default:
          setMessage(text.sendFailed);
      }
    } finally {
      setSaving(false);
    }
  };

  const requestLine = (request: MyInvoiceRequest) => {
    const payment = request.paymentId ? paymentOf.get(request.paymentId) : undefined;
    const what = payment
      ? text.paymentLine(paymentDate(payment), t.billing.price(payment.amountMxn))
      : text.paymentGone;
    const status =
      request.status === 'pending'
        ? text.pending
        : request.status === 'issued'
          ? text.issued(longDate(request.issuedAt ?? request.createdAt))
          : text.rejected(request.adminNote);
    return `${what} ${status}`;
  };

  return (
    <Card aria-labelledby="facturas-titulo">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle as="h3" id="facturas-titulo">
            {text.title}
          </CardTitle>
          <CardDescription>{text.description}</CardDescription>
        </div>
        {ready && available.length > 0 && !editing ? (
          <Button
            ref={requestButton}
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft({
                ...emptyDraft(accountEmail ?? ''),
                paymentId: available[0]?.id ?? '',
              });
              setErrors({});
              setMessage('');
              setEditing(true);
            }}
          >
            <FileText aria-hidden />
            {text.request}
          </Button>
        ) : null}
      </CardHeader>

      {state.status === 'loading' ? <LoadingState label={text.loading} /> : null}
      {state.status === 'failed' ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-fg-muted">{text.failed}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setState({ status: 'loading' });
              setReload((value) => value + 1);
            }}
          >
            {text.retry}
          </Button>
        </div>
      ) : null}

      {ready && invoiceablePayments(ready.payments).length === 0 ? (
        <p className="text-sm text-fg-muted">{text.noPayments}</p>
      ) : null}

      {ready && ready.requests.length > 0 ? (
        <ul aria-label={text.listLabel} className="mb-3 flex flex-col gap-2 text-sm">
          {ready.requests.map((request) => (
            <li key={request.id} className="rounded-md border border-line px-3 py-2">
              {requestLine(request)}
            </li>
          ))}
        </ul>
      ) : null}

      {editing && ready ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => void submit(event)}
          noValidate
          aria-label={text.request}
        >
          <SelectField
            label={text.form.payment}
            value={draft.paymentId}
            error={errors.payment ?? null}
            options={available.map((payment) => ({
              value: payment.id,
              label: text.form.paymentOption(
                paymentDate(payment),
                t.billing.price(payment.amountMxn),
              ),
            }))}
            onChange={(event) => {
              change({ paymentId: event.target.value });
            }}
          />
          <TextField
            label={text.form.rfc}
            value={draft.rfc}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
            // Al abrir el formulario el foco va al primer campo que se escribe
            autoFocus
            error={errors.rfc ?? null}
            onChange={(event) => {
              change({ rfc: event.target.value });
            }}
          />
          <TextField
            label={text.form.legalName}
            hint={text.form.legalNameHint}
            value={draft.legalName}
            autoComplete="organization"
            maxLength={254}
            error={errors.legal_name ?? null}
            onChange={(event) => {
              change({ legalName: event.target.value });
            }}
          />
          <SelectField
            label={text.form.taxRegime}
            value={draft.taxRegime}
            error={errors.tax_regime ?? null}
            options={[
              { value: '', label: text.form.choose },
              ...TAX_REGIMES.map((entry) => ({ value: entry.code, label: catalogLabel(entry) })),
            ]}
            onChange={(event) => {
              change({ taxRegime: event.target.value });
            }}
          />
          <TextField
            label={text.form.postalCode}
            value={draft.postalCode}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            error={errors.postal_code ?? null}
            onChange={(event) => {
              change({ postalCode: event.target.value });
            }}
          />
          <SelectField
            label={text.form.cfdiUse}
            value={draft.cfdiUse}
            error={errors.cfdi_use ?? null}
            options={CFDI_USES.map((entry) => ({ value: entry.code, label: catalogLabel(entry) }))}
            onChange={(event) => {
              change({ cfdiUse: event.target.value });
            }}
          />
          <TextField
            label={text.form.email}
            type="email"
            value={draft.email}
            autoComplete="email"
            error={errors.email ?? null}
            onChange={(event) => {
              change({ email: event.target.value });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? text.form.saving : text.form.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                leave(text.canceled);
              }}
            >
              {text.form.cancel}
            </Button>
          </div>
        </form>
      ) : null}

      <p role="status" className="min-h-5 text-sm text-fg-muted">
        {message}
      </p>
    </Card>
  );
}
