// Aviso de que el aviso de privacidad cambió (Fase H). El propio aviso promete pedir que se acepte de
// nuevo cuando cambia, y esta franja lo hace. Aparece solo para quien ya decidió bajo una versión
// anterior. No cambia ningún permiso, solo deja constancia de que vio la versión nueva. En la
// demostración no aparece, porque el alumno es simulado.
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { recordPrivacyAcceptance } from '@/data/cloud/account';
import { loadCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { acceptCurrentNotice, noticeNeedsAcceptance } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { useCloud } from '../cloudState';
import { screenPath } from '../screens';
import { useSession } from '../session';

export function NoticeUpdateNotice({ className = '' }: { className?: string }) {
  const api = useDataApi();
  const session = useSession();
  const cloudState = useCloud((store) => store.state);
  const userId = session.status === 'ready' && !session.isDemo ? session.user.id : null;
  // Cambia cuando el alumno acepta, para que la franja se vuelva a calcular
  const [accepted, setAccepted] = useState(0);
  const needs = useLiveData(
    () => (userId ? noticeNeedsAcceptance(api, userId) : Promise.resolve(false)),
    [api.repos, userId, accepted],
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  if (session.status !== 'ready' || userId === null || !needs) return null;

  const accept = async () => {
    setStatus('saving');
    try {
      await acceptCurrentNotice(api, session.user);
      // Con la cuenta de la nube conectada, también queda la aceptación allá
      if (cloudState.status === 'linked') {
        const cloud = await loadCloud();
        if (cloud)
          await recordPrivacyAcceptance(cloud, cloudState.identity.authId, PRIVACY_NOTICE_VERSION);
      }
      setStatus('idle');
      setAccepted((value) => value + 1);
    } catch {
      setStatus('failed');
    }
  };

  return (
    <section
      aria-label={t.noticeUpdate.title}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-muted px-4 py-3 text-sm text-fg ${className}`}
    >
      <FileText aria-hidden className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-semibold">{t.noticeUpdate.title}</p>
        <p>{t.noticeUpdate.body(PRIVACY_NOTICE_VERSION)}</p>
        {status === 'failed' ? (
          <p role="alert" className="text-danger">
            {t.noticeUpdate.failed}
          </p>
        ) : null}
      </div>
      <Button asChild size="sm" variant="secondary">
        <Link to={screenPath('privacyNotice')}>{t.noticeUpdate.read}</Link>
      </Button>
      <Button
        size="sm"
        disabled={status === 'saving'}
        onClick={() => {
          void accept();
        }}
      >
        {status === 'saving' ? t.noticeUpdate.saving : t.noticeUpdate.accept}
      </Button>
    </section>
  );
}
