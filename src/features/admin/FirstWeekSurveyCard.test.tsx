// @vitest-environment jsdom
// La tarjeta de la encuesta de los primeros días en Usuarios (B18). Interruptor con días de espera y fecha límite, conteos,
// una tabla por pregunta con su mediana (solo con 3 respuestas o más), la lista por código y Exportar CSV sin ninguna
// columna personal.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SurveyAnswers } from '@/config/surveys';
import { surveyAdminTexts } from '@/i18n/survey';
import {
  createFakeSurveyState,
  fakeSurveyCloud,
  type FakeSurveyState,
} from '../survey/testing/fakeSurveyCloud';
import { FirstWeekSurveyCard } from './FirstWeekSurveyCard';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));
const download = vi.hoisted(() => vi.fn());
vi.mock('../physician/bankTemplates', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('../physician/bankTemplates')),
  downloadText: download,
}));

const text = surveyAdminTexts.card;
let server: FakeSurveyState;

const answers = (overrides: Partial<SurveyAnswers> = {}): SurveyAnswers => ({
  days_used: 'd5_6',
  used: ['review', 'practice'],
  clarity: 4,
  ease: 5,
  useful: 4,
  blockers: ['slow'],
  recommend: 'yes',
  ...overrides,
});

function respond(count: number) {
  for (let index = 1; index <= count; index += 1) {
    server.responses.push({
      code: `R${String(index).padStart(6, '0')}`,
      days: 8 + index,
      answers: answers({ clarity: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5 }),
      comment: index === 1 ? 'Me costó ubicar Simular' : null,
    });
  }
}

beforeEach(() => {
  server = createFakeSurveyState();
  holder.cloud = fakeSurveyCloud(server);
  download.mockReset();
});

afterEach(() => {
  cleanup();
  holder.cloud = null;
  vi.unstubAllGlobals();
});

describe('la tarjeta', () => {
  it('lee el ajuste, los conteos y la lista, y dice que todavía no contesta nadie', async () => {
    render(<FirstWeekSurveyCard />);
    expect(await screen.findByRole('heading', { name: text.title })).toBeVisible();
    expect(await screen.findByText(text.empty)).toBeVisible();
    expect(screen.getByLabelText(text.settings.enabled)).toBeChecked();
    expect(screen.getByLabelText(text.settings.delay)).toHaveValue(7);
    expect(screen.getByLabelText(text.settings.until)).toHaveValue('');
    const counts = within(screen.getByRole('region', { name: text.counts.region }));
    expect(counts.getByText(text.counts.eligible).nextElementSibling).toHaveTextContent('5');
    expect(counts.getByText(text.counts.answered).nextElementSibling).toHaveTextContent('0');
    // Sin respuestas no hay tablas, lista ni botón de exportar
    expect(screen.queryByRole('button', { name: text.exportCsv })).toBeNull();
  });

  it('con menos de 3 respuestas avisa que se puede deducir quién escribió qué y no muestra medianas', async () => {
    respond(2);
    render(<FirstWeekSurveyCard />);
    expect(await screen.findByRole('note')).toHaveTextContent(text.few(2));
    expect(screen.getAllByText(text.notEnough).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Mediana /)).toBeNull();
  });

  it('con 3 respuestas muestra la mediana de cada escala y quita el aviso', async () => {
    respond(3);
    render(<FirstWeekSurveyCard />);
    // Las claridades son 2, 3 y 4, con mediana 3
    expect(await screen.findAllByText(text.median(3))).not.toHaveLength(0);
    expect(screen.queryByRole('note')).toBeNull();
    const clarity = screen.getByRole('table', { name: /qué tan claro/i });
    expect(within(clarity).getByText('1, Nada claro').closest('tr')).toHaveTextContent(
      '0 personas',
    );
    expect(within(clarity).getByText('3').closest('tr')).toHaveTextContent('1 persona');
    const used = screen.getByRole('table', { name: /qué usaste/i });
    expect(within(used).getByText('Repasar').closest('tr')).toHaveTextContent('3 personas');
    expect(within(used).getByText('Tutor').closest('tr')).toHaveTextContent('0 personas');
  });

  it('lista las respuestas por código con su comentario, sin nada que diga de quién son ni los días de la cuenta', async () => {
    respond(3);
    render(<FirstWeekSurveyCard />);
    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.font-mono')?.textContent)).toEqual([
      'R000001',
      'R000002',
      'R000003',
    ]);
    expect(items[0]).toHaveTextContent('Me costó ubicar Simular');
    expect(items[1]).toHaveTextContent(text.noComment);
    expect(document.body.textContent).not.toMatch(/@|user_id|created_at/);
    // Los días de la cuenta (el doble guarda 9, 10 y 11) ligarían un código con la fecha de alta de Usuarios
    expect(list.textContent).not.toMatch(/días de (la )?cuenta|\b(9|10|11) días\b/i);
  });

  it('en computadora la lista es una tabla', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    respond(3);
    render(<FirstWeekSurveyCard />);
    const table = await screen.findByRole('table', { name: text.responses });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([text.column.code, text.column.answers, text.column.comment]);
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  // jsdom no mide, así que aquí se fija que el comentario lleve la regla que parte palabras largas (overflow-wrap anywhere)
  // y se descarta la que no baja el ancho mínimo de una celda (break-words). Que de verdad quepa a 320, 390 y 1280 px lo
  // mide la e2e first-week-survey.spec.ts con un comentario de 500 caracteres sin espacios
  describe('un comentario de 500 caracteres sin espacios', () => {
    const LONG = 'Ab1'.repeat(167).slice(0, 500);
    const seedLong = () => {
      respond(3);
      const first = server.responses[0];
      if (first) first.comment = LONG;
    };
    const wrapped = (element: HTMLElement) => {
      expect(element.className).toContain('[overflow-wrap:anywhere]');
      expect(element.className).not.toContain('break-words');
    };

    it('en el teléfono la lista lo parte donde haga falta', async () => {
      seedLong();
      render(<FirstWeekSurveyCard />);
      const comment = await screen.findByText(LONG);
      wrapped(comment);
      expect(comment.closest('li')?.className).toContain('min-w-0');
    });

    it('en computadora la celda de la tabla lo parte donde haga falta', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
      seedLong();
      render(<FirstWeekSurveyCard />);
      const comment = await screen.findByText(LONG);
      expect(comment.tagName).toBe('TD');
      wrapped(comment);
    });
  });

  it('exporta el CSV con el código, las preguntas y el comentario, y nada más', async () => {
    const typing = userEvent.setup();
    respond(3);
    render(<FirstWeekSurveyCard />);
    await typing.click(await screen.findByRole('button', { name: text.exportCsv }));
    expect(download).toHaveBeenCalledTimes(1);
    const [name, content, type] = download.mock.calls[0] as [string, string, string];
    expect(name).toBe(text.csv.fileName);
    expect(type).toBe('text/csv;charset=utf-8');
    expect(content).toContain('"R000001"');
    expect(content).toContain('"Me costó ubicar Simular"');
    expect(content.split('\r\n')[0]).toContain(text.csv.columns[0]);
    expect(content).not.toMatch(/@|user_id|created_at|correo|alias|días de cuenta/i);
    expect(screen.getByText(text.exportNote)).toBeVisible();
  });
});

