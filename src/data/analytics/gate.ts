// Cuándo la analítica puede juntar y mandar (B15, 1.1 y 1.4). Función pura, sin React, sin red y sin leer
// nada del navegador, para que la tabla completa se pruebe fila por fila (gate.test.ts). Todo tiene que
// cumplirse a la vez. Basta una condición en contra para que no se junte ni se mande nada.
import type { AppEnv } from '@/config/featureFlags';
import type { DatabaseKind } from '../databases';
import type { AnalyticsConfig } from './config';

export interface GateInput {
  /** La bandera productAnalytics (src/config/featureFlags.ts) */
  flag: boolean;
  /** La llave y el host. null si no hay o no tienen la forma buena */
  config: AnalyticsConfig | null;
  /** El permiso Medición de uso. null es que todavía no se sabe */
  consent: boolean | null;
  /** Mi cuenta (real) o Demostración (demo). La demostración nunca mide */
  database: DatabaseKind;
  /** En desarrollo nunca mide, aunque haya llave */
  appEnv: AppEnv;
  /** Si la nube está configurada. Sin ella no hay identificador y las cuentas solo locales no se miden */
  cloud: boolean;
  /** El identificador seudónimo que dio el servidor. null mientras no llega */
  analyticsId: string | null;
}

/** Por qué no se puede, en el orden en que se revisa */
export type GateBlock =
  | 'flag_off'
  | 'no_config'
  | 'development'
  | 'demo_database'
  | 'no_cloud'
  | 'consent_unknown'
  | 'no_consent'
  | 'no_identity';

/** Un identificador seudónimo es un uuid. Cualquier otra cosa no sirve de distinct_id */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lo que impide juntar eventos en memoria, o null si se pueden juntar. No pide el identificador, que llega
 * del servidor un poco después. Mientras llega, los eventos esperan en la cola y no salen
 */
export function collectBlock(input: Omit<GateInput, 'analyticsId'>): GateBlock | null {
  if (!input.flag) return 'flag_off';
  if (input.config === null) return 'no_config';
  if (input.appEnv === 'development') return 'development';
  if (input.database !== 'real') return 'demo_database';
  if (!input.cloud) return 'no_cloud';
  if (input.consent === null) return 'consent_unknown';
  if (!input.consent) return 'no_consent';
  return null;
}

/** Lo que impide mandar, o null si se puede. Igual que collectBlock, más el identificador */
export function sendBlock(input: GateInput): GateBlock | null {
  return (
    collectBlock(input) ??
    (input.analyticsId !== null && UUID.test(input.analyticsId) ? null : 'no_identity')
  );
}

/** Se pueden juntar eventos en memoria. Todavía no salen */
export const canCollect = (input: Omit<GateInput, 'analyticsId'>): boolean =>
  collectBlock(input) === null;

/** Se pueden mandar eventos a PostHog */
export const canSend = (input: GateInput): boolean => sendBlock(input) === null;
