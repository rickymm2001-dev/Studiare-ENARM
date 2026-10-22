// Invitaciones y registro abierto (B9 del plan del cambio, respuesta 52). Mientras el registro esté
// cerrado solo crean cuenta los correos invitados, con el correo o con Google. Lo decide el gancho
// Before User Created del servidor. Aquí el dueño y los admins invitan, ven quién ya creó su cuenta,
// quitan invitaciones y abren el registro el día del lanzamiento. Solo con la cuenta de la nube.
import { ClipboardCopy, MailPlus, Trash2 } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { loadCloud } from '@/data/cloud/client';
import {
  inviteEmail,
  listInvitations,
  readRegistrationOpen,
  revokeInvitation,
  setRegistrationOpen,
  type Invitation,
  type InvitationsFailure,
} from '@/data/cloud/invitations';
import { t } from '@/i18n/es-MX';
import { surveyAdminTexts } from '@/i18n/survey';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import { appAddress } from './appAddress';

type ListState =
  | { status: 'loading' }
  | { status: 'failed'; reason: InvitationsFailure }
  | { status: 'ready'; invitations: Invitation[] };

type Message = { kind: 'ok' | 'error'; text: string } | null;

const invitationText = surveyAdminTexts.invitation;

export function InvitationsCard() {
  const text = t.accounts.admin.invitations;
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [open, setOpen] = useState<boolean | null>(null);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Si el navegador no deja copiar, el mensaje se muestra para copiarlo a mano
  const [manualCopy, setManualCopy] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    void loadCloud().then(async (cloud) => {
      if (!cloud) {
        if (!stopped) setList({ status: 'failed', reason: 'network' });
        return;
      }
      const [invitations, registration] = await Promise.all([
        listInvitations(cloud),
        readRegistrationOpen(cloud),
      ]);
      if (stopped) return;
      setList(
        invitations.ok
          ? { status: 'ready', invitations: invitations.invitations }
          : { status: 'failed', reason: invitations.reason },
      );
      setOpen(registration);
    });
    return () => {
      stopped = true;
    };
  }, [reload]);

  const refresh = () => {
    setReload((value) => value + 1);
  };

  const invite = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const cloud = await loadCloud();
      const result = cloud
        ? await inviteEmail(cloud, draft)
        : { ok: false as const, reason: 'network' as const };
      if (result.ok) {
        setMessage({ kind: 'ok', text: text.invited(draft.trim().toLowerCase()) });
        setDraft('');
        refresh();
      } else {
        setMessage({ kind: 'error', text: text.errors[result.reason] });
      }
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (email: string) => {
    setMessage(null);
    const cloud = await loadCloud();
    const result = cloud
      ? await revokeInvitation(cloud, email)
      : { ok: false as const, reason: 'network' as const };
    setMessage(
      result.ok
        ? { kind: 'ok', text: text.revoked(email) }
        : { kind: 'error', text: text.errors[result.reason] },
    );
    if (result.ok) refresh();
  };

  // El mensaje que Ricardo pega en su chat. La invitación de la base no manda nada, solo deja crear la cuenta con ese correo
  const copyInvitation = async (email: string) => {
    setMessage(null);
    setManualCopy(null);
    const invitation = invitationText.message(appAddress(), email);
    try {
      await navigator.clipboard.writeText(invitation);
      setMessage({ kind: 'ok', text: invitationText.copied(email) });
    } catch {
      setManualCopy(invitation);
      setMessage({ kind: 'error', text: invitationText.copyFailed });
    }
  };

  const changeRegistration = async (next: boolean) => {
    setConfirmOpen(false);
    setMessage(null);
    const cloud = await loadCloud();
    const saved = cloud ? await setRegistrationOpen(cloud, next) : false;
    if (!saved) setMessage({ kind: 'error', text: text.registration.failed });
    refresh();
  };

  return (
    <Card aria-labelledby="invitaciones-titulo">
      <CardHeader>
        <CardTitle id="invitaciones-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4">
        <section aria-label={text.registration.label} className="flex flex-col gap-2">
          <p className="text-sm font-semibold">
            {open === null
              ? text.registration.unknown
              : open
                ? text.registration.open
                : text.registration.closed}
          </p>
          <p className="text-sm text-fg-muted">{text.registration.hint}</p>
          {confirmOpen ? (
            <div
              role="group"
              aria-label={text.registration.confirmOpen}
              className="flex flex-col gap-2"
            >
              <p className="text-sm">{text.registration.confirmOpen}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void changeRegistration(true)}>
                  {text.registration.confirm}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setConfirmOpen(false);
                  }}
                >
                  {text.registration.cancel}
                </Button>
              </div>
            </div>
          ) : open === null ? null : (
            <Button
              size="sm"
              variant="secondary"
              className="self-start"
              onClick={() => {
                if (open) void changeRegistration(false);
                else setConfirmOpen(true);
              }}
            >
              {open ? text.registration.closeAction : text.registration.openAction}
            </Button>
          )}
        </section>

        <form
          className="flex flex-wrap items-end gap-3 border-t border-line pt-4"
          noValidate
          onSubmit={(event) => void invite(event)}
        >
          <TextField
            label={text.email}
            type="email"
            className="min-w-56 flex-1"
            value={draft}
            autoComplete="off"
            inputMode="email"
            onChange={(event) => {
              setDraft(event.target.value);
              setMessage(null);
            }}
          />
          <Button type="submit" disabled={busy}>
            <MailPlus aria-hidden />
            {busy ? text.inviting : text.invite}
          </Button>
        </form>
        <p className="text-sm text-fg-muted">{invitationText.sameEmail}</p>
        {message ? (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={
              message.kind === 'error'
                ? 'rounded-md bg-danger-soft p-3 text-sm break-words text-danger'
                : 'rounded-md bg-muted p-3 text-sm break-words'
            }
          >
            {message.text}
          </p>
        ) : null}

        {manualCopy ? (
          <textarea
            readOnly
            rows={10}
            aria-label={invitationText.copy}
            value={manualCopy}
            className="w-full rounded-md border border-line-strong bg-surface p-3 text-sm"
            onFocus={(event) => {
              event.target.select();
            }}
          />
        ) : null}

        {list.status === 'loading' ? <LoadingState label={text.loading} /> : null}
        {list.status === 'failed' ? (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {text.errors[list.reason]}
          </p>
        ) : null}
        {list.status === 'ready' ? (
          list.invitations.length === 0 ? (
            <p className="text-sm text-fg-muted">{text.empty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {list.invitations.map((invitation) => (
                <li
                  key={invitation.email}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{invitation.email}</p>
                    <p className="text-xs text-fg-muted">{text.invitedOn(invitation.invitedAt)}</p>
                  </div>
                  <Badge variant="neutral">
                    {invitation.registered ? text.registered : text.pending}
                  </Badge>
                  {invitation.registered ? null : (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={invitationText.copyLabel(invitation.email)}
                      onClick={() => void copyInvitation(invitation.email)}
                    >
                      <ClipboardCopy aria-hidden />
                      {invitationText.copy}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={text.revokeLabel(invitation.email)}
                    onClick={() => void revoke(invitation.email)}
                  >
                    <Trash2 aria-hidden />
                    {text.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </Card>
  );
}
