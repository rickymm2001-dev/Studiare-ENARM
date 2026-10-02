// Tus datos (D-068). Foto o avatar, y los datos opcionales de la cuenta. A un perfil viejo sin cuenta
// le pide su correo para crearla.
import { Save } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import { AccountSchema, type Account } from '@/data/schemas/people';
import {
  EMPTY_DETAILS,
  findAccountByEmail,
  normalizeEmail,
  updateAccount,
  type AccountDetails,
} from '@/data/usecases/account';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import { AccountDetailsFields } from './AccountDetailsFields';
import { AvatarPicker } from './AvatarPicker';

export function AccountDataCard({
  session,
  account,
}: {
  session: ReadySession;
  account: Account | null;
}) {
  const api = useDataApi();
  const { user } = session;
  const [details, setDetails] = useState<AccountDetails>(() =>
    account
      ? {
          birthYear: account.birthYear,
          sex: account.sex,
          state: account.state,
          situation: account.situation,
          attempt: account.attempt,
          targetSpecialty: account.targetSpecialty,
          avatar: account.avatar,
        }
      : EMPTY_DETAILS,
  );
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  const save = async () => {
    if (account) {
      await updateAccount(api, account, details);
      setStatus(t.account.saved);
      return;
    }
    const clean = normalizeEmail(email);
    if (!AccountSchema.shape.email.safeParse(clean).success) {
      setStatus(t.account.emailError);
      return;
    }
    if (await findAccountByEmail(api, clean)) {
      setStatus(t.account.emailTaken);
      return;
    }
    await api.repos.accounts.put({
      userId: user.id,
      email: clean,
      ...details,
      updatedAt: new Date().toISOString(),
    });
    setStatus(t.account.saved);
  };

  return (
    <Card aria-labelledby="datos-titulo" className="lg:col-span-2">
      <CardHeader>
        <CardTitle id="datos-titulo">{t.account.detailsTitle}</CardTitle>
        <CardDescription>
          {account ? `${account.email}. ${t.account.detailsHint}` : t.account.noAccount}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-5">
        {account ? null : (
          <TextField
            label={t.account.email}
            hint={t.account.emailHint}
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => {
              setEmail(event.target.value);
              setStatus('');
            }}
          />
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">{t.account.avatarTitle}</legend>
          <AvatarPicker
            name={user.alias}
            seed={user.id}
            value={details.avatar}
            onChange={(avatar) => {
              setDetails({ ...details, avatar });
              setStatus('');
            }}
          />
        </fieldset>
        <AccountDetailsFields
          value={details}
          onChange={(next) => {
            setDetails(next);
            setStatus('');
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              void save();
            }}
          >
            <Save aria-hidden />
            {account ? t.account.save : t.account.addEmail}
          </Button>
          <p role="status" className="text-sm text-fg-muted">
            {status}
          </p>
        </div>
      </div>
    </Card>
  );
}
