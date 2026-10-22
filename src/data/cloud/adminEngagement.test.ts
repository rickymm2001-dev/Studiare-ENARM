// Lo que lee y cambia el admin en Correos y alertas (B15, 3.1 y 2.4). La nube se imita con un cliente en
// memoria: ninguna petición sale a la red
import { describe, expect, it } from 'vitest';
import {
  OVERVIEW_DAYS,
  readAnalyticsSwitch,
  readEmailDelivery,
  readEmailOverview,
  saveAnalyticsSwitch,
  saveEmailDelivery,
  sendServerAlertTest,
} from './adminEngagement';
import { EMAIL_DELIVERY_OFF } from './engagementContracts';

interface Result {
  data: unknown;
  error: unknown;
}

/** Un cliente de platform_settings con lo que se le dé. undefined en una clave es que la lectura falla */
function settings(values: Record<string, unknown>, failWrites = false) {
  const upserts: { key: string; value: unknown }[] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe('platform_settings');
      let key = '';
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          key = value;
          return query;
        },
        maybeSingle: (): Promise<Result> =>
          key in values && values[key] === undefined
            ? Promise.resolve({ data: null, error: { code: '500' } })
            : Promise.resolve({ data: key in values ? { value: values[key] } : null, error: null }),
        upsert: (row: { key: string; value: unknown }): Promise<Result> => {
          upserts.push({ key: row.key, value: row.value });
          return Promise.resolve({ data: null, error: failWrites ? { code: '42501' } : null });
        },
      };
      return query;
    },
  };
  return { client: client as never, upserts };
}

describe('interruptor de envío de correos', () => {
  it('nace apagado y sin tipos en pausa cuando no hay clave', async () => {
    expect(await readEmailDelivery(settings({}).client)).toEqual(EMAIL_DELIVERY_OFF);
  });

  it('lee lo que hay, con la pausa por tipo', async () => {
    const { client } = settings({
      email_delivery: { enabled: true, paused: ['daily_review_reminder'] },
    });
    expect(await readEmailDelivery(client)).toEqual({
      enabled: true,
      paused: ['daily_review_reminder'],
    });
  });

  it('un valor que no cumple la forma cuenta como apagado, nunca como prendido', async () => {
    for (const value of [
      'si',
      1,
      { enabled: 'true' },
      { enabled: true, paused: 'todos' },
      [],
      null,
    ]) {
      expect(
        await readEmailDelivery(settings({ email_delivery: value }).client),
        JSON.stringify(value),
      ).toEqual(EMAIL_DELIVERY_OFF);
    }
    // Sin la lista de pausa se entiende que no hay ninguna
    expect(await readEmailDelivery(settings({ email_delivery: { enabled: true } }).client)).toEqual(
      {
        enabled: true,
        paused: [],
      },
    );
  });

  it('si no se pudo leer devuelve null, que no es lo mismo que apagado', async () => {
    expect(await readEmailDelivery(settings({ email_delivery: undefined }).client)).toBeNull();
    const broken = {
      from: () => {
        throw new Error('sin red');
      },
    } as never;
    expect(await readEmailDelivery(broken)).toBeNull();
  });

  it('guarda sin repetir ni dejar tipos vacíos', async () => {
    const { client, upserts } = settings({});
    expect(
      await saveEmailDelivery(client, {
        enabled: true,
        paused: ['trial_ending', ' trial_ending ', '', 'daily_review_reminder'],
      }),
    ).toBe(true);
    expect(upserts).toEqual([
      {
        key: 'email_delivery',
        value: { enabled: true, paused: ['trial_ending', 'daily_review_reminder'] },
      },
    ]);
  });

  it('dice que no se guardó si la base lo rechaza o la red falla', async () => {
    expect(await saveEmailDelivery(settings({}, true).client, EMAIL_DELIVERY_OFF)).toBe(false);
    const broken = {
      from: () => {
        throw new Error('sin red');
      },
    } as never;
    expect(await saveEmailDelivery(broken, EMAIL_DELIVERY_OFF)).toBe(false);
  });
});

