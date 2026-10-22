// Resend simulado para las pruebas de B15. Atiende POST /emails con la misma forma que la API real, guarda
// lo que llega y reproduce las reglas que importan al envío: la llave de autorización, la repetición con el
// mismo Idempotency-Key (devuelve la misma respuesta sin mandar otro correo), el límite de 2 peticiones por
// segundo con 429 y los errores de validación. Nunca sale a la red. No lo importa ninguna función, solo las
// pruebas, así que no se sube al desplegar.
//
// El reloj es el que se le da, para que las pruebas lo adelanten con el mismo sleep que usa send-emails y
// comprueben el ritmo de una petición cada 550 milisegundos sin esperar de verdad.

export interface FakeResendRequest {
  url: string;
  method: string;
  /** Los encabezados con el nombre en minúsculas */
  headers: Record<string, string>;
  /** El cuerpo ya leído como JSON */
  body: Record<string, unknown>;
  /** El reloj cuando llegó */
  at: number;
}

/** Una respuesta de la que se ocupa la prueba en lugar de la normal */
export interface FakeResendReply {
  status: number;
  /** El nombre del error de Resend, como validation_error */
  name?: string;
}

export interface FakeResendOptions {
  /** La llave que acepta. Otra recibe 401 */
  apiKey: string;
  now?: () => number;
  /**
   * Decide la respuesta de la petición número index (desde 0). Con undefined sigue la regla normal. Sirve para
   * probar el 429, el 5xx o un 422 en un correo
   */
  script?: (request: FakeResendRequest, index: number) => FakeResendReply | undefined;
}

export interface FakeResend {
  fetch: typeof fetch;
  /** Todas las peticiones que llegaron, también las que no se aceptaron */
  requests: FakeResendRequest[];
  /** Los correos aceptados, uno por Idempotency-Key distinto */
  accepted: FakeResendRequest[];
  /** Cuántas veces llegó una petición con un Idempotency-Key ya visto */
  replays: number;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const errorOf = (status: number, name: string) =>
  json({ statusCode: status, name, message: 'Mensaje de prueba de Resend' }, status);

export function createFakeResend(options: FakeResendOptions): FakeResend {
  const now = options.now ?? (() => Date.now());
  const requests: FakeResendRequest[] = [];
  const accepted: FakeResendRequest[] = [];
  const seen = new Map<string, { body: string; id: string }>();
  const state = { replays: 0 };

  const handler = (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }
    const request: FakeResendRequest = {
      url,
      method: init?.method ?? 'GET',
      headers,
      body,
      at: now(),
    };
    const index = requests.length;
    requests.push(request);

    if (url !== 'https://api.resend.com/emails' || request.method !== 'POST') {
      return Promise.resolve(errorOf(404, 'not_found'));
    }
    if (headers.authorization !== `Bearer ${options.apiKey}`) {
      return Promise.resolve(errorOf(401, 'restricted_api_key'));
    }
    const scripted = options.script?.(request, index);
    if (scripted)
      return Promise.resolve(errorOf(scripted.status, scripted.name ?? 'error_de_prueba'));

    // El límite de 2 peticiones por segundo, contado en la última ventana de mil milisegundos
    const recent = requests.filter((other) => other.at > request.at - 1000).length;
    if (recent > 2) return Promise.resolve(errorOf(429, 'rate_limit_exceeded'));

    const key = headers['idempotency-key'] ?? '';
    if (key.length > 256) return Promise.resolve(errorOf(400, 'invalid_idempotency_key'));
    const canonical = JSON.stringify(body);
    const earlier = key === '' ? undefined : seen.get(key);
    if (earlier) {
      if (earlier.body !== canonical)
        return Promise.resolve(errorOf(409, 'invalid_idempotent_request'));
      state.replays += 1;
      return Promise.resolve(json({ id: earlier.id }, 200));
    }

    const to = body.to;
    const valid =
      typeof body.from === 'string' &&
      Array.isArray(to) &&
      to.length >= 1 &&
      to.every(
        (address) => typeof address === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address),
      ) &&
      typeof body.subject === 'string' &&
      body.subject !== '' &&
      (typeof body.html === 'string' || typeof body.text === 'string');
    if (!valid) return Promise.resolve(errorOf(422, 'validation_error'));
    const tags = body.tags;
    if (
      Array.isArray(tags) &&
      !tags.every(
        (tag: unknown) =>
          typeof tag === 'object' &&
          tag !== null &&
          /^[A-Za-z0-9_-]+$/.test(String((tag as { name?: unknown }).name)) &&
          /^[A-Za-z0-9_-]+$/.test(String((tag as { value?: unknown }).value)),
      )
    ) {
      return Promise.resolve(errorOf(422, 'validation_error'));
    }

    const id = `re-simulado-${accepted.length + 1}`;
    if (key !== '') seen.set(key, { body: canonical, id });
    accepted.push(request);
    return Promise.resolve(json({ id }, 200));
  };

  return {
    fetch: handler,
    requests,
    accepted,
    get replays() {
      return state.replays;
    },
  };
}
