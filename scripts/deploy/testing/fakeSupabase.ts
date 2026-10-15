// Una API de administración de Supabase falsa en memoria, para probar la herramienta de despliegue sin
// red. Contesta por fetch con las mismas rutas y formas que la real (docs/DESPLIEGUE.md) y guarda cada
// petición para revisar qué se llamó. Al aplicar SQL lee sus funciones con el mismo lector del repo.
import { extractFunctions, fingerprint } from '../sql.ts';

export interface FakeRequest {
  method: string;
  /** Sin /v1/projects/{ref} ni la consulta */
  path: string;
  search: string;
  headers: Headers;
  json: unknown;
  form: FormData | null;
}

export interface FakeFunction {
  version: number;
  verifyJwt: boolean;
  status: string;
  files: { name: string; content: string }[];
  metadata: Record<string, unknown>;
}

export interface FakeOptions {
  ref?: string;
  history?: { version: string; name: string }[];
  /** Cuerpos de funciones que ya están en la base, por nombre */
  functions?: Record<string, string>;
  /** Funciones que anon puede ejecutar */
  anon?: string[];
  edge?: Record<string, { version: number; verifyJwt: boolean }>;
  secrets?: Record<string, string>;
  /** La fila de una consulta de comprobación, con lo que ya se aplicó */
  checkRow?: (applied: ReadonlySet<string>, query: string) => Record<string, unknown>;
  /** Cambia el cuerpo que queda en la base al aplicar, para simular una diferencia */
  tamper?: (name: string, body: string) => string;
  /** Funciones que quedan abiertas a anon al aplicarlas */
  anonOnApply?: string[];
  /** Responde con este estado y mensaje en toda llamada */
  failWith?: { status: number; message: string };
  /** Falla al aplicar este nombre */
  failApply?: string;
  /** Falla la ruta de solo lectura, para probar el respaldo */
  readOnlyStatus?: number;
  /** Al publicar no sube la versión */
  keepVersion?: boolean;
  /** Al publicar deja este verify_jwt sin importar lo que pidió la herramienta */
  forceVerifyJwt?: boolean;
  /** Cómo falla una consulta de comprobación. Un estado HTTP, una falla de red o null si contesta */
  checkFailure?: (applied: ReadonlySet<string>) => number | 'network' | null;
  /** Error de POST /secrets que repite lo que recibió, como haría una API indiscreta */
  echoSecretsError?: boolean;
}

