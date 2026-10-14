// Party (pantalla 14). En la base de demostración, grupos con compañeros simulados que viven en este
// navegador. Con una cuenta real y la nube conectada, grupos reales con invitación por código o enlace,
// la tabla de la semana con alias y XP, retos y duelos entre alumnos (B7 del plan del cambio,
// respuestas 69 y 77). Sin nube solo explica que Party la necesita. La tarjeta para compartir y la de
// referidos van en todos los casos. El modo enfoque oculta la tabla, el XP y los retos (respuesta 82).
// En el plan Gratis grupos, tabla, retos y duelos quedan detrás de su candado con una vista previa, y
// siguen abiertas Comparte tu semana e Invita y gana un mes (respuesta 20 y 4.3, B8). Si el servidor
// cierra Party antes de que este navegador sepa que el plan cambió, se ve el mismo candado, sin la frase
// de lo que se comparte en un grupo.
import { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { useCloud } from '@/app/cloudState';
import { useFocusMode } from '@/app/focusMode';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SkeletonRows } from '@/ui/components/skeleton';
import { LoadingState } from '@/ui/states/states';
import { buildSnapshot } from '../home/snapshot';
import { FeatureGate } from '../shared/FeatureGate';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { AchievementShare } from './AchievementShare';
import { CloudParty } from './CloudParty';
import { DemoParty } from './DemoParty';
import { inviteStore, readInviteCode } from './inviteLink';
import { PartyLocked } from './PartyLocked';
import { partyModeOf, type PartyMode } from './partyMode';
import { ReferralCard } from './ReferralCard';

const text = t.partyCloud;

export function PartyScreen() {
  const location = useLocation();
  // El código del enlace de invitación se recuerda antes de pedir sesión, por si hay que entrar primero
  const [inviteCode] = useState(() =>
    readInviteCode(location.search, inviteStore(), new Date().getTime()),
  );
  return (
    <RequireSession screen="party">
      {(session) => <Party session={session} inviteCode={inviteCode} />}
    </RequireSession>
  );
}

function Party({ session, inviteCode }: { session: ReadySession; inviteCode: string | null }) {
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const cloudStatus = useCloud((store) => store.state.status);
  const focus = useFocusMode();
  const mode = partyModeOf(session.isDemo, cloudStatus);
  // El servidor contestó que Party ya no está abierta para la cuenta (PT001)
  const [closedByServer, setClosedByServer] = useState(false);
  const onClosed = useCallback(() => {
    setClosedByServer(true);
  }, []);

  const header = (
    <ScreenHeader title={t.screens.party.title} description={t.screens.party.description} />
  );
  if (events === undefined) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const snapshot = buildSnapshot({ events, user, settings, now: new Date() });
  const share = (
    <AchievementShare snapshot={snapshot} alias={user.alias} simulated={session.isDemo} />
  );
  const locked = (
    <>
      <PartyLocked />
      {share}
    </>
  );

  return (
    <>
      {header}
      <FeatureGate userId={user.id} feature="party" locked={locked}>
        {closedByServer ? (
          locked
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              {mode === 'demo' ? text.privacyDemo : text.privacy}
            </p>
            {focus ? <p className="text-sm font-medium">{text.focusNote}</p> : null}
            {share}
            {mode === 'demo' ? (
              <DemoParty
                session={session}
                events={events}
                snapshot={snapshot}
                focus={focus}
                inviteCode={inviteCode}
              />
            ) : mode === 'cloud' ? (
              <CloudParty
                session={session}
                events={events}
                snapshot={snapshot}
                focus={focus}
                inviteCode={inviteCode}
                onClosed={onClosed}
              />
            ) : (
              <PartyNeedsCloud mode={mode} />
            )}
          </>
        )}
      </FeatureGate>
      <ReferralCard />
    </>
  );
}

/** Sin la nube conectada no hay con quién formar un grupo. Una frase dice qué falta */
function PartyNeedsCloud({ mode }: { mode: Exclude<PartyMode, 'demo' | 'cloud'> }) {
  if (mode === 'checking') {
    return (
      <Card>
        <SkeletonRows label={text.needsCloud.checking} rows={2} />
      </Card>
    );
  }
  const body =
    mode === 'cloud_error'
      ? text.needsCloud.error
      : mode === 'signed_out'
        ? text.needsCloud.signedOut
        : text.needsCloud.off;
  return (
    <Card aria-labelledby="party-nube">
      <CardHeader>
        <CardTitle id="party-nube">{text.needsCloud.title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}
