// Nombres de las dos bases locales (D-024). Sin Dexie, para que la interfaz pueda mostrarlos.
export type DatabaseKind = 'real' | 'demo';

export const DATABASE_NAMES: Record<DatabaseKind, string> = {
  real: 'enarm_real',
  demo: 'enarm_demo',
};
