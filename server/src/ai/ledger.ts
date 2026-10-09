// Libro del día del proxy de IA (8.1). Cuenta las llamadas de cada alumno y el gasto del día para
// frenar de golpe cuando se pasa un límite. Vive en memoria y, si se le da un archivo, sobrevive a
// reiniciar el proxy, que si no dejaría el presupuesto en cero cada vez. Solo guarda el día
// actual. El histórico de costos queda en la bitácora de la app (aiCallLog).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { AI_ENGINES, type AiEngine } from '../../../src/engines/aiContracts.ts';

const TIME_ZONE = 'America/Mexico_City';

/** El día en que se cuentan los límites, en hora de México */
export function dayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const EngineTotals = z.strictObject({
  calls: z.int().nonnegative(),
  costUsd: z.number().nonnegative(),
});
const StateSchema = z.strictObject({
  day: z.string(),
  students: z.record(z.string(), z.partialRecord(z.enum(AI_ENGINES), z.int().nonnegative())),
  spentUsd: z.number().nonnegative(),
  byEngine: z.partialRecord(z.enum(AI_ENGINES), EngineTotals),
});
type State = z.infer<typeof StateSchema>;

export interface UsageSummary {
  day: string;
  calls: number;
  students: number;
  spentUsd: number;
  byEngine: Partial<Record<AiEngine, { calls: number; costUsd: number }>>;
}

export type Admission = { ok: true } | { ok: false; reason: 'student_limit' | 'budget_exceeded' };

export class Ledger {
  private state: State;
  private readonly options: { file?: string | null; now?: () => Date };

  constructor(options: { file?: string | null; now?: () => Date } = {}) {
    this.options = options;
    this.state = this.load();
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private empty(day: string): State {
    return { day, students: {}, spentUsd: 0, byEngine: {} };
  }

  private load(): State {
    const day = dayKey(this.now());
    const file = this.options.file;
    if (file && existsSync(file)) {
      try {
        const parsed = StateSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
        if (parsed.day === day) return parsed;
      } catch {
        // Un archivo dañado no frena el proxy. Se empieza el día de nuevo
      }
    }
    return this.empty(day);
  }

  private save(): void {
    const file = this.options.file;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.state));
    renameSync(temp, file);
  }

  /** Pasa al día nuevo cuando cambia la fecha */
  private roll(): void {
    const day = dayKey(this.now());
    if (this.state.day !== day) this.state = this.empty(day);
  }

  /**
   * Deja pasar una llamada o dice por qué no. Cuenta la llamada desde ahora para que varias
   * peticiones a la vez no se salten el límite
   */
  admit(input: {
    studentRef: string;
    engine: AiEngine;
    perStudentPerDay: number;
    dailyBudgetUsd: number;
  }): Admission {
    this.roll();
    const mine = this.state.students[input.studentRef] ?? {};
    if ((mine[input.engine] ?? 0) >= input.perStudentPerDay) {
      return { ok: false, reason: 'student_limit' };
    }
    if (this.state.spentUsd >= input.dailyBudgetUsd) {
      return { ok: false, reason: 'budget_exceeded' };
    }
    this.state.students[input.studentRef] = {
      ...mine,
      [input.engine]: (mine[input.engine] ?? 0) + 1,
    };
    const totals = this.state.byEngine[input.engine] ?? { calls: 0, costUsd: 0 };
    this.state.byEngine[input.engine] = { calls: totals.calls + 1, costUsd: totals.costUsd };
    this.save();
    return { ok: true };
  }

  /** Suma el gasto real de una llamada ya hecha. Las simuladas no gastan */
  settle(input: { engine: AiEngine; costUsd: number; real: boolean }): void {
    this.roll();
    if (!input.real || input.costUsd <= 0) return;
    this.state.spentUsd = Math.round((this.state.spentUsd + input.costUsd) * 1e6) / 1e6;
    const totals = this.state.byEngine[input.engine] ?? { calls: 0, costUsd: 0 };
    this.state.byEngine[input.engine] = {
      calls: totals.calls,
      costUsd: Math.round((totals.costUsd + input.costUsd) * 1e6) / 1e6,
    };
    this.save();
  }

  /** Devuelve el cupo de una llamada que no llegó a hacerse, como una falla antes de pedir al modelo */
  release(input: { studentRef: string; engine: AiEngine }): void {
    this.roll();
    const mine = this.state.students[input.studentRef] ?? {};
    const used = mine[input.engine] ?? 0;
    if (used > 0) this.state.students[input.studentRef] = { ...mine, [input.engine]: used - 1 };
    const totals = this.state.byEngine[input.engine];
    if (totals && totals.calls > 0) {
      this.state.byEngine[input.engine] = { calls: totals.calls - 1, costUsd: totals.costUsd };
    }
    this.save();
  }

  summary(): UsageSummary {
    this.roll();
    const students = Object.keys(this.state.students).length;
    const calls = Object.values(this.state.students)
      .flatMap((byEngine) => Object.values(byEngine))
      .reduce((sum, value) => sum + value, 0);
    return {
      day: this.state.day,
      calls,
      students,
      spentUsd: this.state.spentUsd,
      byEngine: { ...this.state.byEngine },
    };
  }
}
