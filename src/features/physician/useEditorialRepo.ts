// Qué repositorio editorial usa cada pantalla del médico y del admin (B11, 5.7 del plan de B11). La nube
// con base real, cuenta conectada y rol del equipo. La local en la demo y en todo lo demás. No necesita
// bandera, porque los médicos trabajan en la nube desde que B11 se despliega. La local espera a que el
// banco de demostración termine de guardarse, así nadie ve un banco a medias.
import { useMemo } from 'react';
import { useCloud } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { useSession } from '@/app/session';
import { getCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { createCloudEditorialRepo } from '@/data/editorial/cloudEditorialRepo';
import type { EditorialRepo } from '@/data/editorial/editorialRepo';
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
 * Si el banco editorial es el de la nube, sin esperar al banco local. Base real, cuenta conectada y
 * rol del equipo. Lo usa la pantalla 22, que no necesita el banco de demostración guardado
 */
export function useEditorialKind(): 'local' | 'cloud' {
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const linked = useCloud((store) => store.state.status === 'linked');
  if (override) return override.kind;
  return database === 'real' && linked && role !== 'student' && getCloud() ? 'cloud' : 'local';
}

export function useEditorialRepo(): EditorialRepoState {
  const api = useDataApi();
  const role = usePreferences((state) => state.role);
  const database = usePreferences((state) => state.database);
  const linked = useCloud((store) => store.state.status === 'linked');
  const session = useSession();
  const me = session.status === 'ready' ? session.user.id : null;
  const bankReady = useBankReady();
  const cloud = database === 'real' && linked && role !== 'student' ? getCloud() : null;
  const repos = api.repos;
  const repo = useMemo(
    () =>
      override ??
      (cloud
        ? createCloudEditorialRepo(cloud, { onForbidden: askSecondFactor })
        : createLocalEditorialRepo({ repos }, { id: me, role })),
    [cloud, repos, me, role],
  );
  return {
    repo,
    ready: repo.kind === 'cloud' || (bankReady && session.status !== 'loading'),
    me,
    key: `${repo.kind}|${database}|${role}|${me ?? ''}|${override ? 'override' : ''}`,
  };
}