export function fakeSupabase(options: FakeOptions = {}) {
  const ref = options.ref ?? 'abcdefghijklmnopqrst';
  const requests: FakeRequest[] = [];
  const history = [...(options.history ?? [])];
  const functions = new Map(Object.entries(options.functions ?? {}));
  const anon = new Set(options.anon ?? []);
  const applied = new Set<string>();
  const edge = new Map<string, FakeFunction>(
    Object.entries(options.edge ?? {}).map(([slug, value]) => [
      slug,
      { ...value, status: 'ACTIVE', files: [], metadata: {} },
    ]),
  );
  const secrets = new Map(Object.entries(options.secrets ?? {}));
  let clock = 20261015000000;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const info = (slug: string, fn: FakeFunction) => ({
    id: `id-${slug}`,
    slug,
    name: slug,
    status: fn.status,
    version: fn.version,
    created_at: 1,
    updated_at: 2,
    verify_jwt: fn.verifyJwt,
    import_map: false,
    entrypoint_path: `file:///tmp/source/${slug}/index.ts`,
  });

  function queryRows(query: string): Record<string, unknown>[] {
    if (query.startsWith('-- studiare-deploy huellas')) {
      const names = [...query.matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((match) => match[1] ?? '');
      return names
        .filter((name) => functions.has(name))
        .map((name) => ({
          name,
          fingerprint: fingerprint(functions.get(name) ?? ''),
          anon: anon.has(name),
        }));
    }
    return [options.checkRow?.(applied, query) ?? {}];
  }

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const prefix = `/v1/projects/${ref}`;
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
    const body = init?.body;
    const request: FakeRequest = {
      method,
      path,
      search: url.search,
      headers: new Headers(init?.headers),
      json: typeof body === 'string' ? (JSON.parse(body) as unknown) : null,
      form: body instanceof FormData ? body : null,
    };
    requests.push(request);
    if (options.failWith)
      return json({ message: options.failWith.message }, options.failWith.status);
    const payload = (request.json ?? {}) as Record<string, unknown>;

    if (method === 'GET' && path === '/database/migrations') return json(history);
    if (method === 'POST' && path === '/database/migrations') {
      const name = String(payload.name);
      if (name === options.failApply) return json({ message: 'syntax error at or near x' }, 500);
      const query = String(payload.query);
      for (const fn of extractFunctions(query)) {
        if (fn.body === null) continue;
        functions.set(fn.name, options.tamper ? options.tamper(fn.name, fn.body) : fn.body);
        if (options.anonOnApply?.includes(fn.name)) anon.add(fn.name);
      }
      applied.add(name);
      clock += 1;
      history.push({ version: String(clock), name });
      return json(null);
    }
    const isCheck =
      (path === '/database/query/read-only' || path === '/database/query') &&
      !String(payload.query).startsWith('-- studiare-deploy huellas');
    const failure = isCheck ? (options.checkFailure?.(applied) ?? null) : null;
    if (failure === 'network') throw new TypeError('fetch failed');
    if (failure !== null) return json({ message: `la consulta falló con ${failure}` }, failure);
    if (method === 'POST' && path === '/database/query/read-only') {
      if (options.readOnlyStatus)
        return json({ message: 'read-only falló' }, options.readOnlyStatus);
      return json(queryRows(String(payload.query)), 201);
    }
    if (method === 'POST' && path === '/database/query') {
      return json(queryRows(String(payload.query)), 201);
    }
    if (method === 'GET' && path === '/functions') {
      return json([...edge].map(([slug, fn]) => info(slug, fn)));
    }
    const slugMatch = /^\/functions\/([a-z0-9-]+)$/.exec(path);
    if (method === 'GET' && slugMatch?.[1]) {
      const fn = edge.get(slugMatch[1]);
      return fn ? json(info(slugMatch[1], fn)) : json({ message: 'Function not found' }, 404);
    }
    if (method === 'POST' && path === '/functions/deploy') {
      const slug = url.searchParams.get('slug') ?? '';
      const form = request.form;
      const rawMetadata = form?.get('metadata') ?? '{}';
      const metadata = JSON.parse(
        typeof rawMetadata === 'string' ? rawMetadata : await rawMetadata.text(),
      ) as Record<string, unknown>;
      const files = await Promise.all(
        (form?.getAll('file') ?? []).map(async (file) => ({
          name: file instanceof File ? file.name : '',
          content: typeof file === 'string' ? file : await file.text(),
        })),
      );
      const previous = edge.get(slug);
      const next: FakeFunction = {
        version: options.keepVersion ? (previous?.version ?? 1) : (previous?.version ?? 0) + 1,
        verifyJwt: options.forceVerifyJwt ?? metadata.verify_jwt === true,
        status: 'ACTIVE',
        files,
        metadata,
      };
      edge.set(slug, next);
      return json(info(slug, next), 201);
    }
    if (method === 'GET' && path === '/secrets') {
      return json([...secrets].map(([name, value]) => ({ name, value: `digest-${value.length}` })));
    }
    if (method === 'POST' && path === '/secrets') {
      if (options.echoSecretsError) {
        return json({ message: `No me gustó ${JSON.stringify(request.json)}` }, 400);
      }
      for (const entry of request.json as { name: string; value: string }[]) {
        secrets.set(entry.name, entry.value);
      }
      return json(null, 201);
    }
    return json({ message: `Ruta falsa sin respuesta ${method} ${path}` }, 404);
  }) as typeof fetch;

  /** Las peticiones que escriben. Una consulta con read_only no cuenta */
  const writes = () =>
    requests.filter(
      (request) =>
        request.method !== 'GET' &&
        request.path !== '/database/query/read-only' &&
        !(
          request.path === '/database/query' &&
          (request.json as { read_only?: unknown } | null)?.read_only === true
        ),
    );

  return {
    ref,
    fetch: fetchImpl,
    requests,
    writes,
    history,
    functions,
    anon,
    applied,
    edge,
    secrets,
  };
}
