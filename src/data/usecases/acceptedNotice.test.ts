import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, testApi } from '../testing/fixtures';
import { acceptedNoticeVersion } from './profile';

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
