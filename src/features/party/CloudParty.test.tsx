// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import {
  createPartyChallenge,
  createPartyDuel,
  createPartyGroup,
  joinPartyGroup,
  publishPartyNumbers,
  startPartyDuel,
  submitPartyDuelResult,
} from '@/data/cloud/party';
import type { AppEvent } from '@/data/schemas/events';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { newId } from '@/data/testing/fixtures';
import { setConsent } from '@/data/usecases/profile';
import { studyDayOf, weekStartOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { usePractice } from '../simulator/practice';
import { answered, event, option, question } from '../tutor/testing/fixtures';
import type * as DuelActions from './duelActions';

vi.setConfig({ testTimeout: 30_000 });

// getCloud devuelve la nube falsa que arma cada prueba
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

// Elegir las preguntas de un duelo carga el banco completo. Aquí basta con veinte ids fijos
const DUEL_QUESTIONS = Array.from(
  { length: 20 },
  (_, index) => `01J${String(index).padStart(23, '0')}`,
);
vi.mock('./duelActions', async (importOriginal) => ({
  ...(await importOriginal<typeof DuelActions>()),
  pickDuelQuestionIds: () => Promise.resolve(DUEL_QUESTIONS),
}));

const ANA = '2f6c4b1e-8a3d-4c7e-9b10-6d2e5f7a8b01';
const BRUNO = '7a1d3c5e-2b4f-4a6c-8e9d-0f1a2b3c4d5e';
const text = t.partyCloud;
const week = () => weekStartOf(studyDayOf(new Date(), 'America/Merida'));

let fake: FakeCloud;
let app: RenderedApp | undefined;

beforeEach(() => {
  fake = makeFakeCloud({ session: { id: ANA, email: 'ana@ejemplo.mx' } });
  fake.aliases.set(ANA, 'Ana');
  fake.aliases.set(BRUNO, 'Bruno');
  holder.cloud = fake.cloud;
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: ANA, email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
    },
  });
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

/** Bruno, en su navegador, crea un grupo y publica su XP. Devuelve el código */
async function brunoGroup(xp = 70): Promise<{ code: string; groupId: string }> {
  fake.session = { id: BRUNO, email: 'bruno@ejemplo.mx' };
  const created = await createPartyGroup(fake.cloud, 'Guardia');
  if (!created.ok || created.value.status !== 'created') throw new Error('no se creó el grupo');
  await publishPartyNumbers(fake.cloud, { weekStart: week(), weeklyXp: xp, contributions: [] });
  fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
  return { code: created.value.inviteCode, groupId: created.value.groupId };
}

const withConsent = async (api: RenderedApp['api'], user: RenderedApp['user']) => {
  await setConsent(api, user, 'party', true);
};

/** Ana entra al grupo de Bruno y Bruno la reta. Devuelve el duelo y sus preguntas */
async function brunoChallengesAna() {
  const { groupId, code } = await brunoGroup();
  await joinPartyGroup(fake.cloud, code);
  fake.session = { id: BRUNO, email: 'bruno@ejemplo.mx' };
  const questions = Array.from({ length: 20 }, () => question({ id: newId() }));
  const created = await createPartyDuel(fake.cloud, {
    groupId,
    opponentId: ANA,
    questionIds: questions.map((item) => item.id),
  });
  if (!created.ok || created.value.status !== 'created') throw new Error('no se creó el duelo');
  fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
  return { groupId, code, duelId: created.value.duelId, questions };
}

