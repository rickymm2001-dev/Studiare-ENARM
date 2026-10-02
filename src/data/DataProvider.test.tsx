// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it } from 'vitest';
import { DataContext } from './context';
import { DataProvider } from './DataProvider';

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
    expect(screen.getByText('rebuildDerivedState,recordEvent,repos')).toBeInTheDocument();
  });
});
