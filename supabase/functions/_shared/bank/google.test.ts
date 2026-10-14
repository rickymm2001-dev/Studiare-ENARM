// Pruebas del cliente de Google Sheets de bank-sync (B11). Todo contra el Google de mentira, con una llave
// que se genera en cada prueba. Nunca hay red ni llaves en el repo.
import { describe, expect, it } from 'vitest';
import { createFakeGoogle, type FakeSheetFixture } from './fakeGoogle.ts';
import {
  base64Url,
  columnLetter,
  createGoogleClient,
  GoogleError,
  parseServiceAccount,
  SHEETS_API,
  SHEETS_SCOPE,
  sheetRange,
  signServiceJwt,
  TOKEN_URL,
  type GoogleDeps,
} from './google.ts';
import { hasFormulas, readBankSheet, tableFromValues, topicMismatches } from './sheetTable.ts';
import { topicTaxonomy } from './generated/topicTaxonomy.ts';

const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);

const fixture: FakeSheetFixture = {
  spreadsheet: {
    spreadsheetId: 'hoja-de-prueba',
    sheets: [
      {
        properties: { title: "Preguntas d'Paco", gridProperties: { rowCount: 3, columnCount: 3 } },
      },
    ],
  },
  values: {
    spreadsheetId: 'hoja-de-prueba',
    valueRanges: [
      {
        values: [
          ['ID', 'Pregunta'],
          ['GO-0001', '[Prueba] uno'],
        ],
      },
    ],
  },
  formulas: {
    range: "'Preguntas d''Paco'!A2:A2",
    majorDimension: 'ROWS',
    values: [['="GO-"&TEXT(ROW()-1,"0000")']],
  },
};

function decode(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))) as Record<
    string,
    unknown
  >;
}

function depsFor(fetcher: typeof fetch, clock = { now: NOW }, slept: number[] = []): GoogleDeps {
  return {
    fetch: fetcher,
    now: () => clock.now,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  };
}

describe('llave de la cuenta de servicio', () => {
  it('acepta solo un JSON con client_email y private_key', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('no es json')).toBeNull();
    expect(parseServiceAccount('{"client_email":"a@b.mx"}')).toBeNull();
    expect(
      parseServiceAccount(
        JSON.stringify({ client_email: 'a@b.mx', private_key: '-----BEGIN PRIVATE KEY-----x' }),
      ),
    ).toEqual({ client_email: 'a@b.mx', private_key: '-----BEGIN PRIVATE KEY-----x' });
  });
});

