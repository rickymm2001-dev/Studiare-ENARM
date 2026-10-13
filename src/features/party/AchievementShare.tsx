// Compartir un logro (9.6). Una tarjeta con el nivel, la racha y los XP de la semana del propio
// alumno, que se comparte como imagen con el menú del sistema o se descarga. Nada sale de aquí hasta
// que el alumno toca el botón, y el alias solo va si él lo pide.
import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import type { Snapshot } from '../home/snapshot';
import { buildAchievement, type AchievementCard } from './achievement';
import { drawAchievement } from './drawAchievement';
import {
  browserShareDeps,
  shareAchievement,
  type ShareDeps,
  type ShareOutcome,
} from './shareAchievement';

export function AchievementShare({
  snapshot,
  alias,
  simulated,
  render = drawAchievement,
  deps,
}: {
  snapshot: Pick<Snapshot, 'level' | 'streak' | 'weeklyXp'>;
  alias: string;
  /** La cuenta es de demostración y la tarjeta lo dice */
  simulated: boolean;
  /** Dibuja la imagen. Las pruebas ponen uno propio porque jsdom no tiene canvas */
  render?: (card: AchievementCard) => Promise<Blob>;
  /** El navegador de verdad si no se indica */
  deps?: ShareDeps;
}) {
  const text = t.party.share;
  const [includeAlias, setIncludeAlias] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const card = buildAchievement({ snapshot, alias: includeAlias ? alias : null, simulated });

  const share = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await shareAchievement(card, render, deps ?? browserShareDeps()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="compartir-logro">
      <CardHeader className="mb-3">
        <CardTitle id="compartir-logro">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <AchievementPreview card={card} />
        <div className="flex flex-1 flex-col gap-3">
          <CheckboxField
            label={text.includeAlias}
            checked={includeAlias}
            onChange={(event) => {
              setIncludeAlias(event.target.checked);
              setOutcome(null);
            }}
          />
          <Button
            className="self-start"
            disabled={busy}
            onClick={() => {
              void share();
            }}
          >
            <Share2 aria-hidden />
            {busy ? text.working : text.button}
          </Button>
          {outcome ? (
            <p role="status" className="text-sm">
              {text.outcomes[outcome]}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** La misma tarjeta que se comparte, en HTML. Los colores son fijos, como en la imagen */
function AchievementPreview({ card }: { card: AchievementCard }) {
  const text = t.party.share;
  return (
    <figure
      aria-label={text.previewLabel}
      className="flex w-full max-w-xs shrink-0 flex-col overflow-hidden rounded-lg bg-[#156082] text-white"
    >
      <div className="flex flex-col items-center gap-1 px-5 pt-4 pb-5">
        <p className="self-start text-sm font-bold text-white/85">{card.brand}</p>
        <p
          aria-hidden
          className="mt-2 flex size-24 items-center justify-center rounded-full bg-white text-5xl font-bold text-[#156082]"
        >
          {card.level}
        </p>
        <p className="mt-2 text-2xl font-bold">{card.levelTitle}</p>
        <p className="text-sm text-white/85">{text.level(card.level)}</p>
        <div className="mt-3 grid w-full grid-cols-2 gap-2 text-center">
          <p className="rounded-md bg-black/25 px-2 py-2">
            <span className="block text-xs text-white/85">{text.streakLabel}</span>
            <span className="block text-lg font-bold">{text.streakValue(card.streak)}</span>
          </p>
          <p className="rounded-md bg-black/25 px-2 py-2">
            <span className="block text-xs text-white/85">{text.xpLabel}</span>
            <span className="block text-lg font-bold">{card.weeklyXp.toLocaleString('es-MX')}</span>
          </p>
        </div>
        {card.alias ? <p className="mt-2 font-semibold">{card.alias}</p> : null}
      </div>
      {card.simulated ? (
        <figcaption className="bg-[#eef0f2] px-3 py-2 text-center text-xs font-bold text-[#3f4b55]">
          {text.simulatedBanner}
        </figcaption>
      ) : null}
    </figure>
  );
}
