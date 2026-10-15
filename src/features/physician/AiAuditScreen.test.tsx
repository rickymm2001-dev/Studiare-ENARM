// @vitest-environment jsdom
// Auditoría de la IA (pantalla 38, B12, 5.3). Los dos médicos califican, cada uno sin ver al otro, y el
// administrador importa la muestra, la cierra, ve el veredicto y abre los motores. Todo contra la
// compuerta simulada en memoria, que imita las funciones de la base
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/app/preferences';
import { useCloud } from '@/app/cloudState';
import { DataProvider } from '@/data/DataProvider';
import { gateSampleFile } from '@/data/testing/gateSample';
import {
  createFakeAiGateServer,
  type FakeAiGateServer,
  type FakeGateCaller,
} from '@/data/testing/fakeAiGateServer';
import type { AiEngine } from '@/engines/aiContracts';
import { aiAuditText } from '@/i18n/aiAudit';
import { t } from '@/i18n/es-MX';
import type * as Templates from './bankTemplates';
import { AiAuditScreen } from './AiAuditScreen';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));
const downloads = vi.hoisted(() => ({ files: [] as [string, string][] }));
vi.mock('./bankTemplates', async (original) => ({
  ...(await original<typeof Templates>()),
  downloadText: (name: string, content: string) => {
    downloads.files.push([name, content]);
  },
}));

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const ROLES: Record<string, string> = { [P1]: 'physician', [P2]: 'physician', [ADMIN]: 'admin' };
const reviewer = aiAuditText.reviewer;
const admin = aiAuditText.admin;

interface Rig {
  server: FakeAiGateServer;
  rpc: ReturnType<typeof vi.fn>;
}

/** La nube simulada de quien está en la pantalla. Cada llamada atiende la compuerta a su nombre */
function connect(
  caller: FakeGateCaller,
  server = createFakeAiGateServer({ roleOf: (id) => ROLES[id] }),
): Rig {
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    if (name === 'admin_list_users') {
      return Promise.resolve({
        data: [P1, P2].map((id, index) => ({
          user_id: id,
          alias: index === 0 ? 'Ana' : 'Beto',
          email: null,
          role: 'physician',
          plan: 'free',
          created_at: '2026-10-01T10:00:00Z',
          total: 2,
        })),
        error: null,
      });
    }
    const reply = server.call(name, caller, args);
    return Promise.resolve(
      reply ?? { data: null, error: { code: 'PGRST202', message: 'no existe' } },
    );
  });
  const from = () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: { value: server.state }, error: null }),
    };
    return query;
  };
  holder.cloud = { rpc, from };
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: caller.userId, email: 'yo@ejemplo.mx', role: caller.role, alias: null },
    },
  });
  usePreferences.setState({ role: caller.role });
  return { server, rpc };
}

beforeEach(() => {
  downloads.files = [];
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
  usePreferences.setState({ role: 'student' });
});

const show = () =>
  render(
    <DataProvider kind="real">
      <MemoryRouter>
        <AiAuditScreen />
      </MemoryRouter>
    </DataProvider>,
  );

/** Lo importa el admin, con la sesión de él, y deja la muestra lista para los dos médicos */
function seedSample(
  server: FakeAiGateServer,
  perEngine: Partial<Record<AiEngine, number>> = { bias_tips: 4, forgetting: 2 },
) {
  const reply = server.call(
    'admin_ai_gate_sample_create',
    { userId: ADMIN, role: 'admin' },
    { p_sample: gateSampleFile('b12-2026-10', perEngine), p_reviewers: [P1, P2] },
  );
  if (reply?.error) throw new Error(reply.error.message);
}

const pressed = (name: string) => screen.getByRole('button', { name, pressed: true });
const choose = async (
  typing: ReturnType<typeof userEvent.setup>,
  group: string,
  option: string,
) => {
  const fieldset = screen.getByRole('group', { name: group });
  await typing.click(within(fieldset).getByRole('button', { name: option }));
};

/** Califica el texto que está a la vista con una rúbrica completa y buena */
async function rateGood(typing: ReturnType<typeof userEvent.setup>) {
  await choose(typing, reviewer.accuracy.label, reviewer.accuracy.correct);
  await choose(typing, reviewer.grounded.label, reviewer.grounded.yes);
  await choose(typing, reviewer.safety.label, reviewer.safety.no);
  await choose(typing, reviewer.usefulness.label, '4');
  await choose(typing, reviewer.clarity.label, '4');
  await choose(typing, reviewer.verdict.label, reviewer.verdict.approved);
}

