// Cambios que el admin hace a los umbrales, a los pesos del ENARM y a la estimación de costo (pantalla
// 25). Se guardan en este navegador y se aplican al abrir la app, antes de que ningún motor lea sus
// umbrales. Sin dependencias de otros archivos de configuración para que thresholds.ts pueda
// leerlos sin un ciclo. Un valor guardado que no cumple el formato se ignora completo.
import { z } from 'zod';

export const OVERRIDES_KEY = 'enarm.admin.overrides.v1';

const NumberRecord = z.record(z.string(), z.number());

export const StoredOverridesSchema = z.strictObject({
  /** Por grupo y por nombre, por ejemplo bias.minTaggedErrors. Se valida completo contra ThresholdsSchema */
  thresholds: z.record(z.string(), NumberRecord).optional(),
  weights: z
    .strictObject({
      /** Peso de cada rama por su clave */
      branches: z.record(z.string(), z.number().positive()),
      /** Peso de cada tema por rama/tema */
      topics: z.record(z.string(), z.number().positive()),
    })
    .optional(),
  /** Estimación de costo de IA por alumno al mes del plan maestro, en dólares */
  aiCostEstimateUsd: z.number().min(0).max(1000).nullable().optional(),
});
export type StoredOverrides = z.infer<typeof StoredOverridesSchema>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // El navegador puede negar el acceso, por ejemplo en una ventana privada
    return null;
  }
}

export function readStoredOverrides(): StoredOverrides | null {
  try {
    const raw = storage()?.getItem(OVERRIDES_KEY);
    if (!raw) return null;
    const parsed = StoredOverridesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Guarda los cambios. null los borra y deja todo como de fábrica. Devuelve si pudo guardar */
export function writeStoredOverrides(value: StoredOverrides | null): boolean {
  try {
    const target = storage();
    if (!target) return false;
    if (value === null) target.removeItem(OVERRIDES_KEY);
    else target.setItem(OVERRIDES_KEY, JSON.stringify(StoredOverridesSchema.parse(value)));
    return true;
  } catch {
    return false;
  }
}