describe('el ajuste', () => {
  it('prende la encuesta con sus días y su fecha límite por el mismo camino que el registro', async () => {
    const typing = userEvent.setup();
    server.setting = { enabled: false, id: 'first-week-v1', delayDays: 7, accountsUntil: null };
    render(<FirstWeekSurveyCard />);
    const enabled = await screen.findByLabelText(text.settings.enabled);
    expect(enabled).not.toBeChecked();
    await typing.click(enabled);
    await typing.clear(screen.getByLabelText(text.settings.delay));
    await typing.type(screen.getByLabelText(text.settings.delay), '0');
    await typing.type(screen.getByLabelText(text.settings.until), '2026-12-01');
    await typing.click(screen.getByRole('button', { name: text.settings.save }));
    expect(await screen.findByText(text.settings.saved)).toBeVisible();
    expect(server.calls).toContainEqual([
      'platform_settings',
      'upsert',
      expect.objectContaining({
        key: 'survey_first_week',
        value: { enabled: true, id: 'first-week-v1', delay_days: 0, accounts_until: '2026-12-01' },
      }),
    ]);
    expect(server.setting).toEqual({
      enabled: true,
      id: 'first-week-v1',
      delayDays: 0,
      accountsUntil: '2026-12-01',
    });
  });

  it('no guarda días fuera de 0 a 30 ni una fecha que no existe', async () => {
    const typing = userEvent.setup();
    render(<FirstWeekSurveyCard />);
    const delay = await screen.findByLabelText(text.settings.delay);
    await typing.clear(delay);
    await typing.type(delay, '31');
    expect(await screen.findByText(text.settings.invalidDelay)).toBeVisible();
    expect(screen.getByRole('button', { name: text.settings.save })).toBeDisabled();
    await typing.clear(delay);
    await typing.type(delay, '30');
    expect(screen.queryByText(text.settings.invalidDelay)).toBeNull();
    expect(screen.getByRole('button', { name: text.settings.save })).toBeEnabled();
    expect(
      server.calls.some((call) => call[0] === 'platform_settings' && call[1] === 'upsert'),
    ).toBe(false);
  });

  it('si no se pudo guardar lo dice', async () => {
    const typing = userEvent.setup();
    server.failNext['platform_settings.upsert'] = { code: '42501' };
    render(<FirstWeekSurveyCard />);
    await typing.click(await screen.findByRole('button', { name: text.settings.save }));
    expect(await screen.findByText(text.settings.saveFailed)).toBeVisible();
  });
});

describe('cuando algo falla', () => {
  it('quien no es admin lo lee y no ve nada más', async () => {
    server.failNext.admin_survey_summary = { code: '42501' };
    render(<FirstWeekSurveyCard />);
    expect(await screen.findByText(text.notAdmin)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.retry })).toBeNull();
    expect(screen.queryByLabelText(text.settings.enabled)).toBeNull();
  });

  it('sin red lo dice y deja intentar de nuevo', async () => {
    const typing = userEvent.setup();
    server.failNext.admin_survey_summary = 'throw';
    render(<FirstWeekSurveyCard />);
    expect(await screen.findByText(text.failed)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.retry }));
    await waitFor(() => {
      expect(screen.getByLabelText(text.settings.enabled)).toBeVisible();
    });
  });
});
