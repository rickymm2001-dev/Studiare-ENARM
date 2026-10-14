// Generado por scripts/content/sync-bank-shared.ts desde src/data/content/bankColumns.ts. No lo edites a mano. Cambia el
// original y corre npm run bank:shared.
// Nombres de columnas, etiquetas en español y taxonomías que comparten la plantilla de Excel del
// banco (scripts/content/bankTemplate.ts), su lectura (bankConvert.ts, en la app y en los scripts) y
// el Excel del banco de 1500 (scripts/content/bank-excel.ts). Un solo lugar para que la plantilla
// llenada entre sin cambios. Son funciones y datos puros, sin Node ni React.
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

/**
 * Columnas nuevas del Sheet del banco (7.4 del plan del cambio y 3.3 del plan de B11). Todas son
 * opcionales, así el convertidor del Sheet sirve antes y después del cambio de estructura
 */
export const SHEET_HEADERS = {
  caseKey: 'Caso',
  caseOrder: 'Orden en el caso',
  author: 'Autor',
  reviewer: 'Revisor',
  language: 'Idioma',
} as const;

/** Lo que escriben los médicos en Sesgo cuando no hay sesgo. En la correcta cuenta como vacío */
export const NO_BIAS_LABEL = 'Ninguno';

/** Valores de la columna Estado del Sheet. Aprobado ya no existe, la aprobación vive en la app */
export const SHEET_STATUS_LABELS = {
  draft: 'Borrador',
  ready: 'Lista para revisión',
  retire: 'Retirar',
} as const;
/** Lo que se ignora en Estado con un aviso (PC 7.2) */
export const SHEET_APPROVED_LABELS = ['Aprobado', 'Aprobada'] as const;

/** Valores de la columna Idioma. Sin valor es español */
export const LANGUAGE_LABELS = { es: 'Español', en: 'Inglés' } as const;

/** Límites de texto del esquema del banco (src/data/schemas/bank.ts). Pasarlos rechaza el renglón */
export const TEXT_LIMITS = {
  vignette: 8_000,
  prompt: 1_000,
  explanation: 4_000,
  optionText: 1_000,
  rationale: 1_500,
  reference: 300,
  references: 10,
} as const;

/** Órdenes posibles de una pregunta dentro de un caso seriado, como questions.case_order */
export const MAX_CASE_ORDER = 5;

/** Clave corta de un médico en las columnas Autor y Revisor, como physician_codes.code */
export const PHYSICIAN_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,7}$/;

/**
 * Solo la primera línea de un encabezado. El Sheet de hoy trae una segunda línea con instrucciones
 * (PC 7.2) y el convertidor lee solo el nombre de la columna
 */
export function firstHeaderLine(header: string): string {
  return (header.split(/\r?\n/)[0] ?? '').trim();
}

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
