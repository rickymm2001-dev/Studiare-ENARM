// Tus datos (D-068, B3 del plan del cambio, comentarios 6 y 16). Perfil y cuenta juntos y de solo
// lectura. La especialidad que busca va a la vista, primero, porque la usa la comparación por
// especialidad (B9). La foto va en línea con el alias, sin franja gris (H11). Editar perfil abre todos
// los campos, alias, foto y los datos opcionales de la cuenta, con Guardar y Cancelar, y avisa si sales
// con cambios sin guardar. A un perfil viejo sin cuenta le pide su correo para crearla. El alumno de
// la demostración no tiene cuenta y solo cambia su alias.
import { Pencil, Save } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { pushAccountIfLinked } from '@/app/cloudState';
import { useDataApi } from '@/data/context';
import { AccountSchema, type Account } from '@/data/schemas/people';
import {
  addAccountToProfile,
  EMPTY_DETAILS,
  findAccountByEmail,
  normalizeEmail,
  updateAccount,
  type AccountDetails,
} from '@/data/usecases/account';
import { updateProfile } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import { TargetSpecialtyField } from '../shared/SignupFields';
import { UnsavedChangesGuard } from '../shared/UnsavedChangesGuard';
import { AccountDetailsFields } from './AccountDetailsFields';
import { accountRows, detailsOf, examDateLabel, sameDetails, specialtyName } from './accountView';
import { AvatarPicker } from './AvatarPicker';

interface Draft {
  alias: string;
  /** Solo para un perfil viejo sin cuenta, que la crea con su correo */
  email: string;
  details: AccountDetails;
}

type FieldError = { field: 'alias' | 'email'; text: string } | null;

