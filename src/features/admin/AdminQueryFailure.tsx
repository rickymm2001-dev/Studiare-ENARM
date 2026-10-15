// El aviso de una lectura del admin que falló, con Intentar de nuevo (B10, Admin, Pagos)
import type { AdminFailure } from '@/data/cloud/adminBilling';
import { invoicesText } from '@/i18n/invoices';
import { Button } from '@/ui/components/button';

export function AdminQueryFailure({
  reason,
  onRetry,
}: {
  reason: AdminFailure;
  onRetry: () => void;
}) {
  const text = invoicesText.admin;
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
        {text.failed[reason]}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {text.retry}
      </Button>
    </div>
  );
}
