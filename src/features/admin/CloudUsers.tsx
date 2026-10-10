// Usuarios con la cuenta de la nube conectada (pantalla 28, Fase H, D-108). Lista las cuentas reales de
// Supabase con su rol y su plan, y cambia el rol con set_user_role. Las reglas de quién puede cambiar a
// quién las aplica el servidor. Aquí solo se ofrecen las opciones que engines/roles permite, para que
// el admin no vea botones que el servidor va a rechazar.
import { Crown, GraduationCap, ShieldCheck, Stethoscope } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { loadCloud } from '@/data/cloud/client';
import {
  USERS_PAGE_SIZE,
  listCloudUsers,
  setCloudUserRole,
  type CloudUser,
  type UsersFailure,
} from '@/data/cloud/adminUsers';
import type { Role } from '@/data/schemas/common';
import { assignableRoles } from '@/engines/roles';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';

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

  const pages =
    state.status === 'ready' ? Math.max(1, Math.ceil(state.total / USERS_PAGE_SIZE)) : 1;

  return (
    <>
      {header}
      <p className="text-sm text-fg-muted">{text.notice}</p>
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
    </>
  );
}

function UserLine({
  user,
  callerRole,
  isSelf,
  onRole,
}: {
  user: CloudUser;
  callerRole: Role;
  isSelf: boolean;
  onRole: (next: Role) => Promise<void>;
}) {
  const options = assignableRoles(callerRole, user.role, isSelf);
  const Icon = ROLE_ICONS[user.role];
  const planName = t.billing.plans[user.plan as keyof typeof t.billing.plans] as string | undefined;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <Avatar name={user.alias} seed={user.id} className="size-11" />
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
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-semibold">
          <Icon aria-hidden className="size-4" />
          {t.roles.names[user.role]}
        </span>
      )}
    </Card>
  );
}
