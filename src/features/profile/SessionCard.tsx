// Tu sesión, al final de Perfil en Configuración (B3 del plan del cambio, comentario 6). Con qué
// alias y en qué dispositivo está abierta, la cuenta en la nube con su sincronización y Cerrar
// sesión. El alumno de la demostración no tiene sesión que cerrar (D-076).
import { Compass, LogOut } from 'lucide-react';
import { usePreferences } from '@/app/preferences';
import { deviceLabel } from '@/data/cloud/device';
import { requestTour } from '@/features/tour/tourRequest';
import { tourAvailable } from '@/features/tour/tourState';
import { t } from '@/i18n/es-MX';
import { tourTexts } from '@/i18n/tour';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import type { ReadySession } from '../shared/RequireSession';
import { CloudStatus } from './CloudStatus';

export function SessionCard({ session }: { session: ReadySession }) {
  const signOut = usePreferences((state) => state.signOut);
  const role = usePreferences((state) => state.role);
  const text = t.settingsPage.session;
  // Volver a ver el recorrido guiado. Lo ven los alumnos, con la bandera guidedTour prendida (B15, 4.6)
  const tour = tourAvailable(role);
  return (
    <Card aria-labelledby="sesion-titulo">
      <CardHeader>
        <CardTitle as="h3" id="sesion-titulo">
          {text.title}
        </CardTitle>
        <CardDescription>
          {session.isDemo ? text.demo : text.open(session.user.alias, deviceLabel())}
        </CardDescription>
      </CardHeader>
      {session.isDemo ? null : (
        <div className="flex flex-col gap-3">
          <CloudStatus />
          <Button variant="secondary" className="self-start" onClick={signOut}>
            <LogOut aria-hidden />
            {t.session.signOut}
          </Button>
        </div>
      )}
      {tour ? (
        <div
          role="group"
          aria-labelledby="recorrido-titulo"
          className={
            session.isDemo
              ? 'flex flex-col gap-2'
              : 'mt-3 flex flex-col gap-2 border-t border-line pt-3'
          }
        >
          <p id="recorrido-titulo" className="text-sm font-semibold text-fg">
            {tourTexts.settings.title}
          </p>
          <p className="text-sm text-fg-muted">{tourTexts.settings.description}</p>
          <Button variant="secondary" className="self-start" onClick={requestTour}>
            <Compass aria-hidden />
            {tourTexts.settings.button}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
