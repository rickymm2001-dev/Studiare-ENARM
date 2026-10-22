// Aviso discreto de que la sincronización de la bitácora está en pausa porque hay eventos de una versión más
// nueva que esta app (D-146). Se pinta dentro del contenedor de avisos de PwaUpdatePrompt, que es una región
// viva siempre presente, y se apila con el aviso de versión nueva de la app sin taparlo. El botón activa la
// versión nueva y recarga. Si tras actualizar la pausa sigue, cambia a decir que la versión todavía no llegó, sin
// botón, y se acuerda por pestaña para no ofrecer una actualización que ya no ayuda.
import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { syncVersionText as text } from '@/i18n/syncVersion';
import { Button } from '@/ui/components/button';
import { applyLatestVersion } from '../applyLatestVersion';
import { useSyncStatus } from '../syncState';
import { NOTICE_STACK_ID } from './noticeStack';

const TRIED_KEY = 'studiare.sync-version.update-tried';
/** Si pasado este tiempo la página sigue aquí, el botón se reactiva para reintentar */
export const RETRY_AFTER_MS = 8000;

function readTried(): boolean {
  try {
    return sessionStorage.getItem(TRIED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeTried(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(TRIED_KEY, '1');
    else sessionStorage.removeItem(TRIED_KEY);
  } catch {
    // Almacenamiento bloqueado. El aviso funciona igual, solo no recuerda el intento
  }
}

type Phase = 'idle' | 'updating' | 'retry';

export function SyncVersionNotice() {
  const blocked = useSyncStatus((store) => store.state.blockedByNewerVersion === true);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  // Si ya se intentó actualizar antes de esta carga de la página. Es lo que dice que la pausa sigue tras actualizar
  const [triedBefore, setTriedBefore] = useState(readTried);
  const [wasBlocked, setWasBlocked] = useState(blocked);

  // Cuando la pausa termina, se olvida el intento y el aviso vuelve a su estado de partida
  if (wasBlocked !== blocked) {
    setWasBlocked(blocked);
    if (!blocked) {
      setTriedBefore(false);
      setPhase('idle');
    }
  }
  useEffect(() => {
    if (!blocked) writeTried(false);
  }, [blocked]);

  // Tras pedir la actualización, si la recarga se cancela o el worker nuevo no toma el control, el botón no se
  // queda muerto. Se reactiva a los pocos segundos o al volver a mostrarse la página
  useEffect(() => {
    if (phase !== 'updating') return;
    const timer = window.setTimeout(() => {
      setPhase('retry');
    }, RETRY_AFTER_MS);
    const onShow = () => {
      setPhase('retry');
    };
    window.addEventListener('pageshow', onShow);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pageshow', onShow);
    };
  }, [phase]);

  const stuck = blocked && triedBefore;
  const card: ReactNode =
    blocked && !dismissed ? (
      <div className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-surface p-3 shadow-raised">
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm font-semibold text-fg">{stuck ? text.stuckTitle : text.title}</p>
          <p className="text-sm text-fg-muted">{stuck ? text.stuckBody : text.body}</p>
          {stuck ? null : (
            <Button
              size="sm"
              className="self-start"
              disabled={phase === 'updating'}
              onClick={() => {
                writeTried(true);
                setPhase('updating');
                void applyLatestVersion();
              }}
            >
              <RefreshCw aria-hidden />
              {phase === 'updating' ? text.updating : phase === 'retry' ? text.retry : text.update}
            </Button>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label={text.dismiss}
          onClick={() => {
            setDismissed(true);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
    ) : null;

  // Dentro del contenedor de PwaUpdatePrompt, que ya es una región viva. Sin él, por ejemplo en una prueba que
  // monta solo este aviso, se trae su propia región viva, también siempre presente
  const host = typeof document === 'undefined' ? null : document.getElementById(NOTICE_STACK_ID);
  if (host) return createPortal(card, host);
  return (
    <div aria-live="polite" aria-atomic="false">
      {card}
    </div>
  );
}
