// Panel lateral para ver y editar una tarjeta sin perder la lista (B4 del plan del cambio).
import { Check, Edit3, Eye, Pause, Play, Save, X } from 'lucide-react';
import { useState } from 'react';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { CardHtml } from '../shared/CardHtml';
import { ControversySignal } from '../shared/ControversySignal';
import type { ExploreRow } from '@/engines/explore';
import type { CardFaces } from '../review/study';

function dueLabel(due: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(due));
}

export function SidePreviewPanel({
  card,
  faces,
  onClose,
  onSaveNote,
  onToggleSuspend,
  onVerify,
  timeZone,
}: {
  card: ExploreRow | null;
  faces: CardFaces | null;
  onClose: () => void;
  onSaveNote?: (noteId: string, front: string, back: string) => Promise<void>;
  onToggleSuspend?: (cardId: string, suspend: boolean) => Promise<void>;
  onVerify?: (noteId: string) => Promise<void>;
  timeZone: string;
}) {
  const [editing, setEditing] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  if (!card) {
    return (
      <aside
        aria-label={t.explore.sidePanel.title}
        className="flex flex-col items-center justify-center rounded-xl border border-line bg-surface p-6 text-center text-fg-muted"
      >
        <Eye className="mb-2 size-8 text-fg-muted/60" aria-hidden />
        <p className="text-sm font-medium">Selecciona una tarjeta para ver o editar sus detalles</p>
      </aside>
    );
  }

  const isPreloaded = card.origin === 'preloaded';
  const startEdit = () => {
    setFront(card.front);
    setBack(card.back);
    setEditing(true);
    setSavedNotice(false);
  };

  const handleSave = async () => {
    if (!onSaveNote) return;
    setSaving(true);
    try {
      await onSaveNote(card.noteId, front, back);
      setEditing(false);
      setSavedNotice(true);
      setTimeout(() => { setSavedNotice(false); }, 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside
      aria-label={t.explore.sidePanel.title}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">{t.explore.sidePanel.title}</h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {card.deckName ? <Badge variant="neutral">{card.deckName}</Badge> : null}
            {card.topic ? <Badge variant="info">{card.topic}</Badge> : null}
            {card.suspended ? (
              <Badge variant="warning">{t.explore.statusOne.suspended}</Badge>
            ) : null}
            {card.leech ? <Badge variant="danger">{t.explore.statusOne.leech}</Badge> : null}
            {card.fsrs === 'new' ? (
              <Badge variant="info">{t.explore.newCard}</Badge>
            ) : (
              <Badge variant="neutral">{t.explore.statuses[card.fsrs]}</Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={t.explore.sidePanel.close}
          className="size-8 p-0"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      {savedNotice ? (
        <div role="status" className="flex items-center gap-1.5 text-xs font-medium text-success">
          <Check className="size-4" aria-hidden />
          {t.explore.sidePanel.saved}
        </div>
      ) : null}

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="card-edit-front" className="text-xs font-semibold text-fg-muted">
              {t.explore.sidePanel.frontLabel}
            </label>
            <textarea
              id="card-edit-front"
              rows={3}
              value={front}
              onChange={(e) => { setFront(e.target.value); }}
              className="w-full rounded-md border border-line bg-surface p-2 text-sm focus:border-primary-strong focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="card-edit-back" className="text-xs font-semibold text-fg-muted">
              {t.explore.sidePanel.backLabel}
            </label>
            <textarea
              id="card-edit-back"
              rows={4}
              value={back}
              onChange={(e) => { setBack(e.target.value); }}
              className="w-full rounded-md border border-line bg-surface p-2 text-sm focus:border-primary-strong focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" type="submit" disabled={saving}>
              <Save className="size-4" aria-hidden />
              {saving ? 'Guardando…' : t.explore.sidePanel.save}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              disabled={saving}
              onClick={() => { setEditing(false); }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-line/60 bg-muted/20 p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {t.explore.front}
            </span>
            <div className="mt-1 text-sm font-medium">
              {faces ? <CardHtml html={faces.front} /> : card.front || t.explore.emptyFront}
            </div>
          </div>

          <div className="rounded-lg border border-line/60 bg-muted/20 p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {t.explore.back}
            </span>
            <div className="mt-1 text-sm text-fg-muted">
              {faces ? <CardHtml html={faces.back} /> : card.back || '—'}
            </div>
          </div>

          {card.controversy && onVerify ? (
            <ControversySignal
              controversy={card.controversy}
              onVerify={() => onVerify(card.noteId)}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-line/50 p-2 text-xs text-fg-muted">
            <div>
              <span className="font-semibold">{t.explore.table.due}:</span>{' '}
              {card.due ? dueLabel(card.due, timeZone) : '—'}
            </div>
            <div>
              <span className="font-semibold">{t.explore.table.interval}:</span>{' '}
              {card.interval ? `${card.interval} días` : '—'}
            </div>
            <div>
              <span className="font-semibold">{t.explore.table.lapses}:</span> {card.lapses}
            </div>
            <div>
              <span className="font-semibold">Origen:</span>{' '}
              {isPreloaded ? t.explore.preloaded : 'Propia'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
            {!isPreloaded && onSaveNote ? (
              <Button size="sm" variant="secondary" onClick={startEdit}>
                <Edit3 className="size-4" aria-hidden />
                {t.explore.sidePanel.edit}
              </Button>
            ) : (
              <span className="text-xs text-fg-muted">{t.explore.sidePanel.readOnly}</span>
            )}

            {onToggleSuspend ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void onToggleSuspend(card.cardId, !card.suspended)}
              >
                {card.suspended ? (
                  <>
                    <Play className="size-4" aria-hidden />
                    {t.explore.actions.unsuspend}
                  </>
                ) : (
                  <>
                    <Pause className="size-4" aria-hidden />
                    {t.explore.actions.suspend}
                  </>
                )}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
}
