// Usuarios con la cuenta de la nube conectada (pantalla 28, Fase H, D-108). Lista las cuentas reales de
// Supabase con su rol y su plan, y cambia el rol con set_user_role. Las reglas de quién puede cambiar a
// quién las aplica el servidor. Aquí solo se ofrecen las opciones que engines/roles permite, para que
// el admin no vea botones que el servidor va a rechazar. Desde B9 también las invitaciones del registro,
// cómo nos conocieron en conteos, liberar el dispositivo de una cuenta (H17) y, solo para el dueño,
// restablecer el segundo factor de alguien del equipo.
import {
  Crown,
  GraduationCap,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { loadCloud } from '@/data/cloud/client';
import {
  USERS_PAGE_SIZE,
  listCloudUsers,
  releaseUserDevice,
  setCloudUserRole,
  type CloudUser,
  type UsersFailure,
} from '@/data/cloud/adminUsers';
import { needsMfaRole, resetUserMfa } from '@/data/cloud/mfa';
import type { Role } from '@/data/schemas/common';
import { assignableRoles } from '@/engines/roles';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import { InvitationsCard } from './InvitationsCard';
import { SignupSourcesCard } from './SignupSourcesCard';

type State =
  | { status: 'loading' }
  | { status: 'failed'; reason: UsersFailure }
  | { status: 'ready'; users: CloudUser[]; total: number };

const ROLE_ICONS = {
  student: GraduationCap,
  physician: Stethoscope,
  admin: ShieldCheck,
  owner: Crown,
} as const;

export function CloudUsers() {
  const text = t.admin.cloud;
  const cloudState = useCloud((store) => store.state);
  const caller = cloudState.status === 'linked' ? cloudState.identity : null;
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [page, setPage] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    let stopped = false;
    void loadCloud()
      .then((cloud) =>
        cloud
          ? listCloudUsers(cloud, { query, role: role === '' ? null : role, page })
          : ({ ok: false, reason: 'network' } as const),
      )
      .then((result) => {
        if (stopped) return;
        setState(
          result.ok
            ? { status: 'ready', users: result.users, total: result.total }
            : { status: 'failed', reason: result.reason },
        );
      });
    return () => {
      stopped = true;
    };
  }, [query, role, page]);

  const header = (
    <ScreenHeader
      title={t.screens.adminUsers.title}
      description={t.screens.adminUsers.description}
    />
  );

  const search = (event: SyntheticEvent) => {
    event.preventDefault();
    setState({ status: 'loading' });
    setPage(0);
    setQuery(draft);
  };

  const changeRole = async (user: CloudUser, next: Role) => {
    const cloud = await loadCloud();
    if (!cloud) {
      setMessage(text.roleErrors.network);
      return;
    }
    const result = await setCloudUserRole(cloud, user.id, next);
    if (!result.ok) {
      setMessage(
        result.reason === 'no_session' || result.reason === 'network' || result.reason === 'unknown'
          ? text.roleErrors[result.reason]
          : t.admin.denied[result.reason],
      );
      return;
    }
    setMessage(t.admin.roleChanged(user.alias, t.roles.names[next]));
    setState((current) =>
      current.status === 'ready'
        ? {
            ...current,
            users: current.users.map((item) =>
              item.id === user.id ? { ...item, role: next } : item,
            ),
          }
        : current,
    );
  };

  // Libera el dispositivo de una cuenta, por ejemplo de quien llegó al límite de cambios (H17)
  const releaseDevice = async (user: CloudUser) => {
    const cloud = await loadCloud();
    const result = cloud
      ? await releaseUserDevice(cloud, user.id)
      : ({ ok: false, reason: 'network' } as const);
    const device = t.accounts.admin.device;
    setMessage(
      result.ok
        ? result.hadDevice
          ? device.released(user.alias)
          : device.noDevice(user.alias)
        : device.failed,
    );
  };

  // Solo el dueño, y el servidor lo vuelve a revisar con su propio segundo factor (B9)
  const resetMfa = async (user: CloudUser) => {
    const cloud = await loadCloud();
    const result = cloud
      ? await resetUserMfa(cloud, user.id)
      : ({ ok: false, reason: 'failed' } as const);
    const reset = t.accounts.admin.mfaReset;
    setMessage(result.ok ? reset.done(user.alias) : reset.errors[result.reason]);
  };

  const pages =
    state.status === 'ready' ? Math.max(1, Math.ceil(state.total / USERS_PAGE_SIZE)) : 1;

  return (
    <>
      {header}
      <p className="text-sm text-fg-muted">{text.notice}</p>
      <InvitationsCard />
      <form className="flex flex-wrap items-end gap-3" onSubmit={search} role="search">
        <TextField
          label={text.search}
          className="min-w-56 flex-1"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <SelectField
          label={text.roleFilter}
          className="w-44"
          value={role}
          options={[
            { value: '', label: text.allRoles },
            ...(['student', 'physician', 'admin', 'owner'] as const).map((value) => ({
              value,
              label: t.roles.names[value],
            })),
          ]}
          onChange={(event) => {
            setState({ status: 'loading' });
            setPage(0);
            setRole(event.target.value as Role | '');
          }}
        />
        <Button type="submit" variant="secondary">
          {text.searchAction}
        </Button>
      </form>
      {message ? (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {message}
        </p>
      ) : null}
      {state.status === 'loading' ? <LoadingState label={text.loading} /> : null}
      {state.status === 'failed' ? (
        <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {text.errors[state.reason]}
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <>
          <p className="text-sm text-fg-muted">{text.count(state.total)}</p>
          {state.users.length === 0 ? (
            <p className="text-sm">{text.empty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {state.users.map((user) => (
                <li key={user.id}>
                  <UserLine
                    user={user}
                    callerRole={caller?.role ?? 'student'}
                    isSelf={user.id === caller?.authId}
                    onRole={(next) => changeRole(user, next)}
                    onReleaseDevice={() => releaseDevice(user)}
                    onResetMfa={() => resetMfa(user)}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 0}
              onClick={() => {
                setState({ status: 'loading' });
                setPage((value) => Math.max(0, value - 1));
              }}
            >
              {text.previous}
            </Button>
            <span className="text-sm text-fg-muted">{text.pageOf(page + 1, pages)}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => {
                setState({ status: 'loading' });
                setPage((value) => value + 1);
              }}
            >
              {text.next}
            </Button>
          </div>
          <p className="text-sm text-fg-muted">{text.assignmentsNote}</p>
        </>
      ) : null}
      <SignupSourcesCard />
    </>
  );
}

function UserLine({
  user,
  callerRole,
  isSelf,
  onRole,
  onReleaseDevice,
  onResetMfa,
}: {
  user: CloudUser;
  callerRole: Role;
  isSelf: boolean;
  onRole: (next: Role) => Promise<void>;
  onReleaseDevice: () => Promise<void>;
  onResetMfa: () => Promise<void>;
}) {
  const access = t.accounts.admin;
  // Cada acción que cierra sesiones pide confirmarla en la misma fila
  const [confirming, setConfirming] = useState<'device' | 'mfa' | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };
  const canResetMfa = callerRole === 'owner' && !isSelf && needsMfaRole(user.role);
  const options = assignableRoles(callerRole, user.role, isSelf);
  const Icon = ROLE_ICONS[user.role];
  const planName = t.billing.plans[user.plan as keyof typeof t.billing.plans] as string | undefined;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <Avatar name={user.alias} className="size-11" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 font-bold">
          {user.alias}
          {user.role === 'owner' ? <Crown aria-hidden className="size-4 text-accent" /> : null}
          {isSelf ? (
            <span className="text-sm font-normal text-fg-muted">({t.party.you})</span>
          ) : null}
        </p>
        <p className="truncate text-sm text-fg-muted">{user.email ?? t.admin.noEmail}</p>
        <p className="text-xs text-fg-muted">
          {planName ? t.admin.cloud.plan(planName) : null}
          {planName ? '. ' : null}
          {t.admin.cloud.joined(new Date(user.createdAt).toLocaleDateString('es-MX'))}
        </p>
      </div>
      {options.length > 1 ? (
        <SelectField
          label={t.admin.cloud.roleOf(user.alias)}
          className="w-44"
          value={user.role}
          options={options.map((role) => ({ value: role, label: t.roles.names[role] }))}
          onChange={(event) => {
            void onRole(event.target.value as Role);
          }}
        />
      ) : (
        <Badge variant="neutral">
          <Icon aria-hidden className="size-3.5" />
          {t.roles.names[user.role]}
        </Badge>
      )}
      {isSelf ? null : (
        <div className="flex w-full flex-wrap gap-2">
          {confirming ? (
            <div
              role="group"
              aria-label={
                confirming === 'device'
                  ? access.device.releaseLabel(user.alias)
                  : access.mfaReset.label(user.alias)
              }
              className="flex w-full flex-col gap-2 rounded-md bg-muted p-3"
            >
              <p className="text-sm">
                {confirming === 'device'
                  ? access.device.confirm(user.alias)
                  : access.mfaReset.confirm(user.alias)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void run(confirming === 'device' ? onReleaseDevice : onResetMfa)}
                >
                  {access.confirm}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(null);
                  }}
                >
                  {access.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                aria-label={access.device.releaseLabel(user.alias)}
                onClick={() => {
                  setConfirming('device');
                }}
              >
                <MonitorSmartphone aria-hidden />
                {access.device.release}
              </Button>
              {canResetMfa ? (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={access.mfaReset.label(user.alias)}
                  onClick={() => {
                    setConfirming('mfa');
                  }}
                >
                  <KeyRound aria-hidden />
                  {access.mfaReset.action}
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
