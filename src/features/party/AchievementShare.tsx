// Comparte tu semana (respuesta 83 del plan del cambio, B7). Antes era Comparte tu logro (9.6) y ahora
// es el resumen de la semana del propio alumno, con días de estudio, repasos, preguntas y racha. Se
// comparte como imagen con el menú de compartir del teléfono o se descarga. Nada sale de aquí hasta que
// el alumno toca el botón, el alias solo va si él lo pide y en modo enfoque la racha no va. El nombre
// y las propiedades del componente no cambiaron, para que Party lo siga usando igual.
import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { useFocusMode } from '@/app/focusMode';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import {
  buildWeekShare,
  weekShareFigures,
  weekShareLabel,
  type WeekShareCard,
  type WeekShareSource,
} from './achievement';
import { drawWeekShare } from './drawAchievement';
import { browserShareDeps, shareWeek, type ShareDeps, type ShareOutcome } from './shareAchievement';

export function AchievementShare({
  snapshot,
  alias,
  simulated,
  render = drawWeekShare,
  deps,
}: {
  /** La instantánea del alumno. Del resumen solo se leen hoy, la actividad por día y la racha */
  snapshot: WeekShareSource;
  alias: string;
  /** La cuenta es de demostración y la imagen lo dice */
  simulated: boolean;
  /** Dibuja la imagen. Las pruebas ponen uno propio porque jsdom no tiene canvas */
  render?: (card: WeekShareCard) => Promise<Blob>;
  /** El navegador de verdad si no se indica */
  deps?: ShareDeps;
}) {
  const text = t.b7.weekShare;
  const focus = useFocusMode();
  const [includeAlias, setIncludeAlias] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const card = buildWeekShare({
    snapshot,
    alias: includeAlias ? alias : null,
    simulated,
    includeStreak: !focus,
  });

  const share = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await shareWeek(card, render, deps ?? browserShareDeps()));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="compartir-semana" className="@container">
      <CardHeader className="mb-3">
        <CardTitle id="compartir-semana">{text.title}</CardTitle>
        <CardDescription>{focus ? text.hintFocus : text.hint}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 @xl:flex-row @xl:items-start">
        <WeekSharePreview card={card} />
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

/**
 * La misma imagen que se comparte, en HTML. Los colores son fijos, como en la imagen, así se ve igual
 * en claro y en oscuro. Cada cifra va con su etiqueta en una lista de definiciones para el lector de
 * pantalla, con el número arriba a la vista
 */
function WeekSharePreview({ card }: { card: WeekShareCard }) {
  const text = t.b7.weekShare;
  const figures = weekShareFigures(card);
  return (
    <figure
      aria-label={text.previewLabel}
      className="flex w-full max-w-xs shrink-0 flex-col overflow-hidden rounded-lg border border-[#ddd6c9] bg-white text-[#16212b]"
    >
      <div className="flex flex-col gap-0.5 bg-[#156082] px-4 pt-3 pb-4 text-white">
        <p className="text-xs font-bold text-white/85">{card.brand}</p>
        <p className="text-lg font-bold">{text.heading}</p>
        <p className="text-xs text-white/85">{weekShareLabel(card)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 p-3">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={cn(
              'flex flex-col-reverse gap-0.5 rounded-md border border-[#ddd6c9] bg-[#f6f3ee] px-3 py-2',
              figures.length % 2 === 1 && index === 0 && 'col-span-2',
            )}
          >
            <dt className="text-xs font-semibold text-[#576570]">{figure.label}</dt>
            <dd className="text-xl font-bold">{figure.value}</dd>
          </div>
        ))}
      </dl>
      {card.alias ? <p className="px-4 pb-3 font-semibold">{card.alias}</p> : null}
      {card.simulated ? (
        <figcaption className="bg-[#eeeae2] px-3 py-2 text-center text-xs font-bold text-[#3f4b55]">
          {text.simulatedBanner}
        </figcaption>
      ) : null}
    </figure>
  );
}
