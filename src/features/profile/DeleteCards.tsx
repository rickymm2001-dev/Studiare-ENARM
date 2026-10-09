// Borrar mis datos y eliminar mi cuenta (D-101, Fase E bloque E6). Con la cuenta en la nube
// conectada, primero se borra la copia de allá y, solo si salió bien, lo de este dispositivo. Así,
// si el servidor falla, no queda el dispositivo vacío con la nube llena ni al revés. Ninguna de las
// dos se puede deshacer, por eso piden confirmación.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Trash2, UserX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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

interface DeleteProps {
  /** Cliente de la nube, o null si no está configurada. Solo se usa con la cuenta conectada */
  cloud: Cloud | null;
  /** Borra lo de este dispositivo. Lo pone quien conoce la base */
  wipeLocal: () => Promise<void>;
  /** Qué hacer al terminar, normalmente salir de la sesión */
  onDone: () => void;
}

/**
 * Con la cuenta en la nube conectada, borrar exige la nube. Si por algo el cliente no está, borrar
 * falla y no deja el dispositivo vacío con la copia en la nube intacta
 */
function useCloudTarget(cloud: Cloud | null): { linked: boolean; cloud: Cloud | null } {
  const linked = useCloud((store) => store.state.status === 'linked');
  return { linked, cloud };
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
function ErrorLine({ reason }: { reason: EraseFailure | null }) {
  return reason ? (
    <p role="alert" className="text-sm text-danger">
      {t.settings.eraseErrors[reason]}
    </p>
  ) : null;
}

/** Corre el borrado de la nube y, si salió bien, lo local. Devuelve por qué falló, o null si terminó */
async function eraseAll(
  target: { linked: boolean; cloud: Cloud | null },
  step: (cloud: Cloud) => Promise<EraseResult>,
  wipeLocal: () => Promise<void>,
): Promise<EraseFailure | null> {
  if (target.linked) {
    if (!target.cloud) return 'network';
    const result = await step(target.cloud);
    if (!result.ok) return result.reason;
  }
  await wipeLocal();
  return null;
}

/** Borra los datos del dispositivo y, con la nube conectada, también la copia de allá */
export function DeleteDataCard({ cloud, wipeLocal, onDone }: DeleteProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<EraseFailure | null>(null);
  const target = useCloudTarget(cloud);
  const run = () => {
    setBusy(true);
    setFailure(null);
    void eraseAll(target, eraseCloudData, wipeLocal)
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
      {target.linked ? <p className="text-sm text-fg-muted">{t.settings.deleteCloudNote}</p> : null}
      {confirming ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {target.linked ? t.settings.deleteCloudConfirmText : t.settings.deleteConfirmText}
          </p>
          <ErrorLine reason={failure} />
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={busy} onClick={run}>
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
export function DeleteAccountCard({ cloud, wipeLocal, onDone }: DeleteProps) {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<EraseFailure | null>(null);
  const target = useCloudTarget(cloud);
  // Sin cuenta en la nube no hay cuenta que eliminar. Para el dispositivo está Borrar mis datos
  if (!target.linked) return null;
  const confirmed = word.trim() === t.settings.accountDeleteWord;
  return (
    <Panel
      id="eliminar-cuenta-titulo"
      title={t.settings.accountDeleteTitle}
      description={t.settings.accountDeleteDescription}
    >
      <p className="text-sm text-fg-muted">{t.settings.accountDeletePayments}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmed || busy) return;
          setBusy(true);
          setFailure(null);
          void eraseAll(target, deleteCloudAccount, wipeLocal)
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
