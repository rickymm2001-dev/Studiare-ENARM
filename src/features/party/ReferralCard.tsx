// Referidos dentro de Party (Fase P bloque 11, D-080, D-096). Muestra el código del alumno, cuántos
// referidos van y los meses gratis ganados, y deja canjear el código de quien lo invitó. Todo lo
// calcula y otorga el servidor, así que sin la cuenta en la nube solo explica qué hace falta.
import { Copy } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { useCloud } from '@/app/cloudState';
import { getCloud } from '@/data/cloud/client';
import {
  fetchReferralState,
  redeemReferralCode,
  type ReferralState,
} from '@/data/referrals/referrals';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';

const text = t.referrals;

export function ReferralCard() {
  const linked = useCloud((store) => store.state.status === 'linked');
  const [state, setState] = useState<ReferralState | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

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

  return (
    <Card aria-labelledby="referidos-titulo">
      <CardHeader>
        <CardTitle id="referidos-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      {!linked ? (
        <p className="text-sm text-fg-muted">{text.needsCloud}</p>
      ) : state === undefined ? null : state === null ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.loadFailed}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
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
          <p className="text-xs text-fg-muted">{text.rule}</p>
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
