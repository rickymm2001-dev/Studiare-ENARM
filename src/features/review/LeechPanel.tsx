// Panel de sanguijuela (D-085, fila 8). Aparece justo después de olvidar una tarjeta que ya se olvidó
// muchas veces. Explica por qué conviene cambiarla, sugiere cómo según lo que revela su calidad y
// ofrece suspenderla o editarla. Nunca cambia el texto por su cuenta y seguir con ella siempre se puede.
import { BookOpen, Pencil, Pause, Play } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { LeechSuggestion } from '@/engines/leech';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Kbd, KeyHint } from '@/ui/components/key-hint';

export function LeechPanel({
  lapses,
  suggestions,
  canEdit,
  outlineId = null,
  busy,
  onSuspend,
  onEdit,
  onKeep,
}: {
  lapses: number;
  suggestions: readonly LeechSuggestion[];
  /** Solo las tarjetas del propio alumno se editan. Las precargadas no */
  canEdit: boolean;
  /** El apunte de donde sale la tarjeta. Esas tarjetas se editan en el apunte y no aquí */
  outlineId?: string | null;
  busy: boolean;
  onSuspend: () => void;
  onEdit: () => void;
  onKeep: () => void;
}) {
  const text = t.review.leech;
  return (
    <Card aria-labelledby="sanguijuela-titulo" className="w-full lg:max-w-reading">
      <CardHeader>
        <CardTitle id="sanguijuela-titulo">{text.title}</CardTitle>
        <CardDescription>{text.body(lapses)}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-sm font-semibold">{text.suggestionsTitle}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>{text.suggestions[suggestion]}</li>
            ))}
          </ul>
        </div>
        {canEdit ? null : (
          <p className="text-sm text-fg-muted">
            {outlineId ? t.outlines.fromOutline.leech : text.cannotEdit}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" aria-keyshortcuts="1" disabled={busy} onClick={onSuspend}>
            <Pause aria-hidden />
            {text.suspend}
          </Button>
          {canEdit ? (
            <Button variant="secondary" aria-keyshortcuts="2" disabled={busy} onClick={onEdit}>
              <Pencil aria-hidden />
              {text.edit}
            </Button>
          ) : null}
          {!canEdit && outlineId ? (
            <Button asChild variant="secondary" disabled={busy}>
              <Link to={`${screenPath('outlines')}?apunte=${outlineId}`}>
                <BookOpen aria-hidden />
                {t.outlines.fromOutline.open}
              </Link>
            </Button>
          ) : null}
          <Button aria-keyshortcuts="Space Enter" disabled={busy} onClick={onKeep}>
            <Play aria-hidden />
            {text.keep}
          </Button>
        </div>
        <KeyHint>
          <Kbd>1</Kbd> {text.keys.suspend}
          {canEdit ? (
            <>
              {' · '}
              <Kbd>2</Kbd> {text.keys.edit}
            </>
          ) : null}
          {' · '}
          <Kbd>{t.review.keys.space}</Kbd> {text.keys.keep}
        </KeyHint>
      </div>
    </Card>
  );
}
