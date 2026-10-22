// El globo del recorrido guiado y su fondo (B15, 4.3 y 4.4 del plan de B15). Es un diálogo modal de Radix,
// así que atrapa el foco, esconde el resto de la página a los lectores de pantalla y no deja que un clic
// fuera haga nada. Cada paso es un diálogo nuevo (Tour.tsx le pone key), con el foco en el título, que lleva
// el contador "Paso 3 de 8" para que el lector lo diga. Escape salta la introducción y las flechas cambian
// de paso. El fondo oscurece con los cuatro rectángulos del diálogo de siempre (bg-black/50) y deja sin
// oscurecer el elemento señalado, con un borde del token indicator. Es decorativo y va con aria-hidden. No
// hay animaciones ni desplazamiento suave, así que respeta prefers-reduced-motion sin más.
//
// Tres formas, según el ancho y si hay elemento señalado
//   - sheet. En menos de 640 px, una hoja abajo a todo lo ancho, encima de la barra de navegación para no
//     taparla, porque lo que se señala vive ahí
//   - anchored. Con elemento, junto a él (placement.ts)
//   - center. Sin elemento, al centro. Es la bienvenida y también lo que pasa si el ancla no aparece
import { Dialog } from 'radix-ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { tourTexts } from '@/i18n/tour';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { placeBalloon, type Rect, type Size } from './placement';
import { TOUR_STEPS } from './steps';
import { progressOf, type NavLayout } from './tourMachine';

/** Aire entre el elemento señalado y su borde de resalte */
const HIGHLIGHT_PADDING = 4;

export interface TourOverlayProps {
  /** El paso, de 0 a 7 */
  index: number;
  /** El elemento que señala, o null si el paso va al centro */
  target: HTMLElement | null;
  /** El menú que se ve. En el riel el globo va a la derecha del elemento y en la barra, encima */
  layout: NavLayout;
  /** Menos de 640 px. El globo es una hoja abajo a todo lo ancho */
  phone: boolean;
  onNext: () => void;
  onBack: () => void;
  /** Saltar introducción, y también Escape */
  onSkip: () => void;
}

// ===================================================================== Dónde está el elemento

/** Las medidas de la ventana y del elemento en una sola cadena, para que React sepa cuándo cambiaron */
function measureKey(target: HTMLElement | null): string {
  const view = `${String(window.innerWidth)}x${String(window.innerHeight)}`;
  if (target?.isConnected !== true) return view;
  const box = target.getBoundingClientRect();
  const edges = [box.left, box.top, box.width, box.height].map((edge) => String(Math.round(edge)));
  return [view, ...edges].join(',');
}

function parseMeasure(key: string): { viewport: Size; box: Rect | null } {
  const [view = '0x0', ...rest] = key.split(',');
  const [width = 0, height = 0] = view.split('x').map(Number);
  const [left = 0, top = 0, boxWidth = 0, boxHeight = 0] = rest.map(Number);
  const box =
    boxWidth > 0 && boxHeight > 0 ? { left, top, width: boxWidth, height: boxHeight } : null;
  return { viewport: { width, height }, box };
}

/**
 * Dónde está el elemento señalado y qué tan grande es la ventana, al día cuando la ventana cambia de
 * tamaño, la página se desplaza o el elemento se mueve. Un repaso cada medio segundo atrapa lo que no
 * avisa, como una letra que termina de cargar
 */
function useTargetBox(target: HTMLElement | null) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      window.addEventListener('resize', onChange);
      window.addEventListener('scroll', onChange, true);
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onChange);
      if (target) observer?.observe(target);
      const timer = window.setInterval(onChange, 500);
      return () => {
        window.removeEventListener('resize', onChange);
        window.removeEventListener('scroll', onChange, true);
        observer?.disconnect();
        window.clearInterval(timer);
      };
    },
    [target],
  );
  const key = useSyncExternalStore(
    subscribe,
    () => measureKey(target),
    () => '0x0',
  );
  return parseMeasure(key);
}

/** Cuánto mide el globo, para colocarlo sin que se salga. null mientras no se ha pintado */
function useBoxSize(element: HTMLElement | null): Size | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!element || typeof ResizeObserver === 'undefined') return () => undefined;
      const observer = new ResizeObserver(onChange);
      observer.observe(element);
      return () => {
        observer.disconnect();
      };
    },
    [element],
  );
  const key = useSyncExternalStore(
    subscribe,
    () => {
      if (!element) return '';
      const box = element.getBoundingClientRect();
      return `${String(Math.round(box.width))}x${String(Math.round(box.height))}`;
    },
    () => '',
  );
  if (key === '') return null;
  const [width = 0, height = 0] = key.split('x').map(Number);
  return { width, height };
}

// ===================================================================== Fondo

/**
 * Los cuatro rectángulos que oscurecen todo menos el elemento, y el borde que lo resalta. Sin elemento es
 * un solo rectángulo. Decorativo, sin nada que se pueda enfocar
 */
