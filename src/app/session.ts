// Sesión del alumno. En Mi cuenta es el perfil con el que entró (inicio de sesión simulado y local,
// 3.2). En la demostración es siempre el alumno de demostración (11.3).
import { useRepositories } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { UserSettingsSchema, type User, type UserSettings } from '@/data/schemas/people';
import { DEMO_STUDENT_ALIAS } from '@/demo/constants';
import { usePreferences } from './preferences';

export type SessionState =
  | { status: 'loading' }
  /** Mi cuenta sin sesión abierta */
  | { status: 'signed-out' }
  /** La demostración todavía no tiene datos generados */
  | { status: 'demo-empty' }
  | { status: 'ready'; user: User; settings: UserSettings; isDemo: boolean };

export function useSession(): SessionState {
  const repos = useRepositories();
  const sessionUserId = usePreferences((state) => state.sessionUserId);
  const result = useLiveData(async (): Promise<SessionState> => {
    if (repos.kind === 'demo') {
      const users = await repos.users.list();
      const demo = users.find((user) => user.alias === DEMO_STUDENT_ALIAS);
      return demo
        ? {
            status: 'ready',
            user: demo,
            settings: UserSettingsSchema.parse(demo.settings),
            isDemo: true,
          }
        : { status: 'demo-empty' };
    }
    if (!sessionUserId) return { status: 'signed-out' };
    const user = await repos.users.get(sessionUserId);
    return user
      ? { status: 'ready', user, settings: UserSettingsSchema.parse(user.settings), isDemo: false }
      : { status: 'signed-out' };
  }, [repos, sessionUserId]);
  return result ?? { status: 'loading' };
}
