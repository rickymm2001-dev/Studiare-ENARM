// Retar a un compañero del grupo a un duelo (9.6). En el prototipo solo se puede retar a los
// compañeros simulados, porque sin servidor no hay otras personas que jueguen su parte.
import { Swords } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useDataApi } from '@/data/context';
import type { Group, Membership } from '@/data/schemas/activity';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SelectField } from '@/ui/components/field';
import { challengeToDuel } from './duelActions';

export function NewDuelForm({
  group,
  members,
  selfId,
}: {
  group: Group;
  members: readonly Membership[];
  selfId: string;
}) {
  const text = t.party.duel;
  const api = useDataApi();
  const rivals = members.filter((member) => member.isSimulated && member.id !== selfId);
  const [open, setOpen] = useState(false);
  const [rivalId, setRivalId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (rivals.length === 0) return <p className="mt-3 text-sm text-fg-muted">{text.noRivals}</p>;
  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="mt-3 ml-2"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Swords aria-hidden />
        {text.newButton}
      </Button>
    );
  }

  const chosen = rivals.find((member) => member.id === rivalId) ?? rivals[0];
  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!chosen || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const duel = await challengeToDuel(api, group, chosen);
      if (duel) {
        setOpen(false);
      } else {
        setMessage(text.noQuestions);
      }
    } catch {
      setMessage(text.createFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-md border border-line p-3"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <SelectField
        label={text.rival}
        value={chosen?.id ?? ''}
        options={rivals.map((member) => ({ value: member.id, label: member.alias }))}
        onChange={(event) => {
          setRivalId(event.target.value);
        }}
      />
      <p className="text-sm text-fg-muted">{text.rules(20)}</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {text.create}
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
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </form>
  );
}
