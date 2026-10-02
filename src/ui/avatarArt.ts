// Partes de un avatar médico generado a partir de una semilla (D-068). Función pura y estable. La
// misma semilla siempre da el mismo avatar.
import { createRng } from '@/engines/random';

export const AVATAR_BACKGROUNDS = [
  '#0e5a6b',
  '#3a2a7a',
  '#b92b74',
  '#d94f2b',
  '#1f8a57',
  '#c27c0e',
  '#6a4bc4',
  '#0e8fa3',
];
const SKINS = ['#f6d3b3', '#e8b48f', '#c98b62', '#a2694a', '#6e4630'];
const HAIR_COLORS = ['#1d1612', '#3b2a20', '#6b4423', '#a7743d', '#d9b46a', '#8c8c8c'];

export type HairStyle = 'short' | 'long' | 'bun' | 'curly' | 'bald';
export type Accessory = 'stethoscope' | 'cap' | 'glasses' | 'mirror' | 'none';

export interface AvatarParts {
  background: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  accessory: Accessory;
  scrubs: string;
}

export function avatarParts(seed: string): AvatarParts {
  const rng = createRng(`avatar|${seed}`);
  return {
    background: rng.pick(AVATAR_BACKGROUNDS),
    skin: rng.pick(SKINS),
    hair: rng.pick(HAIR_COLORS),
    hairStyle: rng.pick(['short', 'long', 'bun', 'curly', 'bald'] as const),
    accessory: rng.pick(['stethoscope', 'cap', 'glasses', 'mirror', 'none'] as const),
    scrubs: rng.pick(['#ffffff', '#cfe8ef', '#d7f0e3', '#e6defa']),
  };
}

/** Semillas de la galería de avatares que se ofrecen al elegir foto de perfil */
export const AVATAR_GALLERY = Array.from({ length: 12 }, (_, index) => `studiare-${index + 1}`);
