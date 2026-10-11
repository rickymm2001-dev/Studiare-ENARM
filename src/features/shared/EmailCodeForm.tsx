// Entrar con el código que trae el correo del enlace (D-115). Sirve cuando el correo se abre en otro
// dispositivo, porque el enlace solo abre sesión donde se abre. Lo usan el registro, el acceso y la
// tarjeta de Suscripción que pide conectar la cuenta.
import { useState, type SyntheticEvent } from 'react';
import { EMAIL_CODE, normalizeEmailCode, verifyEmailCode } from '@/data/cloud/account';
import { loadCloud } from '@/data/cloud/client';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { TextField } from '@/ui/components/field';

export function EmailCodeForm({
  email,
  onVerified,
}: {
  email: string;
  /** Se llama cuando el código abrió la sesión. El puente de la nube une la cuenta por su lado */
  onVerified?: () => void;
}) {
  const text = t.cloud.code;
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const clean = normalizeEmailCode(code);
  const formatError = EMAIL_CODE.test(clean) ? null : text.format;

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (formatError) return;
    setBusy(true);
    setMessage(null);
    try {
      const cloud = await loadCloud();
      if (!cloud) {
        setMessage(text.errors.failed);
        return;
      }
      const result = await verifyEmailCode(cloud, {
        email: email.trim().toLowerCase(),
        code: clean,
      });
      if (result.ok) {
        setMessage(text.verified);
        onVerified?.();
        return;
      }
      setMessage(text.errors[result.reason]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-4 flex flex-col gap-2 border-t border-line pt-4"
      noValidate
      aria-label={text.formLabel}
      onSubmit={(event) => void onSubmit(event)}
    >
      <TextField
        label={text.label}
        hint={text.hint}
        value={code}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={16}
        error={submitted ? formatError : null}
        onChange={(event) => {
          setCode(event.target.value);
          setMessage(null);
        }}
      />
      <Button type="submit" variant="secondary" disabled={busy} className="self-start">
        {busy ? text.verifying : text.submit}
      </Button>
      <p role="status" className="min-h-5 text-sm text-fg-muted">
        {message}
      </p>
    </form>
  );
}
