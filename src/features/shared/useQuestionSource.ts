// Qué fuente de preguntas usa el alumno (B11, 5.1 del plan de B11). La nube solo con la base real, la
// nube configurada, la bandera cloudBank y una cuenta que entró. En lo demás, el banco de demostración de
// siempre. La decide una vez por pantalla con useQuestionSource. Lo que no es pantalla, como crear un
// duelo, la pide con currentQuestionSource. Cada base tiene una sola fuente de cada tipo, así dos
// pantallas comparten la misma bajada del catálogo.
import { useCloud, type CloudState } from '@/app/cloudState';
import { usePreferences } from '@/app/preferences';
import { isFeatureEnabled } from '@/config/featureFlags';
import { createCloudSource } from '@/data/bank/cloudSource';
import type { QuotaInfo } from '@/data/bank/contracts';
import { createLocalSource } from '@/data/bank/localSource';
import { questionSourceKind, type QuestionSource } from '@/data/bank/questionSource';
import { cloudConfigured, getCloud } from '@/data/cloud/client';
import { useDataApi, type DataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { DatabaseKind } from '@/data/databases';

type Api = Pick<DataApi, 'repos'>;
type Kind = QuestionSource['kind'];

const sources = new WeakMap<object, Partial<Record<Kind, QuestionSource>>>();

/** La fuente de un tipo para una base. Siempre la misma mientras la base sea la misma */
export function questionSourceFor(api: Api, kind: Kind): QuestionSource {
  const known = sources.get(api.repos) ?? {};
  const existing = known[kind];
  if (existing) return existing;
  const created =
    kind === 'cloud'
      ? createCloudSource({ repos: api.repos, cloud: getCloud })
      : createLocalSource({ repos: api.repos });
  sources.set(api.repos, { ...known, [kind]: created });
  return created;
}

function kindFor(database: DatabaseKind, cloudStatus: CloudState['status']): Kind {
  return questionSourceKind({
    database,
    cloudConfigured: cloudConfigured(),
    cloudBank: isFeatureEnabled('cloudBank'),
    cloudStatus,
  });
}

const cloudStatusNow = () => useCloud.getState().state.status;

/** El tipo de fuente que toca ahora, fuera de React */
export function currentSourceKind(api: Api): Kind {
  return kindFor(api.repos.kind, cloudStatusNow());
}

/** La fuente que toca ahora, fuera de React, como al crear o abrir un duelo */
export function currentQuestionSource(api: Api): QuestionSource {
  return questionSourceFor(api, currentSourceKind(api));
}

/** El tipo de fuente para el marco de la app, que no necesita la base para decidir el aviso */
export function useQuestionSourceKind(): Kind {
  const database = usePreferences((state) => state.database);
  const cloudStatus = useCloud((store) => store.state.status);
  return kindFor(database, cloudStatus);
}

/** La fuente de la pantalla. Cambia si la cuenta entra o sale de la nube */
export function useQuestionSource(): QuestionSource {
  const api = useDataApi();
  const cloudStatus = useCloud((store) => store.state.status);
  return questionSourceFor(api, kindFor(api.repos.kind, cloudStatus));
}

/**
 * La última cuota que dijo el servidor, guardada para contarla también sin conexión. null con la fuente
 * local o si nunca llegó. undefined mientras carga
 */
export function useServerQuota(source: QuestionSource): QuotaInfo | null | undefined {
  const api = useDataApi();
  return useLiveData(
    () =>
      source.kind === 'cloud'
        ? api.repos.bankState.get('quota').then((state) => state?.quota ?? null)
        : Promise.resolve(null),
    [api.repos, source],
  );
}
