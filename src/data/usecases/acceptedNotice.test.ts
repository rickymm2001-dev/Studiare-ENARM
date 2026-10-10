import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, testApi } from '../testing/fixtures';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { makeUser } from '../testing/fixtures';
import {
  acceptCurrentNotice,
  acceptedNoticeVersion,
  currentConsents,
  noticeNeedsAcceptance,
} from './profile';

const consent = (userId: string, noticeVersion: string, purpose: 'party' | 'ai_analysis') => ({
  id: newId(),
  userId,
  purpose,
  noticeVersion,
  status: 'granted' as const,
  decidedAt: '2026-10-01T00:00:00.000Z',
});

let api: ReturnType<typeof testApi> | undefined;
afterEach(async () => {
  await api?.dispose();
  api = undefined;
});

describe('versión del aviso que el alumno aceptó', () => {
  it('sin ninguna decisión es null y no se registra nada', async () => {
    api = testApi();
    expect(await acceptedNoticeVersion(api, newId())).toBeNull();
  });

  it('es la versión más reciente bajo la que decidió, no la que trae la app', async () => {
    api = testApi();
    const user = newId();
    await api.repos.consents.put(consent(user, '2026-10-01', 'party'));
    await api.repos.consents.put(consent(user, '2026-10-05', 'ai_analysis'));
    expect(await acceptedNoticeVersion(api, user)).toBe('2026-10-05');
  });

  it('no mezcla las decisiones de otro alumno', async () => {
    api = testApi();
    const user = newId();
    await api.repos.consents.put(consent(user, '2026-10-01', 'party'));
    await api.repos.consents.put(consent(newId(), '2026-10-09', 'party'));
    expect(await acceptedNoticeVersion(api, user)).toBe('2026-10-01');
  });
});

describe('aceptar el aviso nuevo', () => {
  it('quien decidió bajo una versión anterior necesita aceptar la nueva', async () => {
    api = testApi();
    const user = newId();
    await api.repos.consents.put(consent(user, '2026-01-01', 'party'));
    expect(await noticeNeedsAcceptance(api, user)).toBe(true);
  });

  it('quien decidió bajo la versión actual, o todavía no decide nada, no necesita aceptar', async () => {
    api = testApi();
    const user = newId();
    expect(await noticeNeedsAcceptance(api, user)).toBe(false);
    await api.repos.consents.put(consent(user, PRIVACY_NOTICE_VERSION, 'party'));
    expect(await noticeNeedsAcceptance(api, user)).toBe(false);
  });

  it('aceptar vuelve a registrar cada decisión tal como estaba, bajo la versión nueva', async () => {
    api = testApi();
    const user = makeUser();
    await api.repos.users.put(user);
    await api.repos.consents.put(consent(user.id, '2026-01-01', 'party'));
    await api.repos.consents.put({
      ...consent(user.id, '2026-01-01', 'ai_analysis'),
      status: 'revoked' as const,
    });
    const before = await currentConsents(api, user.id);
    await acceptCurrentNotice(api, user);
    expect(await currentConsents(api, user.id)).toEqual(before);
    expect(await acceptedNoticeVersion(api, user.id)).toBe(PRIVACY_NOTICE_VERSION);
    expect(await noticeNeedsAcceptance(api, user.id)).toBe(false);
    // La bitácora de decisiones solo se agrega. Las anteriores siguen ahí
    const all = await api.repos.consents.list();
    expect(all.filter((item) => item.userId === user.id).length).toBeGreaterThanOrEqual(5);
  });
});
