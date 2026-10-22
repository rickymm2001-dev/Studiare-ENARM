// La función email-unsubscribe (B15 del plan del cambio, 3.6). La baja de los recordatorios de repaso. Se
// despliega sin verificación de JWT, porque quien llama es el correo de Gmail o de Yahoo o la página pública
// de la app, y se identifica con la ficha de baja, que son 144 bits al azar.
//   - POST de un clic. Gmail y Yahoo hacen POST a la dirección del encabezado List-Unsubscribe (RFC 8058)
//     con el cuerpo List-Unsubscribe=One-Click y la ficha en ?t=. Apaga el recordatorio y responde 200 en
//     blanco aunque la ficha no exista, para no revelar nada
//   - POST de la página /correo/baja de la app, con JSON { token }. Responde { result } con done, already o
//     invalid. La ficha no se puede adivinar, así que decir invalid a la página no regala nada
//   - GET. Responde con una redirección a {APP_URL}/correo/baja?t=, porque una función sin dominio propio
//     no puede servir HTML. Dar de baja con un GET lo harían los revisores de enlaces de los correos
// Una ficha que no tiene la forma ni se manda a la base. Nunca registra la ficha. No depende de Deno, así se
// prueba con Vitest (D-096).
import { corsHeaders, json } from './http.ts';

/** La ficha de baja, 18 bytes al azar en hexadecimal. Otra forma ni se manda a la base */
const TOKEN = /^[0-9a-f]{36}$/;
/** Lo más que se lee del cuerpo. La baja de un clic trae unos 25 caracteres */
const MAX_BODY = 2048;

export interface UnsubscribeDeps {
  /** APP_URL, para el CORS de la página y para la redirección del GET */
  appUrl: string | undefined;
  /** APP_ORIGINS, más orígenes de la página para el CORS mientras dura una mudanza de dominio (B17, 4.1) */
  appOrigins?: string | undefined;
  /** email_unsubscribe. Lanza si la base falla */
  unsubscribe: (token: string) => Promise<'done' | 'already' | 'invalid'>;
  log: (line: string) => void;
}

const blank = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });

async function readBody(request: Request): Promise<string> {
  try {
    return (await request.text()).slice(0, MAX_BODY);
  } catch {
    return '';
  }
}

export async function handleEmailUnsubscribe(
  request: Request,
  deps: UnsubscribeDeps,
): Promise<Response> {
  const cors = corsHeaders(
    { APP_URL: deps.appUrl, APP_ORIGINS: deps.appOrigins },
    request.headers.get('origin'),
  );
  if (request.method === 'OPTIONS') return blank(204, cors);
  const queryToken = new URL(request.url).searchParams.get('t') ?? '';

  if (request.method === 'GET') {
    // Solo manda a la página de la app. No da de baja a nadie
    if (!deps.appUrl) return blank(404);
    const target = new URL(deps.appUrl);
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/correo/baja`;
    if (TOKEN.test(queryToken)) target.searchParams.set('t', queryToken);
    return blank(302, { location: target.toString() });
  }
  if (request.method !== 'POST') return blank(405, { allow: 'GET, POST, OPTIONS' });

  const fromPage =
    request.headers.get('content-type')?.toLowerCase().includes('application/json') === true;
  if (fromPage) {
    // La página de la app. Dice si se dio de baja, ya lo estaba o la ficha ya no sirve
    let token: string;
    try {
      const body: unknown = JSON.parse(await readBody(request));
      const value =
        body !== null && typeof body === 'object' ? (body as { token?: unknown }).token : null;
      token = typeof value === 'string' ? value : '';
    } catch {
      token = '';
    }
    if (!TOKEN.test(token))
      return json({ result: 'invalid' }, 200, { ...cors, 'cache-control': 'no-store' });
    const result = await deps.unsubscribe(token);
    return json({ result }, 200, { ...cors, 'cache-control': 'no-store' });
  }

  // El correo de Gmail o Yahoo. Siempre 200 en blanco, exista o no la ficha
  await readBody(request);
  if (TOKEN.test(queryToken)) await deps.unsubscribe(queryToken);
  return blank(200);
}
