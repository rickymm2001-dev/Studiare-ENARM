// Sección Perfil dentro de Configuración (B3 del plan del cambio, comentarios 5, 6 y 16).
// Muestra primero el plan actual con opción a cambiarlo, luego los datos del perfil y de la cuenta
// en modo de solo lectura por omisión, con el botón Editar perfil que abre el formulario con aviso
// de cambios sin guardar al cancelar, pedir factura y cerrar sesión.
import { CreditCard, Edit3, FileText, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AlertDialog, Dialog } from 'radix-ui';
import { pushAccountIfLinked } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { PLANS, type PlanKey } from '@/config/billing';
import { SPECIALTIES } from '@/config/specialties';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import {
  addAccountToProfile,
  EMPTY_DETAILS,
  normalizeEmail,
  sameAvatarChoice,
  updateAccount,
  type AccountDetails,
} from '@/data/usecases/account';
import { updateProfile } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField, TextField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import { AccountDetailsFields } from '../profile/AccountDetailsFields';
import { AvatarPicker } from '../profile/AvatarPicker';
import { CloudStatus } from '../profile/AccountSettings';

export function ProfileSection({ session }: { session: ReadySession }) {
  return (
    <div className="flex flex-col gap-4">
      <CurrentPlanCard session={session} />
      <ProfileDataCard session={session} />
    </div>
  );
}

