// Aviso global de que Google o el enlace del correo no dejaron entrar (B9 del plan del cambio). Supabase
// regresa a la app con el error en la dirección, CloudBridge lo traduce y aquí se explica. Con Google, el
// más común mientras el registro esté cerrado es un correo sin invitación. Con el correo, un enlace que
// venció o que ya se usó. El alumno lo descarta.
import { CircleAlert } from 'lucide-react';
import { isLinkError } from '@/data/cloud/oauth';
import { t } from '@/i18n/core';
import { Button } from '@/ui/components/button';
import { useAccess } from '../accessState';

export function OAuthErrorNotice({ className = '' }: { className?: string }) {
  const error = useAccess((store) => store.oauthError);
  const setError = useAccess((store) => store.setOAuthError);
  if (!error) return null;
  const text = t.accounts.oauthError;

  const dismiss = () => {
    setError(null);
    // El botón desaparece. El foco pasa al contenido para que teclado y lector de pantalla no se pierdan
    document.getElementById('contenido')?.focus();
  };

  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-warning-soft px-4 py-3 text-sm text-fg ${className}`}
    >
      <CircleAlert aria-hidden className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{isLinkError(error) ? text.linkTitle : text.title}</p>
        <p>{text[error]}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={dismiss}>
        {text.dismiss}
      </Button>
    </div>
  );
}
