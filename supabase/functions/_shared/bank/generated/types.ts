// Generado por scripts/content/sync-bank-shared.ts desde src/data/schemas/content.ts y src/data/schemas/bank.ts. No lo edites a mano. Cambia el
// original y corre npm run bank:shared.

// Los tipos que usa el motor de estructura, sin zod

export type QuestionTask =
  | 'diagnosis'
  | 'next_step'
  | 'initial_study'
  | 'confirmatory_study'
  | 'initial_treatment'
  | 'treatment_of_choice'
  | 'mechanism'
  | 'risk_factor'
  | 'complication_prognosis'
  | 'prevention_screening'
  | 'data_interpretation';

export interface StructureDictionary {
  version: number;
  status: 'pending_physician_review' | 'physician_reviewed';
  negations: {
    id: string;
    pattern: string;
    kind: 'negation' | 'exception' | 'false_statement' | 'least_likely' | 'contraindication';
  }[];
  falsePositives: string[];
  tasks: { task: QuestionTask; patterns: string[] }[];
}
