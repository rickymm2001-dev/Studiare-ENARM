// Correos y alertas del admin (B15, 3.1 y 2.4 del plan de B15). Lo que la pantalla Plataforma lee y cambia
// en el servidor: el interruptor de envío de correos con la pausa por tipo (email_delivery), el interruptor
// de los eventos de dinero de la analítica (analytics), los conteos de correos de los últimos días
// (admin_email_overview, sin destinatarios) y el error de prueba que manda la función monitoring-test.
//
// Los interruptores viven en platform_settings, que todos leen y solo el admin con segundo factor escribe
// por el permiso por fila, el mismo camino con el que se escriben las banderas (featureFlags.ts). Los dos
// nacen apagados. Un valor que no se lee cuenta como apagado, para que nunca se prenda el envío por un
// error de dedo.
import type { SupabaseClient } from '@supabase/supabase-js';
import { callBankRpc, type ForbiddenHandler } from './editorial.ts';
import {
  ADMIN_EMAIL_OVERVIEW_RPC,
  ANALYTICS_SWITCH_KEY,
  AnalyticsSwitchSchema,
  EMAIL_DELIVERY_KEY,
  EMAIL_DELIVERY_OFF,
  EmailDeliverySchema,
  EmailOverviewSchema,
  MONITORING_TEST_FUNCTION,
  MonitoringTestReplySchema,
  type AnalyticsSwitch,
  type EmailDelivery,
  type EmailOverview,
} from './engagementContracts.ts';

type Tables = Pick<SupabaseClient, 'from'>;
type Rpc = Pick<SupabaseClient, 'rpc'>;
type Functions = Pick<SupabaseClient, 'functions'>;

/** Cuántos días de correos trae el resumen del admin */
export const OVERVIEW_DAYS = 7;

/** Una clave de platform_settings. undefined es que no se pudo leer, null que no existe y el valor si existe */
async function readSetting(cloud: Tables, key: string): Promise<unknown> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error) return undefined;
    return (data as { value?: unknown } | null)?.value ?? null;
  } catch {
    return undefined;
  }
}

async function writeSetting(cloud: Tables, key: string, value: unknown): Promise<boolean> {
  try {
    const { error } = await cloud
      .from('platform_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    return !error;
  } catch {
    return false;
  }
}

/** El interruptor de envío. Apagado si no existe o no cumple la forma. null si no se pudo leer */
export async function readEmailDelivery(cloud: Tables): Promise<EmailDelivery | null> {
  const raw = await readSetting(cloud, EMAIL_DELIVERY_KEY);
  if (raw === undefined) return null;
  const parsed = EmailDeliverySchema.safeParse(raw);
  return parsed.success ? parsed.data : EMAIL_DELIVERY_OFF;
}

/** Guarda el interruptor de envío y sus tipos en pausa, sin repetir ni dejar vacíos. Devuelve si se guardó */
export function saveEmailDelivery(cloud: Tables, delivery: EmailDelivery): Promise<boolean> {
  const paused = [
    ...new Set(delivery.paused.map((kind) => kind.trim()).filter((kind) => kind !== '')),
  ];
  return writeSetting(
    cloud,
    EMAIL_DELIVERY_KEY,
    EmailDeliverySchema.parse({ enabled: delivery.enabled, paused }),
  );
}

/** El interruptor de los eventos de dinero. Apagado si no existe o no cumple la forma. null si no se pudo leer */
export async function readAnalyticsSwitch(cloud: Tables): Promise<AnalyticsSwitch | null> {
  const raw = await readSetting(cloud, ANALYTICS_SWITCH_KEY);
  if (raw === undefined) return null;
  const parsed = AnalyticsSwitchSchema.safeParse(raw);
  return parsed.success ? parsed.data : { enabled: false };
}

export const saveAnalyticsSwitch = (cloud: Tables, value: AnalyticsSwitch): Promise<boolean> =>
  writeSetting(cloud, ANALYTICS_SWITCH_KEY, AnalyticsSwitchSchema.parse(value));

/** Cuántos correos hay por tipo y estado en los últimos días. Sin destinatarios. Lanza EditorialError */
export function readEmailOverview(
  cloud: Rpc,
  onForbidden?: ForbiddenHandler,
  days: number = OVERVIEW_DAYS,
): Promise<EmailOverview> {
  return callBankRpc(
    cloud,
    ADMIN_EMAIL_OVERVIEW_RPC,
    { p_days: days },
    EmailOverviewSchema,
    onForbidden,
  );
}

/**
 * El resultado de mandar el error de prueba desde las funciones
 *   sent         salió hacia Sentry
 *   missing_dsn  la función no tiene SENTRY_DSN y no mandó nada
 *   forbidden    la sesión no es de un admin con segundo factor
 *   failed       la función no contestó o contestó algo raro
 */
export type ServerAlertResult = 'sent' | 'missing_dsn' | 'forbidden' | 'failed';

/** Llama a monitoring-test con la sesión del admin. Nunca lanza */
export async function sendServerAlertTest(cloud: Functions): Promise<ServerAlertResult> {
  let reply: Awaited<ReturnType<Functions['functions']['invoke']>>;
  try {
    reply = await cloud.functions.invoke<unknown>(MONITORING_TEST_FUNCTION, { body: {} });
  } catch {
    return 'failed';
  }
  if (reply.error) {
    const context = (reply.error as { context?: unknown }).context;
    const status = context instanceof Response ? context.status : null;
    return status === 401 || status === 403 ? 'forbidden' : 'failed';
  }
  const parsed = MonitoringTestReplySchema.safeParse(reply.data);
  return parsed.success ? parsed.data.result : 'failed';
}
