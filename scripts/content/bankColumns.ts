// Nombres de columnas, etiquetas en español y taxonomías que comparten la plantilla de Excel del
// banco (bankTemplate.ts), su lectura (bankImport.ts) y el Excel del banco de 1500 (bank-excel.ts).
// Un solo lugar para que la plantilla llenada entre sin cambios. Son funciones y datos puros.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Etiqueta de cada tarea de pregunta, la misma del Excel del banco de 1500 */
export const TASK_LABELS: Readonly<Record<string, string>> = {
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

/** Tipos de reactivo raros (D-080), con los nombres que ya ve el alumno en sus resultados */
export const KIND_LABELS: Readonly<Record<string, string>> = {
  control: 'De control',
  incoherent: 'Con incoherencias',
  inverse_resolution: 'Resolución inversa',
  obscure_detail: 'Datos oscuros',
  patient_perspective: 'Desde el paciente',
};

export const POLARITY_LABELS: Readonly<Record<string, string>> = {
  affirmative: 'Afirmativa',
  negative: 'Negativa',
};

/** Estado con el que entra todo el contenido hasta que un médico lo apruebe */
export const DRAFT_STATE_LABEL = 'Borrador';

/** Opciones que trae la plantilla. El banco acepta de 4 a 6, aunque el esquema llega a 10 */
export const TEMPLATE_OPTIONS = 6;
export const MIN_BANK_OPTIONS = 4;

/** Una fila cuyo ID empieza así es el ejemplo de la plantilla y no se importa */
export const EXAMPLE_ID = 'EJEMPLO, borra esta fila';
export const EXAMPLE_PREFIX = 'ejemplo';
/** Texto de relleno de la plantilla. Si queda en una fila que no es el ejemplo, se avisa */
export const PLACEHOLDER = 'Escribe aquí';
/** Texto de relleno de las columnas con lista desplegable en la fila de ejemplo */
export const PLACEHOLDER_PICK = 'Elige de la lista';

/** Encabezados de la hoja Preguntas, sin las columnas de cada opción */
export const HEADERS = {
  id: 'ID',
  branch: 'Rama troncal',
  topic: 'Subespecialidad',
  subtopic: 'Subtema',
  difficulty: 'Dificultad',
  kind: 'Tipo de reactivo',
  task: 'Tarea',
  polarity: 'Polaridad',
  vignette: 'Caso clínico',
  prompt: 'Pregunta',
  correct: 'Correcta',
  canonical: 'Set canónico',
  explanation: 'Explicación',
  refs: 'Referencias',
  status: 'Estado',
} as const;

/** Otros nombres que también se leen, por si el médico escribió el tema como Tema */
export const HEADER_ALIASES: Readonly<Record<string, keyof typeof HEADERS>> = {
  tema: 'topic',
};

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

/** Encabezados de las tres columnas de una opción */
export function optionHeaders(letter: string) {
  return {
    text: `Opción ${letter}`,
    rationale: `Justificación ${letter}`,
    bias: `Sesgo ${letter}`,
  };
}

/** Minúsculas, sin acentos y con espacios simples. Para comparar lo que escribe una persona */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface TaxonomyTopic {
  key: string;
  name: string;
  subtopics: { key: string; name: string }[];
}
export interface TaxonomyBranch {
  key: string;
  name: string;
  topics: TaxonomyTopic[];
}
export interface BiasInfo {
  key: string;
  name: string;
  englishName: string;
  distractorDefinition: string;
  taggable: boolean;
}
export interface ContentTaxonomies {
  branches: TaxonomyBranch[];
  biases: BiasInfo[];
}

/** Lee las taxonomías de src/demo/content, las mismas que valida la app */
export function loadTaxonomies(root: string): ContentTaxonomies {
  const read = (name: string) =>
    JSON.parse(readFileSync(resolve(root, 'src/demo/content', name), 'utf8')) as unknown;
  const topics = read('topic-taxonomy.json') as { branches: TaxonomyBranch[] };
  const biases = read('bias-taxonomy.json') as { biases: BiasInfo[] };
  return { branches: topics.branches, biases: biases.biases };
}
