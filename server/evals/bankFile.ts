// El banco real exportado para las evaluaciones y la muestra de la compuerta (B12, 4.2, 5.1 y 10.27
// del plan). Vive en private/, que está en .gitignore, y nunca entra al repositorio público. Solo se
// leen las preguntas aprobadas. El formato es este y lo arma quien exporta el banco de la nube.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { BankSource } from './bankCases.ts';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PRIVATE_DIR = resolve(REPO_ROOT, 'private');

/** Una ruta dentro de private/. Cualquier otra se rechaza, para no escribir ni leer texto del banco fuera */
export function privatePath(path: string, root = REPO_ROOT): string {
  const absolute = resolve(root, path);
  const inside = relative(resolve(root, 'private'), absolute);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(
      `La ruta ${path} debe quedar dentro de private/, que nunca entra al repositorio.`,
    );
  }
  return absolute;
}

const Text = (max: number) => z.string().trim().min(1).max(max);

export const EvalBankFileSchema = z.strictObject({
  version: z.literal(1),
  /** Cuándo se exportó, en ISO 8601 */
  exportedAt: z.string().min(1).max(40),
  questions: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[A-Za-z0-9_.:-]{1,62}$/),
        topic: Text(80),
        area: Text(80),
        stem: Text(1_500),
        options: z
          .array(
            z.strictObject({
              label: Text(3),
              text: Text(400),
              isKey: z.boolean(),
              bias: z.string().max(60).nullable(),
            }),
          )
          .min(2)
          .max(10),
        explanation: Text(2_000),
        /** Solo las aprobadas por un médico entran a las evaluaciones y a la muestra */
        approved: z.boolean(),
      }),
    )
    .max(20_000),
  /** Los textos base de los consejos que aprobó o editó un médico (10.13) */
  biases: z
    .array(
      z.strictObject({ key: Text(60), label: Text(80), baseTip: Text(500), approved: z.boolean() }),
    )
    .max(200),
});
export type EvalBankFile = z.infer<typeof EvalBankFileSchema>;

/** El banco real como fuente de casos, solo con lo aprobado */
export function bankSourceOf(file: EvalBankFile): BankSource {
  return {
    set: 'bank',
    questions: file.questions
      .filter((question) => question.approved)
      .map(({ approved: _approved, ...question }) => question),
    biases: file.biases
      .filter((bias) => bias.approved)
      .map(({ approved: _approved, ...bias }) => bias),
  };
}

/** Lee --bank-file, que debe estar dentro de private/ y cumplir EvalBankFileSchema */
export function loadBankFile(path: string, root = REPO_ROOT): BankSource {
  const absolute = privatePath(path, root);
  if (!existsSync(absolute)) throw new Error(`No existe ${path}.`);
  const parsed = EvalBankFileSchema.safeParse(JSON.parse(readFileSync(absolute, 'utf8')));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `${path} no tiene la forma del banco exportado${first ? ` (${first.path.join('.')}: ${first.message})` : ''}.`,
    );
  }
  return bankSourceOf(parsed.data);
}