function Backdrop({ hole }: { hole: Rect | null }) {
  const dim = 'absolute bg-black/50';
  if (hole === null) return <div className={cn(dim, 'inset-0')} />;
  const top = Math.max(0, hole.top);
  const left = Math.max(0, hole.left);
  const bottom = Math.max(0, hole.top + hole.height);
  const right = Math.max(0, hole.left + hole.width);
  return (
    <>
      <div className={cn(dim, 'inset-x-0 top-0')} style={{ height: top }} />
      <div className={cn(dim, 'inset-x-0 bottom-0')} style={{ top: bottom }} />
      <div className={cn(dim, 'left-0')} style={{ top, height: bottom - top, width: left }} />
      <div className={cn(dim, 'right-0')} style={{ top, height: bottom - top, left: right }} />
      <div
        data-tour-hole
        className="absolute rounded-md border-2 border-indicator"
        style={{ top, left, width: right - left, height: bottom - top }}
      />
    </>
  );
}

// ===================================================================== Globo

export function TourOverlay({
  index,
  target,
  layout,
  phone,
  onNext,
  onBack,
  onSkip,
}: TourOverlayProps) {
  const step = TOUR_STEPS[index] ?? TOUR_STEPS[0];
  const text = tourTexts.steps[step];
  const { number, total, canGoBack, isLast } = progressOf(index);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const [balloon, setBalloon] = useState<HTMLDivElement | null>(null);
  const { viewport, box } = useTargetBox(target);
  const size = useBoxSize(balloon);

  // El recuadro de resalte, con un poco de aire alrededor del elemento
  const hole: Rect | null = box && {
    left: box.left - HIGHLIGHT_PADDING,
    top: box.top - HIGHLIGHT_PADDING,
    width: box.width + HIGHLIGHT_PADDING * 2,
    height: box.height + HIGHLIGHT_PADDING * 2,
  };
  const mode = phone ? 'sheet' : hole ? 'anchored' : 'center';
  const placement =
    mode === 'anchored' && hole && size
      ? placeBalloon({
          target: hole,
          size,
          viewport,
          prefer: layout === 'rail' ? 'right' : 'top',
          // Junto al riel el globo cuelga desde el borde de arriba del elemento y no tapa el título
          align: 'start',
        })
      : null;
  // Mientras no se mide el globo queda sin verse, pero en su lugar, para que pueda recibir el foco
  const anchoredStyle: CSSProperties = placement
    ? { left: placement.left, top: placement.top }
    : { left: 0, top: 0, opacity: 0 };

  // El foco va al título al abrir cada paso. Tour.tsx abre un diálogo nuevo por paso, y esto cubre que el
  // mismo diálogo cambie de paso
  useEffect(() => {
    titleRef.current?.focus();
  }, [index]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' && !isLast) {
      event.preventDefault();
      onNext();
    } else if (event.key === 'ArrowLeft' && canGoBack) {
      event.preventDefault();
      onBack();
    }
  };

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        {/* El fondo es del diálogo para que bloquee los clics y el desplazamiento de la página. Es solo
            decorativo, así que los lectores de pantalla lo ignoran */}
        <Dialog.Overlay aria-hidden data-tour-backdrop className="fixed inset-0 z-40">
          <Backdrop hole={hole} />
        </Dialog.Overlay>
        <Dialog.Content
          ref={setBalloon}
          aria-modal="true"
          data-tour-mode={mode}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
          // El foco lo lleva Tour.tsx al título de Inicio al terminar
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onSkip();
          }}
          // Un clic fuera no hace nada, para no saltar la introducción por accidente
          onPointerDownOutside={(event) => {
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
          onKeyDown={onKeyDown}
          style={mode === 'anchored' ? anchoredStyle : undefined}
          className={cn(
            'fixed z-50 flex flex-col gap-3 overflow-y-auto border border-line bg-surface p-4 text-fg shadow-raised outline-none',
            // La hoja flota encima de la barra de abajo, que es lo que señala en el teléfono
            mode === 'sheet' &&
              'inset-x-3 bottom-[calc(var(--spacing-nav)+env(safe-area-inset-bottom)+0.75rem)] max-h-[calc(100dvh-var(--spacing-nav)-env(safe-area-inset-bottom)-1.5rem)] rounded-xl',
            mode === 'anchored' &&
              'w-[min(22rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] rounded-lg',
            mode === 'center' &&
              'top-1/2 left-1/2 w-[min(26rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg',
          )}
        >
          <Dialog.Title ref={titleRef} tabIndex={-1} className="flex flex-col gap-0.5 outline-none">
            <span className="eyebrow">{tourTexts.counter(number, total)}</span>
            {/* El espacio separa el contador del título en el nombre del diálogo, que se lee Paso 3 de 8 Repasar */}{' '}
            <span className="text-lg font-bold">{text.title}</span>
          </Dialog.Title>
          <Dialog.Description className="text-base text-fg">{text.text}</Dialog.Description>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <Button variant="ghost" onClick={onSkip}>
              {tourTexts.skip}
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              {canGoBack ? (
                <Button variant="secondary" onClick={onBack}>
                  {tourTexts.back}
                </Button>
              ) : null}
              <Button onClick={onNext}>{isLast ? tourTexts.finish : tourTexts.next}</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
