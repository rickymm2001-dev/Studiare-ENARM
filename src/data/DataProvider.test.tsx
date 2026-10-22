// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { useContext, useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyticsConsent,
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
} from './analytics/catalog';
import type { AnalyticsRecord } from './analytics/catalog';
import { DataContext, type DataApi } from './context';
import { DataProvider } from './DataProvider';
import { createEvent } from './events/createEvent';
import { newId } from './testing/fixtures';

function ContextKeys() {
  const value = useContext(DataContext);
  return <p>{value ? Object.keys(value).sort().join(',') : 'sin contexto'}</p>;
}

describe('DataProvider', () => {
  it('solo entrega repositorios y casos de uso, nunca la base de Dexie (D-038)', () => {
    render(
      <DataProvider kind="real">
        <ContextKeys />
      </DataProvider>,
    );
    expect(
      screen.getByText('deleteAllData,demo,rebuildDerivedState,recordEvent,recordEventQuiet,repos'),
    ).toBeInTheDocument();
  });
});

describe('DataProvider y la analítica (B15, 1.6)', () => {
  afterEach(() => {
    resetAnalytics();
  });

  function captureApi(kind: 'real' | 'demo'): { api: () => DataApi } {
    let captured: DataApi | null = null;
    function Capture() {
      const value = useContext(DataContext);
      useEffect(() => {
        captured = value;
      }, [value]);
      return null;
    }
    render(
      <DataProvider kind={kind}>
        <Capture />
      </DataProvider>,
    );
    return { api: () => captured as DataApi };
  }

  const joined = () =>
    createEvent('party_joined', { groupId: newId() }, { userId: newId(), tz: 'America/Merida' });

  it('lo que se guarda en este dispositivo pasa por el puente, y lo que baja de otro no', async () => {
    const seen: AnalyticsRecord[] = [];
    setAnalyticsSink((record) => seen.push(record));
    setAnalyticsConsent(true);
    const { api } = captureApi('real');
    await api().recordEvent(joined());
    await waitFor(() => {
      expect(seen.map((record) => record.event)).toEqual(['party_group_joined']);
    });
    await api().recordEventQuiet(joined());
    // Un momento para que, si pasara por el puente, ya hubiera llegado
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toHaveLength(1);
  });

  it('sin permiso el puente no mide nada y el evento se guarda igual', async () => {
    const seen: AnalyticsRecord[] = [];
    setAnalyticsSink((record) => seen.push(record));
    expect(analyticsConsent()).toBeNull();
    const { api } = captureApi('real');
    const event = joined();
    await api().recordEvent(event);
    const stored = await api().repos.events.query({ userId: event.userId });
    expect(stored.map((item) => item.id)).toEqual([event.id]);
    expect(seen).toEqual([]);
  });

  it('la demostración nunca mide, ni con permiso', async () => {
    const seen: AnalyticsRecord[] = [];
    setAnalyticsSink((record) => seen.push(record));
    setAnalyticsConsent(true);
    const { api } = captureApi('demo');
    await api().recordEvent(joined());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual([]);
  });
});
