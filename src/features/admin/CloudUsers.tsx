// Usuarios con la cuenta de la nube conectada (pantalla 28, Fase H, D-108). Lista las cuentas reales de
// Supabase con su rol y su plan, y cambia el rol con set_user_role. Las reglas de quién puede cambiar a
// quién las aplica el servidor. Aquí solo se ofrecen las opciones que engines/roles permite, para que
// el admin no vea botones que el servidor va a rechazar. Desde B9 también las invitaciones del registro,
// cómo nos conocieron en conteos, liberar el dispositivo de una cuenta (H17) y, solo para el dueño,
// restablecer el segundo factor de alguien del equipo. Desde 64rem las cuentas van en una tabla con sus
// acciones por fila y en el teléfono en una lista compacta (H15 de la revisión de diseño de B2). Desde
// B11 cada médico lleva su clave corta para las columnas Autor y Revisor del Google Sheet.
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
import { readBankTeam } from '@/data/cloud/bankAdmin';
import { needsMfaRole, resetUserMfa } from '@/data/cloud/mfa';
import type { Role } from '@/data/schemas/common';
import { assignableRoles } from '@/engines/roles';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';
import { SelectField, TextField } from '@/ui/components/field';
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/hooks/use-media-query';
import { LoadingState } from '@/ui/states/states';
import { InvitationsCard } from './InvitationsCard';
import { PhysicianCodeForm } from './PhysicianCodeForm';
import { useBankAdminQuery } from './useBankAdminQuery';
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
  // Las claves del Sheet de los médicos (B1 de la revisión). Si no se pueden leer, el formulario sigue
  const team = useBankAdminQuery((cloud, onForbidden) => readBankTeam(cloud, onForbidden), 'team');
  const codes =
    team.state.status === 'ready'
      ? new Map(team.state.value.codes.map((entry) => [entry.userId, entry.code] as const))
      : null;

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
      description={adminText.descriptions.adminUsers}
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
            <UserResults
              users={state.users}
              callerRole={caller?.role ?? 'student'}
              callerId={caller?.authId ?? null}
              onRole={changeRole}
              onReleaseDevice={releaseDevice}
              onResetMfa={resetMfa}
              codes={codes}
            />
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

/** La clave de un médico, null si no tiene y undefined mientras no se leen */
const codeOf = (codes: ReadonlyMap<string, string> | null, userId: string) =>
  codes === null ? undefined : (codes.get(userId) ?? null);

interface RowHandlers {
  callerRole: Role;
  /** La clave del Sheet de cada médico, por id de cuenta. null mientras no se lee */
  codes: ReadonlyMap<string, string> | null;
  onRole: (user: CloudUser, next: Role) => Promise<void>;
  onReleaseDevice: (user: CloudUser) => Promise<void>;
  onResetMfa: (user: CloudUser) => Promise<void>;
}

