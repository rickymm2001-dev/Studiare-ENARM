// Aviso global de que se llegó al límite de cambios de dispositivo y esta sesión se cerró. Solo
// aparece cuando CloudBridge deja el motivo device_limit en el estado de la nube. Dice cuándo puede
// volver a cambiar y ofrece pedir ayuda. Va junto al aviso de otro dispositivo, en el marco de la app.
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { readSupportEmail, supportMailto } from '@/config/support';
import { describeRetryTime } from '@/i18n/device';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { useCloud } from '../cloudState';

export function DeviceLimitNotice({ className = '' }: { className?: string }) {
  const state = useCloud((store) => store.state);
  if (state.status !== 'signed-out' || state.reason !== 'device_limit') return null;
  return <LimitAlert retryAt={state.retryAt} className={className} />;
}

function LimitAlert({ retryAt, className }: { retryAt: number | null; className: string }) {
  const setCloud = useCloud((store) => store.set);
  // Se fija al aparecer el aviso, para que "hoy" y "mañana" no cambien al volver a pintar
  const [shownAt] = useState(() => Date.now());
  const text = t.cloud.deviceLimit;
  const support = readSupportEmail();

  const dismiss = () => {
    setCloud({ status: 'signed-out' });
    // El botón desaparece. El foco pasa al contenido para que teclado y lector de pantalla no se pierdan
    document.getElementById('contenido')?.focus();
  };

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-warning-soft px-4 py-3 text-sm text-fg ${className}`}
    >
      <ShieldAlert aria-hidden className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{text.title}</p>
        <p>{text.body(describeRetryTime(retryAt, shownAt))}</p>
        {support ? (
          <p>
            {text.helpQuestion}{' '}
            <a
              href={supportMailto(support, text.helpMailSubject)}
              className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
            >
              {text.helpLink}
            </a>
          </p>
        ) : (
          <p>{text.helpWithoutContact}</p>
        )}
      </div>
      <Button size="sm" variant="secondary" onClick={dismiss}>
        {text.dismiss}
      </Button>
    </div>
  );
}
