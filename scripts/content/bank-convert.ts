// Convierte el banco grande escrito en formato compacto (content-drafts/bank1500/src/*.txt) al
// formato de borrador del banco (D-077). Revuelve las opciones de forma determinista, calcula la
// polaridad con el motor real de estructura y avisa si la tarea declarada no coincide.
// Uso: node scripts/content/bank-convert.ts [archivo.txt ...]   (sin archivos convierte todos)
//
// Formato de cada pregunta, separadas por una línea en blanco
//   # CASE <clave>: <viñeta del caso seriado>            (opcional, antes de sus preguntas)
//   @ <rama>|<tema>|<subtema>|<dificultad 1-5>|<tarea>[|case=<clave>#<orden>]
//   V: <viñeta>            (vacía en pregunta directa o en caso seriado)
//   P: <frase de la pregunta>
//   + <opción correcta> || <por qué es correcta>
//   - <sesgo> | <distractor> || <por qué atrae>          (nueve líneas, las tres primeras son el set canónico)
//   E: <explicación de 80 a 150 palabras>
//   R: <título de GPC o NOM> ;; <otro título>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..', '..');
const srcDir = resolve(root, 'content-drafts/bank1500/src');
const outDir = resolve(root, 'content-drafts/bank1500/json');

const BRANCHES: Record<string, string> = {
  mi: 'internal_medicine',
  ped: 'pediatrics',
  gyo: 'obstetrics_gynecology',
  cir: 'general_surgery',
  fam: 'family_medicine',
  urg: 'emergency_medicine',
};
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

interface StructureEngine {
  analyzeStructure: (
    question: { vignette: string; prompt: string; serialCase: boolean },
    dictionary: unknown,
  ) => { polarity: 'affirmative' | 'negative'; task: string | null };
}
const engine = (await import(
  pathToFileURL(resolve(root, 'src/engines/structure.ts')).href
)) as StructureEngine;
const dictionary = JSON.parse(
  readFileSync(resolve(root, 'src/demo/content/structure-dict.json'), 'utf8'),
) as unknown;

/** Número pseudoaleatorio estable a partir de un texto */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

interface RawOption {
  correct: boolean;
  bias?: string;
  text: string;
  rationale: string;
}

const files =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2).map((file) => resolve(file))
    : readdirSync(srcDir)
        .filter((name) => name.endsWith('.txt'))
        .sort()
        .map((name) => resolve(srcDir, name));

mkdirSync(outDir, { recursive: true });
let failed = false;
for (const file of files) {
  const prefix = basename(file, '.txt');
  const cases: Record<string, string> = {};
  const questions: unknown[] = [];
  const problems: string[] = [];
  const blocks = readFileSync(file, 'utf8')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  let index = 0;
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim());
    if (lines[0]?.startsWith('# CASE ')) {
      const match = /^# CASE ([\w-]+):\s*(.+)$/.exec(lines[0]);
      if (match) cases[match[1] as string] = match[2] as string;
      else problems.push(`caso mal escrito: ${lines[0]}`);
      if (lines.length === 1) continue;
      lines.shift();
    }
    const header = lines.find((line) => line.startsWith('@ '));
    if (!header) {
      problems.push(`bloque sin encabezado: ${lines[0]?.slice(0, 60) ?? ''}`);
      continue;
    }
    index += 1;
    const key = `${prefix}-q${String(index).padStart(2, '0')}`;
    const [branchCode, topic, subtopic, difficulty, task, caseRef] = header
      .slice(2)
      .split('|')
      .map((part) => part.trim());
    const branch = BRANCHES[branchCode ?? ''];
    if (!branch) problems.push(`${key} rama ${branchCode ?? ''}`);
    const field = (tag: string) =>
      lines
        .filter((line) => line.startsWith(`${tag}:`))
        .map((line) => line.slice(tag.length + 1).trim())
        .join(' ');
    const options: RawOption[] = [];
    for (const line of lines) {
      if (line.startsWith('+ ')) {
        const [text, rationale] = line.slice(2).split('||');
        options.push({
          correct: true,
          text: (text ?? '').trim(),
          rationale: (rationale ?? '').trim(),
        });
      } else if (line.startsWith('- ')) {
        const [head, rationale] = line.slice(2).split('||');
        const bar = (head ?? '').indexOf('|');
        options.push({
          correct: false,
          bias: (head ?? '').slice(0, bar).trim(),
          text: (head ?? '').slice(bar + 1).trim(),
          rationale: (rationale ?? '').trim(),
        });
      }
    }
    if (options.length !== 10) problems.push(`${key} tiene ${options.length} opciones`);
    if (options.some((option) => !option.text || !option.rationale))
      problems.push(`${key} opción sin texto o sin justificación`);
    const correct = options.find((option) => option.correct);
    const distractors = options.filter((option) => !option.correct);
    const canonicalSet = new Set<RawOption>([
      ...(correct ? [correct] : []),
      ...distractors.slice(0, 3),
    ]);
    const ordered = shuffle(options, hash(key));
    let caseKey: string | null = null;
    let caseOrder: number | null = null;
    if (caseRef?.startsWith('case=')) {
      const [ref, order] = caseRef.slice(5).split('#');
      caseKey = `${prefix}-${ref ?? ''}`;
      caseOrder = Number(order);
      if (!cases[ref ?? '']) problems.push(`${key} caso ${ref ?? ''} sin viñeta`);
    }
    const vignette = field('V');
    const prompt = field('P');
    const auto = engine.analyzeStructure(
      { vignette, prompt, serialCase: caseKey !== null },
      dictionary,
    );
    if (auto.task !== null && auto.task !== task)
      problems.push(`${key} tarea ${task ?? ''}, el motor dice ${auto.task} · ${prompt}`);
    questions.push({
      key,
      caseKey,
      caseOrder,
      branch,
      topic,
      subtopic,
      vignette,
      prompt,
      polarity: auto.polarity,
      task,
      difficulty: Number(difficulty),
      options: ordered.map((option, position) => ({
        key: KEYS[position],
        text: option.text,
        correct: option.correct,
        ...(option.correct ? {} : { bias: option.bias }),
        rationale: option.rationale,
      })),
      canonical: ordered
        .map((option, position) => (canonicalSet.has(option) ? KEYS[position] : null))
        .filter((value) => value !== null),
      explanation: field('E'),
      gpcRefs: field('R')
        .split(';;')
        .map((ref) => ref.trim())
        .filter(Boolean),
    });
  }
  const caseList = Object.entries(cases).map(([caseKey, vignette]) => ({
    key: `${prefix}-${caseKey}`,
    vignette,
  }));
  writeFileSync(
    resolve(outDir, `${prefix}.json`),
    `${JSON.stringify({ cases: caseList, questions }, null, 2)}\n`,
  );
  console.log(`${prefix}. ${questions.length} preguntas, ${caseList.length} casos`);
  if (problems.length > 0) {
    failed = true;
    for (const problem of problems) console.log(`- ${problem}`);
  }
}
process.exit(failed ? 1 : 0);
