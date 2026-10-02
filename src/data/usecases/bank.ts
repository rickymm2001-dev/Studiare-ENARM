// Banco de preguntas en la base activa. La primera vez que se usa el simulador se guarda el banco
// demo con sus IDs estables. Es contenido de demostración, marcado como tal (11.1).
import type { DataApi } from '../context';

// Una sola carga a la vez por base. Si dos pantallas lo piden juntas, comparten la misma promesa
const inFlight = new WeakMap<object, Promise<number>>();

export function ensureDemoBank(api: Pick<DataApi, 'repos'>): Promise<number> {
  const running = inFlight.get(api.repos);
  if (running) return running;
  const job = loadDemoBank(api).finally(() => {
    inFlight.delete(api.repos);
  });
  inFlight.set(api.repos, job);
  return job;
}

async function loadDemoBank(api: Pick<DataApi, 'repos'>): Promise<number> {
  const existing = await api.repos.questions.listLatest();
  const { buildDemoBank } = await import('@/demo/content/bank');
  const bank = buildDemoBank();
  if (existing.length >= bank.questions.length) return existing.length;
  const present = new Set(existing.map((question) => question.id));
  for (const item of bank.cases) {
    if (!(await api.repos.cases.get(item.id))) await api.repos.cases.add(item);
  }
  for (const entry of bank.questions) {
    if (!present.has(entry.question.id))
      await api.repos.questions.addVersion(entry.question, entry.options);
  }
  return bank.questions.length;
}
