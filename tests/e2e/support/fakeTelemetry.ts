// PostHog y Sentry simulados para las pruebas de nube (B15, paso 0, 6.4 del plan de B15). Se atienden
// dentro del navegador de la prueba, con context.route, los dos orígenes que lleva el build de nube
// (fakeSupabaseConfig.ts). Ninguna petición sale a esos servicios, y por eso createFakeSupabase lo engancha
// a todo contexto que atiende, también al de un segundo dispositivo. Guarda lo que llega para que una
// prueba revise qué se mandó y qué no, que es la forma de demostrar que sin permiso no sale nada.
//
// Contesta lo mínimo para que el navegador no falle (CORS y 200) y guarda las peticiones. Lo que revisan las
// specs del formato queda en un solo lugar, aquí: las propiedades que lleva todo evento (COMMON_EVENT_PROPERTIES),
// cómo se arma el sobre de Sentry y las ayudas de analytics-consent.spec.ts, error-monitoring.spec.ts y
// reminders.spec.ts. Si la API de PostHog o el sobre de Sentry piden otra cosa (8.26 del plan), se ajusta aquí y
// en el cliente, con su prueba.
//
// Todo es simulado y nunca se mezcla con datos reales
import type { BrowserContext, Page, Request, Route } from '@playwright/test';
import { FLAGS_KEY } from '@/config/featureFlags';
import { FAKE_POSTHOG_HOST, FAKE_SENTRY_ORIGIN } from './fakeSupabaseConfig';

/**
 * Las propiedades que lleva todo evento que sale hacia PostHog, además de las del evento (1.4 y 8.8 del plan
 * de B15). Rangos y listas cerradas, nunca algo del alumno. Las tres con $ son del formato de PostHog
 */
export const COMMON_EVENT_PROPERTIES = [
  '$geoip_disable',
  '$lib',
  '$process_person_profile',
  'app_version',
  'installed',
  'plan_kind',
  'platform',
  'role',
] as const;

/** Lo mínimo del Supabase simulado que necesita seedFlags. FakeSupabaseServer lo cumple */
interface FlagSetter {
  setSetting(key: string, value: unknown): void;
}

/**
 * Deja las banderas como las dejaría el servidor, y la copia que el navegador ya habría bajado de él. Así la
 * app abre con ellas puestas y la revisión del servidor no pide recargar. El build de nube de las pruebas se
 * hace sin VITE_APP_ENV, o sea que es de tipo demo, donde las banderas de B15 nacen apagadas
 */
export async function seedFlags(
  page: Page,
  cloud: FlagSetter,
  flags: Record<string, boolean>,
): Promise<void> {
  cloud.setSetting('feature_flags', flags);
  await page.addInitScript(
    ([key, value]) => {
      // También corre en el about:blank con el que openEmailLink recarga la página, que no tiene almacenamiento
      if (!location.protocol.startsWith('http')) return;
      localStorage.setItem(key, value);
    },
    [FLAGS_KEY, JSON.stringify(flags)] as const,
  );
}

/**
 * Hace que la analítica entregue lo que tenga en cola, como cuando el alumno oculta la pestaña (pagehide).
 * Sin esto habría que esperar los 10 segundos de la cola. Una fuga se vería igual: sale en esta entrega
 */
export async function flushAnalytics(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });
}

/** Junta las direcciones de todo lo que la página pide, para revisar qué archivos se bajaron y cuáles no */
export function watchRequestedUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    urls.push(request.url());
  });
  return urls;
}

/** Una petición que llegó a uno de los dos orígenes, ya leída */
export interface RecordedRequest {
  url: string;
  method: string;
  contentType: string | null;
  text: string;
  /** El cuerpo como JSON, o null si no lo es (un sobre de Sentry son varias líneas de JSON) */
  json: unknown;
}

/** Un evento de la API de captura de PostHog */
export interface FakePostHogEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp?: string;
  /** La llave del proyecto con la que llegó el lote. Solo para revisar que es la pública */
  api_key?: string;
}

/** Una pieza de un sobre de Sentry, con el encabezado de la pieza y su contenido */
export interface SentryEnvelopeItem {
  type: string;
  payload: unknown;
}

