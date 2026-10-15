// Fuente de preguntas de la nube (B11, 5.1 a 5.5 del plan de B11). Desde B13 el pool trae el inglés aparte. El catálogo, sin texto, vive en Dexie
// (tabla catalog) y se baja por partes desde el último seq. Los cuerpos se bajan con fetch_questions
// solo cuando el alumno va a contestar, en tandas de hasta 100 que nunca parten un caso seriado, y se
// guardan en las tablas de siempre, así todo lo demás los lee igual que el banco de demostración. Una
// versión ya guardada no se vuelve a pedir ni a escribir, así repasar lo ya bajado no gasta del tope.
// Sin conexión se estudia con lo ya bajado. La cuota que dijo el servidor se guarda para contarla sin
// conexión. Al servidor solo viajan ids de versión y el propósito de la lectura.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAgreementSummary,
  fetchBankQuota,
  fetchCatalogPage,
  fetchQuestionBodies,
  type BankFailure,
} from '../cloud/bank';
import { ulidToUuid, uuidToUlid } from '../cloud/cloudIds';
import type { Repositories } from '../repos/types';
import type { CatalogEntry } from '../schemas/bankCloud';
import { bodyEntitiesOf, caseEntityOf } from './bodies';
import { mergeCatalogPage } from './catalogMerge';
import type { DenyReason, QuotaInfo, ReadPurpose } from './contracts';
import {
  CATALOG_REFRESH_MS,
  EMPTY_POOL,
  type EnsureResult,
  type PoolQuestion,
  type QuestionSource,
  type SourceReadiness,
} from './questionSource';

export { CATALOG_REFRESH_MS };

type Rpc = Pick<SupabaseClient, 'rpc'>;

export type CloudSourceRepos = Pick<Repositories, 'catalog' | 'bankState' | 'questions' | 'cases'>;

export interface CloudSourceDeps {
  repos: CloudSourceRepos;
  /**
   * El cliente de Supabase. Puede esperar a que el SDK termine de bajar, como pasa justo después de
   * abrir la app. null sin nube, que se trata como sin conexión
   */
  cloud: () => Rpc | null | Promise<Rpc | null>;
  now?: () => Date;
  /** Avisa cuántas filas o cuerpos se descartaron, sin nada de su contenido */
  onDiscarded?: (what: 'catalog' | 'bodies' | 'cases', count: number) => void;
}

/** Cuerpos por petición. Es maxFetch de bank_limits, que la base no deja pasar */
export const FETCH_BATCH = 100;
/** Tope de páginas por bajada, para no quedarse en un ciclo si la base no avanza */
const MAX_PAGES = 1000;

function defaultDiscarded(what: string, count: number) {
  console.warn(`Banco de la nube. Se descartaron ${count} (${what}) que la app no puede guardar`);
}

/** La pregunta del catálogo como la elige el pool */
export function poolQuestionOfEntry(entry: CatalogEntry, cached = false): PoolQuestion {
  return {
    id: entry.versionId,
    questionId: entry.questionId,
    version: entry.version,
    caseId: entry.caseId,
    caseOrder: entry.caseOrder,
    branch: entry.branch,
    topic: entry.topic,
    subtopic: entry.subtopic,
    physicianDifficulty: entry.difficulty,
    ...(entry.itemKinds.length > 0 ? { itemKinds: entry.itemKinds } : {}),
    ...(entry.variantOf ? { variantOf: entry.variantOf } : {}),
    isDemo: false,
    structure: { polarity: entry.polarity, task: entry.task, format: entry.format },
    examEligible: entry.examEligible,
    language: entry.language,
    distractorBiases: entry.distractorBiases,
    cached,
  };
}

/**
 * Agrupa lo pedido en tandas de hasta size. Las preguntas de un mismo caso seriado van juntas, porque
 * la base concede un caso completo o nada (2.2)
 */
