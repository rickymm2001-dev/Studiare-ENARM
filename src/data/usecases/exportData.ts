// Exportar mis datos (4.5). Todo lo del alumno en un JSON legible, incluida la bitácora completa.
import type { Repositories } from '../repos/types';

export async function exportUserData(repos: Repositories, userId: string) {
  const [user, account, consents, events, layout, subscription] = await Promise.all([
    repos.users.get(userId),
    repos.accounts.get(userId),
    repos.consents.list().then((list) => list.filter((consent) => consent.userId === userId)),
    repos.events.query({ userId }),
    repos.widgetLayouts.get(userId),
    repos.subscriptions.get(userId),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    format: 'enarm-prototipo-export-v1',
    user,
    account: account ?? null,
    consents,
    subscription: subscription ?? null,
    widgetLayout: layout ?? null,
    events,
  };
}
