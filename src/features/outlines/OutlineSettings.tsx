// Mazo y tema de un apunte abierto (B6 del plan del cambio, respuesta 74). El alumno elige el mazo
// de sus tarjetas, uno suyo o el automático que cuelga de Apuntes, y su tema, uno del ENARM o una
// materia libre. Guardar pasa todas las tarjetas del apunte a ese mazo con la etiqueta de ese tema.
// Si el mazo del apunte se borró, la sección sale abierta y avisa. Si otra ventana cambió el apunte,
// no se guarda y la pantalla muestra el mismo aviso que el editor.
import { useMemo, useState } from 'react';
import type { Deck } from '@/data/schemas/decks';
import type { Outline } from '@/data/schemas/outlines';
import { isAutomaticOutlineDeck, type OutlineDeckChoice } from '@/data/usecases/outlines';
import type { OutlineSubject } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField } from '@/ui/components/field';
import { ownDeckOptions } from './outlineNav';
import { SubjectFields } from './SubjectFields';
import { draftOf, subjectLabel, subjectOf, type SubjectDraft } from './subjectDraft';

/** El valor del selector para el mazo automático nuevo */
const AUTOMATIC = 'automatico';

/** Cómo terminó guardar el mazo y el tema. conflict es que otra ventana cambió el apunte */
export type SettingsResult = 'saved' | 'failed' | 'conflict';

export function OutlineSettings({
  outline,
  decks,
  userId,
  suggestions,
  busy,
  onSave,
}: {
  outline: Outline;
  decks: readonly Deck[];
  userId: string;
  suggestions: readonly string[];
  busy: boolean;
  /** Guarda el mazo y el tema. Devuelve cómo terminó */
  onSave: (deck: OutlineDeckChoice, subject: OutlineSubject | null) => Promise<SettingsResult>;
}) {
  const text = t.outlines;
  const deck = decks.find((entry) => entry.id === outline.deckId);
  const automatic = isAutomaticOutlineDeck(decks, outline.deckId, { id: userId });
  const options = useMemo(() => {
    const own = ownDeckOptions(decks, userId);
    // Si el apunte no está en un mazo automático, se puede pedir uno nuevo con su título
    const extra = automatic ? [] : [{ value: AUTOMATIC, label: text.form.deckAutomatic }];
    const missing = deck ? [] : [{ value: '', label: '—' }];
    return [...missing, ...own, ...extra];
  }, [decks, userId, automatic, deck, text.form.deckAutomatic]);

  const [deckValue, setDeckValue] = useState(deck ? deck.id : '');
  const [subject, setSubject] = useState<SubjectDraft>(() => draftOf(outline.subject));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SettingsResult | null>(null);
  // Cuando el apunte cambia de mazo, como al pedir uno automático nuevo, el selector lo sigue
  const [seenDeck, setSeenDeck] = useState(outline.deckId);
  if (seenDeck !== outline.deckId) {
    setSeenDeck(outline.deckId);
    setDeckValue(deck ? deck.id : '');
  }

  const save = async () => {
    const chosen = subjectOf(subject);
    if (!chosen.ok) {
      setError(chosen.error);
      return;
    }
    if (deckValue === '') return;
    setError(null);
    setDone(null);
    const choice: OutlineDeckChoice =
      deckValue === AUTOMATIC ? { kind: 'automatic' } : { kind: 'deck', deckId: deckValue };
    setDone(await onSave(choice, chosen.subject));
  };

  const deckName = deck
    ? (options.find((entry) => entry.value === deck.id)?.label ?? deck.name)
    : '—';

  return (
    <Disclosure
      title={text.settings.title}
      summary={`${deckName} · ${subjectLabel(outline.subject)}`}
      // Con el mazo en su lugar queda plegado. Si el mazo ya no existe sale abierto
      defaultOpen={!deck}
    >
      <SelectField
        label={text.editor.deckLabel}
        value={deckValue}
        options={options}
        onChange={(event) => {
          setDeckValue(event.target.value);
          setDone(null);
        }}
      />
      <SubjectFields
        value={subject}
        onChange={(next) => {
          setSubject(next);
          setError(null);
          setDone(null);
        }}
        suggestions={suggestions}
        error={error}
      />
      <Button
        type="button"
        variant="secondary"
        className="self-start"
        disabled={busy || deckValue === ''}
        onClick={() => {
          void save();
        }}
      >
        {busy ? text.settings.saving : text.settings.save}
      </Button>
      {done ? (
        <p
          // El choque con otra ventana ya lo anuncia el aviso de la pantalla, aquí solo se recuerda
          role={done === 'failed' ? 'alert' : 'status'}
          className={done === 'saved' ? 'text-sm text-fg-muted' : 'text-sm text-danger'}
        >
          {text.settings[done]}
        </p>
      ) : null}
    </Disclosure>
  );
}
