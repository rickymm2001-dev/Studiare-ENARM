// Sección Banco de Plataforma (pantalla 25, 4.3 del plan de B11). El freno de lectura de los planes de
// pago, los avisos al admin, el tope de reportes de error por alumno, las preguntas por petición y la
// tarifa por revisión del reporte de pagos. Viven en platform_settings y los lee la base, así que solo
// se cambian con la cuenta de la nube conectada como admin.
import { useState } from 'react';
import { useCloud } from '@/app/cloudState';
import {
  BankLimitsSchema,
  PhysicianPaySchema,
  readBankSettings,
  saveBankLimits,
  savePhysicianPay,
  type BankLimits,
  type BankSettings,
} from '@/data/cloud/bankAdmin';
import { bankAdminText } from '@/i18n/bankAdmin';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { bankCodeText } from './bankErrors';
import { requireCloud, useBankAdminQuery } from './useBankAdminQuery';

const text = bankAdminText.platform;
const LIMIT_FIELDS = [
  'perMinute',
  'perHour',
  'alertDaily',
  'alertWeekShare',
  'reportsPerDay',
  'maxFetch',
] as const satisfies readonly (keyof BankLimits)[];

export function BankSettingsForm() {
  const linked = useCloud((store) => store.state.status === 'linked');
  return (
    <Card aria-labelledby="config-banco" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="config-banco">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {linked ? <BankSettingsFields /> : <p className="text-sm text-fg-muted">{text.needsCloud}</p>}
    </Card>
  );
}

function BankSettingsFields() {
  const { state, reload } = useBankAdminQuery(async (cloud) => {
    const settings = await readBankSettings(cloud);
    if (!settings) throw new Error('settings');
    return settings;
  }, 'bank-settings');
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'failed') {
    return <ErrorState description={bankCodeText(state.code)} onRetry={reload} />;
  }
  return <SettingsForm initial={state.value} />;
}

function SettingsForm({ initial }: { initial: BankSettings }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(LIMIT_FIELDS.map((field) => [field, String(initial.limits[field])])),
    perReviewMxn: initial.pay.perReviewMxn === null ? '' : String(initial.pay.perReviewMxn),
  }));
  const [message, setMessage] = useState<'saved' | 'invalid' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);

  const limits = BankLimitsSchema.safeParse(
    Object.fromEntries(LIMIT_FIELDS.map((field) => [field, Number(draft[field])])),
  );
  const rate = (draft.perReviewMxn ?? '').trim();
  const pay = PhysicianPaySchema.safeParse({ perReviewMxn: rate === '' ? null : Number(rate) });

  const save = async () => {
    if (!limits.success || !pay.success) {
      setMessage('invalid');
      return;
    }
    setBusy(true);
    try {
      const cloud = await requireCloud();
      const [savedLimits, savedPay] = await Promise.all([
        saveBankLimits(cloud, limits.data),
        savePhysicianPay(cloud, pay.data),
      ]);
      setMessage(savedLimits && savedPay ? 'saved' : 'failed');
    } catch {
      setMessage('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {[...LIMIT_FIELDS, 'perReviewMxn' as const].map((field) => (
          <TextField
            key={field}
            label={text.fields[field]}
            type="number"
            inputMode="decimal"
            value={draft[field] ?? ''}
            onChange={(event) => {
              setMessage(null);
              setDraft((current) => ({ ...current, [field]: event.target.value }));
            }}
          />
        ))}
      </div>
      <div>
        <Button type="submit" disabled={busy}>
          {text.save}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-fg-muted">
        {message === 'saved'
          ? text.saved
          : message === 'invalid'
            ? text.invalid
            : message === 'failed'
              ? text.failed
              : ''}
      </p>
    </form>
  );
}