export function AccountDataCard({
  session,
  account,
}: {
  session: ReadySession;
  account: Account | null;
}) {
  const api = useDataApi();
  const { user } = session;
  const text = t.settingsPage.profile;
  const saved = (): Draft => ({ alias: user.alias, email: '', details: detailsOf(account) });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(saved);
  const [error, setError] = useState<FieldError>(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  // Al salir de editar, el foco vuelve a Editar perfil para no perder el lugar con el teclado
  const returnFocus = useRef(false);
  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    editButton.current?.focus();
  }, [editing]);

  // El alumno de la demostración sin cuenta no tiene dónde guardar foto ni datos (D-076)
  const hasAccountFields = account !== null || !session.isDemo;
  const dirty =
    draft.alias.trim() !== user.alias ||
    draft.email.trim() !== '' ||
    !sameDetails(draft.details, detailsOf(account));

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
    setStatus('');
  };

  const leaveEditing = (message: string) => {
    returnFocus.current = true;
    setEditing(false);
    setError(null);
    setStatus(message);
  };

  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (saving) return;
    const alias = draft.alias.trim();
    if (!alias) {
      setError({ field: 'alias', text: t.onboarding.aliasError });
      return;
    }
    const email = normalizeEmail(draft.email);
    // Sin cuenta, la foto y los datos solo se guardan creándola con un correo
    if (!account && !session.isDemo) {
      if (email === '' && !sameDetails(draft.details, EMPTY_DETAILS)) {
        setError({ field: 'email', text: text.emailNeeded });
        return;
      }
      if (email !== '' && !AccountSchema.shape.email.safeParse(email).success) {
        setError({ field: 'email', text: t.account.emailError });
        return;
      }
    }
    setSaving(true);
    try {
      if (!account && !session.isDemo && email !== '' && (await findAccountByEmail(api, email))) {
        setError({ field: 'email', text: t.account.emailTaken });
        return;
      }
      if (alias !== user.alias) await updateProfile(api, user, { alias });
      if (account) {
        if (!sameDetails(draft.details, detailsOf(account))) {
          await updateAccount(api, account, draft.details);
        }
      } else if (!session.isDemo && email !== '') {
        // La fecha de la elección de foto la pone el caso de uso, solo si eligió foto (B2)
        await addAccountToProfile(api, { userId: user.id, email, details: draft.details });
      }
      void pushAccountIfLinked(api, user.id);
      leaveEditing(text.saved);
    } catch {
      setStatus(text.failed);
    } finally {
      setSaving(false);
    }
  };

  // Lo que se lee del perfil, en dos columnas como los campos del diseño (D-150). El alias y el correo
  // primero, la especialidad a la vista (B9), la fecha del examen, la zona horaria con la que se
  // cuentan sus días de estudio y al final los datos opcionales de la cuenta
  const rows = [
    { label: t.onboarding.alias, value: user.alias },
    { label: t.account.email, value: account?.email ?? text.noEmail },
    ...(hasAccountFields
      ? [
          {
            label: t.account.targetSpecialty,
            value: specialtyName(detailsOf(account)) ?? t.accounts.profile.specialtyEmpty,
          },
        ]
      : []),
    { label: text.examDate, value: examDateLabel(user) },
    { label: t.settings.timeZone, value: user.timeZone },
    ...accountRows(detailsOf(account), { withSpecialty: !hasAccountFields }),
  ];

  return (
    <Card aria-labelledby="datos-titulo" lift={false}>
      <CardHeader className="mb-4 flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          {/* La foto grande en círculo marino con las iniciales, o la foto que eligió (D-150) */}
          <Avatar
            name={user.alias}
            avatar={account?.avatar}
            className="size-16 shrink-0 bg-primary text-2xl font-extrabold text-primary-fg ring-0"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle as="h3" id="datos-titulo">
              {text.title}
            </CardTitle>
            <CardDescription>{text.description}</CardDescription>
          </div>
        </div>
        {editing ? null : (
          <Button
            ref={editButton}
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft(saved());
              setError(null);
              setStatus('');
              setEditing(true);
            }}
          >
            <Pencil aria-hidden />
            {text.edit}
          </Button>
        )}
      </CardHeader>

      {editing ? (
        <form className="flex flex-col gap-5" onSubmit={(event) => void save(event)} noValidate>
          <TextField
            label={t.onboarding.alias}
            hint={t.onboarding.aliasHint}
            value={draft.alias}
            maxLength={40}
            autoComplete="nickname"
            // Al abrir la edición el foco va al primer campo
            autoFocus
            error={error?.field === 'alias' ? error.text : null}
            onChange={(event) => {
              change({ alias: event.target.value });
            }}
          />
          {account ? (
            <p className="flex flex-col text-sm">
              <span className="font-medium">{t.account.email}</span>
              <span className="text-fg-muted">{account.email}</span>
            </p>
          ) : session.isDemo ? (
            <p className="text-sm text-fg-muted">{text.demoNote}</p>
          ) : (
            <TextField
              label={t.account.email}
              hint={`${t.account.noAccount} ${t.account.emailHint}`}
              type="email"
              value={draft.email}
              autoComplete="email"
              error={error?.field === 'email' ? error.text : null}
              onChange={(event) => {
                change({ email: event.target.value });
              }}
            />
          )}
          {hasAccountFields ? (
            <>
              {/* La especialidad va primero y a la vista, porque con ella se compara al alumno (B9) */}
              <TargetSpecialtyField
                value={draft.details.targetSpecialty}
                onChange={(targetSpecialty) => {
                  change({ details: { ...draft.details, targetSpecialty } });
                }}
              />
              <fieldset className="flex flex-col gap-2">
                <legend className="eyebrow mb-1 text-fg-muted">{t.account.avatarTitle}</legend>
                <AvatarPicker
                  name={draft.alias.trim() || user.alias}
                  value={draft.details.avatar}
                  onChange={(avatar) => {
                    change({ details: { ...draft.details, avatar } });
                  }}
                />
              </fieldset>
              <AccountDetailsFields
                value={draft.details}
                withSpecialty={false}
                onChange={(details) => {
                  change({ details });
                }}
              />
            </>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving}>
              <Save aria-hidden />
              {saving ? text.saving : text.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setDraft(saved());
                leaveEditing('');
              }}
            >
              {text.cancel}
            </Button>
          </div>
          <UnsavedChangesGuard dirty={dirty && !saving} />
        </form>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-sm font-semibold text-fg">{row.label}</dt>
              <dd className="truncate text-fg-muted">{row.value ?? text.notSet}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Un solo aviso para los dos modos, así el lector de pantalla oye Guardamos tu perfil */}
      <p role="status" className={status ? 'mt-3 text-sm text-fg-muted' : 'sr-only'}>
        {status}
      </p>
    </Card>
  );
}
