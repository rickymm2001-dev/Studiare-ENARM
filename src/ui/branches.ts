// Tono de cada rama (D-061, D-128). Color propio para cada rama, distinguible y seguro para
// daltonismo, que se hereda en toda la app por los tokens. Las clases van completas para que Tailwind
// las encuentre. Las etiquetas y los íconos usan el fondo suave con el tono ink, que llega a 4.5 de
// contraste, y las marcas y barras el tono lleno (3 a 1 o más). El color nunca va solo, siempre junto
// al nombre de la rama. Lo que no tiene rama conocida va en neutro, porque una etiqueta o un ícono
// decorativo no lleva el color de acción (comentario 10, D-121)
export type BranchTone = 'mi' | 'ped' | 'gyo' | 'cir' | 'fam' | 'urg' | 'neutral';

const TONE_BY_KEY: Record<string, BranchTone> = {
  internal_medicine: 'mi',
  pediatrics: 'ped',
  obstetrics_gynecology: 'gyo',
  general_surgery: 'cir',
  urgencias: 'urg',
  family_medicine: 'fam',
  emergency_medicine: 'urg',
  'paco-mi': 'mi',
  'paco-gyo': 'gyo',
  'paco-urgencias': 'urg',
};

export const TONE_CLASSES: Record<BranchTone, { chip: string; bar: string; icon: string }> = {
  mi: { chip: 'bg-mi-soft text-mi-ink', bar: 'bg-mi', icon: 'bg-mi-soft text-mi-ink' },
  ped: { chip: 'bg-ped-soft text-ped-ink', bar: 'bg-ped', icon: 'bg-ped-soft text-ped-ink' },
  gyo: { chip: 'bg-gyo-soft text-gyo-ink', bar: 'bg-gyo', icon: 'bg-gyo-soft text-gyo-ink' },
  cir: { chip: 'bg-cir-soft text-cir-ink', bar: 'bg-cir', icon: 'bg-cir-soft text-cir-ink' },
  fam: { chip: 'bg-fam-soft text-fam-ink', bar: 'bg-fam', icon: 'bg-fam-soft text-fam-ink' },
  urg: { chip: 'bg-urg-soft text-urg-ink', bar: 'bg-urg', icon: 'bg-urg-soft text-urg-ink' },
  neutral: {
    chip: 'bg-muted text-fg-muted',
    bar: 'bg-line-strong',
    icon: 'bg-muted text-fg-muted',
  },
};

export function branchTone(key: string | null | undefined): BranchTone {
  return (key ? TONE_BY_KEY[key] : undefined) ?? 'neutral';
}

export function toneClasses(key: string | null | undefined) {
  return TONE_CLASSES[branchTone(key)];
}
