// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { DataProvider } from '@/data/DataProvider';
import { makeUser } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../../shared/RequireSession';
import {
  BiasPatternWidget,
  FutureLoadWidget,
  LatestHypothesisWidget,
  WeakTopicsWidget,
} from './AnalysisWidgets';
import { WidgetSettingsForm } from './WidgetSettingsForm';

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

  it('carga futura sin mazos lo dice y lleva a Mazos', async () => {
    renderWidget(<FutureLoadWidget session={session} events={[]} settings={{}} />);
    expect(await screen.findByText(t.widgets.futureLoad.empty)).toBeVisible();
    expect(screen.getByRole('link', { name: t.widgets.futureLoad.goToDecks })).toHaveAttribute(
      'href',
      expect.stringContaining('mazos'),
    );
  });

  it('la última hipótesis calibra y no inventa ninguna, con un acceso al tutor', async () => {
    renderWidget(<LatestHypothesisWidget session={session} events={[]} settings={{}} />);
    expect(
      await screen.findByText(t.tutor.calibrating(0), undefined, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: t.widgets.latestHypothesis.open })).toBeVisible();
    expect(screen.queryByText(t.tutor.confirmedBadge)).toBeNull();
  });
});

describe('ajustes de los widgets de análisis', () => {
  it('temas débiles cambia cuántos muestra y la rama, y solo manda lo suyo', async () => {
    const typing = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WidgetSettingsForm
        type="weak_topics"
        settings={{ count: 5, branch: 'all', otroAjuste: 'x' }}
        onChange={onChange}
      />,
    );
    await typing.selectOptions(screen.getByLabelText(t.widgets.weakTopics.settings.count), '8');
    expect(onChange).toHaveBeenLastCalledWith({ count: 8, branch: 'all' });
    await typing.selectOptions(
      screen.getByLabelText(t.widgets.weakTopics.settings.branch),
      'pediatrics',
    );
    expect(onChange).toHaveBeenLastCalledWith({ count: 5, branch: 'pediatrics' });
  });

  it('carga futura ofrece 30 y 60 días y arranca en lo que haya guardado', async () => {
    const typing = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetSettingsForm type="future_load" settings={{ days: 60 }} onChange={onChange} />);
    const select = screen.getByLabelText(t.widgets.futureLoad.settings.days);
    expect(select).toHaveValue('60');
    await typing.selectOptions(select, '30');
    expect(onChange).toHaveBeenLastCalledWith({ days: 30 });
  });

  it('un valor guardado que ya no existe vuelve al de siempre en lugar de romper', () => {
    render(
      <WidgetSettingsForm
        type="weak_topics"
        settings={{ count: 99, branch: 'no_existe' }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByLabelText(t.widgets.weakTopics.settings.count)).toHaveValue('5');
    expect(screen.getByLabelText(t.widgets.weakTopics.settings.branch)).toHaveValue('all');
  });

  it('los widgets sin ajustes no pintan formulario', () => {
    const { container } = render(
      <WidgetSettingsForm type="streak" settings={{}} onChange={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
