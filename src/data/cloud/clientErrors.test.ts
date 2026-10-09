import { describe, expect, it, vi } from 'vitest';
import type { ClientErrorReport } from '../telemetry/clientErrors';
import { fetchClientErrors, sendClientError } from './clientErrors';

const report: ClientErrorReport = {
  fingerprint: 'aaaaaaaa11111111',
  kind: 'error',
  message: 'TypeError: x',
  stack: 'at f',
  screen: '/mazos',
  version: 'abc1234',
};

const rpcCloud = (reply: unknown) => {
  const rpc = vi.fn().mockImplementation(() => Promise.resolve(reply));
  return { cloud: { rpc } as never, rpc };
};

describe('mandar un error', () => {
  it('llama a report_client_error con los seis datos y nada más', async () => {
    const { cloud, rpc } = rpcCloud({ data: 'recorded', error: null });
    expect(await sendClientError(cloud, report)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('report_client_error', {
      p_fingerprint: 'aaaaaaaa11111111',
      p_kind: 'error',
      p_message: 'TypeError: x',
      p_stack: 'at f',
      p_screen: '/mazos',
      p_version: 'abc1234',
    });
  });

  it('sumar a uno que ya estaba también cuenta como registrado', async () => {
    expect(await sendClientError(rpcCloud({ data: 'counted', error: null }).cloud, report)).toBe(
      true,
    );
  });

  it('el tope diario, un reporte inválido o un error del servidor no cuentan', async () => {
    expect(await sendClientError(rpcCloud({ data: 'full', error: null }).cloud, report)).toBe(
      false,
    );
    expect(await sendClientError(rpcCloud({ data: 'invalid', error: null }).cloud, report)).toBe(
      false,
    );
    expect(
      await sendClientError(rpcCloud({ data: null, error: { message: 'x' } }).cloud, report),
    ).toBe(false);
  });

  it('una excepción de red no sale hacia afuera', async () => {
    const cloud = { rpc: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) } as never;
    expect(await sendClientError(cloud, report)).toBe(false);
  });
});

const row = {
  day: '2026-10-10',
  kind: 'error',
  message: 'TypeError: x',
  stack: null,
  screen: '/mazos',
  version: 'abc1234',
  occurrences: 3,
  first_seen: '2026-10-10T10:00:00Z',
  last_seen: '2026-10-10T11:00:00Z',
};

function fromCloud(reply: unknown) {
  const limit = vi.fn().mockResolvedValue(reply);
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  return { cloud: { from: vi.fn().mockReturnValue({ select }) } as never, select, order, limit };
}

describe('leer los errores', () => {
  it('pide los más recientes primero y con tope', async () => {
    const { cloud, order, limit } = fromCloud({ data: [row], error: null });
    expect(await fetchClientErrors(cloud)).toEqual([row]);
    expect(order).toHaveBeenCalledWith('last_seen', { ascending: false });
    expect(limit).toHaveBeenCalledWith(100);
  });

  it('un error de la base, un formato roto o una excepción devuelven null', async () => {
    expect(
      await fetchClientErrors(fromCloud({ data: null, error: { message: 'x' } }).cloud),
    ).toBeNull();
    expect(
      await fetchClientErrors(fromCloud({ data: [{ ...row, kind: 'otro' }], error: null }).cloud),
    ).toBeNull();
    const broken = {
      from: () => {
        throw new Error('red');
      },
    } as never;
    expect(await fetchClientErrors(broken)).toBeNull();
  });
});
