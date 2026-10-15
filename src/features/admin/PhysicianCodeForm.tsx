// Clave corta de un médico para las columnas Autor y Revisor del Google Sheet (B11, 3.7 y 4.3 del plan
// de B11). Va en Usuarios junto a cada médico. La guarda admin_set_physician_code, que responde taken si
// ya es de otro médico y not_physician si la cuenta no es de médico. Sin correos en el Sheet.
import { useId, useState, type SyntheticEvent } from 'react';
import { PHYSICIAN_CODE, setPhysicianCode } from '@/data/cloud/bankAdmin';
import { bankAdminText } from '@/i18n/bankAdmin';
import { Button } from '@/ui/components/button';
import { TextField } from '@/ui/components/field';
import { askSecondFactor } from '../physician/secondFactor';
import { requireCloud } from './useBankAdminQuery';

export function PhysicianCodeForm({
  userId,
  alias,
  current,
}: {
  userId: string;
  alias: string;
  /** La clave que ya tiene, de admin_bank_team. null si no tiene y undefined si no se pudo leer */
  current?: string | null;
}) {
  const text = bankAdminText.users;
  const id = useId();
  const [code, setCode] = useState(current ?? '');
  const [saved, setSaved] = useState(current);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = PHYSICIAN_CODE.test(code);

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid) {
      setMessage(text.invalid);
      return;
    }
    setBusy(true);
    try {
      const result = await setPhysicianCode(await requireCloud(), userId, code, askSecondFactor);
      if (result === 'ok') setSaved(code);
      setMessage(
        result === 'ok'
          ? text.saved(alias, code)
          : result === 'taken'
            ? text.taken
            : text.notPhysician,
      );
    } catch {
      setMessage(text.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-labelledby={`${id}-titulo`}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        void save(event);
      }}
      noValidate
    >
      <span id={`${id}-titulo`} className="sr-only">
        {`${text.code} ${alias}`}
      </span>
      <TextField
        label={text.code}
        hint={text.codeHint}
        value={code}
        maxLength={8}
        autoCapitalize="characters"
        onChange={(event) => {
          setMessage('');
          setCode(event.target.value.trim().toUpperCase());
        }}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        {text.save}
      </Button>
      {saved === undefined ? null : (
        <p className="w-full text-sm text-fg-muted">
          {saved === null ? text.noCode : text.current(saved)}
        </p>
      )}
      <p role="status" className="w-full text-sm text-fg-muted">
        {message}
      </p>
    </form>
  );
}
