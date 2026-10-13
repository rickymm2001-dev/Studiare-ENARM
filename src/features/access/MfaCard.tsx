// Segundo factor del equipo (B9 del plan del cambio, respuesta 30). Tapa la app de un médico, un admin
// o el dueño hasta que da su código, cuando la bandera requireMfa lo pide. La primera vez da de alta el
// factor con el QR o la clave en una app de autenticación. Las siguientes solo pide el código. Con el
// código correcto la sesión queda en aal2 y el servidor le devuelve su rol en los permisos por fila.
import { LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAccess, type MfaGateState } from '@/app/accessState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import { loadCloud } from '@/data/cloud/client';
import {
  TOTP_CODE,
  startTotpEnrollment,
  verifyTotp,
  type TotpEnrollment,
  type VerifyResult,
} from '@/data/cloud/mfa';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';

type Gate = Extract<MfaGateState, { status: 'enroll' } | { status: 'challenge' }>;
type Enrollment =
  { status: 'loading' } | { status: 'failed' } | ({ status: 'ready' } & TotpEnrollment);

/** La clave en grupos de cuatro, para escribirla a mano sin perderse */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

export function MfaCard({ gate }: { gate: Gate }) {
  const text = t.accounts.mfa;
  const role = usePreferences((state) => state.role);
  const signOut = usePreferences((state) => state.signOut);
  const setMfa = useAccess((store) => store.setMfa);
  const [enrollment, setEnrollment] = useState<Enrollment>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  // Un alta por intento. El modo estricto de React corre el efecto dos veces y Supabase crearía dos
  useEffect(() => {
    if (gate.status !== 'enroll' || started.current === attempt) return;
    started.current = attempt;
    setEnrollment({ status: 'loading' });
    void loadCloud()
      .then((cloud) => (cloud ? startTotpEnrollment(cloud) : { ok: false as const }))
      .then((result) => {
        setEnrollment(result.ok ? { status: 'ready', ...result.enrollment } : { status: 'failed' });
      });
  }, [gate.status, attempt]);

  const factorId =
    gate.status === 'challenge'
      ? gate.factorId
      : enrollment.status === 'ready'
        ? enrollment.factorId
        : null;
  const enrolling = gate.status === 'enroll';

  const title = enrolling ? text.enrollTitle : text.challengeTitle;

  return (
    <>
      <ScreenHeader
        title={title}
        description={
          enrolling ? text.enrollDescription(t.roles.names[role]) : text.challengeDescription
        }
      />
      <Card aria-label={title} className="flex max-w-reading flex-col gap-3">
        {enrolling ? (
          <EnrollSteps
            enrollment={enrollment}
            onRetry={() => {
              setAttempt((value) => value + 1);
            }}
          />
        ) : null}
        {factorId ? (
          <CodeForm
            factorId={factorId}
            onVerified={() => {
              setMfa({ status: 'verified' });
            }}
          />
        ) : null}
        <p className="text-sm text-fg-muted">{text.lost}</p>
        <Button variant="secondary" className="self-start" onClick={signOut}>
          <LogOut aria-hidden />
          {text.signOut}
        </Button>
      </Card>
    </>
  );
}

function EnrollSteps({ enrollment, onRetry }: { enrollment: Enrollment; onRetry: () => void }) {
  const text = t.accounts.mfa;
  if (enrollment.status === 'loading') return <LoadingState label={text.preparing} />;
  if (enrollment.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-danger">
          {text.prepareFailed}
        </p>
        <Button variant="secondary" onClick={onRetry}>
          {text.retry}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {text.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        {/* El QR necesita fondo claro para leerse, también en modo oscuro */}
        <img
          src={enrollment.qrCode}
          alt={text.qrAlt}
          width={176}
          height={176}
          className="size-44 rounded-md border border-line bg-white p-2"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-fg-muted">{text.secretLabel}</p>
          <code className="font-mono text-base break-all select-all">
            {grouped(enrollment.secret)}
          </code>
        </div>
      </div>
    </div>
  );
}

function CodeForm({ factorId, onVerified }: { factorId: string; onVerified: () => void }) {
  const text = t.accounts.mfa;
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Extract<VerifyResult, { ok: false }>['reason'] | null>(
    null,
  );
  const clean = code.replace(/\D/g, '');
  const formatError = TOTP_CODE.test(clean) ? null : text.codeFormat;

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (formatError || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const cloud = await loadCloud();
      const result = cloud
        ? await verifyTotp(cloud, { factorId, code: clean })
        : ({ ok: false, reason: 'failed' } as const);
      if (result.ok) {
        onVerified();
        return;
      }
      setFailure(result.reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 border-t border-line pt-4"
      noValidate
      onSubmit={(event) => void onSubmit(event)}
    >
      <TextField
        label={text.codeLabel}
        value={code}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        error={submitted ? formatError : null}
        onChange={(event) => {
          setCode(event.target.value);
          setFailure(null);
        }}
      />
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? text.verifying : text.verify}
      </Button>
      {failure ? (
        <p role="alert" className="text-sm text-danger">
          {text.errors[failure]}
        </p>
      ) : null}
    </form>
  );
}
