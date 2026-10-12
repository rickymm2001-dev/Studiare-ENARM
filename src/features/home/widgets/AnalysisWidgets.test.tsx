// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { DataProvider } from '@/data/DataProvider';
import { makeUser } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../../shared/RequireSession';
import { BiasPatternWidget, WeakTopicsWidget } from './AnalysisWidgets';

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };

function renderWidget(node: ReactNode) {
  return render(
    <DataProvider kind="real">
      <MemoryRouter>{node}</MemoryRouter>
    </DataProvider>,
  );
}

describe('widgets de análisis sin datos', () => {
  it('temas débiles calibra y dice cuántas respuestas faltan, sin inventar temas', async () => {
    renderWidget(<WeakTopicsWidget session={session} events={[]} settings={{}} />);
    // Primero dice que carga y luego que calibra
    expect(await screen.findByText(t.states.calibrating.title)).toBeVisible();
    const note = screen.getByRole('status');
    const minimum = DEFAULT_THRESHOLDS.topics.minResponsesPerTopic;
    expect(note).toHaveTextContent(`0 de ${minimum}`);
    expect(note).toHaveTextContent(t.widgets.weakTopics.unit);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('patrón de sesgo calibra con los errores etiquetados que pide el motor', async () => {
    renderWidget(<BiasPatternWidget session={session} events={[]} settings={{}} />);
    expect(await screen.findByText(t.states.calibrating.title)).toBeVisible();
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(`0 de ${DEFAULT_THRESHOLDS.bias.minTaggedErrors}`);
    expect(note).toHaveTextContent(t.widgets.biasPattern.unit);
  });
});
