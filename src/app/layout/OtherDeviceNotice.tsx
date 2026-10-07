// Aviso global de que la cuenta se abrió en otro dispositivo y esta sesión se cerró. Solo aparece
// cuando CloudBridge deja el motivo other_device en el estado de la nube. Va en el marco de la app
// junto a los otros avisos, así se ve también en la pantalla de entrada. El alumno lo descarta.
import { MonitorSmartphone } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { useCloud } from '../cloudState';

export function OtherDeviceNotice({ className = '' }: { className?: string }) {
  const state = useCloud((store) => store.state);
  const setCloud = useCloud((store) => store.set);
  if (state.status !== 'signed-out' || state.reason !== 'other_device') return null;

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
      <MonitorSmartphone aria-hidden className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{t.cloud.otherDevice.title}</p>
        <p>{t.cloud.otherDevice.body}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={dismiss}>
        {t.cloud.otherDevice.dismiss}
      </Button>
    </div>
  );
}
