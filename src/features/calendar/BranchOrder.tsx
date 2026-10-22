// Elegir las ramas del plan y su orden (V4-B10, fase 2). Una lista de casillas con botones para subir y
// bajar, que guarda al momento en settings.branches con el mismo mecanismo que los ajustes del repaso
// (updateProfile, que deja un settings_changed por el cambio). Sirve con teclado y con lector de
// pantalla, sin arrastrar nada. Después de mover una rama el foco se queda en su botón.
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDataApi } from '@/data/context';
import { updateProfile } from '@/data/usecases/profile';
import { calendarBranchesText as text } from '@/i18n/calendarBranches';
import { Button } from '@/ui/components/button';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField } from '@/ui/components/field';
import type { ReadySession } from '../shared/RequireSession';
import { branchChoices, chosenBranches, moveBranch, toggleBranch } from './branchOrder';

export function BranchOrder({
  session,
  branches,
}: {
  session: ReadySession;
  /** Las ramas que hay, con su clave y su nombre, en el orden de la taxonomía */
  branches: readonly { key: string; name: string }[];
}) {
  const api = useDataApi();
  const { user, settings } = session;
  const all = branches.map((branch) => branch.key);
  const nameOf = (key: string) => branches.find((branch) => branch.key === key)?.name ?? key;
  const choices = branchChoices(settings.branches, all);
  const chosen = chosenBranches(settings.branches, all);
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);
  // El botón que debe recibir el foco cuando la lista se reacomode con las ramas ya guardadas
  const pendingFocus = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    pendingFocus.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-focus-id="${id}"]`)?.focus();
  }, [settings.branches]);

  const save = (next: string[], focus: string | null) => {
    setStatus(null);
    pendingFocus.current = focus;
    updateProfile(api, user, { settings: { branches: next } }).then(
      () => {
        setStatus('saved');
      },
      () => {
        pendingFocus.current = null;
        setStatus('failed');
      },
    );
  };

  return (
    <Disclosure title={text.title} summary={text.summary(chosen.length)}>
      <p className="text-sm text-fg-muted">{text.hint}</p>
      <ul ref={listRef} aria-label={text.listLabel} className="flex flex-col gap-1">
        {choices.map((choice, index) => {
          const name = nameOf(choice.key);
          const last = chosen.length <= 1 && choice.included;
          return (
            <li key={choice.key} className="flex items-center gap-2">
              {choice.included ? (
                <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-fg-muted">
                  <span className="sr-only">{text.position(index + 1)}. </span>
                  <span aria-hidden>{index + 1}</span>
                </span>
              ) : (
                <span aria-hidden className="w-6 shrink-0" />
              )}
              <CheckboxField
                className="min-w-0 flex-1 items-center"
                label={name}
                checked={choice.included}
                disabled={last}
                onChange={() => {
                  save(toggleBranch(settings.branches, choice.key, all), null);
                }}
              />
              {choice.included ? (
                <span className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-touch min-w-touch px-0"
                    aria-label={text.moveUp(name)}
                    data-focus-id={`${choice.key}-up`}
                    disabled={index === 0}
                    onClick={() => {
                      save(moveBranch(settings.branches, choice.key, -1, all), `${choice.key}-up`);
                    }}
                  >
                    <ChevronUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-touch min-w-touch px-0"
                    aria-label={text.moveDown(name)}
                    data-focus-id={`${choice.key}-down`}
                    disabled={index === chosen.length - 1}
                    onClick={() => {
                      save(moveBranch(settings.branches, choice.key, 1, all), `${choice.key}-down`);
                    }}
                  >
                    <ChevronDown aria-hidden />
                  </Button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {chosen.length <= 1 ? <p className="text-sm text-fg-muted">{text.atLeastOne}</p> : null}
      <p role="status" className="min-h-5 text-sm text-fg-muted">
        {status === 'saved' ? text.saved : status === 'failed' ? text.saveFailed : ''}
      </p>
    </Disclosure>
  );
}
