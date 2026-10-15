// Solicitudes de factura en Admin, Pagos (B10 del plan del cambio, respuesta 12, 3.3). Ricardo emite
// cada factura en su sistema y aquí la marca emitida, o la rechaza con una nota que el alumno ve en su
// Perfil. Filtro por estado. En computadora es una tabla y en el teléfono una lista, con las mismas
// acciones.
import { useState } from 'react';
import {
  listInvoiceRequests,
  setInvoiceStatus,
  type AdminInvoiceRequest,
  type InvoiceStatus,
} from '@/data/cloud/adminBilling';
import { loadCloud } from '@/data/cloud/client';
import { longDate } from '@/features/billing/planState';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { SegmentedControl } from '@/ui/components/segmented';
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/hooks/use-media-query';
import { LoadingState } from '@/ui/states/states';
import { AdminQueryFailure } from './AdminQueryFailure';
import { useAdminQuery } from './useAdminQuery';

const text = invoicesText.admin.invoices;
type Filter = InvoiceStatus | 'all';
const FILTERS: readonly Filter[] = ['pending', 'issued', 'rejected', 'all'];

const aliasOf = (request: AdminInvoiceRequest) => request.alias ?? text.noAlias;

function paymentText(request: AdminInvoiceRequest): string {
  if (request.amountMxn === null) return text.noPayment;
  return text.paymentOf(
    t.billing.price(request.amountMxn),
    longDate(request.paidAt ?? request.createdAt),
  );
}

/** RFC, razón social, régimen, código postal y uso, uno por línea */
function FiscalData({ request }: { request: AdminInvoiceRequest }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold">{request.legalName}</span>
      <span>{text.rfc(request.rfc)}</span>
      <span className="text-fg-muted">
        {text.regime(request.taxRegime)}. {text.postal(request.postalCode)}.{' '}
        {text.use(request.cfdiUse)}.
      </span>
    </div>
  );
}

interface ActionsProps {
  request: AdminInvoiceRequest;
  busy: boolean;
  rejecting: boolean;
  note: string;
  noteError: string | null;
  onIssue: () => void;
  onStartReject: () => void;
  onNote: (value: string) => void;
  onReject: () => void;
  onCancel: () => void;
}

function Actions(props: ActionsProps) {
  const { request } = props;
  if (props.rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <TextField
          label={text.rejectNote}
          hint={text.rejectNoteHint}
          value={props.note}
          maxLength={500}
          error={props.noteError}
          onChange={(event) => {
            props.onNote(event.target.value);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" disabled={props.busy} onClick={props.onReject}>
            {text.rejectConfirm}
          </Button>
          <Button size="sm" variant="secondary" disabled={props.busy} onClick={props.onCancel}>
            {text.cancel}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {request.status !== 'issued' ? (
        <Button size="sm" disabled={props.busy} onClick={props.onIssue}>
          {text.markIssued}
        </Button>
      ) : null}
      {request.status !== 'rejected' ? (
        <Button size="sm" variant="secondary" disabled={props.busy} onClick={props.onStartReject}>
          {text.reject}
        </Button>
      ) : null}
    </div>
  );
}

function statusText(request: AdminInvoiceRequest): string {
  const name = text.statuses[request.status];
  if (request.status === 'issued' && request.issuedAt)
    return `${name}, ${longDate(request.issuedAt)}`;
  if (request.status === 'rejected' && request.adminNote) return `${name}. ${request.adminNote}`;
  return name;
}

export function InvoiceRequestsCard() {
  const [filter, setFilter] = useState<Filter>('pending');
  const { state, reload } = useAdminQuery(
    (cloud) => listInvoiceRequests(cloud, { status: filter === 'all' ? null : filter }),
    filter,
  );
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const change = async (request: AdminInvoiceRequest, status: InvoiceStatus) => {
    const clean = note.trim();
    if (status === 'rejected' && clean === '') {
      setNoteError(text.noteNeeded);
      return;
    }
    setBusy(true);
    const cloud = await loadCloud();
    const result = cloud
      ? await setInvoiceStatus(cloud, {
          id: request.id,
          status,
          note: status === 'rejected' ? clean : null,
        })
      : ({ ok: false, reason: 'network' } as const);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.reason === 'duplicate' ? text.duplicate : text.changeFailed);
      return;
    }
    setRejecting(null);
    setNote('');
    setMessage(
      status === 'issued'
        ? text.markedIssued(aliasOf(request))
        : text.markedRejected(aliasOf(request)),
    );
    reload();
  };

  const actionsFor = (request: AdminInvoiceRequest) => (
    <Actions
      request={request}
      busy={busy}
      rejecting={rejecting === request.id}
      note={note}
      noteError={noteError}
      onIssue={() => {
        void change(request, 'issued');
      }}
      onStartReject={() => {
        setRejecting(request.id);
        setNote('');
        setNoteError(null);
        setMessage('');
      }}
      onNote={(value) => {
        setNote(value);
        setNoteError(null);
      }}
      onReject={() => {
        void change(request, 'rejected');
      }}
      onCancel={() => {
        setRejecting(null);
        setNote('');
        setNoteError(null);
      }}
    />
  );

  const requests = state.status === 'ready' ? state.value.requests : [];

  return (
    <Card aria-labelledby="facturas-admin-titulo" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="facturas-admin-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <SegmentedControl
        label={text.filterLabel}
        value={filter}
        options={FILTERS.map((value) => ({ value, label: text.filters[value] }))}
        onChange={(value) => {
          if (value === filter) return;
          setFilter(value);
          setRejecting(null);
          setMessage('');
          reload();
        }}
      />
      <p role="status" className="text-sm text-fg-muted empty:hidden">
        {message}
      </p>
      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'failed' ? (
        <AdminQueryFailure reason={state.reason} onRetry={reload} />
      ) : null}
      {state.status === 'ready' && requests.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : null}
      {requests.length > 0 && desktop ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
            <caption className="sr-only">{text.title}</caption>
            <thead>
              <tr className="border-b border-line-strong text-xs text-fg-muted">
                {(
                  ['date', 'student', 'fiscal', 'email', 'payment', 'status', 'actions'] as const
                ).map((column) => (
                  <th key={column} scope="col" className="py-2 pr-3 align-bottom font-semibold">
                    {text.columns[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {requests.map((request) => (
                <tr key={request.id}>
                  <td className="py-2 pr-3">{longDate(request.createdAt)}</td>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <span className="font-semibold">{aliasOf(request)}</span>
                    {request.accountEmail ? (
                      <span className="block break-all text-fg-muted">{request.accountEmail}</span>
                    ) : null}
                  </th>
                  <td className="py-2 pr-3">
                    <FiscalData request={request} />
                  </td>
                  <td className="py-2 pr-3 break-all">{request.email}</td>
                  <td className="py-2 pr-3">{paymentText(request)}</td>
                  <td className="py-2 pr-3">{statusText(request)}</td>
                  <td className="w-64 py-2">{actionsFor(request)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {requests.length > 0 && !desktop ? (
        <ul
          aria-label={text.title}
          className="flex flex-col divide-y divide-line border-y border-line"
        >
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-2 py-3 text-sm">
              <p>
                <span className="font-semibold">{aliasOf(request)}</span>
                <span className="text-fg-muted">, {longDate(request.createdAt)}</span>
              </p>
              <FiscalData request={request} />
              <p className="break-all">{request.email}</p>
              <p>{paymentText(request)}</p>
              <p>{statusText(request)}</p>
              {actionsFor(request)}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