describe('JWT de la cuenta de servicio', () => {
  it('lleva RS256, la cuenta, el alcance de solo lectura, el token como aud y una hora', async () => {
    const google = await createFakeGoogle([fixture], { now: () => NOW });
    const jwt = await signServiceJwt(google.key, NOW);
    const [header = '', claims = '', signature = ''] = jwt.split('.');
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const parsed = decode(claims);
    expect(parsed).toEqual({
      iss: google.key.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    });
    expect(SHEETS_SCOPE).toBe('https://www.googleapis.com/auth/spreadsheets.readonly');
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('la firma verifica con la llave de la prueba y una firma alterada no', async () => {
    const google = await createFakeGoogle([fixture], { now: () => NOW });
    const client = createGoogleClient(google.key, depsFor(google.fetch));
    await expect(client.accessToken()).resolves.toBe('fake-token-1');
    expect(google.lastClaims?.scope).toBe(SHEETS_SCOPE);

    const jwt = await signServiceJwt(google.key, NOW);
    const tampered = `${jwt.slice(0, -4)}${jwt.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
    const reply = await google.fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: tampered,
      }).toString(),
    });
    expect(reply.status).toBe(400);
  });

  it('base64Url no deja relleno ni caracteres de URL', () => {
    expect(base64Url(new Uint8Array([251, 255, 254]))).toBe('-__-');
  });
});

describe('cliente de Google Sheets', () => {
  it('guarda el token en memoria hasta un minuto antes de que venza', async () => {
    const clock = { now: NOW };
    const google = await createFakeGoogle([fixture], { now: () => clock.now });
    const client = createGoogleClient(google.key, depsFor(google.fetch, clock));
    await client.sheets('hoja-de-prueba');
    await client.sheets('hoja-de-prueba');
    expect(google.tokens).toBe(1);
    clock.now += (3600 - 61) * 1000;
    await client.sheets('hoja-de-prueba');
    expect(google.tokens).toBe(1);
    clock.now += 2000;
    await client.sheets('hoja-de-prueba');
    expect(google.tokens).toBe(2);
  });

  it('codifica la pestaña con comillas y pide FORMULA solo para la columna ID', async () => {
    const google = await createFakeGoogle([fixture], { now: () => NOW });
    const client = createGoogleClient(google.key, depsFor(google.fetch));
    const read = await readBankSheet(
      client,
      'hoja-de-prueba',
      { tab: "Preguntas d'Paco", maxRows: 1 },
      topicTaxonomy.branches,
    );
    const sheetCalls = google.requests.filter((url) => url.startsWith(SHEETS_API));
    expect(sheetCalls).toHaveLength(3);
    expect(sheetCalls[0]).toBe(
      `${SHEETS_API}/hoja-de-prueba?fields=sheets.properties(title%2CgridProperties)`,
    );
    const batch = new URL(sheetCalls[1] ?? '');
    expect(batch.pathname).toBe('/v4/spreadsheets/hoja-de-prueba/values:batchGet');
    expect(batch.searchParams.getAll('ranges')).toEqual(["'Preguntas d''Paco'!1:2"]);
    expect(batch.searchParams.get('valueRenderOption')).toBe('FORMATTED_VALUE');
    expect(sheetCalls[2]).toBe(
      `${SHEETS_API}/hoja-de-prueba/values/${encodeURIComponent("'Preguntas d''Paco'!A2:A2")}?valueRenderOption=FORMULA&majorDimension=ROWS`,
    );
    expect(read.idFormula).toBe(true);
    expect(read.table.headers).toEqual(['ID', 'Pregunta']);
    expect(read.table.rows).toEqual([{ rowNumber: 2, cells: ['GO-0001', '[Prueba] uno'] }]);
    expect(read.truncated).toBe(true);
    expect(read.topicMismatches).toBeNull();
  });

  it('una pestaña que no existe es un error del paso tab_missing', async () => {
    const google = await createFakeGoogle([fixture], { now: () => NOW });
    const client = createGoogleClient(google.key, depsFor(google.fetch));
    await expect(
      readBankSheet(client, 'hoja-de-prueba', { tab: 'Otra', maxRows: 10 }, []),
    ).rejects.toMatchObject({ name: 'GoogleError', step: 'tab_missing', status: 404 });
  });

  it('reintenta una vez un 429 a los dos segundos', async () => {
    const google = await createFakeGoogle([fixture], { now: () => NOW, rateLimitOnce: true });
    const slept: number[] = [];
    const client = createGoogleClient(google.key, depsFor(google.fetch, { now: NOW }, slept));
    await expect(client.sheets('hoja-de-prueba')).resolves.toEqual([
      { title: "Preguntas d'Paco", rowCount: 3, columnCount: 3 },
    ]);
    expect(slept).toEqual([2000]);
  });

  it('un 429 seguido o cualquier otro error lanza GoogleError sin el cuerpo', async () => {
    const google = await createFakeGoogle([fixture], { now: () => NOW, failWith: 429 });
    const client = createGoogleClient(google.key, depsFor(google.fetch));
    const error = await client.sheets('hoja-de-prueba').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GoogleError);
    expect(error).toMatchObject({ step: 'metadata', status: 429 });
    expect((error as Error).message).not.toContain('fail');

    const denied = await createFakeGoogle([fixture], { now: () => NOW, failWith: 403 });
    const other = createGoogleClient(denied.key, depsFor(denied.fetch));
    await expect(other.values('hoja-de-prueba', 'A1', 'FORMULA')).rejects.toMatchObject({
      step: 'values',
      status: 403,
    });
  });
});

describe('ayudas de la hoja', () => {
  it('letras de columna y rangos', () => {
    expect([1, 26, 27, 52, 53, 702, 703].map(columnLetter)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
    expect(sheetRange('Temas', 'A:Z')).toBe("'Temas'!A:Z");
  });

  it('detecta fórmulas y convierte celdas a texto', () => {
    expect(hasFormulas([['GO-0001'], ['GO-0002']])).toBe(false);
    expect(hasFormulas([['GO-0001'], ['=A1']])).toBe(true);
    expect(
      tableFromValues('P', [
        ['ID', 'Dificultad'],
        ['GO-0001', 3, true, null],
      ]),
    ).toEqual({
      name: 'P',
      headers: ['ID', 'Dificultad'],
      rows: [{ rowNumber: 2, cells: ['GO-0001', '3', 'true', ''] }],
    });
  });

  it('cuenta los renglones de Temas que no coinciden con la taxonomía', () => {
    const branch = topicTaxonomy.branches.find((item) => item.key === 'obstetrics_gynecology');
    const topic = branch?.topics[0];
    const subtopic = topic?.subtopics[0];
    if (!branch || !topic || !subtopic) throw new Error('taxonomía sin Ginecología y obstetricia');
    const values = [
      ['Rama troncal\nLa rama', 'Subespecialidad', 'Subtema'],
      [branch.name, topic.name, subtopic.name],
      [branch.name, 'Obstetricia', subtopic.name],
      ['', '', ''],
    ];
    expect(topicMismatches(values, topicTaxonomy.branches)).toBe(1);
    expect(topicMismatches([['Otra'], ['x']], topicTaxonomy.branches)).toBe(1);
  });
});
