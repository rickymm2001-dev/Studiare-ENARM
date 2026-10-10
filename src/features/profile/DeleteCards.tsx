// Borrar mis datos y eliminar mi cuenta (D-101, Fase E bloque E6). Con la cuenta en la nube
// conectada, primero se borra la copia de allá y, solo si salió bien, lo de este dispositivo. Así,
// si el servidor falla, no queda el dispositivo vacío con la nube llena ni al revés. Ninguna de las
// dos se puede deshacer, por eso piden confirmación.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Trash2, UserX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { pauseSync, resumeSync } from '@/app/syncState';
import { useCloud } from '@/app/cloudState';
import {
  deleteCloudAccount,
  eraseCloudData,
  type EraseFailure,
  type EraseResult,
} from '@/data/cloud/privacy';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';

type Cloud = Pick<SupabaseClient, 'rpc'>;

/** Por qué falló un borrado. local es que la nube sí se borró y este dispositivo no */
type DeleteFailure = EraseFailure | 'local';

interface DeleteProps {
  /** Baja el cliente de la nube, o null si no está configurada o no se pudo bajar */
  loadCloud: () => Promise<Cloud | null>;
  /** Borra lo de este dispositivo. Lo pone quien conoce la base */
  wipeLocal: () => Promise<void>;
  /** Qué hacer al terminar, normalmente salir de la sesión */
  onDone: () => void;
}

/**
 * Qué se puede borrar según el estado de la nube. Con la sesión abierta se borra la nube y luego el
 * dispositivo. Mientras se comprueba la cuenta se espera, para no borrar solo el dispositivo por
 * error. Sin sesión, o si no se pudo comprobar, solo se borra el dispositivo y se avisa que la copia
 * en la nube se queda
 */
type Mode = 'device' | 'cloud' | 'wait';

function useMode(): { mode: Mode; note: string | null } {
  const status = useCloud((store) => store.state.status);
  switch (status) {
    case 'linked':
      return { mode: 'cloud', note: t.settings.deleteCloudNote };
    case 'checking':
      return { mode: 'wait', note: t.settings.deleteCloudChecking };
    case 'signed-out':
      return { mode: 'device', note: t.settings.deleteSignedOutNote };
    case 'error':
      return { mode: 'device', note: t.settings.deleteCloudUnknownNote };
    case 'off':
      return { mode: 'device', note: null };
  }
}

interface PanelProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

function Panel({ id, title, description, children }: PanelProps) {
  return (
    <Card aria-labelledby={id}>
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children}
    </Card>
  );
}

function ErrorLine({ reason }: { reason: DeleteFailure | null }) {
  return reason ? (
    <p role="alert" className="text-sm text-danger">
      {t.settings.eraseErrors[reason]}
    </p>
  ) : null;
}

/**
 * Con la nube, la sincronización se frena, se borra allá y luego aquí. Devuelve por qué falló, o
 * null si terminó. Si algo falla la sincronización se reanuda. Si todo sale bien se queda frenada
 * hasta que la sesión se cierre, porque no debe volver a subir lo que se acaba de borrar
 */
async function eraseAll(
  mode: Mode,
  loadCloud: DeleteProps['loadCloud'],
  step: (cloud: Cloud) => Promise<EraseResult>,
  wipeLocal: () => Promise<void>,
): Promise<DeleteFailure | null> {
  if (mode === 'wait') return 'network';
  if (mode === 'cloud') {
    await pauseSync();
    const cloud = await loadCloud();
    const result = cloud ? await step(cloud) : null;
    if (!result?.ok) {
      resumeSync();
      return result ? result.reason : 'network';
    }
  }
  try {
    await wipeLocal();
  } catch {
    if (mode === 'cloud') resumeSync();
    return 'local';
  }
  return null;
}

/** Borra los datos del dispositivo y, con la nube conectada, también la copia de allá */
export function DeleteDataCard({ loadCloud, wipeLocal, onDone }: DeleteProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DeleteFailure | null>(null);
  const { mode, note } = useMode();
  const run = () => {
    setBusy(true);
    setFailure(null);
    void eraseAll(mode, loadCloud, eraseCloudData, wipeLocal)
      .then((reason) => {
        if (reason) setFailure(reason);
        else onDone();
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <Panel
      id="borrar-titulo"
      title={t.settings.deleteTitle}
      description={t.settings.deleteDescription}
    >
      {note ? <p className="text-sm text-fg-muted">{note}</p> : null}
      {confirming ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {mode === 'cloud' ? t.settings.deleteCloudConfirmText : t.settings.deleteConfirmText}
          </p>
          <ErrorLine reason={failure} />
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy || mode === 'wait'} onClick={run}>
              {busy ? t.settings.deleting : t.settings.deleteConfirm}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setFailure(null);
              }}
            >
              {t.settings.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="danger"
          className="self-start"
          disabled={mode === 'wait'}
          onClick={() => {
            setConfirming(true);
          }}
        >
          <Trash2 aria-hidden />
          {t.settings.delete}
        </Button>
      )}
    </Panel>
  );
}

/** Elimina la cuenta en la nube. Pide escribir la palabra para no hacerlo por un toque de más */
export function DeleteAccountCard({ loadCloud, wipeLocal, onDone }: DeleteProps) {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DeleteFailure | null>(null);
  const { mode } = useMode();
  // Sin cuenta en la nube conectada no hay cuenta que eliminar. Para el dispositivo está Borrar mis datos
  if (mode !== 'cloud') return null;
  const confirmed = word.trim() === t.settings.accountDeleteWord;
  return (
    <Panel
      id="eliminar-cuenta-titulo"
      title={t.settings.accountDeleteTitle}
      description={t.settings.accountDeleteDescription}
    >
      <p className="text-sm text-fg-muted">{t.settings.accountDeleteExportHint}</p>
      <p className="text-sm text-fg-muted">{t.settings.accountDeletePayments}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmed || busy) return;
          setBusy(true);
          setFailure(null);
          void eraseAll(mode, loadCloud, deleteCloudAccount, wipeLocal)
            .then((reason) => {
              if (reason) setFailure(reason);
              else onDone();
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        <TextField
          label={t.settings.accountDeleteConfirmLabel}
          value={word}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(event) => {
            setWord(event.target.value);
          }}
        />
        <ErrorLine reason={failure} />
        <Button type="submit" variant="danger" className="self-start" disabled={!confirmed || busy}>
          <UserX aria-hidden />
          {busy ? t.settings.deleting : t.settings.accountDeleteAction}
        </Button>
      </form>
    </Panel>
  );
}
