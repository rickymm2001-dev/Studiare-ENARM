// Estado de la cuenta en la nube, en Tu sesión de Perfil. Solo aparece si Supabase está configurado
// (D-075). Con la cuenta conectada dice además cómo va la sincronización (D-095). Va en renglones
// separados por una línea, sin cajas grises dentro de la tarjeta (H06 de la revisión de B2).
import { useCloud } from '@/app/cloudState';
import { t } from '@/i18n/es-MX';
import { SyncStatus } from './SyncStatus';

export function CloudStatus() {
  const state = useCloud((store) => store.state);
  if (state.status === 'off') return null;
  const text =
    state.status === 'linked'
      ? t.cloud.linked(state.identity.email)
      : state.status === 'checking'
        ? t.cloud.checking
        : state.status === 'error'
          ? t.cloud.error
          : t.cloud.notLinked;
  return (
    <>
      <div className="flex flex-col gap-0.5 border-t border-line pt-3 text-sm">
        <p className="font-semibold">{t.cloud.statusTitle}</p>
        <p className="text-fg-muted">{text}</p>
      </div>
      {state.status === 'linked' ? <SyncStatus /> : null}
    </>
  );
}
