// Recorte circular de la foto de perfil (B2 del plan del cambio, comentario 15). AvatarPicker lo
// carga con lazy solo cuando el alumno elige un archivo. Muestra la foto dentro de un círculo, la
// acerca con un control deslizante, la encuadra arrastrando, con las flechas del teclado o con los
// botones, y al confirmar dibuja un JPEG de 256 por 256 en un canvas. Nada sale del navegador aquí.
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import {
  fitDataUrl,
  initialFrame,
  isUsableImage,
  MAX_ZOOM,
  MIN_ZOOM,
  moveBy,
  NUDGE_PX,
  OUTPUT_SIZE,
  placement,
  sourceRect,
  ZOOM_STEP,
  zoomTo,
  type Frame,
  type ImageSize,
} from './avatarCrop';

/** Lado del círculo de vista previa en píxeles. Cabe en un teléfono de 320 px con sus márgenes */
const VIEWPORT = 224;

const text = t.account.avatarCrop;

const ARROWS: Record<string, [dx: number, dy: number]> = {
  ArrowUp: [0, -NUDGE_PX],
  ArrowDown: [0, NUDGE_PX],
  ArrowLeft: [-NUDGE_PX, 0],
  ArrowRight: [NUDGE_PX, 0],
};

/** Dibuja la zona encuadrada en un canvas cuadrado y la devuelve como JPEG que cabe en el esquema */
function exportCrop(source: CanvasImageSource, image: ImageSize, frame: Frame): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const rect = sourceRect(image, frame);
  context.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  return fitDataUrl((quality) => canvas.toDataURL('image/jpeg', quality));
}

export function AvatarCropper({
  file,
  onConfirm,
  onCancel,
}: {
  file: File;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  // La foto se lee como dataUrl, que el navegador pinta sin pedir nada a la red. AvatarPicker monta
  // el recortador de nuevo por cada archivo, así que aquí no hay que reiniciar el encuadre
  const [source, setSource] = useState<string | null>(null);
  const [image, setImage] = useState<ImageSize | null>(null);
  const [frame, setFrame] = useState<Frame>(() => initialFrame(VIEWPORT));
  const [error, setError] = useState('');
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const zoomId = useId();
  const titleId = useId();
  const hintId = useId();

  useEffect(() => {
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (active && typeof reader.result === 'string') setSource(reader.result);
    };
    reader.onerror = () => {
      if (active) setError(t.account.avatarOpenError);
    };
    reader.readAsDataURL(file);
    return () => {
      active = false;
      reader.abort();
    };
  }, [file]);

  const move = (dx: number, dy: number) => {
    if (image) setFrame((current) => moveBy(image, current, dx, dy));
  };

  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const size = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    };
    if (isUsableImage(size)) {
      setImage(size);
      setError('');
    } else {
      setError(t.account.avatarOpenError);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = drag.current;
    if (!last) return;
    drag.current = { x: event.clientX, y: event.clientY };
    move(event.clientX - last.x, event.clientY - last.y);
  };
  const endDrag = () => {
    drag.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = ARROWS[event.key];
    if (!delta) return;
    event.preventDefault();
    move(delta[0], delta[1]);
  };

  const confirm = () => {
    const element = imageRef.current;
    if (!element || !image) return;
    const dataUrl = exportCrop(element, image, frame);
    if (!dataUrl) {
      setError(t.account.avatarTooBig);
      return;
    }
    onConfirm(dataUrl);
  };

  const placed = image ? placement(image, frame) : null;

  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-3">
      <div>
        <p id={titleId} className="font-semibold">
          {text.title}
        </p>
        <p id={hintId} className="text-sm text-fg-muted">
          {text.hint}
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* El único círculo del rediseño es el de la foto. Es un grupo y no una imagen, porque
            recibe el foco y las flechas del teclado la mueven */}
        <div
          role="group"
          aria-label={text.preview}
          aria-describedby={hintId}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative size-56 shrink-0 cursor-move touch-none overflow-hidden rounded-full border border-line bg-muted select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {source ? (
            <img
              ref={imageRef}
              src={source}
              alt=""
              draggable={false}
              onLoad={onLoad}
              onError={() => {
                setError(t.account.avatarOpenError);
              }}
              className="pointer-events-none absolute max-w-none"
              style={
                placed
                  ? {
                      width: Math.round(placed.width),
                      height: Math.round(placed.height),
                      left: Math.round(placed.left),
                      top: Math.round(placed.top),
                    }
                  : { visibility: 'hidden' }
              }
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={zoomId} className="text-sm font-semibold">
              {text.zoom}
            </label>
            <input
              id={zoomId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={frame.zoom}
              disabled={!image}
              aria-valuetext={text.zoomValue(frame.zoom)}
              className="w-full accent-primary"
              onChange={(event) => {
                const zoom = Number(event.target.value);
                if (image) setFrame((current) => zoomTo(image, current, zoom));
              }}
            />
          </div>
          <div role="group" aria-label={text.move} className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={text.moveLeft}
              disabled={!image}
              onClick={() => {
                move(-NUDGE_PX, 0);
              }}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={text.moveUp}
              disabled={!image}
              onClick={() => {
                move(0, -NUDGE_PX);
              }}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={text.moveDown}
              disabled={!image}
              onClick={() => {
                move(0, NUDGE_PX);
              }}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label={text.moveRight}
              disabled={!image}
              onClick={() => {
                move(NUDGE_PX, 0);
              }}
            >
              <ArrowRight aria-hidden />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!image} onClick={confirm}>
              <Check aria-hidden />
              {text.use}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              <X aria-hidden />
              {text.cancel}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
