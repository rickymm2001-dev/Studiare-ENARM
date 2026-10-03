// Genera el Excel del banco grande (D-077) desde content-drafts/bank1500/json/*.json.
// Hojas. Preguntas (una fila por pregunta con sus 10 opciones), Opciones (una fila por opción con
// su trampa y su justificación), Casos seriados y Resumen por rama y subespecialidad.
// Uso: node scripts/content/bank-excel.ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';

const root = resolve(import.meta.dirname, '..', '..');
const jsonDir = resolve(root, 'content-drafts/bank1500/json');
const output = resolve(root, 'content-drafts/bank1500/Studiare-banco-1500-borrador.xlsx');

interface Option {
  key: string;
  text: string;
  correct: boolean;
  bias?: string;
  rationale: string;
}
interface Question {
  key: string;
  caseKey: string | null;
  caseOrder: number | null;
  branch: string;
  topic: string;
  subtopic: string;
  vignette: string;
  prompt: string;
  polarity: string;
  task: string;
  difficulty: number;
  options: Option[];
  canonical: string[];
  explanation: string;
  gpcRefs: string[];
}
interface Taxonomy {
  branches: {
    key: string;
    name: string;
    topics: { key: string; name: string; subtopics: { key: string; name: string }[] }[];
  }[];
}

const taxonomy = JSON.parse(
  readFileSync(resolve(root, 'src/demo/content/topic-taxonomy.json'), 'utf8'),
) as Taxonomy;
const biasNames = new Map(
  (
    JSON.parse(readFileSync(resolve(root, 'src/demo/content/bias-taxonomy.json'), 'utf8')) as {
      biases: { key: string; name: string }[];
    }
  ).biases.map((bias) => [bias.key, bias.name]),
);
const branchName = new Map(taxonomy.branches.map((branch) => [branch.key, branch.name]));
const topicName = new Map(
  taxonomy.branches.flatMap((branch) => branch.topics.map((topic) => [topic.key, topic.name])),
);
const subtopicName = new Map(
  taxonomy.branches.flatMap((branch) =>
    branch.topics.flatMap((topic) => topic.subtopics.map((sub) => [sub.key, sub.name])),
  ),
);
const TASKS: Record<string, string> = {
  diagnosis: 'Diagnóstico',
  next_step: 'Siguiente paso',
  initial_study: 'Estudio inicial',
  confirmatory_study: 'Estudio confirmatorio',
  initial_treatment: 'Tratamiento inicial',
  treatment_of_choice: 'Tratamiento de elección',
  mechanism: 'Mecanismo',
  risk_factor: 'Factor de riesgo',
  complication_prognosis: 'Complicación o pronóstico',
  prevention_screening: 'Prevención o tamizaje',
  data_interpretation: 'Interpretación de datos',
};

const questions: Question[] = [];
const cases: { key: string; vignette: string }[] = [];
for (const name of readdirSync(jsonDir)
  .filter((file) => file.endsWith('.json'))
  .sort()) {
  const data = JSON.parse(readFileSync(resolve(jsonDir, name), 'utf8')) as {
    cases: { key: string; vignette: string }[];
    questions: Question[];
  };
  questions.push(...data.questions);
  cases.push(...data.cases);
}

const book = new ExcelJS.Workbook();
book.creator = 'Studiare';
book.created = new Date();
const header = (sheet: ExcelJS.Worksheet) => {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E5A6B' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
};

const info = book.addWorksheet('Léeme');
info.columns = [{ width: 120 }];
[
  'Banco de preguntas de Studiare. BORRADOR escrito con IA, pendiente de revisión médica.',
  'Ninguna pregunta está validada por médicos. No usar como contenido final sin revisión.',
  'Referencias solo por título de GPC o NOM, sin años ni claves, y marcadas por verificar.',
  `Total ${questions.length} preguntas, 10 opciones cada una, una sola correcta.`,
  'Cada distractor lleva la trampa o sesgo que explota y por qué atrae.',
  'El set canónico son las 4 opciones que se muestran por defecto en la app.',
].forEach((line) => info.addRow([line]));
info.getRow(1).font = { bold: true, size: 14 };