export function fetchBatches(
  ids: readonly string[],
  caseOf: (id: string) => string | null,
  size: number = FETCH_BATCH,
): string[][] {
  const units = new Map<string, string[]>();
  for (const id of ids) {
    const key = caseOf(id) ?? `q:${id}`;
    units.set(key, [...(units.get(key) ?? []), id]);
  }
  const batches: string[][] = [];
  let current: string[] = [];
  for (const unit of units.values()) {
    if (current.length > 0 && current.length + unit.length > size) {
      batches.push(current);
      current = [];
    }
    current = [...current, ...unit];
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Una bajada del catálogo a la vez por base, aunque la pidan dos pantallas */
const refreshing = new WeakMap<object, Promise<void>>();

export function createCloudSource(deps: CloudSourceDeps): QuestionSource {
  const { repos } = deps;
  const now = deps.now ?? (() => new Date());
  const discarded = deps.onDiscarded ?? defaultDiscarded;

  const saveQuota = async (quota: QuotaInfo) => {
    await repos.bankState.put({ key: 'quota', quota, at: now().toISOString() });
  };

  /** Baja el catálogo desde el último seq hasta done. Devuelve si pudo hablar con la nube */
  async function refreshCatalog(cloud: Rpc): Promise<BankFailure | null> {
    const state = await repos.bankState.get('catalog');
    let since = state?.since ?? 0;
    let complete = state?.complete ?? false;
    const stored = new Map(
      (await repos.catalog.list()).map((entry) => [entry.questionId, entry.seq] as const),
    );
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const reply = await fetchCatalogPage(cloud, since);
      if (!reply.ok) return reply.reason;
      const merge = mergeCatalogPage(stored, reply.value, since);
      if (merge.dropped > 0) discarded('catalog', merge.dropped);
      if (merge.upserts.length > 0) {
        await repos.catalog.putMany(merge.upserts);
        for (const entry of merge.upserts) stored.set(entry.questionId, entry.seq);
      }
      // Si la base no avanzó, lo que queda se pide en la siguiente bajada
      const done = merge.done || merge.nextSince <= since;
      since = merge.nextSince;
      complete ||= done;
      await repos.bankState.put({
        key: 'catalog',
        since,
        complete,
        open: merge.open,
        syncedAt: done ? now().toISOString() : (state?.syncedAt ?? null),
      });
      if (done) return null;
    }
    return null;
  }

  async function refreshAll(): Promise<void> {
    const cloud = await deps.cloud();
    if (!cloud) return;
    const failure = await refreshCatalog(cloud);
    if (failure === 'network') return;
    const [quota, agreement] = await Promise.all([
      fetchBankQuota(cloud),
      fetchAgreementSummary(cloud),
    ]);
    if (quota.ok) await saveQuota(quota.value);
    if (agreement.ok) {
      await repos.bankState.put({
        key: 'agreement',
        summary: agreement.value,
        at: now().toISOString(),
      });
    }
  }

  const refresh = (): Promise<void> => {
    const running = refreshing.get(repos);
    if (running) return running;
    const job = refreshAll()
      .catch(() => undefined)
      .finally(() => {
        refreshing.delete(repos);
      });
    refreshing.set(repos, job);
    return job;
  };

  const readiness = async (): Promise<SourceReadiness | null> => {
    const state = await repos.bankState.get('catalog');
    if (!state?.complete) return null;
    return state.open ? 'ready' : 'closed';
  };

  return {
    kind: 'cloud',

    async prepare() {
      const state = await repos.bankState.get('catalog');
      const known = await readiness();
      const stale =
        !state?.syncedAt || now().getTime() - Date.parse(state.syncedAt) >= CATALOG_REFRESH_MS;
      if (known !== null && !stale) {
        // La cuota cambia con cada sesión. Se pide sin esperar, para que el tope que se ve esté al día
        void (async () => {
          const cloud = await deps.cloud();
          const quota = cloud ? await fetchBankQuota(cloud) : null;
          if (quota?.ok) await saveQuota(quota.value);
        })().catch(() => undefined);
        return known;
      }
      if (known !== null) {
        void refresh();
        return known;
      }
      await refresh();
      return (await readiness()) ?? 'never_downloaded';
    },

    async pool() {
      const state = await repos.bankState.get('catalog');
      if (state?.open === false) return EMPTY_POOL;
      const entries = await repos.catalog.listPublished();
      // Lo ya bajado se marca, así sin conexión se elige solo de ahí (M2 de la revisión de B11)
      const stored = await repos.questions.storedIds(entries.map((entry) => entry.versionId));
      const all = entries.map((entry) => poolQuestionOfEntry(entry, stored.has(entry.versionId)));
      // El inglés va aparte (B13). La práctica en español, los duelos y el planificador nunca lo ven
      const spanish = all.filter((question) => question.language === 'es');
      const english = all.filter((question) => question.language === 'en');
      return {
        practice: spanish,
        exam: spanish.filter((question) => question.examEligible),
        english: {
          practice: english,
          exam: english.filter((question) => question.examEligible),
        },
      };
    },

    async ensureBodies(versionIds: readonly string[], purpose: ReadPurpose): Promise<EnsureResult> {
      const ids = [...new Set(versionIds)];
      const present = await repos.questions.storedIds(ids);
      const missing = ids.filter((id) => !present.has(id));
      const cachedQuota = async () => (await repos.bankState.get('quota'))?.quota ?? null;
      const result = (
        denied: EnsureResult['denied'],
        quota: QuotaInfo | null,
        offline: boolean,
      ) => ({
        ready: ids.filter((id) => present.has(id)),
        denied,
        quota,
        offline,
      });
      if (missing.length === 0) return result([], await cachedQuota(), false);
      const cloud = await deps.cloud();
      if (!cloud) return result([], await cachedQuota(), true);

      const cases = new Map<string, string | null>();
      for (const id of missing)
        cases.set(id, (await repos.catalog.getByVersion(id))?.caseId ?? null);
      const denied: { id: string; reason: DenyReason }[] = [];
      let quota: QuotaInfo | null = null;
      let offline = false;
      let refreshCatalogAfter = false;
      for (const batch of fetchBatches(missing, (id) => cases.get(id) ?? null)) {
        const uuids = batch.map((id) => ulidToUuid(id));
        if (uuids.some((uuid) => uuid === null)) {
          // Un id que no es ULID no puede venir del catálogo
          denied.push(...batch.map((id) => ({ id, reason: 'not_found' as const })));
          continue;
        }
        const reply = await fetchQuestionBodies(cloud, uuids as string[], purpose);
        if (!reply.ok) {
          offline = reply.reason === 'network';
          break;
        }
        const { questions, cases: rawCases } = reply.value;
        quota = reply.value.quota;
        let badCases = 0;
        for (const raw of rawCases) {
          const clinicalCase = caseEntityOf(raw);
          if (!clinicalCase) badCases += 1;
          else if (!(await repos.cases.get(clinicalCase.id))) await repos.cases.add(clinicalCase);
        }
        if (badCases > 0) discarded('cases', badCases);
        let badBodies = 0;
        for (const raw of questions) {
          const body = bodyEntitiesOf(raw);
          if (!body) {
            badBodies += 1;
            continue;
          }
          if (!(await repos.questions.get(body.question.id))) {
            await repos.questions.addVersion(body.question, body.options);
          }
          present.add(body.question.id);
        }
        if (badBodies > 0) discarded('bodies', badBodies);
        for (const item of reply.value.denied) {
          const id = uuidToUlid(item.id) ?? item.id;
          denied.push({ id, reason: item.reason });
          if (item.reason === 'not_found' || item.reason === 'retired') refreshCatalogAfter = true;
        }
      }
      if (quota) await saveQuota(quota);
      // Una pregunta que ya no está o se retiró quiere decir que el catálogo de este navegador va atrás
      if (refreshCatalogAfter) void refresh();
      return result(denied, quota ?? (await cachedQuota()), offline);
    },

    async quota() {
      const cloud = await deps.cloud();
      const reply = cloud ? await fetchBankQuota(cloud) : null;
      if (reply?.ok) {
        await saveQuota(reply.value);
        return reply.value;
      }
      return (await repos.bankState.get('quota'))?.quota ?? null;
    },

    refresh,
  };
}
