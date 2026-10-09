// Lectura y validación de los ajustes de la pantalla 24. Aparte de la pantalla para poder probarlo
// sin pintar nada.
import type { DemoAdjustments } from '@/data/context';
import { DEMO_COHORT_MAX, DEMO_COHORT_MIN } from '@/demo/constants';
import { t } from '@/i18n/es-MX';

const SEED_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha que existe. El 30 de febrero tiene la forma pero no existe */
const isRealDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export interface DemoFields {
  cohortSize: string;
  seed: string;
  examDate: string;
}

/** Los ajustes que sí se pueden usar, o el error de cada campo */
export function readAdjustments(fields: DemoFields): {
  adjust: DemoAdjustments;
  errors: Partial<Record<keyof DemoFields, string>>;
} {
  const text = t.adminDemo.fields;
  const errors: Partial<Record<keyof DemoFields, string>> = {};
  const size = Number(fields.cohortSize);
  if (!Number.isInteger(size) || size < DEMO_COHORT_MIN || size > DEMO_COHORT_MAX) {
    errors.cohortSize = text.cohortError(DEMO_COHORT_MIN, DEMO_COHORT_MAX);
  }
  if (!SEED_PATTERN.test(fields.seed)) errors.seed = text.seedError;
  const examDate = fields.examDate.trim();
  if (examDate !== '' && !isRealDate(examDate)) {
    errors.examDate = text.examDateError;
  }
  return {
    errors,
    adjust: {
      cohortSize: size,
      seed: fields.seed,
      ...(examDate === '' ? {} : { examDate }),
    },
  };
}
