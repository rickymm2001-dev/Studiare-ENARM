import { describe, expect, it } from 'vitest';
import { ManagementApiError, createManagementClient } from './managementApi.ts';
import { fakeSupabase } from './testing/fakeSupabase.ts';

// Un token falso. No tiene la forma de uno real para que ningún escáner de secretos lo confunda
const TOKEN = 'token-falso-de-prueba-que-no-debe-salir-en-pantalla';

function setup(options: Parameters<typeof fakeSupabase>[0] = {}, token: string | null = TOKEN) {
  const fake = fakeSupabase(options);
  const client = createManagementClient({ ref: fake.ref, token, fetch: fake.fetch });
  return { fake, client };
}

describe('forma de cada llamada a la API de administración', () => {
  it('SQL con escritura y de solo lectura', async () => {
    const { fake, client } = setup({ checkRow: () => ({ listo: true }) });
    expect(await client.runQuery('select true as listo')).toEqual([{ listo: true }]);
    expect(await client.readQuery('select true as listo')).toEqual([{ listo: true }]);
    const [write, read] = fake.requests;
    expect(write?.method).toBe('POST');
    expect(write?.path).toBe('/database/query');
    expect(write?.json).toEqual({ query: 'select true as listo' });
    expect(write?.headers.get('content-type')).toBe('application/json');
    expect(write?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(read?.path).toBe('/database/query/read-only');
    expect(read?.json).toEqual({ query: 'select true as listo' });
  });

  it('si la ruta de solo lectura falla, repite en la general con read_only', async () => {
    const { fake, client } = setup({ readOnlyStatus: 500, checkRow: () => ({ ok: 1 }) });
    // Sin pedirlo no hay respaldo
    await expect(client.readQuery('select 1 as ok')).rejects.toThrow(/500/);
    fake.requests.splice(0);
    expect(await client.readQuery('select 1 as ok', { fallback: true })).toEqual([{ ok: 1 }]);
    expect(fake.requests.map((request) => request.path)).toEqual([
      '/database/query/read-only',
      '/database/query',
    ]);
    expect(fake.requests[1]?.json).toEqual({ query: 'select 1 as ok', read_only: true });
  });

  it('un 401 no se repite y el error no lleva el token', async () => {
    const { fake, client } = setup({
      failWith: { status: 401, message: 'JWT could not be decoded' },
    });
    const error = await client.readQuery('select 1').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ManagementApiError);
    expect((error as ManagementApiError).status).toBe(401);
    expect((error as Error).message).toBe(
      'Supabase respondió 401 en POST /database/query/read-only. JWT could not be decoded',
    );
    expect((error as Error).message).not.toContain(TOKEN);
    expect(fake.requests).toHaveLength(1);
  });

  it('historia de migraciones y aplicar una con su nombre', async () => {
    const { fake, client } = setup({
      history: [{ version: '20261015010236', name: 'billing_emails' }],
    });
    expect(await client.listMigrations()).toEqual([
      { version: '20261015010236', name: 'billing_emails' },
    ]);
    await client.applyMigration({ name: 'manual_pagos_b10', query: 'select 1;' });
    expect(fake.requests[0]).toMatchObject({ method: 'GET', path: '/database/migrations' });
    expect(fake.requests[1]).toMatchObject({
      method: 'POST',
      path: '/database/migrations',
      json: { query: 'select 1;', name: 'manual_pagos_b10' },
    });
    // Idempotency-Key, que la especificación acepta en esta ruta, sale del nombre y del SQL
    const key = fake.requests[1]?.headers.get('idempotency-key') ?? '';
    expect(key).toMatch(/^studiare-manual_pagos_b10-[0-9a-f]{32}$/);
    await client.applyMigration({ name: 'manual_pagos_b10', query: 'select 2;' });
    expect(fake.requests[2]?.headers.get('idempotency-key')).not.toBe(key);
  });

  it('funciones, una por slug y 404 como null', async () => {
    const { fake, client } = setup({
      edge: { 'create-checkout': { version: 16, verifyJwt: true } },
    });
    expect(await client.listFunctions()).toMatchObject([
      { slug: 'create-checkout', version: 16, verifyJwt: true, status: 'ACTIVE' },
    ]);
    expect(await client.getFunction('create-checkout')).toMatchObject({ version: 16 });
    expect(await client.getFunction('cancel-subscription')).toBeNull();
    expect(fake.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'GET /functions',
      'GET /functions/create-checkout',
      'GET /functions/cancel-subscription',
    ]);
  });

  it('publicar manda multipart con metadata y cada archivo con su ruta desde la raíz', async () => {
    const { fake, client } = setup();
    const result = await client.deployFunction({
      slug: 'cancel-subscription',
      entrypointPath: 'supabase/functions/cancel-subscription/index.ts',
      verifyJwt: true,
      files: [
        { path: 'supabase/functions/cancel-subscription/index.ts', content: "import './x.ts';" },
        { path: 'supabase/functions/_shared/x.ts', content: 'export const ñ = 1;' },
      ],
    });
    expect(result).toMatchObject({ slug: 'cancel-subscription', version: 1, verifyJwt: true });
    const request = fake.requests[0];
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe('/functions/deploy');
    expect(request?.search).toBe('?slug=cancel-subscription');
    // fetch pone el content-type de multipart con la frontera, así que no se fija a mano
    expect(request?.headers.get('content-type')).toBeNull();
    // Como el CLI, metadata va como campo de texto y no como archivo
    const metadata = request?.form?.get('metadata');
    expect(typeof metadata).toBe('string');
    expect(JSON.parse(metadata as string)).toEqual({
      name: 'cancel-subscription',
      entrypoint_path: 'supabase/functions/cancel-subscription/index.ts',
      verify_jwt: true,
    });
    const files = request?.form?.getAll('file') ?? [];
    expect(files.map((file) => (file instanceof File ? file.name : ''))).toEqual([
      'supabase/functions/cancel-subscription/index.ts',
      'supabase/functions/_shared/x.ts',
    ]);
    expect(await (files[1] as File).text()).toBe('export const ñ = 1;');
    expect(fake.edge.get('cancel-subscription')?.files).toHaveLength(2);
  });

  it('con un deno.json manda import_map_path en el metadata y el archivo entre los demás', async () => {
    const { fake, client } = setup();
    await client.deployFunction({
      slug: 'ai-proxy',
      entrypointPath: 'supabase/functions/ai-proxy/index.ts',
      verifyJwt: false,
      files: [
        { path: 'supabase/functions/ai-proxy/index.ts', content: "import { z } from 'zod';" },
        { path: 'supabase/functions/ai-proxy/deno.json', content: '{"imports":{}}' },
      ],
      importMapPath: 'supabase/functions/ai-proxy/deno.json',
    });
    const request = fake.requests[0];
    expect(JSON.parse(request?.form?.get('metadata') as string)).toEqual({
      name: 'ai-proxy',
      entrypoint_path: 'supabase/functions/ai-proxy/index.ts',
      verify_jwt: false,
      import_map_path: 'supabase/functions/ai-proxy/deno.json',
    });
    const names = (request?.form?.getAll('file') ?? []).map((file) =>
      file instanceof File ? file.name : '',
    );
    expect(names).toContain('supabase/functions/ai-proxy/deno.json');
  });

  it('secretos en una sola llamada y la lista solo con nombres', async () => {
    const { fake, client } = setup({ secrets: { APP_URL: 'https://app.example' } });
    await client.setSecrets([
      { name: 'STRIPE_PRICE_FOUNDER', value: 'price_123' },
      { name: 'STRIPE_PORTAL_CONFIG_REGULAR', value: 'bpc_456' },
    ]);
    expect(fake.requests[0]).toMatchObject({
      method: 'POST',
      path: '/secrets',
      json: [
        { name: 'STRIPE_PRICE_FOUNDER', value: 'price_123' },
        { name: 'STRIPE_PORTAL_CONFIG_REGULAR', value: 'bpc_456' },
      ],
    });
    const names = await client.listSecretNames();
    expect(names.sort()).toEqual([
      'APP_URL',
      'STRIPE_PORTAL_CONFIG_REGULAR',
      'STRIPE_PRICE_FOUNDER',
    ]);
    expect(fake.requests[1]).toMatchObject({ method: 'GET', path: '/secrets' });
  });

  it('si fetch lanza, el error no repite su mensaje, que puede traer el token', async () => {
    const client = createManagementClient({
      ref: 'abcdefghijklmnopqrst',
      token: `${TOKEN}\r`,
      fetch: () =>
        Promise.reject(
          new TypeError(`Headers.append: Bearer ${TOKEN}\r is an invalid header value.`),
        ),
    });
    const error = await client.listMigrations().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ManagementApiError);
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).toContain(
      'No hubo respuesta de Supabase en GET /database/migrations',
    );
  });

  it('si Supabase repitiera el token en su mensaje, sale tapado', async () => {
    const { client } = setup({ failWith: { status: 400, message: `token ${TOKEN} inválido` } });
    const error = await client.listMigrations().catch((caught: unknown) => caught);
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).toContain('[oculto]');
  });

  it('sin token no manda authorization, para que lo ponga el proxy', async () => {
    const { fake, client } = setup({}, null);
    await client.listMigrations();
    expect(fake.requests[0]?.headers.get('authorization')).toBeNull();
  });

  it('la referencia del proyecto debe tener la forma de Supabase', () => {
    expect(() => createManagementClient({ ref: 'mal', token: null, fetch })).toThrow(
      ManagementApiError,
    );
  });
});
