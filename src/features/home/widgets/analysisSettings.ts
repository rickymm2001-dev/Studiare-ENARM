// Ajustes de los widgets de análisis de Inicio (9.1). Lo guardado puede venir de una versión anterior
// o estar alterado, así que cada lector revisa el valor y si no es uno de los permitidos usa el de
// siempre en lugar de romper el tablero.
import { topicTaxonomy } from '@/demo/content';
import { LOAD_HORIZONS, type LoadHorizon } from '../../progress/futureLoad';

export const WEAK_TOPIC_COUNTS = [3, 5, 8] as const;
export type WeakTopicCount = (typeof WEAK_TOPIC_COUNTS)[number];

/** Valor de la rama cuando no se filtra por ninguna */
export const ALL_BRANCHES = 'all';

export interface WeakTopicsSettings {
  count: WeakTopicCount;
  /** ALL_BRANCHES o la clave de una rama troncal */
  branch: string;
}

export const DEFAULT_WEAK_TOPICS: WeakTopicsSettings = { count: 5, branch: ALL_BRANCHES };

const branchKeys: ReadonlySet<string> = new Set(topicTaxonomy.branches.map((branch) => branch.key));

export function readWeakTopicsSettings(raw: Readonly<Record<string, unknown>>): WeakTopicsSettings {
  return {
    count: WEAK_TOPIC_COUNTS.find((count) => count === raw.count) ?? DEFAULT_WEAK_TOPICS.count,
    branch:
      typeof raw.branch === 'string' && branchKeys.has(raw.branch) ? raw.branch : ALL_BRANCHES,
  };
}

export interface FutureLoadSettings {
  days: LoadHorizon;
}

export const DEFAULT_FUTURE_LOAD: FutureLoadSettings = { days: 30 };

export function readFutureLoadSettings(raw: Readonly<Record<string, unknown>>): FutureLoadSettings {
  return {
    days: LOAD_HORIZONS.find((days) => days === raw.days) ?? DEFAULT_FUTURE_LOAD.days,
  };
}
