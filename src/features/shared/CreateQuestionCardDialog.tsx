// Diálogo para crear una tarjeta a partir de una pregunta (D-124, comentario 1).
// Permite elegir el mazo destino (mazos propios, precargados que sigue o crear uno nuevo),
// previsualizar y editar el frente y reverso armados con el texto del banco sin IA,
// y guardar la tarjeta en la capa del alumno de forma idempotente.
import { BookOpen, Check, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import type { Option, Question } from '@/data/schemas/bank';
import { isEditableDeck, isLive } from '@/data/schemas/decks';
import { createManualDeck } from '@/data/usecases/manualDecks';
import {
  createCardFromQuestion,
  defaultQuestionBack,
  defaultQuestionFront,
} from '@/data/usecases/questionCard';
import { useDeckCatalog } from '@/features/decks/useDeckCatalog';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SelectField, TextAreaField, TextField } from '@/ui/components/field';

export interface CreateQuestionCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: Pick<Question, 'id' | 'prompt' | 'explanation' | 'topic' | 'gpcRefs'>;
  questionVersionId: string;
  vignette?: string;
  options: readonly Pick<Option, 'id' | 'text' | 'isCorrect' | 'rationale'>[];
  onCardCreated?: (result: { cardId: string; deckId: string }) => void;
}

export function CreateQuestionCardDialog({
  open,
  onOpenChange,
  question,
  questionVersionId,
  vignette,
  options,
  onCardCreated,
}: CreateQuestionCardDialogProps) {
  const api = useDataApi();
  const session = useSession();
  const catalog = useDeckCatalog();

  const [availableDecks, setAvailableDecks] = useState<{ id: string; name: string }[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [newDeckName, setNewDeckName] = useState('Nuevo mazo');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const user = session.status === 'ready' ? session.user : null;

  useEffect(() => {
    if (!open) {
      setSaved(false);
      return;
    }
    const defFront = defaultQuestionFront(question.prompt, vignette);
    const defBack = defaultQuestionBack(options, question.explanation, question.gpcRefs);
    setFront(defFront);
    setBack(defBack);
    setSaved(false);

    // Cargar mazos editables y precargados
    void api.repos.decks.list().then((decks) => {
      const items: { id: string; name: string }[] = [];
      const ownDecks = decks.filter(
        (d) => user && isEditableDeck(d, user.id) && isLive(d) && !d.parentId,
      );
      for (const d of ownDecks) {
        items.push({ id: d.id, name: d.name });
      }

      // Mazos precargados seguidos o disponibles
      const preloadedDecks = decks.filter(
        (d) => d.origin === 'preloaded' && !d.parentId && isLive(d),
      );
      for (const d of preloadedDecks) {
        items.push({ id: d.id, name: `${d.name} (precargado)` });
      }

      // Si no hay mazos precargados en Dexie pero están en el catálogo, agregarlos
      if (catalog) {
        for (const file of catalog) {
          if (!items.some((item) => item.name.includes(file.name))) {
            const found = decks.find((d) => d.name === file.name);
            if (found) {
              items.push({ id: found.id, name: `${found.name} (precargado)` });
            }
          }
        }
      }

      // Opción de nuevo mazo al final
      items.push({ id: '__new__', name: '+ Crear nuevo mazo' });

      setAvailableDecks(items);
      const first = items[0];
      if (first && !selectedDeckId) {
        setSelectedDeckId(first.id);
      }
    });
  }, [open, question, vignette, options, api, user, catalog, selectedDeckId]);

  if (!user) return null;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let targetDeckId = selectedDeckId;
      if (targetDeckId === '__new__') {
        const createdDeck = await createManualDeck(api, user, {
          name: newDeckName.trim() || 'Nuevo mazo',
        });
        targetDeckId = createdDeck.id;
      }

      const res = await createCardFromQuestion(api, user, {
        question,
        questionVersionId,
        vignette,
        options,
        destinationDeckId: targetDeckId,
        customFront: front,
        customBack: back,
      });

      setSaved(true);
      onCardCreated?.({ cardId: res.card.id, deckId: res.effectiveDeckId });
      setTimeout(() => {
        onOpenChange(false);
      }, 700);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="animate-rise fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-raised">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Dialog.Title className="flex items-center gap-2 text-xl font-bold">
                <BookOpen aria-hidden className="size-5 text-accent" />
                {t.review.createCard}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-fg-muted">
                Guarda esta pregunta como tarjeta de repaso con el texto del banco.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted"
              aria-label="Cerrar"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-3">
            <SelectField
              label="Mazo destino"
              value={selectedDeckId}
              options={availableDecks.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(e) => {
                setSelectedDeckId(e.target.value);
              }}
            />

            {selectedDeckId === '__new__' ? (
              <TextField
                label="Nombre del nuevo mazo"
                value={newDeckName}
                onChange={(e) => {
                  setNewDeckName(e.target.value);
                }}
                autoFocus
              />
            ) : null}

            <TextAreaField
              label="Frente (caso y pregunta)"
              value={front}
              rows={4}
              onChange={(e) => {
                setFront(e.target.value);
              }}
            />

            <TextAreaField
              label="Reverso (respuesta correcta, explicación y referencias)"
              value={back}
              rows={6}
              onChange={(e) => {
                setBack(e.target.value);
              }}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || saved}>
              {saved ? (
                <>
                  <Check aria-hidden className="size-4" />
                  {t.review.cardCreated}
                </>
              ) : (
                <>
                  <Plus aria-hidden className="size-4" />
                  {saving ? 'Guardando…' : 'Guardar tarjeta'}
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
