// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { ContentReport } from '@/data/schemas/bank';
import type { User } from '@/data/schemas/people';
import { newId } from '@/data/testing/fixtures';
import { ensureDemoBank } from '@/data/usecases/bank';
import { buildDemoBank } from '@/demo/content/bank';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { buildNextVersion, draftFromVersion } from './editorDraft';

vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 30_000 };
const text = physicianText.reportsScreen;
const [first, second] = buildDemoBank().questions;
if (!first || !second) throw new Error('El banco demo no alcanza para la prueba');

const report = (
  versionId: string,
  reason: ContentReport['reason'],
  overrides: Partial<ContentReport> = {},
): ContentReport => ({
  id: newId(),
  reporterId: newId(),
  targetKind: 'question',
  targetId: versionId,
  reason,
  status: 'open',
  createdAt: '2026-10-09T10:00:00.000Z',
  resolvedAt: null,
  ...overrides,
});

const assign = (api: DataApi, user: User, questionId: string) =>
  api.repos.reviewAssignments.put({
    id: newId(),
    questionId,
    physicianId: user.id,
    assignedBy: null,
    assignedAt: '2026-10-08T10:00:00.000Z',
  });

async function open(
  role: 'physician' | 'admin',
  seed?: (api: DataApi, user: User) => Promise<void>,
) {
  usePreferences.setState({ role });
  app = await renderApp(SCREENS.contentReports.path, { seed });
  await screen.findByRole('heading', { level: 1, name: t.screens.contentReports.title }, WAIT);
  return app;
}

const card = (prompt: string) => screen.findByRole('region', { name: prompt }, WAIT);

describe('bandeja de reportes (pantalla 21)', () => {
  it('sin reportes dice que no hay abiertos', async () => {
    await open('admin');
    expect(await screen.findByText(text.empty.openTitle, undefined, WAIT)).toBeVisible();
  });

  it('el médico ve solo los reportes de las preguntas que le asignaron', async () => {
    await open('physician', async (api, user) => {
      await assign(api, user, first.question.questionId);
      await api.repos.contentReports.putMany([
        report(first.question.id, 'wrong_key'),
        report(first.question.id, 'typo'),
        report(second.question.id, 'typo'),
      ]);
    });
    const mine = await card(first.question.prompt);
    expect(within(mine).getByText(text.group.open(2))).toBeVisible();
    expect(within(mine).getByText(`${t.simulator.reportReasons.wrong_key} ×1`)).toBeVisible();
    expect(screen.queryByRole('region', { name: second.question.prompt })).toBeNull();
    const stats = screen.getByRole('region', { name: text.stats.label });
    expect(within(stats).getByText(text.stats.open)).toBeVisible();
  });

  it('el admin ve los reportes de todo el banco', async () => {
    await open('admin', async (api) => {
      await api.repos.contentReports.putMany([
        report(first.question.id, 'typo'),
        report(second.question.id, 'outdated'),
      ]);
    });
    expect(await card(first.question.prompt)).toBeVisible();
    expect(await card(second.question.prompt)).toBeVisible();
  });

  it('resuelve un reporte, lo manda al filtro de resueltos y se puede reabrir', async () => {
    const typing = userEvent.setup();
    const rendered = await open('admin', async (api) => {
      await api.repos.contentReports.put(report(first.question.id, 'typo'));
    });
    const group = await card(first.question.prompt);
    await typing.click(within(group).getByRole('button', { name: text.row.resolve }));
    await waitFor(async () => {
      const [saved] = await rendered.api.repos.contentReports.list();
      expect(saved).toMatchObject({ status: 'resolved' });
      expect(saved?.resolvedAt).not.toBeNull();
    }, WAIT);
    expect(await screen.findByText(text.empty.openTitle, undefined, WAIT)).toBeVisible();

    await typing.selectOptions(screen.getByLabelText(text.filter.label), 'resolved');
    const resolved = await card(first.question.prompt);
    await typing.click(within(resolved).getByRole('button', { name: text.row.reopen }));
    await waitFor(async () => {
      expect((await rendered.api.repos.contentReports.list())[0]).toMatchObject({
        status: 'open',
        resolvedAt: null,
      });
    }, WAIT);
  });

  it('resuelve y descarta todos los abiertos de una pregunta de un golpe', async () => {
    const typing = userEvent.setup();
    const rendered = await open('admin', async (api) => {
      await api.repos.contentReports.putMany([
        report(first.question.id, 'typo'),
        report(first.question.id, 'other'),
        report(first.question.id, 'outdated'),
      ]);
    });
    const group = await card(first.question.prompt);
    await typing.click(within(group).getByRole('button', { name: text.group.dismissOpen(3) }));
    await waitFor(async () => {
      const all = await rendered.api.repos.contentReports.list();
      expect(all.every((item) => item.status === 'dismissed')).toBe(true);
    }, WAIT);
    expect(
      await screen.findByText(text.changed(3, text.row.status.dismissed ?? ''), undefined, WAIT),
    ).toBeVisible();
  });

  it('marca el reporte de una versión anterior y deja abrir el editor', async () => {
    await open('admin', async (api) => {
      await ensureDemoBank(api);
      const options = await api.repos.options.listForQuestionVersion(first.question.id);
      const next = buildNextVersion({
        current: first.question,
        draft: draftFromVersion(first.question, options),
        newId,
        now: new Date(),
      });
      await api.repos.questions.addVersion(next.question, next.options);
      await api.repos.contentReports.put(report(first.question.id, 'typo'));
    });
    const group = await card(first.question.prompt);
    expect(within(group).getByText(text.row.outdated)).toBeVisible();
    expect(within(group).getByText(text.group.outdatedHint)).toBeVisible();
    expect(within(group).getByRole('link', { name: text.group.edit })).toHaveAttribute(
      'href',
      `${SCREENS.questionEditor.path}?pregunta=${first.question.questionId}`,
    );
  });
});