/** El intento de Ana en su bitácora. answeredCount respuestas, las primeras correct correctas */
function attemptEvents(input: {
  duelId: string;
  sessionId: string;
  questions: ReturnType<typeof question>[];
  answeredCount: number;
  correct: number;
  ended: boolean;
}): AppEvent[] {
  const right = option(newId(), true, 'Correcta');
  const at = Date.now() - 3_600_000;
  return [
    event(
      'session_started',
      { kind: 'challenge', config: { duelId: input.duelId, count: input.questions.length } },
      at,
      input.sessionId,
    ),
    ...input.questions
      .slice(0, input.answeredCount)
      .map((item, index) =>
        answered(
          item,
          right.id,
          index < input.correct,
          at + (index + 1) * 60_000,
          { msToAnswer: 30_000 },
          input.sessionId,
        ),
      ),
    ...(input.ended
      ? [
          event(
            'session_ended',
            {
              kind: 'challenge',
              reason: input.answeredCount === input.questions.length ? 'completed' : 'abandoned',
              items: input.answeredCount,
              correct: input.correct,
              durationMs: input.answeredCount * 30_000,
              xp: 0,
            },
            at + 30 * 60_000,
            input.sessionId,
          ),
        ]
      : []),
  ];
}

describe('Party en la nube', () => {
  it('pide el permiso antes de compartir, crea un grupo y lo muestra con su código', async () => {
    app = await renderApp('/party');
    const consent = await screen.findByRole('region', { name: text.consent.title });
    expect(within(consent).getByText(text.consent.body)).toBeVisible();
    expect(screen.queryByRole('region', { name: t.party.createTitle })).toBeNull();
    await userEvent.click(within(consent).getByRole('button', { name: text.consent.allow }));

    const create = await screen.findByRole('region', { name: t.party.createTitle });
    expect(within(create).getByText(text.createHint)).toBeVisible();
    // Sin compañeros simulados con una cuenta real
    expect(within(create).queryByLabelText(t.party.withFriends)).toBeNull();
    await userEvent.type(within(create).getByLabelText(t.party.groupName), 'Guardia');
    await userEvent.click(within(create).getByRole('button', { name: t.party.create }));

    const group = await screen.findByRole('region', { name: 'Guardia' });
    const code = within(group).getByTestId('party-invite-code').textContent;
    expect(code).toBe(fake.party.codeOf('Guardia'));
    expect(within(group).getByRole('button', { name: text.invite.copyLink })).toBeVisible();
    const rows = within(within(group).getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent(`Ana (${t.party.you})`);
    expect(screen.getByText(text.privacy)).toBeVisible();
    const joined = (await app.api.repos.events.query({ userId: app.user.id })).filter(
      (item) => item.type === 'party_joined',
    );
    expect(joined).toHaveLength(1);
  });

  it('entra con el enlace de invitación, ve la tabla y publica su XP de la semana', async () => {
    const { code } = await brunoGroup(70);
    app = await renderApp(`/party?codigo=${code.toLowerCase()}`, {
      seed: async (api, user) => {
        await withConsent(api, user);
        // 40 XP de hoy, que sale de su bitácora y es lo único que se publica
        await api.repos.events.append({
          ...event(
            'xp_awarded',
            { amount: 40, reason: 'card_review', sourceEventId: null },
            Date.now(),
          ),
          userId: user.id,
        });
      },
    });
    const join = await screen.findByRole('region', { name: t.party.joinTitle });
    expect(within(join).getByLabelText(t.party.code)).toHaveValue(code);
    await userEvent.click(within(join).getByRole('button', { name: t.party.join }));
    expect(await within(join).findByText(text.joinResults.joined)).toBeVisible();

    const group = await screen.findByRole('region', { name: 'Guardia' });
    const table = within(group).getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Bruno');
    expect(rows[1]).toHaveTextContent('70');
    expect(rows[2]).toHaveTextContent(`Ana (${t.party.you})`);
    expect(rows[2]).toHaveTextContent('40');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['#', t.party.alias, t.party.weeklyXp]);
    await waitFor(() => {
      expect(fake.party.publishedXp('Guardia', ANA)).toBe(40);
    });
  });

  it('el modo enfoque oculta la tabla, el XP y los retos, y deja los miembros y los duelos', async () => {
    const { code } = await brunoGroup(70);
    app = await renderApp(`/party?codigo=${code}`, { seed: withConsent });
    const join = await screen.findByRole('region', { name: t.party.joinTitle });
    await userEvent.click(within(join).getByRole('button', { name: t.party.join }));
    const group = await screen.findByRole('region', { name: 'Guardia' });
    expect(within(group).getByRole('table')).toBeVisible();
    expect(within(group).getByRole('button', { name: t.party.newChallenge })).toBeVisible();

    act(() => {
      usePreferences.getState().setAppearance({ focusMode: true });
    });
    expect(await screen.findByText(text.focusNote)).toBeVisible();
    expect(within(group).queryByRole('table')).toBeNull();
    expect(within(group).queryByText(t.party.leaderboard)).toBeNull();
    expect(within(group).queryByText(t.party.challenges)).toBeNull();
    expect(within(group).queryByRole('button', { name: t.party.newChallenge })).toBeNull();
    const members = within(group).getByRole('list', { name: text.membersTitle });
    expect(members).toHaveTextContent('Bruno');
    expect(members).not.toHaveTextContent('70');
    expect(within(group).getByText(text.duels.title)).toBeVisible();
    expect(within(group).getByRole('button', { name: t.party.duel.newButton })).toBeVisible();
    expect(within(group).getByTestId('party-invite-code')).toHaveTextContent(code);
  });

  it('reta a un compañero real y el duelo queda esperando su turno', async () => {
    const { code } = await brunoGroup();
    app = await renderApp(`/party?codigo=${code}`, { seed: withConsent });
    const join = await screen.findByRole('region', { name: t.party.joinTitle });
    await userEvent.click(within(join).getByRole('button', { name: t.party.join }));
    const group = await screen.findByRole('region', { name: 'Guardia' });
    await userEvent.click(within(group).getByRole('button', { name: t.party.duel.newButton }));
    expect(within(group).getByLabelText(t.party.duel.rival)).toHaveDisplayValue('Bruno');
    await userEvent.click(within(group).getByRole('button', { name: t.party.duel.create }));

    const duel = await within(group).findByText(t.party.duel.title('Bruno'));
    const row = duel.closest('li') as HTMLElement;
    expect(within(row).getByText(t.party.duel.rules(20))).toBeVisible();
    expect(within(row).getByRole('button', { name: t.party.duel.play })).toBeVisible();
    // Sin datos simulados ni resultado del rival antes de jugar
    expect(within(row).queryByText(t.labels.simulatedData)).toBeNull();
    expect(within(row).queryByRole('table')).toBeNull();
  });

  it('manda el resultado del duelo jugado aquí y muestra quién ganó cuando los dos terminan', async () => {
    const { duelId, questions } = await brunoChallengesAna();
    // Bruno juega primero
    fake.session = { id: BRUNO, email: 'bruno@ejemplo.mx' };
    await startPartyDuel(fake.cloud, duelId);
    await submitPartyDuelResult(fake.cloud, { duelId, correct: 12, totalMs: 900_000 });
    // Ana empezó su duelo en el servidor al tocar Jugar y lo terminó en este dispositivo, pero su
    // resultado todavía no llega al servidor
    fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
    await startPartyDuel(fake.cloud, duelId);
    app = await renderApp('/party', {
      seed: async (api, user) => {
        await withConsent(api, user);
        const played = attemptEvents({
          duelId,
          sessionId: newId(),
          questions,
          answeredCount: 20,
          correct: 15,
          ended: true,
        }).map((item) => ({ ...item, userId: user.id }));
        for (const item of played) await api.repos.events.append(item);
      },
    });

    const group = await screen.findByRole('region', { name: 'Guardia' });
    const table = await within(group).findByRole('table', { name: t.party.duel.result });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(t.party.duel.hitsOf(15, 20));
    expect(rows[2]).toHaveTextContent('Bruno');
    expect(rows[2]).toHaveTextContent(t.party.duel.hitsOf(12, 20));
    expect(within(group).getByText(t.party.duel.verdicts.win_accuracy)).toBeVisible();
    expect(fake.party.duelResults(ANA)).toContainEqual({
      duelId,
      userId: ANA,
      correct: 15,
      totalMs: 600_000,
    });
  });

  it('un duelo dejado a medias cuenta como su intento, sin volver a ofrecer jugar', async () => {
    const { duelId, questions } = await brunoChallengesAna();
    await startPartyDuel(fake.cloud, duelId);
    app = await renderApp('/party', {
      seed: async (api, user) => {
        await withConsent(api, user);
        // Contestó 3, acertó 2 y cerró la pestaña sin llegar al resumen
        const halfway = attemptEvents({
          duelId,
          sessionId: newId(),
          questions,
          answeredCount: 3,
          correct: 2,
          ended: false,
        }).map((item) => ({ ...item, userId: user.id }));
        for (const item of halfway) await api.repos.events.append(item);
      },
    });
    const group = await screen.findByRole('region', { name: 'Guardia' });
    const row = (await within(group).findByText(t.party.duel.title('Bruno'))).closest(
      'li',
    ) as HTMLElement;
    expect(await within(row).findByText(text.duels.yourResult(2, 20, '1:30'))).toBeVisible();
    expect(within(row).queryByRole('button', { name: t.party.duel.play })).toBeNull();
    await waitFor(() => {
      expect(fake.party.duelResults(ANA)).toContainEqual({
        duelId,
        userId: ANA,
        correct: 2,
        totalMs: 90_000,
      });
    });
  });

  it('a medias en esta pestaña deja continuar y todavía no manda nada', async () => {
    const { duelId, questions } = await brunoChallengesAna();
    await startPartyDuel(fake.cloud, duelId);
    app = await renderApp('/party', {
      seed: async (api, user) => {
        await withConsent(api, user);
        const sessionId = newId();
        const halfway = attemptEvents({
          duelId,
          sessionId,
          questions,
          answeredCount: 2,
          correct: 1,
          ended: false,
        }).map((item) => ({ ...item, userId: user.id }));
        for (const item of halfway) await api.repos.events.append(item);
        usePractice.getState().set({
          sessionId,
          userId: user.id,
          questionIds: questions.map((item) => item.id),
          index: 2,
          answers: [],
          startedAt: Date.now(),
          ended: false,
          kind: 'challenge',
          duelId,
          targetTags: [],
        });
      },
    });
    const group = await screen.findByRole('region', { name: 'Guardia' });
    const row = (await within(group).findByText(t.party.duel.title('Bruno'))).closest(
      'li',
    ) as HTMLElement;
    expect(await within(row).findByText(text.duels.inProgress)).toBeVisible();
    expect(within(row).getByRole('link', { name: text.duels.continue })).toHaveAttribute(
      'href',
      SCREENS.question.path,
    );
    expect(within(row).queryByRole('button', { name: t.party.duel.play })).toBeNull();
    expect(fake.party.duelResults(ANA).filter((item) => item.userId === ANA)).toEqual([]);
    act(() => {
      usePractice.getState().set({ sessionId: null, userId: null, duelId: null, kind: 'practice' });
    });
  });

  it('un duelo empezado en otro dispositivo ya no se juega en este', async () => {
    const { duelId } = await brunoChallengesAna();
    await startPartyDuel(fake.cloud, duelId);
    app = await renderApp('/party', { seed: withConsent });
    const group = await screen.findByRole('region', { name: 'Guardia' });
    const row = (await within(group).findByText(t.party.duel.title('Bruno'))).closest(
      'li',
    ) as HTMLElement;
    expect(await within(row).findByText(text.duels.startedElsewhere)).toBeVisible();
    expect(within(row).queryByRole('button', { name: t.party.duel.play })).toBeNull();
  });

  it('quien administra cambia el código y quita a un miembro, con confirmación', async () => {
    // Ana crea el grupo y Bruno entra
    fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
    const created = await createPartyGroup(fake.cloud, 'Guardia');
    if (!created.ok || created.value.status !== 'created') throw new Error('sin grupo');
    fake.session = { id: BRUNO, email: 'bruno@ejemplo.mx' };
    await joinPartyGroup(fake.cloud, created.value.inviteCode);
    fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
    app = await renderApp('/party', { seed: withConsent });
    const group = await screen.findByRole('region', { name: 'Guardia' });
    expect(within(group).getByText(text.admin.youAdminister)).toBeVisible();

    // Cambiar el código pide confirmación y se puede cancelar
    await userEvent.click(within(group).getByRole('button', { name: text.admin.rotateCode }));
    expect(within(group).getByText(text.admin.rotateConfirm)).toBeVisible();
    await userEvent.click(within(group).getByRole('button', { name: text.admin.cancel }));
    expect(fake.party.codeOf('Guardia')).toBe(created.value.inviteCode);
    await userEvent.click(within(group).getByRole('button', { name: text.admin.rotateCode }));
    await userEvent.click(within(group).getByRole('button', { name: text.admin.rotateYes }));
    expect(await within(group).findByText(text.admin.rotated)).toBeVisible();
    const fresh = fake.party.codeOf('Guardia') ?? '';
    expect(fresh).not.toBe(created.value.inviteCode);
    await waitFor(() => {
      expect(within(group).getByTestId('party-invite-code')).toHaveTextContent(fresh);
    });

    // Quitar a Bruno
    await userEvent.click(within(group).getByText(text.admin.membersTitle));
    await userEvent.click(within(group).getByRole('button', { name: text.admin.remove('Bruno') }));
    expect(within(group).getByText(text.admin.removeConfirm('Bruno'))).toBeVisible();
    await userEvent.click(within(group).getByRole('button', { name: text.admin.removeYes }));
    expect(await within(group).findByText(text.admin.removed('Bruno'))).toBeVisible();
    expect(fake.party.activeMembers('Guardia')).toEqual([ANA]);
  });

  it('quien no administra no ve las acciones de moderación y borra solo sus retos', async () => {
    const { groupId, code } = await brunoGroup();
    await joinPartyGroup(fake.cloud, code);
    fake.session = { id: BRUNO, email: 'bruno@ejemplo.mx' };
    await createPartyChallenge(fake.cloud, {
      groupId,
      title: 'De Bruno',
      metric: 'cards',
      target: 50,
    });
    fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
    await createPartyChallenge(fake.cloud, {
      groupId,
      title: 'De Ana',
      metric: 'cards',
      target: 50,
    });
    app = await renderApp('/party', { seed: withConsent });
    const group = await screen.findByRole('region', { name: 'Guardia' });
    await within(group).findByText('De Ana');
    expect(within(group).queryByText(text.admin.youAdminister)).toBeNull();
    expect(within(group).queryByRole('button', { name: text.admin.rotateCode })).toBeNull();
    expect(within(group).queryByText(text.admin.membersTitle)).toBeNull();
    const deletes = within(group).getAllByRole('button', { name: text.admin.deleteChallenge });
    expect(deletes).toHaveLength(1);
    const own = within(group).getByText('De Ana').closest('li') as HTMLElement;
    await userEvent.click(within(own).getByRole('button', { name: text.admin.deleteChallenge }));
    await userEvent.click(within(own).getByRole('button', { name: text.admin.deleteChallengeYes }));
    await waitFor(() => {
      expect(within(group).queryByText('De Ana')).toBeNull();
    });
    expect(within(group).getByText('De Bruno')).toBeVisible();
  });
});

describe('Party sin nube', () => {
  it('explica que necesita la cuenta en la nube y sigue mostrando la tarjeta de referidos', async () => {
    holder.cloud = null;
    useCloud.setState({ state: { status: 'off' } });
    app = await renderApp('/party');
    const card = await screen.findByRole('region', { name: text.needsCloud.title });
    expect(within(card).getByText(text.needsCloud.off)).toBeVisible();
    expect(screen.queryByRole('region', { name: t.party.createTitle })).toBeNull();
    expect(screen.getByRole('region', { name: t.b7.referral.title })).toBeVisible();
  });

  it('con la nube configurada y este navegador sin conectar lo dice', async () => {
    useCloud.setState({ state: { status: 'signed-out' } });
    app = await renderApp('/party');
    expect(await screen.findByText(text.needsCloud.signedOut)).toBeVisible();
  });
});