const sheet = book.addWorksheet('Preguntas');
sheet.columns = [
  { header: 'ID', key: 'id', width: 22 },
  { header: 'Rama troncal', key: 'branch', width: 22 },
  { header: 'Subespecialidad', key: 'topic', width: 24 },
  { header: 'Subtema', key: 'subtopic', width: 26 },
  { header: 'Caso seriado', key: 'case', width: 16 },
  { header: 'Orden', key: 'order', width: 7 },
  { header: 'Caso clínico', key: 'vignette', width: 60 },
  { header: 'Pregunta', key: 'prompt', width: 45 },
  { header: 'Polaridad', key: 'polarity', width: 12 },
  { header: 'Tarea', key: 'task', width: 20 },
  { header: 'Dificultad', key: 'difficulty', width: 10 },
  ...'ABCDEFGHIJ'.split('').map((letter) => ({
    header: `Opción ${letter}`,
    key: `opt${letter}`,
    width: 32,
  })),
  { header: 'Correcta', key: 'correct', width: 9 },
  { header: 'Set canónico', key: 'canonical', width: 12 },
  { header: 'Explicación', key: 'explanation', width: 70 },
  { header: 'Referencias', key: 'refs', width: 45 },
  { header: 'Estado', key: 'status', width: 26 },
];
for (const question of questions) {
  const row: Record<string, string | number> = {
    id: question.key,
    branch: branchName.get(question.branch) ?? question.branch,
    topic: topicName.get(question.topic) ?? question.topic,
    subtopic: subtopicName.get(question.subtopic) ?? question.subtopic,
    case: question.caseKey ?? '',
    order: question.caseOrder ?? '',
    vignette: question.vignette,
    prompt: question.prompt,
    polarity: question.polarity === 'negative' ? 'Negativa' : 'Afirmativa',
    task: TASKS[question.task] ?? question.task,
    difficulty: question.difficulty,
    correct: (question.options.find((option) => option.correct)?.key ?? '').toUpperCase(),
    canonical: question.canonical.map((key) => key.toUpperCase()).join(', '),
    explanation: question.explanation,
    refs: question.gpcRefs.join('\n'),
    status: 'Borrador, pendiente de revisión médica',
  };
  question.options.forEach((option) => {
    row[`opt${option.key.toUpperCase()}`] = option.text;
  });
  sheet.addRow(row);
}
header(sheet);
sheet.eachRow((row, index) => {
  if (index > 1) row.alignment = { vertical: 'top', wrapText: true };
});

const optionSheet = book.addWorksheet('Opciones');
optionSheet.columns = [
  { header: 'ID pregunta', key: 'id', width: 22 },
  { header: 'Opción', key: 'letter', width: 8 },
  { header: 'Texto', key: 'text', width: 50 },
  { header: 'Correcta', key: 'correct', width: 9 },
  { header: 'Trampa o sesgo', key: 'bias', width: 28 },
  { header: 'Por qué es correcta o por qué atrae', key: 'rationale', width: 70 },
];
for (const question of questions)
  for (const option of question.options)
    optionSheet.addRow({
      id: question.key,
      letter: option.key.toUpperCase(),
      text: option.text,
      correct: option.correct ? 'Sí' : '',
      bias: option.bias ? (biasNames.get(option.bias) ?? option.bias) : '',
      rationale: option.rationale,
    });
header(optionSheet);
optionSheet.eachRow((row, index) => {
  if (index > 1) row.alignment = { vertical: 'top', wrapText: true };
});

const caseSheet = book.addWorksheet('Casos seriados');
caseSheet.columns = [
  { header: 'Caso', key: 'key', width: 22 },
  { header: 'Viñeta compartida', key: 'vignette', width: 110 },
];
for (const item of cases) caseSheet.addRow(item);
header(caseSheet);

const summary = book.addWorksheet('Resumen');
summary.columns = [
  { header: 'Rama troncal', key: 'branch', width: 26 },
  { header: 'Subespecialidad', key: 'topic', width: 30 },
  { header: 'Preguntas', key: 'count', width: 12 },
];
for (const branch of taxonomy.branches) {
  for (const topic of branch.topics)
    summary.addRow({
      branch: branch.name,
      topic: topic.name,
      count: questions.filter((question) => question.topic === topic.key).length,
    });
  summary.addRow({
    branch: branch.name,
    topic: 'Total de la rama',
    count: questions.filter((question) => question.branch === branch.key).length,
  });
}
summary.addRow({ branch: 'Total', topic: '', count: questions.length });
header(summary);

await book.xlsx.writeFile(output);
console.log(`Excel con ${questions.length} preguntas en ${output}`);
