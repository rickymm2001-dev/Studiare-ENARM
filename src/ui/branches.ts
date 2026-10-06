// Color de cada rama (D-061). Las clases van completas para que Tailwind las encuentre. El texto de
// las etiquetas usa el tono ink, más oscuro que el del ícono, para llegar a 4.5 de contraste sobre el fondo suave.
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
  mi: { chip: 'bg-mi-soft text-mi-ink', bar: 'bg-mi', icon: 'bg-mi text-white' },
  ped: { chip: 'bg-ped-soft text-ped-ink', bar: 'bg-ped', icon: 'bg-ped text-white' },
  gyo: { chip: 'bg-gyo-soft text-gyo-ink', bar: 'bg-gyo', icon: 'bg-gyo text-white' },
  cir: { chip: 'bg-cir-soft text-cir-ink', bar: 'bg-cir', icon: 'bg-cir text-white' },
  fam: { chip: 'bg-fam-soft text-fam-ink', bar: 'bg-fam', icon: 'bg-fam text-white' },
  urg: { chip: 'bg-urg-soft text-urg-ink', bar: 'bg-urg', icon: 'bg-urg text-white' },
  neutral: {
    chip: 'bg-primary-soft text-primary',
    bar: 'bg-primary',
    icon: 'bg-primary text-primary-fg',
  },
};

export function branchTone(key: string | null | undefined): BranchTone {
  return (key ? TONE_BY_KEY[key] : undefined) ?? 'neutral';
}

export function toneClasses(key: string | null | undefined) {
  return TONE_CLASSES[branchTone(key)];
}
