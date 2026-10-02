// Color de cada rama (D-061). Las clases van completas para que Tailwind las encuentre.
export type BranchTone = 'mi' | 'ped' | 'gyo' | 'cir' | 'urg' | 'neutral';

const TONE_BY_KEY: Record<string, BranchTone> = {
  internal_medicine: 'mi',
  pediatrics: 'ped',
  obstetrics_gynecology: 'gyo',
  general_surgery: 'cir',
  urgencias: 'urg',
  'paco-mi': 'mi',
  'paco-gyo': 'gyo',
  'paco-urgencias': 'urg',
};

export const TONE_CLASSES: Record<BranchTone, { chip: string; bar: string; icon: string }> = {
  mi: { chip: 'bg-mi-soft text-mi', bar: 'bg-mi', icon: 'bg-mi text-white' },
  ped: { chip: 'bg-ped-soft text-ped', bar: 'bg-ped', icon: 'bg-ped text-white' },
  gyo: { chip: 'bg-gyo-soft text-gyo', bar: 'bg-gyo', icon: 'bg-gyo text-white' },
  cir: { chip: 'bg-cir-soft text-cir', bar: 'bg-cir', icon: 'bg-cir text-white' },
  urg: { chip: 'bg-urg-soft text-urg', bar: 'bg-urg', icon: 'bg-urg text-white' },
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
