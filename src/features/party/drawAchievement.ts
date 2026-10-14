// Dibuja el resumen de la semana como una imagen PNG cuadrada con el canvas del navegador (respuesta
// 83 del plan del cambio, B7). Diseño sobrio de B2 (D-121). Superficie blanca, una franja lisa del
// color de acción #156082 con la marca y la semana, y las cifras en cuadros neutros con borde fino.
// Sin degradados ni dorado. Los colores son fijos y salen de la paleta del modo claro, así la imagen se
// ve igual sin importar el tema de quien la comparte. Solo corre en el navegador, por eso quien la usa
// la recibe por parámetro.
import { t } from '@/i18n/es-MX';
import { weekShareFigures, weekShareLabel, type WeekShareCard } from './achievement';

const SIZE = 1080;
const MARGIN = 72;
const GAP = 24;
const BAND = 300;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/** Paleta de src/ui/tokens.css en modo claro. Un solo color de acción y neutros (B2, D-121) */
const COLOR = {
  surface: '#ffffff',
  action: '#156082',
  onAction: '#ffffff',
  onActionSoft: 'rgba(255, 255, 255, 0.85)',
  tile: '#f5f6f7',
  line: '#dde2e6',
  ink: '#16212b',
  muted: '#576570',
  sim: '#eef0f2',
  simInk: '#3f4b55',
} as const;

type Align = 'left' | 'center';

/** Escribe una línea y la encoge hasta que quepa en el ancho dado */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    x: number;
    y: number;
    weight: number;
    size: number;
    color: string;
    maxWidth: number;
    align?: Align;
  },
) {
  let size = options.size;
  ctx.font = `${options.weight} ${size}px ${SANS}`;
  while (size > 20 && ctx.measureText(text).width > options.maxWidth) {
    size -= 2;
    ctx.font = `${options.weight} ${size}px ${SANS}`;
  }
  ctx.fillStyle = options.color;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, options.x, options.y);
}

/** Rectángulo de esquinas redondas. roundRect no existe en los iPhone con iOS 15 o anterior */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Un cuadro con la cifra grande y su etiqueta abajo */
function tile(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  figure: { label: string; value: string },
) {
  roundedRect(ctx, box.x, box.y, box.width, box.height, 24);
  ctx.fillStyle = COLOR.tile;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR.line;
  ctx.stroke();
  const inner = box.width - 72;
  fitText(ctx, figure.value, {
    x: box.x + 36,
    y: box.y + box.height / 2 + 20,
    weight: 800,
    size: 96,
    color: COLOR.ink,
    maxWidth: inner,
  });
  fitText(ctx, figure.label, {
    x: box.x + 36,
    y: box.y + box.height - 40,
    weight: 600,
    size: 36,
    color: COLOR.muted,
    maxWidth: inner,
  });
}

/**
 * Dónde va cada cuadro. Dos columnas. Con un número impar de cifras, como en modo enfoque sin la
 * racha, la primera ocupa todo el ancho
 */
export function tileBoxes(
  count: number,
  area: { top: number; bottom: number },
): { x: number; y: number; width: number; height: number }[] {
  const full = SIZE - MARGIN * 2;
  const half = (full - GAP) / 2;
  const rows = Math.ceil(count / 2);
  const height = (area.bottom - area.top - GAP * (rows - 1)) / rows;
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = area.top + row * (height + GAP);
    const left = count - index;
    if (row === 0 && count % 2 === 1) {
      boxes.push({ x: MARGIN, y, width: full, height });
      index += 1;
      continue;
    }
    boxes.push({ x: MARGIN, y, width: left === 1 ? full : half, height });
    index += 1;
    if (left > 1) {
      boxes.push({ x: MARGIN + half + GAP, y, width: half, height });
      index += 1;
    }
  }
  return boxes;
}

function paint(ctx: CanvasRenderingContext2D, card: WeekShareCard) {
  const text = t.b7.weekShare;
  const width = SIZE - MARGIN * 2;

  ctx.fillStyle = COLOR.surface;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Franja lisa del color de acción con la marca, el título y la semana
  ctx.fillStyle = COLOR.action;
  ctx.fillRect(0, 0, SIZE, BAND);
  fitText(ctx, card.brand, {
    x: MARGIN,
    y: 104,
    weight: 700,
    size: 44,
    color: COLOR.onActionSoft,
    maxWidth: width,
  });
  fitText(ctx, text.heading, {
    x: MARGIN,
    y: 196,
    weight: 800,
    size: 72,
    color: COLOR.onAction,
    maxWidth: width,
  });
  fitText(ctx, weekShareLabel(card), {
    x: MARGIN,
    y: 254,
    weight: 500,
    size: 40,
    color: COLOR.onActionSoft,
    maxWidth: width,
  });

  // Abajo queda lugar para el alias y para la franja de datos de demostración
  const bottom = SIZE - (card.simulated ? 80 : 0) - (card.alias ? 96 : 0) - MARGIN;
  const figures = weekShareFigures(card);
  tileBoxes(figures.length, { top: BAND + MARGIN - 24, bottom }).forEach((box, index) => {
    const figure = figures[index];
    if (figure) tile(ctx, box, figure);
  });

  if (card.alias) {
    fitText(ctx, card.alias, {
      x: MARGIN,
      y: bottom + 72,
      weight: 600,
      size: 40,
      color: COLOR.ink,
      maxWidth: width,
    });
  }

  if (card.simulated) {
    ctx.fillStyle = COLOR.sim;
    ctx.fillRect(0, SIZE - 80, SIZE, 80);
    fitText(ctx, text.simulatedBanner, {
      x: SIZE / 2,
      y: SIZE - 30,
      weight: 700,
      size: 30,
      color: COLOR.simInk,
      maxWidth: SIZE - 80,
      align: 'center',
    });
  }
}

export async function drawWeekShare(card: WeekShareCard): Promise<Blob> {
  // Con las fuentes de la app ya cargadas el texto sale con su tipografía
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no puede dibujar la imagen');
  paint(ctx, card);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo crear la imagen'));
    }, 'image/png');
  });
}