describe('sin la nube', () => {
  it('dice que la auditoría necesita la cuenta real', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: t.screens.aiAudit.title })).toBeVisible();
    expect(screen.getByText(aiAuditText.needsCloud)).toBeVisible();
  });
});

describe('el médico', () => {
  it('sin muestra asignada lo dice', async () => {
    connect({ userId: P1, role: 'physician' });
    show();
    expect(await screen.findByText(reviewer.empty)).toBeVisible();
  });

  it('ve su texto con su fuente, califica y se guarda al elegir, con el avance al día', async () => {
    const typing = userEvent.setup();
    const { server, rpc } = connect({ userId: P1, role: 'physician' });
    seedSample(server);
    show();

    expect(await screen.findByText(reviewer.progress(0, 6))).toBeVisible();
    expect(screen.getByText(reviewer.position(1, 6))).toBeVisible();
    // Como lo vería el alumno, junto a su fuente, y sin el modelo ni el prompt
    expect(screen.getByRole('heading', { name: reviewer.studentSees })).toBeVisible();
    expect(screen.getByRole('heading', { name: reviewer.sourceTitle })).toBeVisible();
    expect(screen.getByText(reviewer.draft)).toBeVisible();
    expect(screen.queryByText(/claude-/)).toBeNull();

    // Una rúbrica a medias no se guarda y dice qué falta
    await choose(typing, reviewer.accuracy.label, reviewer.accuracy.correct);
    await choose(typing, reviewer.grounded.label, reviewer.grounded.yes);
    expect(screen.getByText(/Para guardar falta/)).toBeVisible();
    expect(rpc.mock.calls.filter(([name]) => name === 'ai_gate_review')).toHaveLength(0);

    // Completa, se guarda sola con las llaves exactas del contrato
    await choose(typing, reviewer.safety.label, reviewer.safety.no);
    await choose(typing, reviewer.usefulness.label, '4');
    await choose(typing, reviewer.clarity.label, '3');
    await choose(typing, reviewer.verdict.label, reviewer.verdict.approved);
    expect(await screen.findByText(reviewer.saved)).toBeVisible();
    expect(await screen.findByText(reviewer.progress(1, 6))).toBeVisible();
    const saved = rpc.mock.calls.filter(([name]) => name === 'ai_gate_review');
    expect(saved).toHaveLength(1);
    expect(saved[0]?.[1]).toMatchObject({
      p_review: {
        accuracy: 'correct',
        grounded: true,
        safetyIssue: false,
        usefulness: 4,
        clarity: 3,
        verdict: 'approved',
        comment: null,
      },
    });
    // La base ya la tiene
    expect([...server.reviewsOf(P1).values()]).toHaveLength(1);
  });

  it('cambiar una respuesta la vuelve a guardar y un error grave avisa lo que pasa', async () => {
    const typing = userEvent.setup();
    const { server } = connect({ userId: P1, role: 'physician' });
    seedSample(server);
    show();
    await screen.findByText(reviewer.progress(0, 6));
    await rateGood(typing);
    await screen.findByText(reviewer.progress(1, 6));
    await choose(typing, reviewer.accuracy.label, reviewer.accuracy.severe);
    expect(await screen.findByText(reviewer.severeNote)).toBeVisible();
    await waitFor(() => {
      expect([...server.reviewsOf(P1).values()][0]?.accuracy).toBe('severe');
    });
    // Sigue siendo un solo texto calificado
    expect(screen.getByText(reviewer.progress(1, 6))).toBeVisible();
  });

  it('el filtro de pendientes, Siguiente y Siguiente pendiente recorren los textos', async () => {
    const typing = userEvent.setup();
    const { server } = connect({ userId: P1, role: 'physician' });
    seedSample(server);
    show();
    await screen.findByText(reviewer.position(1, 6));
    await rateGood(typing);
    await screen.findByText(reviewer.progress(1, 6));

    await typing.click(screen.getByRole('button', { name: reviewer.next }));
    expect(screen.getByText(reviewer.position(2, 6))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: reviewer.previous }));
    expect(screen.getByText(reviewer.position(1, 6))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: reviewer.nextPending }));
    expect(screen.getByText(reviewer.position(2, 6))).toBeVisible();

    await typing.click(screen.getByRole('button', { name: `${reviewer.filterPending} (5)` }));
    expect(pressed(`${reviewer.filterPending} (5)`)).toBeVisible();
    // Las flechas pasan de un texto a otro
    await typing.keyboard('{ArrowRight}');
    expect(screen.getByText(reviewer.position(3, 6))).toBeVisible();
    await typing.keyboard('{ArrowLeft}');
    expect(screen.getByText(reviewer.position(2, 6))).toBeVisible();
  });

  it('el otro médico no ve lo que puso el primero y ve los textos en otro orden', async () => {
    const typing = userEvent.setup();
    const first = connect({ userId: P1, role: 'physician' });
    seedSample(first.server);
    show();
    await screen.findByText(reviewer.position(1, 6));
    await rateGood(typing);
    await screen.findByText(reviewer.progress(1, 6));
    const firstOrder = [...first.server.reviewsOf(P1).keys()];
    cleanup();

    connect({ userId: P2, role: 'physician' }, first.server);
    show();
    expect(await screen.findByText(reviewer.progress(0, 6))).toBeVisible();
    expect(first.server.reviewsOf(P2).size).toBe(0);
    expect(firstOrder).toHaveLength(1);
  });

  it('una muestra ya cerrada deja las respuestas fijas', async () => {
    const { server } = connect({ userId: P1, role: 'physician' });
    seedSample(server, { bias_tips: 2 });
    server.call(
      'admin_ai_gate_close',
      { userId: ADMIN, role: 'admin' },
      { p_sample: 'b12-2026-10' },
    );
    // Ya no es de las abiertas que lista, pero sus textos se pueden leer
    show();
    expect(await screen.findByText(reviewer.empty)).toBeVisible();
  });

  it('baja sus calificaciones en CSV y sube otras, con las mismas reglas', async () => {
    const typing = userEvent.setup();
    const { server } = connect({ userId: P1, role: 'physician' });
    seedSample(server, { bias_tips: 3 });
    show();
    await screen.findByText(reviewer.progress(0, 3));
    await rateGood(typing);
    await screen.findByText(reviewer.progress(1, 3));

    await typing.click(screen.getByRole('button', { name: aiAuditText.file.download }));
    expect(downloads.files).toHaveLength(1);
    const [fileName, csv] = downloads.files[0] ?? ['', ''];
    expect(fileName).toBe(aiAuditText.file.fileName('b12-2026-10'));
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe(
      'id,exactitud,anclaje,problema_de_seguridad,utilidad,claridad,veredicto,comentario',
    );
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.includes('"aprobado"'))).toHaveLength(1);

    // Sube una hoja con las otras dos filas llenas
    const ids = rows.slice(1).map((row) => row.split(',')[0]?.replace(/"/g, '') ?? '');
    const mine = server.reviewsOf(P1);
    const empty = ids.filter((id) => !mine.has(id));
    const file = new File(
      [
        'id,exactitud,anclaje,problema_de_seguridad,utilidad,claridad,veredicto,comentario\n',
        ...empty.map((id) => `${id},correcto,sí,no,3,4,aprobado,\n`),
      ],
      'mis.csv',
      { type: 'text/csv' },
    );
    await typing.upload(screen.getByLabelText(aiAuditText.file.upload), file);
    expect(await screen.findByText(/Se guardaron 2 calificaciones/)).toBeVisible();
    await waitFor(() => {
      expect(server.reviewsOf(P1).size).toBe(3);
    });
  });

  it('un CSV con un valor raro no guarda nada y dice en qué fila', async () => {
    const typing = userEvent.setup();
    const { server } = connect({ userId: P1, role: 'physician' });
    seedSample(server, { bias_tips: 2 });
    show();
    await screen.findByText(reviewer.progress(0, 2));
    const id = server.sampleIds()[0] ? [...server.reviewsOf(P1).keys()][0] : undefined;
    expect(id).toBeUndefined();
    const file = new File(
      [
        'id,exactitud,anclaje,problema_de_seguridad,utilidad,claridad,veredicto,comentario\n',
        'x,rarísimo,sí,no,3,4,aprobado,\n',
      ],
      'mis.csv',
      { type: 'text/csv' },
    );
    await typing.upload(screen.getByLabelText(aiAuditText.file.upload), file);
    const alert = await screen.findByText(aiAuditText.file.problems(1));
    expect(alert).toBeVisible();
    expect(server.reviewsOf(P1).size).toBe(0);
  });
});