/** Tabla desde 64rem y lista en el teléfono, con las mismas acciones por cuenta */
function UserResults({
  users,
  callerId,
  ...handlers
}: RowHandlers & { users: CloudUser[]; callerId: string | null }) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const columns = t.accounts.admin.users;
  if (!desktop) {
    return (
      <ul
        aria-label={columns.caption}
        className="flex flex-col divide-y divide-line border-y border-line"
      >
        {users.map((user) => (
          <li key={user.id}>
            <UserItem user={user} isSelf={user.id === callerId} {...handlers} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">{columns.caption}</caption>
        <thead>
          <tr className="border-b border-line-strong text-xs text-fg-muted">
            <th scope="col" className="w-[30%] py-2 pr-3 font-semibold">
              {columns.account}
            </th>
            <th scope="col" className="w-[17%] py-2 pr-3 font-semibold">
              {columns.role}
            </th>
            <th scope="col" className="w-[13%] py-2 pr-3 font-semibold">
              {columns.plan}
            </th>
            <th scope="col" className="w-[12%] py-2 pr-3 font-semibold">
              {columns.joined}
            </th>
            <th scope="col" className="w-[28%] py-2 font-semibold">
              {columns.actions}
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} isSelf={user.id === callerId} {...handlers} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RowProps extends RowHandlers {
  user: CloudUser;
  isSelf: boolean;
}

const ROLE_ICON_CLASS = 'size-4 shrink-0 text-fg-muted';
const joinedOn = (user: CloudUser) => new Date(user.createdAt).toLocaleDateString('es-MX');
const planNameOf = (user: CloudUser) =>
  t.billing.plans[user.plan as keyof typeof t.billing.plans] as string | undefined;

/** Alias, corona del dueño y la marca de la cuenta propia */
function AliasLine({ user, isSelf }: { user: CloudUser; isSelf: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-1 font-semibold text-fg">
      <span className="break-words">{user.alias}</span>
      {user.role === 'owner' ? <Crown aria-hidden className="size-4 text-fg-muted" /> : null}
      {isSelf ? <span className="font-normal text-fg-muted">({t.party.you})</span> : null}
    </p>
  );
}

/** El selector del rol si hay algo que ofrecer, o el rol en texto */
function RoleControl({
  user,
  isSelf,
  callerRole,
  onRole,
  labelHidden,
}: Pick<RowProps, 'user' | 'isSelf' | 'callerRole' | 'onRole'> & { labelHidden: boolean }) {
  const options = assignableRoles(callerRole, user.role, isSelf);
  if (options.length > 1) {
    return (
      <SelectField
        label={t.admin.cloud.roleOf(user.alias)}
        labelHidden={labelHidden}
        value={user.role}
        options={options.map((role) => ({ value: role, label: t.roles.names[role] }))}
        onChange={(event) => {
          void onRole(user, event.target.value as Role);
        }}
      />
    );
  }
  const Icon = ROLE_ICONS[user.role];
  return (
    <span className="inline-flex items-center gap-1.5 text-fg">
      <Icon aria-hidden className={ROLE_ICON_CLASS} />
      {t.roles.names[user.role]}
    </span>
  );
}

/**
 * Liberar el dispositivo y, para el dueño, restablecer el segundo factor de alguien del equipo. Cada
 * acción cierra sesiones, así que pide confirmarla en el mismo lugar. Nadie las usa consigo mismo
 */
function AccountActions({
  user,
  isSelf,
  callerRole,
  onReleaseDevice,
  onResetMfa,
}: Omit<RowProps, 'onRole'>) {
  const access = t.accounts.admin;
  const [confirming, setConfirming] = useState<'device' | 'mfa' | null>(null);
  const [busy, setBusy] = useState(false);
  if (isSelf) return null;
  const run = async (action: (user: CloudUser) => Promise<void>) => {
    setBusy(true);
    try {
      await action(user);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };
  const canResetMfa = callerRole === 'owner' && needsMfaRole(user.role);
  if (confirming) {
    return (
      <div
        role="group"
        aria-label={
          confirming === 'device'
            ? access.device.releaseLabel(user.alias)
            : access.mfaReset.label(user.alias)
        }
        className="flex flex-col gap-2 rounded-md bg-muted p-3"
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
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
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
    </div>
  );
}

/** Una fila de la tabla. La cuenta es el encabezado de su fila */
function UserRow(props: RowProps) {
  const { user, isSelf } = props;
  return (
    <tr className="border-b border-line align-top">
      <th scope="row" className="py-3 pr-3 font-normal">
        <div className="flex items-center gap-3">
          <Avatar name={user.alias} className="size-9 shrink-0" />
          <div className="min-w-0">
            <AliasLine user={user} isSelf={isSelf} />
            <p className="truncate text-fg-muted">{user.email ?? t.admin.noEmail}</p>
          </div>
        </div>
      </th>
      <td className="py-3 pr-3">
        <RoleControl {...props} labelHidden />
      </td>
      <td className="py-3 pr-3">{planNameOf(user) ?? t.accounts.admin.users.noPlan}</td>
      <td className="py-3 pr-3 tabular-nums">{joinedOn(user)}</td>
      <td className="py-3">
        <div className="flex flex-col gap-2">
          <AccountActions {...props} />
          {user.role === 'physician' ? (
            <PhysicianCodeForm
              key={codeOf(props.codes, user.id) ?? ''}
              userId={user.id}
              alias={user.alias}
              current={codeOf(props.codes, user.id)}
            />
          ) : null}
        </div>
      </td>
    </tr>
  );
}

/** Una cuenta en la lista del teléfono, con el rol debajo del nombre */
function UserItem(props: RowProps) {
  const { user, isSelf } = props;
  const planName = planNameOf(user);
  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center gap-3">
        <Avatar name={user.alias} className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <AliasLine user={user} isSelf={isSelf} />
          <p className="truncate text-sm text-fg-muted">{user.email ?? t.admin.noEmail}</p>
          <p className="text-xs text-fg-muted">
            {planName ? t.admin.cloud.plan(planName) : null}
            {planName ? '. ' : null}
            {t.admin.cloud.joined(joinedOn(user))}
          </p>
        </div>
      </div>
      <RoleControl {...props} labelHidden={false} />
      <AccountActions {...props} />
      {user.role === 'physician' ? (
        <PhysicianCodeForm
          key={codeOf(props.codes, user.id) ?? ''}
          userId={user.id}
          alias={user.alias}
          current={codeOf(props.codes, user.id)}
        />
      ) : null}
    </div>
  );
}
