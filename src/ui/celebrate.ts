// Celebraciones al ganar (D-061). Confeti y un acorde corto. Cada uno respeta su ajuste, y el
// confeti además respeta animaciones apagadas y prefers-reduced-motion. canvas-confetti se carga
// solo la primera vez que hace falta, así no pesa en la carga inicial.
import { usePreferences } from '@/app/preferences';
import { motionAllowed } from './appearance';

export type CelebrationKind = 'goal' | 'level' | 'badge' | 'session' | 'small';

const COLORS = ['#f2c14e', '#0e5a6b', '#d94f2b', '#0e8fa3', '#b92b74', '#1f8a57'];

const NOTES: Record<CelebrationKind, number[]> = {
  small: [880],
  session: [523, 659, 784],
  goal: [523, 659, 784, 1047],
  badge: [659, 880, 1175],
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
