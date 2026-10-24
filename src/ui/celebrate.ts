// Celebraciones al ganar (D-061). Confeti y un acorde corto. Cada uno respeta su ajuste, y el
// confeti además respeta animaciones apagadas y prefers-reduced-motion. canvas-confetti se carga
// solo la primera vez que hace falta, así no pesa en la carga inicial.
import { usePreferences } from '@/app/preferences';
import { motionAllowed } from './appearance';

// Las insignias se quitaron con Logros (B3 del plan del cambio). El acorde que usaban quedó para
// los retos de grupo de Party
export type CelebrationKind = 'goal' | 'level' | 'challenge' | 'session' | 'small';

// Marino, cielo y el acento cálido de la portada (D-150)
const COLORS = ['#01337a', '#0f96e3', '#7cc2ee', '#bfe0f5', '#a64a13', '#f5dacb'];

const NOTES: Record<CelebrationKind, number[]> = {
  small: [880],
  session: [523, 659, 784],
  goal: [523, 659, 784, 1047],
  challenge: [659, 880, 1175],
  level: [523, 659, 784, 1047, 1319],
};

let audio: AudioContext | null = null;

function playNotes(notes: number[]): void {
  try {
    audio ??= new AudioContext();
    const start = audio.currentTime;
    notes.forEach((frequency, index) => {
      const ctx = audio as AudioContext;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      const at = start + index * 0.09;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.4);
    });
  } catch {
    // Sin audio disponible. La celebración sigue sin sonido
  }
}

let canvasOk: boolean | undefined;

/** Hay un lienzo donde dibujar. Algunos navegadores lo bloquean por privacidad y las pruebas no lo tienen */
function canvasAvailable(): boolean {
  canvasOk ??= (() => {
    try {
      return document.createElement('canvas').getContext('2d') !== null;
    } catch {
      return false;
    }
  })();
  return canvasOk;
}

async function burst(kind: CelebrationKind): Promise<void> {
  if (!canvasAvailable()) return;
  const { default: confetti } = await import('canvas-confetti');
  const big = kind === 'level' || kind === 'goal';
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 60 };
  if (kind === 'small') {
    await confetti({ ...base, particleCount: 30, spread: 50, origin: { y: 0.7 } });
    return;
  }
  await Promise.all([
    confetti({ ...base, particleCount: big ? 120 : 70, spread: 70, origin: { x: 0.2, y: 0.8 } }),
    confetti({ ...base, particleCount: big ? 120 : 70, spread: 70, origin: { x: 0.8, y: 0.8 } }),
  ]);
}

export function celebrate(kind: CelebrationKind): void {
  const { appearance } = usePreferences.getState();
  if (appearance.sounds) playNotes(NOTES[kind]);
  if (appearance.confetti && motionAllowed(appearance)) void burst(kind).catch(() => undefined);
}
