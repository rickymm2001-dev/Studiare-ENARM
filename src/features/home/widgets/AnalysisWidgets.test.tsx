// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { DataProvider } from '@/data/DataProvider';
import type { StudentModel } from '@/data/model/contracts';
import { makeUser } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { modelTexts } from '@/i18n/model';
import type { ReadySession } from '../../shared/RequireSession';
import { BiasPatternWidget, WeakTopicRow, WeakTopicsWidget } from './AnalysisWidgets';

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

describe('un tema a reforzar con lo que dice el modelo (B14, 4.2)', () => {
  const topic = {
    key: 'cardiology',
    name: 'Cardiología',
    branch: 'internal_medicine',
    branchName: 'Medicina interna',
    mastery: 0.42,
  };
  const item = (overrides: Partial<StudentModel['reinforce'][number]> = {}) => ({
    key: 'cardiology',
    priority: 0.1,
    why: 'low_mastery',
    action: 'topic_simulator' as const,
    populationHard: false,
    ...overrides,
  });
  const renderRow = (props: Parameters<typeof WeakTopicRow>[0]) =>
    render(
      <MemoryRouter>
        <ul>
          <WeakTopicRow {...props} />
        </ul>
      </MemoryRouter>,
    );

  it('trae el dominio y el atajo para practicar el tema', () => {
    renderRow({ topic, item: item() });
    expect(screen.getByText('Cardiología')).toBeVisible();
    expect(screen.getByText('42%')).toBeVisible();
    expect(
      screen.getByRole('link', { name: t.widgets.weakTopics.practice('Cardiología') }),
    ).toHaveAttribute('href', expect.stringContaining('topic=cardiology'));
    // Sin pistas ni atajo de tarjetas
    expect(screen.queryByText(modelTexts.reinforce.hard)).toBeNull();
    expect(screen.queryByText(modelTexts.reinforce.fading)).toBeNull();
    expect(
      screen.queryByRole('link', { name: modelTexts.reinforce.reviewCards('Cardiología') }),
    ).toBeNull();
  });

  it('dice cuando le cuesta a la mayoría de los alumnos', () => {
    renderRow({ topic, item: item({ populationHard: true }) });
    expect(screen.getByText(modelTexts.reinforce.hard)).toBeVisible();
  });

  it('si sus tarjetas se olvidan lo dice y ofrece repasarlas, además de practicar', () => {
    renderRow({ topic, item: item({ why: 'cards_fading', action: 'review_cards' }) });
    expect(screen.getByText(modelTexts.reinforce.fading)).toBeVisible();
    expect(
      screen.getByRole('link', { name: modelTexts.reinforce.reviewCards('Cardiología') }),
    ).toHaveAttribute('href', '/repasar');
    expect(
      screen.getByRole('link', { name: t.widgets.weakTopics.practice('Cardiología') }),
    ).toBeVisible();
  });

  it('sin lo que dice el modelo queda solo lo básico', () => {
    renderRow({ topic });
    expect(screen.getByText('Medicina interna')).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
