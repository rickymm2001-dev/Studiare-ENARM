// Las llaves de Supabase de las funciones, en sus dos formas (B17, 4.2). La de siempre es un JWT (anon y
// service_role) y la nueva no (sb_publishable_ y sb_secret_). Las dos funcionan a la vez, así que el cambio se
// hace sin cortes y las pruebas fijan las dos formas.
import { describe, expect, it } from 'vitest';
import {
  isOpaqueKey,
  keyLevel,
  KEY_ENV_NAMES,
  resolveSupabaseKeys,
  serviceHeaders,
} from './keys.ts';

const jwt = (role: string) =>
  ['eyJhbGciOiJIUzI1NiJ9', btoa(JSON.stringify({ role })).replace(/=+$/, ''), 'firma'].join('.');
const ANON = jwt('anon');
const SERVICE = jwt('service_role');
const NEW_PUBLIC = 'sb_publishable_' + 'AbCdEf0123456789_zYxWvUtS';
const NEW_SECRET = 'sb_secret_' + 'AbCdEf0123456789_zYxWvUtS';
const dictionary = (entries: Record<string, unknown>) => JSON.stringify(entries);

describe('qué puede hacer una llave', () => {
  it('reconoce las dos formas, de servicio y públicas', () => {
    expect(keyLevel(NEW_SECRET)).toBe('service');
    expect(keyLevel(SERVICE)).toBe('service');
    expect(keyLevel(NEW_PUBLIC)).toBe('public');
    expect(keyLevel(ANON)).toBe('public');
  });

  it('lo que no es ninguna de las dos es desconocido, nunca se toma por pública ni de servicio', () => {
    for (const key of ['', 'abc', 'a.b.c', jwt('authenticated'), 'sb_otra_cosa_0123456789']) {
      expect(keyLevel(key), key).toBe('unknown');
    }
  });

  it('una llave nueva se manda sin authorization, y toda la que empieza con sb_ cuenta', () => {
    expect(isOpaqueKey(NEW_SECRET)).toBe(true);
    expect(isOpaqueKey(NEW_PUBLIC)).toBe(true);
    expect(isOpaqueKey('sb_mal_formada')).toBe(true);
    expect(isOpaqueKey(SERVICE)).toBe(false);
    expect(isOpaqueKey('llave-de-prueba')).toBe(false);
  });
});

describe('serviceHeaders', () => {
  it('la llave nueva va solo en apikey, porque no es un JWT y la plataforma rechaza un Bearer así', () => {
    expect(serviceHeaders(NEW_SECRET)).toEqual({ apikey: NEW_SECRET });
  });

  it('la llave de siempre va en apikey y en authorization, como hasta hoy', () => {
    expect(serviceHeaders(SERVICE)).toEqual({
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
    });
    expect(serviceHeaders('llave-de-prueba')).toEqual({
      apikey: 'llave-de-prueba',
      authorization: 'Bearer llave-de-prueba',
    });
  });
});

describe('qué llave toma la función', () => {
  it('sin las nuevas usa las de siempre, que es como sale todo mientras Ricardo no las cree', () => {
    expect(
      resolveSupabaseKeys({ SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE }),
    ).toEqual({ anonKey: ANON, serviceKey: SERVICE, anonFrom: 'legacy', serviceFrom: 'legacy' });
  });

  it('las nuevas ganan apenas existen, cada una por su lado', () => {
    const both = resolveSupabaseKeys({
      SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      SUPABASE_PUBLISHABLE_KEYS: dictionary({ default: NEW_PUBLIC }),
      SUPABASE_SECRET_KEYS: dictionary({ default: NEW_SECRET }),
    });
    expect(both).toEqual({
      anonKey: NEW_PUBLIC,
      serviceKey: NEW_SECRET,
      anonFrom: 'new',
      serviceFrom: 'new',
    });
    const onlySecret = resolveSupabaseKeys({
      SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      SUPABASE_SECRET_KEYS: dictionary({ default: NEW_SECRET }),
    });
    expect(onlySecret).toMatchObject({ anonKey: ANON, serviceKey: NEW_SECRET, serviceFrom: 'new' });
  });

  it('funciona solo con las nuevas y dice cuando falta alguna', () => {
    expect(
      resolveSupabaseKeys({
        SUPABASE_PUBLISHABLE_KEYS: dictionary({ default: NEW_PUBLIC }),
        SUPABASE_SECRET_KEYS: dictionary({ default: NEW_SECRET }),
      }),
    ).toMatchObject({ anonKey: NEW_PUBLIC, serviceKey: NEW_SECRET });
    expect(resolveSupabaseKeys({})).toEqual({
      anonKey: '',
      serviceKey: '',
      anonFrom: 'missing',
      serviceFrom: 'missing',
    });
    expect(
      resolveSupabaseKeys({ SUPABASE_ANON_KEY: '  ', SUPABASE_SERVICE_ROLE_KEY: '' }),
    ).toMatchObject({ anonFrom: 'missing', serviceFrom: 'missing' });
  });

  it('sin default toma la primera con la forma, y prefiere default si hay varias', () => {
    const named = dictionary({ ci: NEW_SECRET.replace('AbCd', 'XxXx'), default: NEW_SECRET });
    expect(resolveSupabaseKeys({ SUPABASE_SECRET_KEYS: named }).serviceKey).toBe(NEW_SECRET);
    const noDefault = dictionary({ ci: 'no es una llave', otra: NEW_SECRET });
    expect(resolveSupabaseKeys({ SUPABASE_SECRET_KEYS: noDefault }).serviceKey).toBe(NEW_SECRET);
  });

  it('un JSON roto, sin la forma o con la llave de otro tipo se ignora y cae a la de siempre', () => {
    const bad = [
      '',
      '   ',
      '{',
      'null',
      '[]',
      '"sb_secret_' + 'AbCdEf0123456789_zYxWvUtS"',
      '{}',
      dictionary({ default: 5 }),
      dictionary({ default: 'sb_secret_corta' }),
      dictionary({ default: 'sb_secret_con espacios 0123456789' }),
      // Una publicable en el diccionario de las secretas, y al revés, no vale
      dictionary({ default: NEW_PUBLIC }),
    ];
    for (const value of bad) {
      const resolved = resolveSupabaseKeys({
        SUPABASE_SECRET_KEYS: value,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      });
      expect(resolved, value).toMatchObject({ serviceKey: SERVICE, serviceFrom: 'legacy' });
    }
    expect(
      resolveSupabaseKeys({
        SUPABASE_PUBLISHABLE_KEYS: dictionary({ default: NEW_SECRET }),
        SUPABASE_ANON_KEY: ANON,
      }),
    ).toMatchObject({ anonKey: ANON, anonFrom: 'legacy' });
  });

  it('quita los espacios de las llaves de siempre', () => {
    expect(
      resolveSupabaseKeys({ SUPABASE_ANON_KEY: ` ${ANON}\n`, SUPABASE_SERVICE_ROLE_KEY: SERVICE }),
    ).toMatchObject({ anonKey: ANON });
  });

  it('el resultado no trae mensajes ni texto con valores, solo las llaves y de dónde salieron', () => {
    const resolved = resolveSupabaseKeys({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_roto' });
    expect(Object.keys(resolved).sort()).toEqual([
      'anonFrom',
      'anonKey',
      'serviceFrom',
      'serviceKey',
    ]);
  });

  it('lee exactamente los cuatro nombres que se pasan desde los index.ts y runtime.ts', () => {
    expect([...KEY_ENV_NAMES].sort()).toEqual([
      'SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEYS',
      'SUPABASE_SECRET_KEYS',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]);
  });
});
