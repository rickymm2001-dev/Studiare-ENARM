// Qué fuente de preguntas usa el alumno (B11, 5.1 del plan de B11). La nube solo con la base real, la
// nube configurada, la bandera cloudBank y una cuenta que entró. En lo demás, el banco de demostración de
// siempre. La decide una vez por pantalla con useQuestionSource. Lo que no es pantalla, como crear un
// duelo, la pide con currentQuestionSource. Cada base tiene una sola fuente de cada tipo, así dos
// pantallas comparten la misma bajada del catálogo. La decisión sola vive en questionSourceKind.ts,
// que es lo único que necesita el marco de la app.
import { useCloud } from '@/app/cloudState';
import { createCloudSource } from '@/data/bank/cloudSource';
import type { QuotaInfo } from '@/data/bank/contracts';
import { createLocalSource } from '@/data/bank/localSource';
import type { QuestionSource } from '@/data/bank/questionSource';
import { loadCloud } from '@/data/cloud/client';
import { useDataApi, type DataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { currentSourceKind, sourceKindFor } from './questionSourceKind';

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
      ? // Justo al abrir la app el SDK todavía puede estar bajando. La fuente lo espera y no lo toma
        // como sin conexión
        createCloudSource({ repos: api.repos, cloud: loadCloud })
      : createLocalSource({ repos: api.repos });
  sources.set(api.repos, { ...known, [kind]: created });
  return created;
}

/** La fuente que toca ahora, fuera de React, como al crear o abrir un duelo */
export function currentQuestionSource(api: Api): QuestionSource {
  return questionSourceFor(api, currentSourceKind(api.repos.kind));
}

/** La fuente de la pantalla. Cambia si la cuenta entra o sale de la nube */
export function useQuestionSource(): QuestionSource {
  const api = useDataApi();
  const cloudStatus = useCloud((store) => store.state.status);
  return questionSourceFor(api, sourceKindFor(api.repos.kind, cloudStatus));
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