describe('interruptor de la analítica', () => {
  it('nace apagado, se guarda y un valor raro cuenta como apagado', async () => {
    expect(await readAnalyticsSwitch(settings({}).client)).toEqual({ enabled: false });
    expect(await readAnalyticsSwitch(settings({ analytics: { enabled: true } }).client)).toEqual({
      enabled: true,
    });
    expect(await readAnalyticsSwitch(settings({ analytics: 'si' }).client)).toEqual({
      enabled: false,
    });
    expect(await readAnalyticsSwitch(settings({ analytics: undefined }).client)).toBeNull();
    const { client, upserts } = settings({});
    expect(await saveAnalyticsSwitch(client, { enabled: true })).toBe(true);
    expect(upserts).toEqual([{ key: 'analytics', value: { enabled: true } }]);
  });
});

describe('conteos de correos', () => {
  const overview = {
    days: 7,
    kinds: [{ kind: 'trial_ending', queued: 1, sent: 2, skipped: 3, failed: 4 }],
  };

  it('pide los últimos 7 días y valida la respuesta', async () => {
    const calls: unknown[] = [];
    const cloud = {
      rpc: (name: string, args: unknown) => {
        calls.push([name, args]);
        return Promise.resolve({ data: overview, error: null });
      },
    } as never;
    expect(await readEmailOverview(cloud)).toEqual(overview);
    expect(calls).toEqual([['admin_email_overview', { p_days: OVERVIEW_DAYS }]]);
    expect(OVERVIEW_DAYS).toBe(7);
  });

  it('avisa del segundo factor cuando la base responde que no hay permiso', async () => {
    let asked = 0;
    const cloud = {
      rpc: () => Promise.resolve({ data: null, error: { code: '42501' } }),
    } as never;
    await expect(
      readEmailOverview(cloud, () => {
        asked += 1;
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(asked).toBe(1);
  });

  it('una respuesta con otra forma no se acepta', async () => {
    const cloud = { rpc: () => Promise.resolve({ data: { days: 7 }, error: null }) } as never;
    await expect(readEmailOverview(cloud)).rejects.toMatchObject({ code: 'unknown' });
  });
});

describe('error de prueba desde las funciones', () => {
  const functions = (reply: { data?: unknown; error?: unknown } | Error) =>
    ({
      functions: {
        invoke: (name: string) => {
          expect(name).toBe('monitoring-test');
          return reply instanceof Error
            ? Promise.reject(reply)
            : Promise.resolve({ data: null, error: null, ...reply });
        },
      },
    }) as never;

  it('devuelve sent o missing_dsn según la función', async () => {
    expect(await sendServerAlertTest(functions({ data: { result: 'sent' } }))).toBe('sent');
    expect(await sendServerAlertTest(functions({ data: { result: 'missing_dsn' } }))).toBe(
      'missing_dsn',
    );
  });

  it('un 401 o un 403 es que la sesión no es de un admin con segundo factor', async () => {
    for (const status of [401, 403]) {
      const error = { context: new Response('{}', { status }) };
      expect(await sendServerAlertTest(functions({ error }))).toBe('forbidden');
    }
  });

  it('cualquier otra falla, una respuesta rara o la red caída es failed y nunca lanza', async () => {
    expect(
      await sendServerAlertTest(
        functions({ error: { context: new Response('{}', { status: 502 }) } }),
      ),
    ).toBe('failed');
    expect(await sendServerAlertTest(functions({ error: { message: 'sin respuesta' } }))).toBe(
      'failed',
    );
    expect(await sendServerAlertTest(functions({ data: { result: 'quizá' } }))).toBe('failed');
    expect(await sendServerAlertTest(functions({ data: null }))).toBe('failed');
    expect(await sendServerAlertTest(functions(new Error('sin red')))).toBe('failed');
  });
});