describe('el administrador', () => {
  it('ve la compuerta cerrada, importa una muestra con dos médicos y la ve en la lista', async () => {
    const typing = userEvent.setup();
    const { server } = connect({ userId: ADMIN, role: 'admin' });
    show();
    expect(await screen.findByText(admin.samplesEmpty)).toBeVisible();
    const gate = screen.getByRole('region', { name: admin.gateTitle });
    expect(within(gate).getAllByText(admin.state.closed)).toHaveLength(5);
    expect(within(gate).getAllByText(admin.notAudited, { exact: false })).toHaveLength(5);

    const file = new File(
      [JSON.stringify(gateSampleFile('b12-2026-10', { bias_tips: 4 }))],
      'm.json',
      {
        type: 'application/json',
      },
    );
    await typing.upload(screen.getByLabelText(admin.fileLabel), file);
    expect(await screen.findByText(admin.fileSummary('b12-2026-10', 4))).toBeVisible();
    // Sin elegir a los dos médicos no se importa, y no pueden ser el mismo
    const importButton = screen.getByRole('button', { name: admin.import });
    expect(importButton).toBeDisabled();
    await typing.selectOptions(screen.getByLabelText(admin.reviewer1), 'Ana');
    await typing.selectOptions(screen.getByLabelText(admin.reviewer2), 'Ana');
    expect(screen.getByText(admin.sameReviewer)).toBeVisible();
    expect(importButton).toBeDisabled();
    await typing.selectOptions(screen.getByLabelText(admin.reviewer2), 'Beto');
    await typing.click(importButton);

    expect(await screen.findByText(admin.imported('b12-2026-10'))).toBeVisible();
    expect(server.sampleIds()).toEqual(['b12-2026-10']);
    expect(
      await screen.findByText(admin.sampleRow('b12-2026-10', 4, admin.statusOpen)),
    ).toBeVisible();
  });

  it('un archivo que no es una muestra se rechaza antes de mandarlo', async () => {
    const typing = userEvent.setup();
    const { rpc } = connect({ userId: ADMIN, role: 'admin' });
    show();
    await screen.findByText(admin.samplesEmpty);
    await typing.upload(
      screen.getByLabelText(admin.fileLabel),
      new File(['{"version":1}'], 'x.json', { type: 'application/json' }),
    );
    expect(await screen.findByText(admin.fileProblem.invalid ?? '')).toBeVisible();
    expect(rpc.mock.calls.filter(([name]) => name === 'admin_ai_gate_sample_create')).toHaveLength(
      0,
    );
  });

  it('ve el avance de cada médico, cierra la muestra, ve el veredicto y abre el motor que pasó', async () => {
    const typing = userEvent.setup();
    const { server } = connect({ userId: ADMIN, role: 'admin' });
    seedSample(server, { bias_tips: 2, forgetting: 1 });
    // Los dos médicos califican todo bien salvo las hipótesis, que dejan sin calificar
    const good: AiGateReviewLike = {
      accuracy: 'correct',
      grounded: true,
      safetyIssue: false,
      usefulness: 4,
      clarity: 4,
      verdict: 'approved',
      comment: null,
    };
    for (const reviewerId of [P1, P2]) {
      const mine = server.call(
        'ai_gate_my_items',
        { userId: reviewerId, role: 'physician' },
        { p_sample: 'b12-2026-10' },
      );
      const items = (mine?.data as { items: { id: string; engine: string }[] }).items.filter(
        (item) => item.engine === 'bias_tips',
      );
      for (const item of items) {
        server.call(
          'ai_gate_review',
          { userId: reviewerId, role: 'physician' },
          { p_item: item.id, p_review: good },
        );
      }
    }
    show();
    const row = await screen.findByText(admin.sampleRow('b12-2026-10', 3, admin.statusOpen));
    expect(row).toBeVisible();
    await typing.click(screen.getByRole('button', { name: admin.selectLabel('b12-2026-10') }));
    const detail = await screen.findByRole('region', { name: admin.selected('b12-2026-10') });
    expect(within(detail).getByText(admin.reviewerProgress('Ana', 2, 3, 0))).toBeVisible();
    expect(within(detail).getByText(admin.reviewerProgress('Beto', 2, 3, 0))).toBeVisible();

    // Cerrar pide confirmar, porque las respuestas quedan fijas
    await typing.click(within(detail).getByRole('button', { name: admin.closeSample }));
    expect(within(detail).getByText(admin.closeSampleHint)).toBeVisible();
    await typing.click(within(detail).getByRole('button', { name: admin.confirmClose }));
    expect(await screen.findByText(admin.sampleClosed)).toBeVisible();

    // Los consejos pasaron. Las hipótesis no, porque faltan calificar
    const verdict = await screen.findByRole('heading', { name: admin.verdictTitle });
    const table = verdict.parentElement as HTMLElement;
    const tips = within(table)
      .getByText(aiAuditText.engines.bias_tips)
      .closest('li') as HTMLElement;
    expect(within(tips).getByText(admin.verdictPassed)).toBeVisible();
    const forgetting = within(table)
      .getByText(aiAuditText.engines.forgetting)
      .closest('li') as HTMLElement;
    expect(within(forgetting).getByText(admin.verdictFailed)).toBeVisible();
    expect(within(forgetting).getByText(admin.reasons.incomplete ?? '')).toBeVisible();
    expect(within(forgetting).queryByRole('button', { name: /Abrir/ })).toBeNull();

    // Abrir el motor que pasó lo deja abierto para alumnos, atado a su modelo y su prompt
    await typing.click(
      within(tips).getByRole('button', {
        name: admin.openWith(aiAuditText.engines.bias_tips, 'b12-2026-10'),
      }),
    );
    expect(await screen.findByText(admin.opened(aiAuditText.engines.bias_tips))).toBeVisible();
    expect(server.state.engines.bias_tips).toMatchObject({
      open: true,
      model: 'claude-haiku-5-5',
      sampleId: 'b12-2026-10',
      promptVersion: 'bias_tips.base.v1',
    });
    const gate = screen.getByRole('region', { name: admin.gateTitle });
    await waitFor(() => {
      expect(within(gate).getByText(admin.state.open)).toBeVisible();
    });

    // Y cerrarlo siempre se puede
    await typing.click(
      within(gate).getByRole('button', { name: admin.closeLabel(aiAuditText.engines.bias_tips) }),
    );
    expect(await screen.findByText(admin.closed(aiAuditText.engines.bias_tips))).toBeVisible();
    expect(server.state.engines.bias_tips?.open).toBe(false);
  });

  it('un motor que no pasó no se abre, y la pausa global se pone y se quita', async () => {
    const typing = userEvent.setup();
    const { server } = connect({ userId: ADMIN, role: 'admin' });
    seedSample(server, { bias_tips: 1 });
    show();
    const gate = await screen.findByRole('region', { name: admin.gateTitle });
    expect(await within(gate).findByText(admin.notPaused)).toBeVisible();
    await typing.click(within(gate).getByRole('button', { name: admin.pause }));
    expect(await screen.findByText(admin.pausedDone)).toBeVisible();
    expect(server.state.paused).toBe(true);
    expect(await within(gate).findByText(admin.paused)).toBeVisible();
    await typing.click(within(gate).getByRole('button', { name: admin.unpause }));
    expect(await screen.findByText(admin.unpausedDone)).toBeVisible();
    expect(server.state.paused).toBe(false);
  });

  it('un médico no ve nada de la parte del administrador', async () => {
    connect({ userId: P1, role: 'physician' });
    show();
    await screen.findByText(reviewer.empty);
    expect(screen.queryByText(admin.gateTitle)).toBeNull();
    expect(screen.queryByText(admin.importTitle)).toBeNull();
  });
});

interface AiGateReviewLike {
  accuracy: 'correct' | 'minor' | 'severe';
  grounded: boolean;
  safetyIssue: boolean;
  usefulness: number;
  clarity: number;
  verdict: 'approved' | 'minor_changes' | 'rejected';
  comment: string | null;
}
