// Salir de todos los grupos de la nube desde Party (B7 y B8 del plan del cambio). Lo ve quien todavía
// está en algún grupo, aunque su plan ya no incluya Party o no haya dado el permiso de Party, así nunca
// depende de un solo camino para irse. Las membresías se leen con party_export_mine y se sale con
// party_leave_all, que no piden Party abierta (20261021000001_free_plan_locks.sql). Sin la nube
// conectada no muestra nada.
import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCloud } from '@/app/cloudState';
import { getCloud } from '@/data/cloud/client';
import { fetchMyPartyExport } from '@/data/cloud/party';
import { stopSharingParty } from '@/data/usecases/partyCloud';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';

const text = t.partyCloud.consent;

export function LeaveAllGroups() {
  const linked = useCloud((store) => store.state.status === 'linked');
  const [stillIn, setStillIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const cloud = getCloud();
    if (!linked || !cloud) return;
    let stopped = false;
    void fetchMyPartyExport(cloud).then((reply) => {
      if (stopped || !reply.ok) return;
      setStillIn(reply.value.memberships.filter((item) => item.leftAt === null).length);
    });
    return () => {
      stopped = true;
    };
  }, [linked]);

  const leaveAll = async () => {
    const cloud = getCloud();
    if (!cloud) return;
    setBusy(true);
    const reply = await stopSharingParty(cloud);
    setBusy(false);
    if (reply.ok) {
      setStillIn(0);
      setMessage(text.leftAll);
    } else {
      setMessage(t.partyCloud.failures[reply.reason]);
    }
  };

  return (
    <>
      {stillIn > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{text.stillIn(stillIn)}</p>
          <Button
            variant="secondary"
            className="self-start"
            disabled={busy}
            onClick={() => {
              void leaveAll();
            }}
          >
            <LogOut aria-hidden />
            {text.leaveAll}
          </Button>
        </div>
      ) : null}
      <p role="status" className={message ? 'text-sm' : 'sr-only'}>
        {message}
      </p>
    </>
  );
}
