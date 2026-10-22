// Exportar mis datos, borrar mis datos y eliminar mi cuenta, en Privacidad de Configuración (4.5,
// D-101, B3 del plan del cambio). Venía de la pestaña Cuenta.
import { Download } from 'lucide-react';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { loadCloud } from '@/data/cloud/client';
import { fetchReminderPrefs } from '@/data/cloud/reminders';
import { useDataApi } from '@/data/context';
import {
  exportUserData,
  type PartyCloudExport,
  type RemindersCloudExport,
} from '@/data/usecases/exportData';
import { exportMyPartyData } from '@/data/usecases/partyCloud';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { clearExamState } from '../exam/examStorage';
import { DeleteAccountCard, DeleteDataCard } from '../profile/DeleteCards';
import type { ReadySession } from '../shared/RequireSession';

export function DataSection({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { deleteAllData } = api;
  const { user } = session;
  const signOut = usePreferences((state) => state.signOut);
  const cloudStatus = useCloud((store) => store.state.status);
  // Lo de Party vive solo en la nube (B7). Se pide con la cuenta real conectada, nunca en la demostración
  const partyCloud = async (): Promise<PartyCloudExport | null> => {
    if (session.isDemo || cloudStatus !== 'linked') return null;
    const cloud = await loadCloud();
    return cloud ? exportMyPartyData(cloud) : { status: 'unavailable', reason: 'network' };
  };
  // Los recordatorios por correo (B15) también viven en la nube, con la misma regla
  const remindersCloud = async (): Promise<RemindersCloudExport | null> => {
    if (session.isDemo || cloudStatus !== 'linked') return null;
    const cloud = await loadCloud();
    const prefs = cloud ? await fetchReminderPrefs(cloud) : null;
    return prefs ? { status: 'included', data: prefs } : { status: 'unavailable' };
  };
  // El examen en curso vive en el navegador y no en la base, así que se borra aparte. Hay que leer
  // los perfiles antes, porque con la base borrada ya no se sabe de quién eran
  const wipeLocal = async () => {
    if (!deleteAllData) return;
    const users = await api.repos.users.list();
    await deleteAllData();
    for (const { id } of users) clearExamState(id);
  };
  return (
    <>
      <Card aria-labelledby="exportar-titulo">
        <CardHeader>
          <CardTitle as="h3" id="exportar-titulo">
            {t.settings.exportTitle}
          </CardTitle>
          <CardDescription>{t.settings.exportDescription}</CardDescription>
        </CardHeader>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            void exportUserData(api.repos, user.id, { partyCloud, remindersCloud }).then((data) => {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `mis-datos-${user.alias}.json`;
              link.click();
              URL.revokeObjectURL(url);
            });
          }}
        >
          <Download aria-hidden />
          {t.settings.export}
        </Button>
      </Card>
      {deleteAllData ? (
        <>
          <DeleteDataCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={signOut} />
          <DeleteAccountCard loadCloud={loadCloud} wipeLocal={wipeLocal} onDone={signOut} />
        </>
      ) : null}
    </>
  );
}
