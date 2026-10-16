// Transporte del autotest (B14, 3.14 del plan de B14). postgres.js por el socket del Postgres temporal,
// como superusuario, y con set local role service_role en cada llamada. Así se prueban también los
// permisos reales de las funciones calibration_*: lo que la llave secreta no puede ejecutar, el
// autotest tampoco. Usa la misma lista RPC que el transporte de producción.
//
// Solo lo usa scripts/calibration/selftest.ts. Nunca entra a la corrida real.
import type postgres from 'postgres';
import { createStore, StoreError, type CalibrationStore, type RpcCall } from './store.ts';

export type PgSql = postgres.Sql;

/** Lo que trae un error de postgres.js, que es el SQLSTATE en code */
function sqlstateOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

export function createPgStore(sql: PgSql): CalibrationStore {
  const call: RpcCall = async (spec, params) => {
    // jsonb viaja como texto JSON y se convierte en la base, sin depender de cómo el cliente lo serializa
    const placeholders = spec.params
      .map(([, type], index) => `$${index + 1}::${type === 'jsonb' ? 'text::jsonb' : type}`)
      .join(', ');
    // Los booleanos viajan como booleanos y no como texto, porque el serializador de postgres.js solo
    // reconoce true. Lo demás viaja como texto o número que Postgres convierte a su tipo
    const values = spec.params.map(([name, type]) => {
      const value = params[name];
      if (value === null || value === undefined) return null;
      if (type === 'jsonb') return JSON.stringify(value);
      if (type === 'boolean') return value === true;
      return typeof value === 'string' || typeof value === 'number' ? value : null;
    });
    try {
      const rows = await sql.begin(async (tx) => {
        await tx.unsafe('set local role service_role');
        return tx.unsafe(`select public.${spec.name}(${placeholders}) as result`, values);
      });
      return (rows[0] as { result?: unknown } | undefined)?.result ?? null;
    } catch (error) {
      throw new StoreError(spec.name, { code: sqlstateOf(error), kind: 'store_error' });
    }
  };
  return createStore(call);
}