/** Tarjeta del plan actual del alumno con su precio y fecha de renovación o prueba */
function CurrentPlanCard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );
  const current: PlanKey = subscription?.status === 'active' ? subscription.plan : 'free';
  const planInfo = PLANS[current];
  const priceLabel =
    planInfo.priceMxn === 0 ? t.settings.freePlan : t.billing.price(planInfo.priceMxn);

  const periodLabel = subscription?.periodEnd
    ? t.settings.validUntil(new Date(subscription.periodEnd).toLocaleDateString('es-MX'))
    : t.settings.noRenewal;

  return (
    <Card aria-labelledby="plan-actual-titulo">
      <CardHeader>
        <CardTitle id="plan-actual-titulo">
          {t.settings.currentPlan}: {t.billing.plans[current]}
        </CardTitle>
        <CardDescription>
          {priceLabel} · {periodLabel}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary">
          <Link to={screenPath('subscription')}>
            <CreditCard aria-hidden />
            {t.settings.changePlan}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/**
 * Datos de Perfil y de Cuenta juntos (comentario 6).
 * Por omisión se muestran de solo lectura. El botón "Editar perfil" abre todos los campos
 * con Guardar y Cancelar, avisando si se cancela con cambios sin guardar (comentario 16).
 */
function ProfileDataCard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const signOut = usePreferences((state) => state.signOut);
  const { user } = session;
  const account = useLiveData(
    () => api.repos.accounts.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );

  const [isEditing, setIsEditing] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Estados del borrador al editar
  const [alias, setAlias] = useState(user.alias);
  const [email, setEmail] = useState('');
  const [examDate, setExamDate] = useState(user.examDate ?? '');
  const [details, setDetails] = useState<AccountDetails>(EMPTY_DETAILS);
  const [status, setStatus] = useState('');

  const startEditing = () => {
    setAlias(user.alias);
    setEmail(account?.email ?? '');
    setExamDate(user.examDate ?? '');
    setDetails(
      account
        ? {
            birthYear: account.birthYear,
            sex: account.sex,
            state: account.state,
            situation: account.situation,
            attempt: account.attempt,
            targetSpecialty: account.targetSpecialty,
            avatar: account.avatar,
            howHeard: account.howHeard ?? null,
          }
        : EMPTY_DETAILS,
    );
    setStatus('');
    setIsEditing(true);
  };

  const isDirty = () => {
    const originalDetails = account
      ? {
          birthYear: account.birthYear,
          sex: account.sex,
          state: account.state,
          situation: account.situation,
          attempt: account.attempt,
          targetSpecialty: account.targetSpecialty,
          avatar: account.avatar,
          howHeard: account.howHeard ?? null,
        }
      : EMPTY_DETAILS;

    return (
      alias.trim() !== user.alias ||
      (examDate ? examDate : null) !== (user.examDate ?? null) ||
      (!account && email.trim() !== '') ||
      (account ? email.trim() !== account.email : false) ||
      !sameAvatarChoice(details.avatar, originalDetails.avatar) ||
      details.birthYear !== originalDetails.birthYear ||
      details.sex !== originalDetails.sex ||
      details.state !== originalDetails.state ||
      details.situation !== originalDetails.situation ||
      details.attempt !== originalDetails.attempt ||
      details.targetSpecialty !== originalDetails.targetSpecialty ||
      details.howHeard !== originalDetails.howHeard
    );
  };

  const handleCancel = () => {
    if (isDirty()) {
      setConfirmDiscardOpen(true);
    } else {
      setIsEditing(false);
    }
  };

  const confirmDiscard = () => {
    setConfirmDiscardOpen(false);
    setIsEditing(false);
  };

  const handleSave = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!alias.trim()) return;

    // Guardar cambios en el perfil (alias y fecha de examen)
    await updateProfile(api, user, {
      alias: alias.trim(),
      examDate: examDate ? examDate : null,
    });

    // Guardar o agregar cuenta
    if (account) {
      await updateAccount(api, account, details);
    } else if (email.trim()) {
      const clean = normalizeEmail(email);
      await addAccountToProfile(api, { userId: user.id, email: clean, details });
    }

    void pushAccountIfLinked(api, user.id);
    setStatus(t.settings.saved);
    setIsEditing(false);
  };

  const specialtyLabel =
    account?.targetSpecialty
      ? SPECIALTIES.find(([key]) => key === account.targetSpecialty)?.[1] ?? account.targetSpecialty
      : t.account.preferNot;

  return (
    <>
      <Card aria-labelledby="datos-perfil-titulo">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle id="datos-perfil-titulo">{t.account.detailsTitle}</CardTitle>
              <CardDescription>
                {account ? `${account.email}. ${t.account.detailsHint}` : t.account.noAccount}
              </CardDescription>
            </div>
            {!isEditing && (
              <Button onClick={startEditing}>
                <Edit3 aria-hidden />
                {t.settings.editProfile}
              </Button>
            )}
          </div>
        </CardHeader>

        {isEditing ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              void handleSave(e);
            }}
          >
            <TextField
              label={t.onboarding.alias}
              value={alias}
              maxLength={40}
              required
              onChange={(e) => {
                setAlias(e.target.value);
              }}
            />

            {!account ? (
              <TextField
                label={t.account.email}
                hint={t.account.emailHint}
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className="eyebrow mb-1 text-fg-muted">{t.account.avatarTitle}</legend>
              <AvatarPicker
                name={alias.trim() ? alias.trim() : user.alias}
                value={details.avatar}
                onChange={(avatar) => {
                  setDetails({ ...details, avatar });
                }}
              />
            </fieldset>

            <AccountDetailsFields
              value={details}
              onChange={(next) => {
                setDetails(next);
              }}
            />

            <TextField
              label={t.account.examDate}
              type="date"
              value={examDate}
              onChange={(e) => {
                setExamDate(e.target.value);
              }}
            />

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button type="submit">{t.settings.save}</Button>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                {t.settings.cancelEdit}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <Avatar
                name={user.alias}
                seed={user.id}
                avatar={account?.avatar}
                className="size-16 text-xl ring-2 ring-surface"
              />
              <div>
                <p className="text-xl font-bold">{user.alias}</p>
                <p className="text-sm text-fg-muted">{account?.email ?? t.account.noAccount}</p>
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs font-semibold text-fg-muted">{t.account.sex}</dt>
                <dd className="mt-1 font-medium">
                  {account?.sex ? t.account.sexes[account.sex] : t.account.preferNot}
                </dd>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs font-semibold text-fg-muted">{t.account.situation}</dt>
                <dd className="mt-1 font-medium">
                  {account?.situation ? t.account.situations[account.situation] : t.account.preferNot}
                </dd>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs font-semibold text-fg-muted">{t.account.attempt}</dt>
                <dd className="mt-1 font-medium">
                  {account?.attempt ? t.account.attempts(account.attempt) : t.account.preferNot}
                </dd>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs font-semibold text-fg-muted">{t.account.targetSpecialty}</dt>
                <dd className="mt-1 font-medium">{specialtyLabel}</dd>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs font-semibold text-fg-muted">{t.account.examDate}</dt>
                <dd className="mt-1 font-medium">{user.examDate ?? t.account.noExamDate}</dd>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <dt className="text-xs font-semibold text-fg-muted">{t.account.howHeard}</dt>
                <dd className="mt-1 font-medium">
                  {account?.howHeard ? t.account.howHeards[account.howHeard] : t.account.preferNot}
                </dd>
              </div>
            </dl>

            <CloudStatus />

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <InvoiceDialog />
              {!session.isDemo ? (
                <Button type="button" variant="secondary" onClick={signOut}>
                  <LogOut aria-hidden />
                  {t.session.signOut}
                </Button>
              ) : null}
            </div>

            {status ? (
              <p role="status" className="text-sm text-fg-muted">
                {status}
              </p>
            ) : null}
          </div>
        )}
      </Card>

      {/* Diálogo de confirmación al cancelar con cambios sin guardar */}
      <AlertDialog.Root open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-raised">
            <AlertDialog.Title className="text-lg font-bold">
              {t.settings.discardEditTitle}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-fg-muted">
              {t.settings.discardEditDescription}
            </AlertDialog.Description>
            <div className="flex justify-end gap-2 pt-2">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">{t.settings.keepEditing}</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="danger" onClick={confirmDiscard}>
                  {t.settings.confirmDiscard}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

