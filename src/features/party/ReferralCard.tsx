// Invita y gana un mes (Fase P bloque 11, D-080, D-096, respuesta 77 y 4.3 del plan del cambio, B7).
// Muestra el enlace de invitación del alumno para compartirlo con el menú del teléfono, su código,
// cuántos referidos van y los meses gratis ganados, y deja canjear el código de quien lo invitó. Todo
// lo calcula y otorga el servidor, y el mes llega con el primer cobro del referido, así que sin la
// cuenta en la nube solo explica qué hace falta. Vive en Party y en Configuración, sección Perfil, y
// sigue abierta en el plan Gratis (4.3), así que nunca va detrás de un candado de plan.
import { Copy, Share2 } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { useCloud } from '@/app/cloudState';
import { getCloud } from '@/data/cloud/client';
import { clearPendingReferral, readPendingReferral } from '@/data/referrals/pendingReferral';
import {
  fetchReferralState,
  normalizeReferralCode,
  redeemReferralCode,
  type ReferralState,
} from '@/data/referrals/referrals';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import {
  browserLinkShareDeps,
  referralLinkHere,
  shareReferralLink,
  type LinkShareDeps,
  type LinkShareOutcome,
} from './referralLink';

const text = t.referrals;
const linkText = t.b7.referral;

const LINK_OUTCOMES: Record<LinkShareOutcome, string> = {
  shared: linkText.shared,
  copied: linkText.linkCopied,
  cancelled: '',
  failed: linkText.copyFailed,
};

export function ReferralCard({
  headingAs = 'h2',
  shareDeps,
}: {
  /** h3 dentro de una sección que ya tiene su h2, como Perfil en Configuración */
  headingAs?: 'h2' | 'h3';
  /** El navegador de verdad si no se indica */
  shareDeps?: LinkShareDeps;
}) {
  const linked = useCloud((store) => store.state.status === 'linked');
  const [state, setState] = useState<ReferralState | null | undefined>(undefined);
  // El código del enlace con el que llegó, si todavía no se canjeó solo
  const [code, setCode] = useState(() => readPendingReferral() ?? '');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkStatus, setLinkStatus] = useState('');

  useEffect(() => {
    if (!linked) return;
    const cloud = getCloud();
    if (!cloud) return;
    let stopped = false;
    void fetchReferralState(cloud).then((next) => {
      if (!stopped) setState(next);
    });
    return () => {
      stopped = true;
    };
  }, [linked]);

  const redeem = async (event: SyntheticEvent) => {
    event.preventDefault();
    const cloud = getCloud();
    if (!cloud || code.trim() === '') return;
    const result = await redeemReferralCode(cloud, code);
    // El código del enlace ya no hace falta canjearlo al conectar si ya se canjeó aquí o el servidor lo
    // rechazó
    if (
      result === 'ok' ||
      (result !== 'failed' && normalizeReferralCode(code) === readPendingReferral())
    ) {
      clearPendingReferral();
    }
    if (result === 'ok') {
      setMessage(text.redeemed);
      setCode('');
      setState(await fetchReferralState(cloud));
    } else {
      setMessage(text.results[result]);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const shareLink = async (link: string) => {
    setLinkStatus('');
    const outcome = await shareReferralLink(link, shareDeps ?? browserLinkShareDeps());
    setLinkStatus(LINK_OUTCOMES[outcome]);
  };

  return (
    <Card aria-labelledby="referidos-titulo">
      <CardHeader>
        <CardTitle as={headingAs} id="referidos-titulo">
          {linkText.title}
        </CardTitle>
        <CardDescription>{linkText.description}</CardDescription>
      </CardHeader>
      {!linked ? (
        <p className="text-sm text-fg-muted">{text.needsCloud}</p>
      ) : state === undefined ? null : state === null ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.loadFailed}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-fg-muted">{linkText.yourLink}</p>
            <p className="font-mono text-sm break-all" data-testid="referral-link">
              {referralLinkHere(state.code)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  void shareLink(referralLinkHere(state.code));
                }}
              >
                <Share2 aria-hidden />
                {linkText.share}
              </Button>
              <span role="status" className="text-sm text-fg-muted">
                {linkStatus}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-xs text-fg-muted">{text.yourCode}</p>
              <p
                className="font-mono text-2xl font-bold tracking-widest"
                data-testid="referral-code"
              >
                {state.code}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                void copy(state.code);
              }}
            >
              <Copy aria-hidden />
              {text.copy}
            </Button>
            <span role="status" className="text-sm text-fg-muted">
              {copied ? text.copied : ''}
            </span>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <li>{text.pending(state.summary.pending)}</li>
            <li>{text.completed(state.summary.completed)}</li>
            <li>{text.months(state.summary.monthsEarned)}</li>
          </ul>
          {state.summary.grantedUntil ? (
            <p className="text-sm">
              {text.until(new Date(state.summary.grantedUntil).toLocaleDateString('es-MX'))}
            </p>
          ) : null}
          <p className="text-xs text-fg-muted">{linkText.rule}</p>
          {state.summary.referredBy ? (
            <p className="text-sm text-fg-muted">{text.alreadyReferred}</p>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                void redeem(event);
              }}
            >
              <p className="font-semibold">{text.redeemTitle}</p>
              <TextField
                label={text.redeemLabel}
                value={code}
                maxLength={12}
                autoCapitalize="characters"
                onChange={(event) => {
                  setCode(event.target.value);
                }}
              />
              <Button type="submit" className="self-start" disabled={code.trim() === ''}>
                {text.redeem}
              </Button>
            </form>
          )}
          <p role="status" className="min-h-5 text-sm">
            {message}
          </p>
        </div>
      )}
    </Card>
  );
}
