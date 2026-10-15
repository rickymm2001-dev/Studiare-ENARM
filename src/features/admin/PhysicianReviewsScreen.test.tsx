// @vitest-environment jsdom
// Revisiones de médicos (pantalla 36, 4.5 del plan de B11). La tabla por médico y mes y sus dos CSV,
// que cuadran: la suma de Preguntas revisadas del resumen es el número de filas del detalle que pagan.
// Ana revisa una pregunta en dos rondas, que cuenta una vez
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { DataProvider } from '@/data/DataProvider';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import type * as Templates from '../physician/bankTemplates';
import { PhysicianReviewsScreen } from './PhysicianReviewsScreen';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));
const downloads = vi.hoisted(() => ({ files: [] as [string, string][] }));
vi.mock('../physician/bankTemplates', async (original) => ({
  ...(await original<typeof Templates>()),
  downloadText: (name: string, content: string) => {
    downloads.files.push([name, content]);
  },
}));

const text = bankAdminText.reviews;

const SUMMARY = [
  {
    month: '2026-10-01',
    physician_id: 'p1',
    alias: 'Ana',
    code: 'AN',
    approved: 2,
    changes_requested: 1,
    rejected: 0,
    reviewed: 2,
    distractors_resolved: 1,
    amount_mxn: '100',
  },
  {
    month: '2026-10-01',
    physician_id: 'p2',
    alias: 'Beto',
    code: null,
    approved: 1,
    changes_requested: 0,
    rejected: 0,
    reviewed: 1,
    distractors_resolved: 0,
    amount_mxn: '50',
  },
];
const DETAIL = (
  [
    ['p1', 'request_changes', 'GO-0001', 1, true],
    ['p1', 'approve', 'GO-0001', 2, false],
    ['p1', 'approve', 'GO-0002', 1, true],
    ['p2', 'approve', 'GO-0003', 1, true],
  ] as const
).map(([physician, decision, key, version, counts], index) => ({
  decided_at: `2026-10-1${index}T16:00:00.000Z`,
  month: '2026-10-01',
  physician_id: physician,
  alias: physician === 'p1' ? 'Ana' : 'Beto',
  code: physician === 'p1' ? 'AN' : null,
  question_key: key,
  version,
  decision,
  counts,
}));

function fakeCloud() {
  const calls: [string, unknown][] = [];
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({
        data:
          name === 'admin_bank_settings'
            ? { limits: {}, pay: { perReviewMxn: 50 } }
            : name === 'admin_review_report'
              ? SUMMARY
              : DETAIL,
        error: null,
      });
    },
    from: () => {
      let key = '';
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          key = value;
          return query;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: key === 'bank_sync' ? { value: { enabled: false } } : null,
            error: null,
          }),
      };
      return query;
    },
  };
  return calls;
}

const lines = (csv: string) =>
  csv
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');

beforeEach(() => {
  downloads.files = [];
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'yo', email: 'yo@ejemplo.mx', role: 'admin', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

const showScreen = () =>
  render(
    <DataProvider kind="real">
      <MemoryRouter>
        <PhysicianReviewsScreen />
      </MemoryRouter>
    </DataProvider>,
  );

describe('Revisiones de médicos', () => {
  it('sin la nube dice que necesita la cuenta de un admin', () => {
    useCloud.setState({ state: { status: 'off' } });
    showScreen();
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.physicianReviews.title }),
    ).toBeVisible();
    expect(screen.getByText(bankAdminText.needsCloud)).toBeVisible();
  });

  it('la tabla y los dos CSV cuadran con las decisiones', async () => {
    const calls = fakeCloud();
    const typing = userEvent.setup();
    showScreen();
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Ana' })).toBeVisible();
    expect(await screen.findByText(text.rate(50))).toBeVisible();
    const total = within(table).getByRole('rowheader', { name: text.total }).closest('tr');
    expect(total).toHaveTextContent('3');
    expect(calls.find(([name]) => name !== 'admin_bank_settings')?.[0]).toBe('admin_review_report');

    await typing.click(screen.getByRole('button', { name: text.summaryCsv }));
    await typing.click(screen.getByRole('button', { name: text.detailCsv }));
    await waitFor(() => {
      expect(downloads.files).toHaveLength(2);
    });
    const [summary, detail] = downloads.files;
    const summaryRows = lines(summary?.[1] ?? '').slice(1);
    const reviewed = summaryRows.reduce(
      (sum, line) => sum + Number(line.split(',')[6]?.replace(/"/g, '')),
      0,
    );
    expect(reviewed).toBe(3);
    const detailRows = lines(detail?.[1] ?? '').slice(1);
    expect(detailRows).toHaveLength(4);
    expect(detailRows.filter((line) => line.endsWith(`,"${text.pays}"`))).toHaveLength(reviewed);
    expect(summary?.[1]).not.toContain('@');
  });
});