const REGIMEN_FISCAL_OPTIONS = [
  { value: '605', label: '605 - Sueldos y Salarios' },
  { value: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { value: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { value: '616', label: '616 - Sin obligaciones fiscales' },
];

const USO_CFDI_OPTIONS = [
  { value: 'G03', label: 'G03 - Gastos en general' },
  { value: 'D10', label: 'D10 - Pagos por servicios educativos (colegiaturas)' },
  { value: 'S01', label: 'S01 - Sin efectos fiscales' },
  { value: 'CP01', label: 'CP01 - Pagos' },
];

/** Diálogo para solicitar factura CFDI (respuesta 12 del plan del cambio) */
function InvoiceDialog() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rfc, setRfc] = useState('');
  const [name, setName] = useState('');
  const [regimen, setRegimen] = useState('612');
  const [postalCode, setPostalCode] = useState('');
  const [usoCfdi, setUsoCfdi] = useState('G03');
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setRfc('');
      setName('');
      setPostalCode('');
      setEmail('');
    }, 200);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary">
          <FileText aria-hidden />
          {t.settings.invoice}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-raised">
          <Dialog.Title className="text-xl font-bold">
            {t.settings.invoiceTitle}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-fg-muted">
            {t.settings.invoiceDescription}
          </Dialog.Description>

          {submitted ? (
            <div className="flex flex-col gap-4 py-3">
              <div className="rounded-lg bg-accent-soft p-4 text-sm text-accent-ink">
                {t.settings.invoiceRequested}
              </div>
              <Button className="self-end" onClick={handleClose}>
                Cerrar
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              <TextField
                label="RFC"
                placeholder="XAXX010101000"
                maxLength={13}
                required
                value={rfc}
                onChange={(e) => {
                  setRfc(e.target.value.toUpperCase());
                }}
              />
              <TextField
                label="Nombre o Razón Social"
                placeholder="Como aparece en la Constancia de Situación Fiscal"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
              <SelectField
                label="Régimen Fiscal"
                value={regimen}
                options={REGIMEN_FISCAL_OPTIONS}
                onChange={(e) => {
                  setRegimen(e.target.value);
                }}
              />
              <TextField
                label="Código Postal Fiscal"
                placeholder="00000"
                maxLength={5}
                required
                value={postalCode}
                onChange={(e) => {
                  setPostalCode(e.target.value);
                }}
              />
              <SelectField
                label="Uso de CFDI"
                value={usoCfdi}
                options={USO_CFDI_OPTIONS}
                onChange={(e) => {
                  setUsoCfdi(e.target.value);
                }}
              />
              <TextField
                label="Correo para recibir factura"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="secondary" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button type="submit">Enviar solicitud</Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
