// Qué repositorio editorial usa cada pantalla del médico y del admin (B11, 5.7 del plan de B11). Con base
// real, nube configurada y rol del equipo siempre es la nube. Mientras la sesión se revisa las pantallas
// cargan y sin sesión o sin conexión dicen que necesitan conexión, pero nunca caen a la base local, que
// no es la del equipo (M6 de la revisión). La local queda para la demo y lo demás. No necesita bandera,
// porque los médicos trabajan en la nube desde que B11 se despliega. La local espera a que el banco de
// demostración termine de guardarse, así nadie ve un banco a medias.
import { useMemo } from 'react';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { useSession } from '@/app/session';
import { cloudConfigured, getCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { createCloudEditorialRepo } from '@/data/editorial/cloudEditorialRepo';
import { EditorialError, type EditorialRepo } from '@/data/editorial/editorialRepo';
import { createLocalEditorialRepo } from '@/data/editorial/localEditorialRepo';
import { useBankReady } from '../shared/useBankReady';
import { askSecondFactor } from './secondFactor';

let override: EditorialRepo | null = null;

/** Solo para las pruebas de pantalla. Pone un repositorio fijo, o null para volver a lo normal */
export function setEditorialRepoOverride(repo: EditorialRepo | null): void {
  override = repo;
}

export interface EditorialRepoState {
  repo: EditorialRepo;
  /** false mientras el banco local o la sesión todavía cargan. La nube siempre está lista */
  ready: boolean;
  /** El perfil con sesión en la base local, o null */
  me: string | null;
  /** Cambia cuando cambia el repositorio, para volver a leer con useRepoQuery */
  key: string;
}

/**
 * Qué banco editorial toca, sin esperar al banco local. cloud con la cuenta conectada, checking mientras
 * se revisa la sesión y unavailable sin sesión o sin conexión, las tres con base real, nube configurada
 * y rol del equipo. local en lo demás. Lo usa también la pantalla 22, que no necesita el banco de
 * demostración guardado
 */
export type EditorialKind = 'local' | 'cloud' | 'checking' | 'unavailable';

export function useEditorialKind(): EditorialKind {
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const status = useCloud((store) => store.state.status);
  if (override) return override.kind;
  if (database !== 'real' || role === 'student' || !cloudConfigured()) return 'local';
  if (status === 'linked' && getCloud()) return 'cloud';
  return status === 'checking' ? 'checking' : 'unavailable';
}

const offline = () => Promise.reject(new EditorialError('network'));

/** El banco del equipo sin conexión. Todo responde network y la pantalla dice que necesita conexión */
const UNAVAILABLE_REPO: EditorialRepo = {
  kind: 'cloud',
  list: offline,
  question: offline,
  createQuestion: offline,
  saveVersion: offline,
  submit: offline,
  label: offline,
  decide: offline,
  reports: offline,
  setReportsStatus: offline,
  distractorQueue: offline,
  resolveDistractor: offline,
  labelPairs: offline,
  myReviews: offline,
  resolveSyncConflict: offline,
};

export function useEditorialRepo(): EditorialRepoState {
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const kind = useEditorialKind();
  const session = useSession();
  const me = session.status === 'ready' ? session.user.id : null;
  const bankReady = useBankReady();
  const cloud = kind === 'cloud' ? getCloud() : null;
  const repos = api.repos;
  const repo = useMemo(
    () =>
      override ??
      (cloud
        ? createCloudEditorialRepo(cloud, { onForbidden: askSecondFactor })
        : kind === 'local'
          ? createLocalEditorialRepo({ repos }, { id: me, role })
          : UNAVAILABLE_REPO),
    [cloud, kind, repos, me, role],
  );
  return {
    repo,
    // Mientras se revisa la sesión de la nube las pantallas siguen cargando
    ready:
      kind === 'cloud' ||
      kind === 'unavailable' ||
      (kind === 'local' && bankReady && session.status !== 'loading'),
    me,
    key: `${kind}|${database}|${role}|${me ?? ''}|${override ? 'override' : ''}`,
  };
}
