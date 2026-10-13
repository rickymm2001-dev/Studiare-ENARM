// Piezas de Party que comparten la demostración y la nube (9.6, B7 del plan del cambio). Crear un
// grupo, entrar con un código, crear un reto, la tabla de la semana y la lista de miembros. Quien las
// usa decide qué pasa al enviar y qué mensaje se muestra.
import { Plus, Users } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import type { Ranked } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField, SelectField, TextField } from '@/ui/components/field';
import type { ChallengeMetric } from './stats';

/** Lo que mide un reto que crea el alumno. accuracy era de los duelos de antes */
export type CollectiveMetric = Exclude<ChallengeMetric, 'accuracy'>;

export function CreateGroupCard({
  hint,
  simulatedOption,
  onCreate,
}: {
  /** La frase de arriba. Solo cuando todavía no está en ningún grupo */
  hint: string | null;
  /** La demostración ofrece agregar compañeros simulados */
  simulatedOption: boolean;
  /** Crea el grupo. Devuelve null si se creó o el mensaje que hay que mostrar */
  onCreate: (name: string, withSimulatedFriends: boolean) => Promise<string | null>;
}) {
  const [name, setName] = useState('');
  const [withFriends, setWithFriends] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const failure = await onCreate(name, simulatedOption && withFriends);
      if (failure === null) setName('');
      else setMessage(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card aria-labelledby="crear-grupo">
      <CardHeader>
        <CardTitle id="crear-grupo">{t.party.createTitle}</CardTitle>
        {hint ? <CardDescription>{hint}</CardDescription> : null}
      </CardHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <TextField
          label={t.party.groupName}
          value={name}
          maxLength={60}
          required
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {simulatedOption ? (
          <CheckboxField
            label={t.party.withFriends}
            checked={withFriends}
            onChange={(event) => {
              setWithFriends(event.target.checked);
            }}
          />
        ) : null}
        <Button type="submit" className="self-start" disabled={busy}>
          <Plus aria-hidden />
          {t.party.create}
        </Button>
        <p role="status" className="min-h-5 text-sm">
          {message}
        </p>
      </form>
    </Card>
  );
}

export function JoinGroupCard({
  hint,
  initialCode,
  onJoin,
}: {
  hint: string;
  /** El código que trajo el enlace de invitación, ya escrito */
  initialCode: string | null;
  /** Entra al grupo. Devuelve el mensaje que hay que mostrar */
  onJoin: (code: string) => Promise<string>;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      setMessage(await onJoin(code));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card aria-labelledby="unirse-grupo">
      <CardHeader>
        <CardTitle id="unirse-grupo">{t.party.joinTitle}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <TextField
          label={t.party.code}
          value={code}
          maxLength={6}
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setMessage('');
          }}
        />
        <Button type="submit" variant="secondary" className="self-start" disabled={busy}>
          <Users aria-hidden />
          {t.party.join}
        </Button>
        {message ? (
          <p role="status" className="text-sm">
            {message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

export function NewChallengeForm({
  onCreate,
}: {
  /** Crea el reto. Devuelve null si se creó o el mensaje que hay que mostrar */
  onCreate: (input: {
    title: string;
    metric: CollectiveMetric;
    target: number;
  }) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<CollectiveMetric>('cards');
  const [target, setTarget] = useState('500');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="mt-3 self-start"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        {t.party.newChallenge}
      </Button>
    );
  }
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    const value = Number(target);
    if (!title.trim() || !(value > 0) || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const failure = await onCreate({ title, metric, target: Math.round(value) });
      if (failure === null) {
        setOpen(false);
        setTitle('');
      } else {
        setMessage(failure);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="mt-3 grid gap-3 rounded-md border border-line p-3 sm:grid-cols-3"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <TextField
        label={t.party.challengeTitle}
        value={title}
        maxLength={80}
        required
        onChange={(event) => {
          setTitle(event.target.value);
        }}
      />
      <SelectField
        label={t.party.metric}
        value={metric}
        options={(['cards', 'questions', 'xp'] as const).map((value) => ({
          value,
          label: t.party.metrics[value],
        }))}
        onChange={(event) => {
          setMetric(event.target.value as CollectiveMetric);
        }}
      />
      <TextField
        label={t.party.target}
        type="number"
        min={1}
        value={target}
        onChange={(event) => {
          setTarget(event.target.value);
        }}
      />
      <div className="flex gap-2 sm:col-span-3">
        <Button type="submit" size="sm" disabled={busy}>
          {t.party.createChallenge}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setMessage(null);
          }}
        >
          {t.party.cancel}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="text-sm text-danger sm:col-span-3">
          {message}
        </p>
      ) : null}
    </form>
  );
}

/** Un miembro como se muestra en la tabla y en la lista. key es estable dentro del grupo */
export interface MemberEntry {
  key: string;
  alias: string;
  isSelf: boolean;
  isSimulated: boolean;
}

/** La tabla de la semana, con lugar, alias y XP. Es lo único que se comparte de cada miembro */
export function LeaderboardTable({
  rows,
}: {
  rows: readonly Ranked<MemberEntry & { weeklyXp: number }>[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t.party.leaderboard}</caption>
        <thead>
          <tr className="text-left text-fg-muted">
            <th scope="col" className="py-1 pr-2">
              #
            </th>
            <th scope="col" className="py-1 pr-2">
              {t.party.alias}
            </th>
            <th scope="col" className="py-1 text-right">
              {t.party.weeklyXp}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.isSelf ? 'bg-primary-soft font-semibold' : ''}>
              <td className="py-1 pr-2">{row.rank}</td>
              <td className="py-1 pr-2">
                {row.alias}
                {row.isSelf ? ` (${t.party.you})` : ''}
                {row.isSimulated ? (
                  <span className="ml-1 text-xs text-fg-muted">· {t.party.simulated}</span>
                ) : null}
              </td>
              <td className="py-1 text-right tabular-nums">
                {row.weeklyXp.toLocaleString('es-MX')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Los miembros sin lugar ni XP, para el modo enfoque */
export function MemberList({ members }: { members: readonly MemberEntry[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t.partyCloud.membersTitle}>
      {members.map((member) => (
        <li key={member.key}>
          {member.alias}
          {member.isSelf ? ` (${t.party.you})` : ''}
          {member.isSimulated ? (
            <span className="ml-1 text-xs text-fg-muted">· {t.party.simulated}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
