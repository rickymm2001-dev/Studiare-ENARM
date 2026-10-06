// Dibuja la tarjeta de logro como una imagen PNG cuadrada con el canvas del navegador (9.6). Los
// colores son fijos y salen de la paleta de marca, así la imagen se ve igual sin importar el tema de
// quien la comparte. Solo corre en el navegador, por eso quien la usa la recibe por parámetro.
import { t } from '@/i18n/es-MX';
import type { AchievementCard } from './achievement';

const SIZE = 1080;
const MARGIN = 72;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const DISPLAY = `"Bricolage Grotesque Variable", ${SANS}`;

/** Paleta de marca de src/ui/tokens.css en su tono claro, con el oro y la racha aclarados para fondo oscuro */
const COLOR = {
  top: '#0e5a6b',
  bottom: '#093a46',
  ink: '#ffffff',
  soft: 'rgba(255, 255, 255, 0.82)',
  panel: 'rgba(255, 255, 255, 0.12)',
  gold: '#f6d27a',
  goldDeep: '#d9a441',
  flame: '#ffc7a6',
  sim: '#ece8fb',
  simInk: '#45358a',
} as const;

/** Escribe texto centrado y lo encoge hasta que quepa en el ancho dado */
function centered(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  weight: number,
  startSize: number,
  family: string,
  color: string,
  maxWidth: number,
) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 20 && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
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

function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  label: string,
  value: string,
  valueColor: string,
) {
  const width = (SIZE - MARGIN * 2 - 24) / 2;
  ctx.fillStyle = COLOR.panel;
  roundedRect(ctx, x, 760, width, 150, 28);
  ctx.fill();
  centered(ctx, label, x + width / 2, 815, 500, 32, SANS, COLOR.soft, width - 40);
  centered(ctx, value, x + width / 2, 883, 800, 62, DISPLAY, valueColor, width - 40);
}

function paint(ctx: CanvasRenderingContext2D, card: AchievementCard) {
  const text = t.party.share;
  const middle = SIZE / 2;

  const background = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  background.addColorStop(0, COLOR.top);
  background.addColorStop(1, COLOR.bottom);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 44px ${DISPLAY}`;
  ctx.fillStyle = COLOR.soft;
  ctx.fillText(card.brand, MARGIN, 120);

  // Medalla de oro con el nivel
  const badge = ctx.createLinearGradient(middle - 190, 190, middle + 190, 570);
  badge.addColorStop(0, COLOR.gold);
  badge.addColorStop(1, COLOR.goldDeep);
  ctx.fillStyle = badge;
  ctx.beginPath();
  ctx.arc(middle, 380, 190, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = COLOR.ink;
  ctx.stroke();
  centered(ctx, String(card.level), middle, 460, 800, 230, DISPLAY, COLOR.bottom, 280);

  centered(ctx, card.levelTitle, middle, 668, 800, 76, DISPLAY, COLOR.ink, SIZE - MARGIN * 2);
  centered(ctx, text.level(card.level), middle, 722, 500, 40, SANS, COLOR.soft, SIZE - MARGIN * 2);

  const half = (SIZE - MARGIN * 2 - 24) / 2;
  panel(ctx, MARGIN, text.streakLabel, text.streakValue(card.streak), COLOR.flame);
  panel(ctx, MARGIN + half + 24, text.xpLabel, card.weeklyXp.toLocaleString('es-MX'), COLOR.gold);

  if (card.alias)
    centered(ctx, card.alias, middle, 976, 600, 40, SANS, COLOR.ink, SIZE - MARGIN * 2);

  if (card.simulated) {
    ctx.fillStyle = COLOR.sim;
    ctx.fillRect(0, SIZE - 80, SIZE, 80);
    centered(ctx, text.simulatedBanner, middle, SIZE - 30, 700, 30, SANS, COLOR.simInk, SIZE - 80);
  }
}

export async function drawAchievement(card: AchievementCard): Promise<Blob> {
  // Con las fuentes de la app ya cargadas el texto sale con su tipografía
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no puede dibujar la tarjeta');
  paint(ctx, card);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo crear la imagen'));
    }, 'image/png');
  });
}
