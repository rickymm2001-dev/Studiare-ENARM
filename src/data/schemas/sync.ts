// Estado de la sincronización entre dispositivos (D-095). Vive solo en este navegador y no se sube.
// Si se pierde, la siguiente sincronización baja y sube todo otra vez sin duplicar nada, porque
// los registros se comparan por fecha y los eventos por ID.
import { z } from 'zod';
import { IdSchema, UtcDateTimeSchema } from './common';

export const SyncStateSchema = z.strictObject({
  userId: IdSchema,
  /** Cuenta de la nube a la que pertenece este estado. Si cambia, se empieza de cero */
  authId: z.string().min(1).max(64),
  /** Último contador del servidor que ya se bajó, de los registros y de la bitácora */
  recordsCursor: z.int().nonnegative(),
  eventsCursor: z.int().nonnegative(),
  /** Hasta qué fecha ya se subió, de los registros y de la bitácora */
  recordsWatermark: UtcDateTimeSchema.nullable(),
  eventsWatermark: UtcDateTimeSchema.nullable(),
  lastSyncAt: UtcDateTimeSchema.nullable(),
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export function emptySyncState(userId: string, authId: string): SyncState {
  return {
    userId,
    authId,
    recordsCursor: 0,
    eventsCursor: 0,
    recordsWatermark: null,
    eventsWatermark: null,
    lastSyncAt: null,
  };
}
