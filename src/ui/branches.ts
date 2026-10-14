// Tono de cada rama (D-061, D-122). Color propio para cada rama, distinguible y seguro para
// daltonismo. Las clases van completas para que Tailwind las encuentre. Las etiquetas y los íconos usan
// el fondo suave con el tono ink, que llega a 4.5 de contraste; las barras usan el tono lleno (>= 3 a 1)
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
    chip: 'bg-primary-soft text-primary-ink',
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