export interface FakeTelemetry {
  /** Todo lo que llegó al origen de PostHog, en orden */
  readonly posthog: readonly RecordedRequest[];
  /** Todo lo que llegó al origen de Sentry, en orden */
  readonly sentry: readonly RecordedRequest[];
  /** Los eventos de PostHog que llegaron, en orden. Lee /batch/ ({ api_key, batch }) y /i/v0/e/ (un evento) */
  posthogEvents(): FakePostHogEvent[];
  /** Las piezas de los sobres de Sentry que llegaron, en orden */
  sentryItems(): SentryEnvelopeItem[];
  /** Los eventos de error o mensaje de Sentry (las piezas de tipo event), en orden */
  sentryEvents(): Record<string, unknown>[];
  /** Olvida lo que llegó, por ejemplo para revisar qué sale después de apagar el permiso */
  clear(): void;
  /** Atiende los dos orígenes en este contexto. createFakeSupabase lo llama en cada attach */
  attach(context: BrowserContext): Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Las piezas de un sobre de Sentry, que son líneas de JSON. Una línea que no se lee se salta */
function envelopeItems(text: string): SentryEnvelopeItem[] {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  // La primera línea es el encabezado del sobre. Luego van pares de encabezado de pieza y contenido
  const items: SentryEnvelopeItem[] = [];
  for (let index = 1; index + 1 < lines.length; index += 2) {
    const header = parseJson(lines[index] ?? '');
    const type = isRecord(header) && typeof header.type === 'string' ? header.type : 'unknown';
    items.push({ type, payload: parseJson(lines[index + 1] ?? '') });
  }
  return items;
}

function eventsOf(request: RecordedRequest): FakePostHogEvent[] {
  const body = request.json;
  if (!isRecord(body)) return [];
  const apiKey = typeof body.api_key === 'string' ? { api_key: body.api_key } : {};
  const toEvent = (value: unknown, fallback: Record<string, unknown>): FakePostHogEvent | null => {
    if (!isRecord(value) || typeof value.event !== 'string') return null;
    const distinct =
      typeof value.distinct_id === 'string'
        ? value.distinct_id
        : typeof fallback.distinct_id === 'string'
          ? fallback.distinct_id
          : '';
    return {
      event: value.event,
      distinct_id: distinct,
      properties: isRecord(value.properties) ? value.properties : {},
      ...(typeof value.timestamp === 'string' ? { timestamp: value.timestamp } : {}),
      ...apiKey,
    };
  };
  if (Array.isArray(body.batch)) {
    return (body.batch as unknown[])
      .map((item) => toEvent(item, body))
      .filter((item): item is FakePostHogEvent => item !== null);
  }
  const single = toEvent(body, body);
  return single ? [single] : [];
}

/** Los encabezados que el navegador necesita para aceptar la respuesta de otro origen */
function corsHeaders(request: Request): Record<string, string> {
  return {
    'access-control-allow-origin': request.headers().origin ?? '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

export function createFakeTelemetry(): FakeTelemetry {
  const posthog: RecordedRequest[] = [];
  const sentry: RecordedRequest[] = [];

  const serve = (log: RecordedRequest[], reply: unknown) => async (route: Route) => {
    const request = route.request();
    const headers = corsHeaders(request);
    // El permiso previo (preflight) del navegador no es una petición de datos y no se guarda
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const text = request.postData() ?? '';
    log.push({
      url: request.url(),
      method: request.method(),
      contentType: request.headers()['content-type'] ?? null,
      text,
      json: parseJson(text),
    });
    await route.fulfill({
      status: 200,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(reply),
    });
  };

  const sentryItems = () => sentry.flatMap((request) => envelopeItems(request.text));

  return {
    posthog,
    sentry,
    posthogEvents: () => posthog.flatMap(eventsOf),
    sentryItems,
    sentryEvents: () =>
      sentryItems()
        .filter((item) => item.type === 'event' && isRecord(item.payload))
        .map((item) => item.payload as Record<string, unknown>),
    clear() {
      posthog.length = 0;
      sentry.length = 0;
    },
    async attach(context) {
      await context.route(`${FAKE_POSTHOG_HOST}/**`, serve(posthog, { status: 1 }));
      await context.route(`${FAKE_SENTRY_ORIGIN}/**`, serve(sentry, { id: 'fake-event-id' }));
    },
  };
}
