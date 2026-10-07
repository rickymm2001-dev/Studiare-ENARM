// Atajos de teclado de una pantalla de estudio (D-087). Con el teclado el alumno no mueve el ratón
// entre las opciones y el botón de responder. Los atajos no se activan al escribir en un campo, con
// Ctrl, Alt o Cmd, ni cuando el foco está en un botón y la tecla es Enter o Espacio, que ya lo
// activan por sí solas.
import { useEffect, useEffectEvent } from 'react';

/** Nombre de la tecla para los atajos. Letras en minúscula y Mayús con la letra como shift+a */
export function shortcutKey(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): string {
  if (event.key === ' ') return 'space';
  const base = event.key.toLowerCase();
  return event.shiftKey && /^[a-z]$/.test(base) ? `shift+${base}` : base;
}

const EDITABLE =
  'input:not([type=radio]):not([type=checkbox]), textarea, select, [contenteditable]';

/** El foco está en algo donde la persona escribe o que ya reacciona a esta tecla */
function ignoresKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(EDITABLE)) return true;
  const pressesButton = key === 'enter' || key === 'space';
  return pressesButton && Boolean(target.closest('button, a[href], summary'));
}

export type ShortcutBindings = Readonly<Record<string, () => void>>;

/** Atajos activos mientras enabled sea true. Las teclas son las de shortcutKey */
export function useShortcuts(bindings: ShortcutBindings, enabled = true): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = shortcutKey(event);
    const action = bindings[key];
    if (!action || ignoresKey(event.target, key)) return;
    // Mantener una tecla apretada no repite la acción, por ejemplo calificar dos tarjetas seguidas
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    action();
  });
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      handle(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, [enabled]);
}
