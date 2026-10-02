// Usuarios (pantalla 28, D-070). El admin y el dueño ven las cuentas, cambian roles según las
// reglas de engines/roles y asignan subespecialidades del banco a cada médico. En el prototipo
// trabaja sobre los perfiles de este navegador. Con Supabase usa set_user_role (D-069).
import { ClipboardCheck, Crown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Account, User } from '@/data/schemas/people';
import { ensureDemoBank } from '@/data/usecases/bank';
import { setLocalUserRole, setPhysicianTopics } from '@/data/usecases/admin';
import { assignableRoles, type AppRole } from '@/engines/roles';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';

export function AdminUsersScreen() {
  const api = useDataApi();
  const callerRole = usePreferences((state) => state.role);
  const session = useSession();
  const callerId = session.status === 'ready' ? session.user.id : null;
  // El banco se guarda antes de consultar, fuera de la consulta reactiva
  const [bankReady, setBankReady] = useState(false);
  useEffect(() => {
    void ensureDemoBank(api).then(() => {
      setBankReady(true);
    });
  }, [api]);
  const data = useLiveData(async () => {
    const [users, accounts, assignments, questions] = await Promise.all([
      api.repos.users.list(),
      api.repos.accounts.list(),
      api.repos.reviewAssignments.list(),
      api.repos.questions.listLatest(),
    ]);
    return { users, accounts, assignments, questions };
  }, [api.repos, bankReady]);
  const [message, setMessage] = useState('');

  const header = (
    <ScreenHeader
      title={t.screens.adminUsers.title}
      description={t.screens.adminUsers.description}
    />
  );
  // Espera a que el banco termine de guardarse, así las asignaciones lo ven completo
  if (data === undefined || !bankReady) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const accountOf = new Map(data.accounts.map((account) => [account.userId, account]));
  const topicOfQuestion = new Map(data.questions.map((q) => [q.questionId, q.topic]));
  // En la demo hay cientos de alumnos simulados. Se muestran primero los que tienen rol
  const users = [...data.users]
    .sort((a, b) => rank(b.role) - rank(a.role) || a.alias.localeCompare(b.alias, 'es'))
    .slice(0, 60);

  return (
    <>
      {header}
      <p className="max-w-reading text-sm text-fg-muted">{t.admin.notice}</p>
      {message ? (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        {users.map((user) => (
          <UserRow
            key={user.id}
            user={user}
            account={accountOf.get(user.id) ?? null}
            callerRole={callerRole}
            isSelf={user.id === callerId}
            assignedTopics={
              new Set(
                data.assignments
                  .filter((assignment) => assignment.physicianId === user.id)
                  .map((assignment) => topicOfQuestion.get(assignment.questionId))
                  .filter((topic): topic is string => topic !== undefined),
              )
            }
            assignedCount={
              data.assignments.filter((assignment) => assignment.physicianId === user.id).length
            }
            onRole={async (next) => {
              const result = await setLocalUserRole(
                api,
                { id: callerId, role: callerRole },
                user,
                next,
              );
              setMessage(
                result.ok
                  ? t.admin.roleChanged(user.alias, t.roles.names[next])
                  : t.admin.denied[result.reason],
              );
            }}
            onAssign={async (topics) => {
              const result = await setPhysicianTopics(api, user.id, topics, callerId);
              setMessage(t.admin.assigned(user.alias, result.added, result.removed));
            }}
          />
        ))}
      </div>
    </>
  );
}

const rank = (role: AppRole) => ({ owner: 3, admin: 2, physician: 1, student: 0 })[role];

function UserRow({
  user,
  account,
  callerRole,
  isSelf,
  assignedTopics,
  assignedCount,
  onRole,
  onAssign,
}: {
  user: User;
  account: Account | null;
  callerRole: AppRole;
  isSelf: boolean;
  assignedTopics: Set<string>;
  assignedCount: number;
  onRole: (next: AppRole) => Promise<void>;
  onAssign: (topics: Set<string>) => Promise<void>;
}) {
  const [assigning, setAssigning] = useState(false);
  const [topics, setTopics] = useState<Set<string>>(assignedTopics);
  const options = assignableRoles(callerRole, user.role, isSelf);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={user.alias} seed={user.id} avatar={account?.avatar} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-bold">
            {user.alias}
            {user.role === 'owner' ? <Crown aria-hidden className="size-4 text-accent" /> : null}
            {isSelf ? (
              <span className="text-sm font-normal text-fg-muted">({t.party.you})</span>
            ) : null}
          </p>
          <p className="truncate text-sm text-fg-muted">{account?.email ?? t.admin.noEmail}</p>
        </div>
        {options.length > 1 ? (
          <SelectField
            label={t.admin.role}
            className="w-44"
            value={user.role}
            options={options.map((role) => ({ value: role, label: t.roles.names[role] }))}
            onChange={(event) => {
              void onRole(event.target.value as AppRole);
            }}
          />
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
            {t.roles.names[user.role]}
          </span>
        )}
      </div>
      {user.role === 'physician' ? (
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{t.admin.assignedCount(assignedCount)}</p>
            <Button
              size="sm"
              variant="secondary"
              aria-expanded={assigning}
              onClick={() => {
                setAssigning((value) => !value);
              }}
            >
              <ClipboardCheck aria-hidden />
              {t.admin.assign}
            </Button>
          </div>
          {assigning ? (
            <>
              <CardHeader className="mb-0">
                <CardTitle className="text-base">{t.admin.assignTitle(user.alias)}</CardTitle>
                <CardDescription>{t.admin.assignHint}</CardDescription>
              </CardHeader>
              <BranchTopicPicker selected={topics} onChange={setTopics} />
              <Button
                className="self-start"
                onClick={() => {
                  void onAssign(topics).then(() => {
                    setAssigning(false);
                  });
                }}
              >
                {t.admin.saveAssignment}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
