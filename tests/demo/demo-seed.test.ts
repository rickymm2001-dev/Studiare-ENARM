// npm run demo-seed. La base demo vive en IndexedDB dentro del navegador, así que la siembra real
// se hace en la app (Perfil, Demostración, Generar datos de demostración). Este script genera la
// siembra por defecto completa fuera del navegador, valida cada registro con su esquema y reporta
// los conteos, para revisar el generador sin abrir la app (D-052).
import { describe, expect, it } from 'vitest';
import { SimTruthSchema } from '@/data/schemas/activity';
import { AppEventSchema } from '@/data/schemas/events';
import { UserSchema } from '@/data/schemas/people';
import { buildDemoBank } from '@/demo/content/bank';
import { topicTaxonomy } from '@/demo/content';
import { buildDemoSeed, DEFAULT_DEMO_SEED, provisionalExamDate } from '@/demo/generator/seed';

describe.runIf(process.env.DEMO_SEED_DRY_RUN === '1')('siembra por defecto de la demo', () => {
  it('genera y valida todo lo que se guardaría', { timeout: 180_000 }, () => {
    const endDay = new Date().toISOString().slice(0, 10);
    const seed = buildDemoSeed(buildDemoBank(), topicTaxonomy, {
      ...DEFAULT_DEMO_SEED,
      endDay,
      examDate: provisionalExamDate(endDay),
    });
    for (const event of seed.events) expect(AppEventSchema.safeParse(event).success).toBe(true);
    for (const user of seed.users) expect(UserSchema.safeParse(user).success).toBe(true);
    for (const truth of seed.simTruth) expect(SimTruthSchema.safeParse(truth).success).toBe(true);
    const counts = Object.entries(
      seed.events.reduce<Record<string, number>>((acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      }, {}),
    )
      .map(([type, count]) => `${type} ${count}`)
      .join(', ');
    console.log(
      [
        `Semilla ${seed.options.seed}, último día ${endDay}, ENARM provisional ${seed.options.examDate ?? 'sin fecha'}`,
        `${seed.questions.length} preguntas, ${seed.cases.length} casos y ${seed.cards.length} tarjetas sintéticas`,
        `${seed.users.length} perfiles (1 alumno de demostración y ${seed.cohort.students.length} simulados)`,
        `Bitácora del alumno de demostración con ${seed.events.length} eventos. ${counts}`,
        'Para guardarla, abre la app, ve a Perfil, elige Demostración y usa Generar datos de demostración',
      ].join('\n'),
    );
  });
});
