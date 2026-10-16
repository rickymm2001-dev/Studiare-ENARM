// @vitest-environment jsdom
// Proponer con IA solo en las preguntas marcadas (B12, 5.3). Una pregunta está marcada si tiene un
// reporte de error abierto o un distractor que casi nadie elige. Las demás no se ofrecen.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { buildDemoBank } from '@/demo/content/bank';
import { guardRestructure } from '@/engines/aiGuards';
import { mockRestructure } from '@/engines/aiMock';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { buildRestructureInput } from './restructure';

vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 30_000 };
const text = physicianText.draftsScreen.questions;
const entries = buildDemoBank().questions;
const usable = entries.filter((entry) => {
  const built = buildRestructureInput(entry.question, entry.options, 'to_except');
  return (
    built.ok &&
    entry.question.caseId === null &&
    guardRestructure(mockRestructure(built.input), built.input).passed
  );
});
const [target, other] = usable;
if (!target || !other) throw new Error('El banco demo no tiene dos preguntas que sirvan');

const report = (
  user: User,
  versionId: string,
  status: 'open' | 'resolved' = 'open',
): Parameters<DataApi['repos']['contentReports']['put']>[0] => ({
  id: newId(),
  reporterId: user.id,
  targetKind: 'question',
  targetId: versionId,
  reason: 'wrong_key',
  status,
  createdAt: '2026-10-08T10:00:00.000Z',
  resolvedAt: status === 'open' ? null : '2026-10-09T10:00:00.000Z',
});

async function open(seed?: (api: DataApi, user: User) => Promise<void>) {
  usePreferences.setState({ role: 'admin' });
  app = await renderApp(SCREENS.aiDrafts.path, { seed });
  await screen.findByRole('heading', { level: 1, name: t.screens.aiDrafts.title }, WAIT);
  return app;
}

describe('proponer con IA solo en preguntas marcadas', () => {
  it('sin preguntas marcadas dice por qué y no ofrece ninguna', async () => {
    await open();
    expect(await screen.findByText(text.markedEmpty, undefined, WAIT)).toBeVisible();
    expect(screen.getByText(text.markedHint)).toBeVisible();
    expect(screen.queryByRole('button', { name: new RegExp(`^${text.pick}`) })).toBeNull();
    expect(screen.getByRole('button', { name: text.ask })).toBeDisabled();
  });

  it('una pregunta con un reporte abierto se ofrece con su motivo y se puede proponer', async () => {
    const typing = userEvent.setup();
    const rendered = await open(async (api, user) => {
      await api.repos.contentReports.put(report(user, target.question.id));
    });
    expect(await screen.findByText(text.markedCount(1), undefined, WAIT)).toBeVisible();
    const picks = await screen.findAllByRole('button', { name: new RegExp(`^${text.pick}`) }, WAIT);
    expect(picks).toHaveLength(1);
    const row = picks[0]?.closest('li') as HTMLElement;
    expect(within(row).getByText(text.markReasons.open_report ?? '')).toBeVisible();
    // La otra pregunta no está marcada, aunque se busque por su texto
    await typing.type(screen.getByLabelText(text.search), other.question.prompt.slice(0, 30));
    expect(await screen.findByText(text.noResults)).toBeVisible();
    await typing.clear(screen.getByLabelText(text.search));

    await typing.click(await screen.findByRole('button', { name: new RegExp(`^${text.pick}`) }));
    await typing.click(screen.getByRole('button', { name: text.ask }));
    expect(await screen.findByText(text.created, undefined, WAIT)).toBeVisible();
    expect(await rendered.api.repos.aiArtifacts.list()).toHaveLength(1);
  });

  it('una pregunta en inglés con un reporte abierto no se ofrece, porque la IA de reestructurar es solo del banco en español', async () => {
    const typing = userEvent.setup();
    const stem = '[Prueba] According to the passage, which statement is correct?';
    await open(async (api, user) => {
      await api.repos.contentReports.put(report(user, target.question.id));
      // La misma pregunta, pero de Inglés médico y con su reporte abierto. No es de un caso seriado, así que
      // sin la regla de B13 pasaría todos los filtros
      const versionId = newId();
      const options = target.options.map((option) => ({
        ...option,
        id: newId(),
        optionId: newId(),
        questionVersionId: versionId,
      }));
      const newIdOf = new Map(
        target.options.map((option, index) => [option.id, options[index]?.id]),
      );
      const english = {
        ...target.question,
        id: versionId,
        questionId: newId(),
        branch: 'medical_english',
        topic: 'reading_comprehension',
        subtopic: 'english_internal_medicine',
        language: 'en' as const,
        vignette: '',
        prompt: stem,
        canonicalOptionIds: target.question.canonicalOptionIds.flatMap((id) => {
          const mapped = newIdOf.get(id);
          return mapped ? [mapped] : [];
        }),
      };
      await api.repos.questions.addVersion(english, options);
      await api.repos.contentReports.put(report(user, versionId));
    });
    // Solo la de español cuenta como marcada y se ofrece
    expect(await screen.findByText(text.markedCount(1), undefined, WAIT)).toBeVisible();
    const picks = await screen.findAllByRole('button', { name: new RegExp(`^${text.pick}`) }, WAIT);
    expect(picks).toHaveLength(1);
    expect(screen.queryByText(stem)).toBeNull();
    // Ni buscándola por su texto
    await typing.type(screen.getByLabelText(text.search), 'According to the passage');
    expect(await screen.findByText(text.noResults)).toBeVisible();
    expect(screen.queryByText(stem)).toBeNull();
    // Y la pantalla le dice al médico que las de Inglés médico no se reestructuran con IA
    expect(screen.getByText(text.markedHint)).toHaveTextContent('Inglés médico');
  });

  it('un reporte ya resuelto no marca la pregunta', async () => {
    await open(async (api, user) => {
      await api.repos.contentReports.put(report(user, target.question.id, 'resolved'));
    });
    expect(await screen.findByText(text.markedEmpty, undefined, WAIT)).toBeVisible();
    expect(screen.queryByRole('button', { name: new RegExp(`^${text.pick}`) })).toBeNull();
  });
});
