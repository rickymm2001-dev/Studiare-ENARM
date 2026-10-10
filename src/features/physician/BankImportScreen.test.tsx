// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { HEADERS, optionHeaders } from '@/data/content/bankColumns';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { importedQuestionId } from './bankImport';

vi.setConfig({ testTimeout: 60_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 30_000 };
const text = physicianText.importScreen;

const COLUMNS = [
  ...Object.values(HEADERS),
  ...['A', 'B', 'C', 'D'].flatMap((letter) => Object.values(optionHeaders(letter))),
];
const record = (overrides: Record<string, string> = {}): Record<string, string> => ({
  [HEADERS.id]: 'q-001',
  [HEADERS.branch]: 'Medicina interna',
  [HEADERS.topic]: 'Cardiología',
  [HEADERS.subtopic]: 'Hipertensión arterial sistémica',
  [HEADERS.difficulty]: '3',
  [HEADERS.vignette]: 'Hombre de 58 años con cefalea occipital y presión de 190/110 mmHg.',
  [HEADERS.prompt]: '¿Cuál es el diagnóstico más probable?',
  [HEADERS.correct]: 'A',
  [HEADERS.explanation]:
    'Una presión muy elevada sin daño a órgano blanco es una urgencia hipertensiva.',
  [HEADERS.refs]: 'GPC Hipertensión arterial',
  ...Object.fromEntries(
    ['A', 'B', 'C', 'D'].flatMap((letter, index) => [
      [optionHeaders(letter).text, `Opción de texto ${letter}`],
      [optionHeaders(letter).rationale, `Razón de la opción ${letter}.`],
      [
        optionHeaders(letter).bias,
        index === 0 ? '' : (['anchoring', 'premature_closure', 'framing_effect'][index - 1] ?? ''),
      ],
    ]),
  ),
  ...overrides,
});
const csv = (records: Record<string, string>[]) =>
  [COLUMNS, ...records.map((row) => COLUMNS.map((column) => JSON.stringify(row[column] ?? '')))]
    .map((line) => line.join(','))
    .join('\n');
const fileOf = (content: string, name = 'banco.csv') =>
  new File([content], name, { type: 'text/csv' });

async function open() {
  usePreferences.setState({ role: 'physician' });
  app = await renderApp(SCREENS.bankImport.path);
  await screen.findByRole('heading', { level: 1, name: t.screens.bankImport.title }, WAIT);
  return app;
}

describe('importador del banco (pantalla 22)', () => {
  it('ofrece las tres plantillas', async () => {
    await open();
    const card = screen.getByRole('region', { name: text.template.title });
    expect(within(card).getByRole('link', { name: text.template.excel })).toHaveAttribute(
      'href',
      expect.stringContaining('plantillas/Studiare-banco-plantilla.xlsx'),
    );
    expect(within(card).getByRole('button', { name: text.template.csv })).toBeVisible();
    expect(within(card).getByRole('button', { name: text.template.json })).toBeVisible();
  });

  it('revisa el archivo, muestra los problemas con su fila y guarda solo lo bueno', async () => {
    const typing = userEvent.setup();
    const rendered = await open();
    const input = screen.getByLabelText(text.file.label);
    await typing.upload(
      input,
      fileOf(
        csv([
          record(),
          record({ [HEADERS.id]: 'q-002', [HEADERS.branch]: 'Brujería' }),
          record({ [HEADERS.id]: 'q-003', [optionHeaders('B').bias]: '' }),
        ]),
      ),
    );

    const summary = await screen.findByRole('region', { name: text.summary.title }, WAIT);
    expect(within(summary).getByText(text.summary.newQuestions(1))).toBeVisible();
    expect(within(summary).getByText(text.summary.draftNote)).toBeVisible();
    const problems = screen.getByRole('region', { name: new RegExp(text.problems.title) });
    const rows = within(problems).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByText('3')).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText('q-002')).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText(/Brujería/)).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText('4')).toBeVisible();
    // Revisar no guarda nada
    expect(await rendered.api.repos.questions.listLatest()).toHaveLength(0);

    await typing.click(screen.getByRole('button', { name: text.run.import(1) }));
    const done = await screen.findByRole('region', { name: text.done.title }, WAIT);
    expect(within(done).getByText(text.done.created(1))).toBeVisible();
    await waitFor(async () => {
      const latest = await rendered.api.repos.questions.listLatest();
      expect(latest).toHaveLength(1);
      expect(latest[0]).toMatchObject({
        questionId: importedQuestionId('q-001'),
        editorialStatus: 'draft',
        isDemo: false,
      });
    }, WAIT);
  });

  it('volver a subir el mismo archivo no duplica y lo dice', async () => {
    const typing = userEvent.setup();
    const rendered = await open();
    const content = csv([record()]);
    await typing.upload(screen.getByLabelText(text.file.label), fileOf(content));
    await typing.click(await screen.findByRole('button', { name: text.run.import(1) }, WAIT));
    await screen.findByRole('region', { name: text.done.title }, WAIT);

    await typing.click(screen.getByRole('button', { name: text.run.again }));
    await typing.upload(screen.getByLabelText(text.file.label), fileOf(content));
    const summary = await screen.findByRole('region', { name: text.summary.title }, WAIT);
    expect(within(summary).getByText(text.summary.unchangedDetail(1))).toBeVisible();
    expect(screen.getByText(text.run.nothing)).toBeVisible();
    expect(screen.getByRole('button', { name: text.run.import(0) })).toBeDisabled();
    expect(await rendered.api.repos.questions.listLatest()).toHaveLength(1);
  });

  it('un formato que no se puede leer dice por qué', async () => {
    const typing = userEvent.setup({ applyAccept: false });
    await open();
    await typing.upload(
      screen.getByLabelText(text.file.label),
      new File(['x'], 'banco.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByRole('alert', undefined, WAIT)).toHaveTextContent(
      text.errors.unsupported ?? '',
    );
  });

  it('acepta JSON con los encabezados como llaves', async () => {
    const typing = userEvent.setup();
    await open();
    await typing.upload(
      screen.getByLabelText(text.file.label),
      fileOf(JSON.stringify([record()]), 'banco.json'),
    );
    const summary = await screen.findByRole('region', { name: text.summary.title }, WAIT);
    expect(within(summary).getByText(text.summary.newQuestions(1))).toBeVisible();
  });
});
