// Siembra de la base temporal del autotest de la calibración (B14, 3.13 del plan de B14).
//
// Arma, como superusuario y sobre la base migrada, un universo simulado completo: el banco de la demo con
// textos marcados [Prueba] y una marca única, usuarios de auth con alias y correos marcados, la
// especialidad objetivo, los permisos de mejora anónima de varios tipos, la bitácora de una cohorte con
// sus pantallas de opciones, respuestas, motivos de error, sesiones y repasos, las lecturas del banco
// (bank_reads) de cada primera lectura y los pares de etiquetas de dos médicos. Todo lo que se siembra es
// simulado y nunca se mezcla con datos reales: vive en el Postgres temporal que se apaga al terminar.
//
// Los casos que el autotest revisa quedan sembrados a propósito:
//   - 85% de los alumnos dio el permiso, 10% no decidió, 5% lo dio y lo retiró, y tres lo dieron con un
//     aviso anterior a la versión mínima. Dos médicos y un admin también lo dieron y no deben contar
//   - Cinco alumnos con permiso inventan respuestas a preguntas que nunca pidieron al servidor
//   - 40 alumnos con permiso buscan cirugía general y 12 pediatría
//   - Doce preguntas son variantes de otra. Seis ya tienen exposiciones de sobra y seis no
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import { buildDemoBank, type DemoBank } from '@/demo/content/bank';
import { generateCohort, simUserId, type Cohort } from '@/demo/generator/cohort';
import { DEFAULT_MIX } from '@/demo/generator/model';
import { SIM_TIME_ZONE } from '@/demo/generator/simulate';
import { ulidToUuid } from '@/data/cloud/cloudIds';
import { ERROR_MOTIVES } from '@/engines/errorCauses';
import { createRng } from '@/engines/random';
import { addDays, studyDayOf } from '@/engines/studyDay';
import type { PgSql } from './pgStore.ts';

export type ConsentKind = 'granted' | 'revoked' | 'undecided' | 'old_notice';

export interface SeededStudent {
  index: number;
  userId: string;
  alias: string;
  email: string;
  consent: ConsentKind;
  role: 'student' | 'physician' | 'admin';
  specialty: string | null;
  /** Inventa respuestas sin haber pedido la pregunta al servidor */
  forger: boolean;
}

export interface SeedOptions {
  seed: string;
  size: number;
  days: number;
  /** Una marca única que va en los textos, alias y correos. No debe aparecer en ningún registro */
  mark: string;
}

export interface Universe {
  /** Día de estudio de hoy en la base. Es el día del corte */
  today: string;
  /** Último día con datos */
  endDay: string;
  cohort: Cohort;
  bank: DemoBank;
  students: SeededStudent[];
  /** Repasos sembrados por alumno y día de estudio */
  reviews: Map<number, Map<string, number>>;
  /** Respuestas inventadas que se sembraron, todas sin lectura previa */
  forgedAnswers: number;
  /** Versiones (uuid) de las variantes que ya tienen exposiciones de sobra y de las que no */
  variants: { ready: string[]; notReady: string[] };
  /** Todo lo que no debe aparecer jamás en un registro público */
  secrets: string[];
  /** Eventos sembrados */
  events: number;
}

const CONSENT_VERSION = '2026-10-15b';
const OLD_NOTICE_VERSION = '2026-10-14';
const SPECIALTY_PLAN: readonly (readonly [string, number])[] = [
  ['general_surgery', 40],
  ['pediatrics', 12],
  ['internal_medicine', 20],
  ['family_medicine', 10],
  ['orthopedics', 8],
];
const FORGERS = 5;
const FORGED_PER_STUDENT = 700;
const REVIEW_DAYS = 36;
const EVENT_CHUNK = 40_000;

/** El valor, o un error si falta. Evita las aserciones con ! en un script que no debe seguir con datos rotos */
function must<T>(value: T | null | undefined, what = 'dato'): T {
  if (value === null || value === undefined) throw new RangeError(`Falta ${what} en la siembra`);
  return value;
}

export const uuidOf = (ulid: string): string => {
  const uuid = ulidToUuid(ulid);
  if (uuid === null) throw new RangeError('Un id de la demo no es un ULID válido');
  return uuid;
};

/** Cuántos primeros intentos de alumnos con permiso tiene cada pregunta, por su clave */
function firstAttemptCounts(cohort: Cohort, valid: ReadonlySet<number>): Map<string, number> {
  const counts = new Map<string, number>();
  cohort.students.forEach((student, index) => {
    if (!valid.has(index)) return;
    const seen = new Set<string>();
    for (const response of student.history.responses) {
      if (seen.has(response.itemKey)) continue;
      seen.add(response.itemKey);
      counts.set(response.itemKey, (counts.get(response.itemKey) ?? 0) + 1);
    }
  });
  return counts;
}

interface EventRow {
  id: string;
  userId: string;
  type: string;
  at: string;
  sessionId: string | null;
  payload: unknown;
}

async function insertEvents(sql: PgSql, rows: readonly EventRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += EVENT_CHUNK) {
    const chunk = rows.slice(start, start + EVENT_CHUNK);
    await sql.unsafe(
      `insert into public.events (id, user_id, type, at, tz, session_id, payload)
       select t.id, t.user_id, t.type, t.at, '${SIM_TIME_ZONE}', t.session_id, t.payload::jsonb
       from unnest($1::text[], $2::uuid[], $3::text[], $4::timestamptz[], $5::text[], $6::text[])
         as t(id, user_id, type, at, session_id, payload)`,
      [
        chunk.map((row) => row.id),
        chunk.map((row) => row.userId),
        chunk.map((row) => row.type),
        chunk.map((row) => row.at),
        chunk.map((row) => row.sessionId),
        chunk.map((row) => JSON.stringify(row.payload)),
      ] as never,
    );
  }
}

/** Un evento de permiso, como lo sube la app */
const consentEvent = (
  counter: { n: number },
  userId: string,
  at: string,
  status: 'granted' | 'revoked',
  noticeVersion: string,
): EventRow => ({
  id: `cons-${(counter.n += 1).toString(36).padStart(7, '0')}`,
  userId,
  type: 'consent_changed',
  at,
  sessionId: null,
  payload: { purpose: 'anonymized_improvement', status, noticeVersion },
});

export async function seedUniverse(sql: PgSql, options: SeedOptions): Promise<Universe> {
  const { seed, size, days, mark } = options;
  const [{ today }] = (await sql.unsafe(`select public.study_day()::text as today`)) as unknown as [
    { today: string },
  ];
  const endDay = addDays(today, -1);
  const bank = buildDemoBank();
  const cohort = generateCohort(bank, topicTaxonomy, {
    seed,
    size,
    days,
    endDay,
    simulateCards: false,
    mix: DEFAULT_MIX,
  });

  // ------------------------------------------------------------------ Alumnos, permisos y especialidades
  const rng = createRng(`${seed}|universo`);
  const staffStart = size - 3;
  const order = rng.shuffle(Array.from({ length: staffStart }, (_, index) => index));
  const undecided = new Set(order.slice(0, Math.round(staffStart * 0.1)));
  const revoked = new Set(
    order.slice(undecided.size, undecided.size + Math.round(staffStart * 0.05)),
  );
  const oldNotice = new Set(
    order.slice(undecided.size + revoked.size, undecided.size + revoked.size + 3),
  );
  const students: SeededStudent[] = cohort.students.map((student, index) => ({
    index,
    userId: uuidOf(student.userId),
    alias: `Alumno ${mark} ${index + 1}`,
    email: `${mark.toLowerCase()}-${index + 1}@ejemplo.mx`,
    consent:
      index >= staffStart
        ? 'granted'
        : undecided.has(index)
          ? 'undecided'
          : revoked.has(index)
            ? 'revoked'
            : oldNotice.has(index)
              ? 'old_notice'
              : 'granted',
    role: index === size - 1 ? 'admin' : index >= staffStart ? 'physician' : 'student',
    specialty: null,
    forger: false,
  }));
  for (let k = 0; k < FORGERS; k += 1) {
    const index = size + k;
    students.push({
      index,
      userId: uuidOf(simUserId(seed, index)),
      alias: `Alumno ${mark} ${index + 1}`,
      email: `${mark.toLowerCase()}-${index + 1}@ejemplo.mx`,
      consent: 'granted',
      role: 'student',
      specialty: null,
      forger: true,
    });
  }
  // Las especialidades van a quienes sí cuentan, en orden. Algunos que no cuentan también buscan lo mismo
  const counting = students.filter(
    (student) => student.consent === 'granted' && student.role === 'student' && !student.forger,
  );
  let cursor = 0;
  for (const [specialty, count] of SPECIALTY_PLAN) {
    for (const student of counting.slice(cursor, cursor + count)) student.specialty = specialty;
    cursor += count;
  }
  must(counting[cursor + 1], 'un alumno sin decidir').specialty = 'undecided';
  const others = students.filter(
    (student) => student.consent !== 'granted' || student.role !== 'student',
  );
  others.slice(0, 8).forEach((student) => (student.specialty = 'general_surgery'));
  others.slice(8, 12).forEach((student) => (student.specialty = 'pediatrics'));

  await sql.unsafe(
    `insert into auth.users (id, email, raw_user_meta_data)
     select u.id, u.email, jsonb_build_object('alias', u.alias)
     from unnest($1::uuid[], $2::text[], $3::text[]) as u(id, email, alias)`,
    [
      students.map((s) => s.userId),
      students.map((s) => s.email),
      students.map((s) => s.alias),
    ] as never,
  );
  await sql.unsafe(
    `update public.user_roles set role = u.role::public.app_role
     from unnest($1::uuid[], $2::text[]) as u(id, role) where user_id = u.id`,
    [
      students.filter((s) => s.role !== 'student').map((s) => s.userId),
      students.filter((s) => s.role !== 'student').map((s) => s.role),
    ] as never,
  );
  await sql.unsafe(
    `update public.private_accounts a set target_specialty = u.specialty
     from unnest($1::uuid[], $2::text[]) as u(id, specialty) where a.user_id = u.id`,
    [
      students.filter((s) => s.specialty !== null).map((s) => s.userId),
      students.filter((s) => s.specialty !== null).map((s) => s.specialty),
    ] as never,
  );

  // ------------------------------------------------------------------ Variantes
  const validIndexes = new Set(
    students
      .filter((s) => s.consent === 'granted' && s.role === 'student' && !s.forger)
      .map((s) => s.index),
  );
  const attempts = firstAttemptCounts(cohort, validIndexes);
  const ranked = bank.questions
    .map((entry) => ({ entry, attempts: attempts.get(entry.key) ?? 0 }))
    .sort((a, b) => b.attempts - a.attempts);
  // Seis variantes a las que se les muestra siempre el set canónico, así llegan a 200 exposiciones por
  // distractor con los 249 primeros intentos, y seis a las que se les muestra lo que sale del muestreo,
  // que reparte las exposiciones entre todas las opciones y no llega
  const readyEntries = ranked.slice(0, 6);
  const notReadyEntries = ranked.slice(6, 12);
  const readyKeys = new Set(readyEntries.map((row) => row.entry.key));
  const variantOf = new Map<string, string>();
  for (const row of [...readyEntries, ...notReadyEntries]) {
    // Variante de la pregunta que no es ella y no es otra variante
    const original = bank.questions.find(
      (candidate) =>
        candidate.key !== row.entry.key &&
        !readyEntries.some((r) => r.entry.key === candidate.key) &&
        !notReadyEntries.some((r) => r.entry.key === candidate.key),
    );
    if (original) variantOf.set(row.entry.key, original.question.questionId);
  }

  // ------------------------------------------------------------------ Banco
  await sql.unsafe(
    `insert into public.clinical_cases (id, vignette, case_key)
     select r.id, r.vignette, r.case_key
     from jsonb_to_recordset($1::text::jsonb) as r(id uuid, vignette text, case_key text)`,
    [
      JSON.stringify(
        bank.cases.map((c, i) => ({
          id: uuidOf(c.id),
          vignette: `[Prueba] ${mark} ${c.vignette}`,
          case_key: `CASO-${mark}-${i + 1}`,
        })),
      ),
    ] as never,
  );
  await sql.unsafe(
    `insert into public.questions (
       id, question_id, version, case_id, case_order, branch, topic, subtopic, body, editorial_status, is_demo,
       polarity, task, format, structure_source, difficulty, item_kinds, variant_of, language, version_source,
       canonical_option_ids, incomplete)
     select r.id, r.question_id, 1, r.case_id, r.case_order, r.branch, r.topic, r.subtopic,
            jsonb_build_object('vignette', r.vignette, 'prompt', r.prompt, 'explanation', r.explanation,
                               'gpcRefs', '[]'::jsonb, 'clues', '[]'::jsonb),
            'approved', false, r.polarity, r.task, r.format, 'physician', r.difficulty, '{}', r.variant_of,
            'es', 'sheet', r.canonical, '{}'
     from jsonb_to_recordset($1::text::jsonb) as r(
       id uuid, question_id uuid, case_id uuid, case_order int, branch text, topic text, subtopic text,
       vignette text, prompt text, explanation text, polarity text, task text, format text, difficulty int,
       variant_of uuid, canonical uuid[])`,
    [
      JSON.stringify(
        bank.questions.map((entry) => ({
          id: uuidOf(entry.question.id),
          question_id: uuidOf(entry.question.questionId),
          case_id: entry.question.caseId === null ? null : uuidOf(entry.question.caseId),
          case_order: entry.question.caseOrder,
          branch: entry.question.branch,
          topic: entry.question.topic,
          subtopic: entry.question.subtopic,
          vignette: `[Prueba] ${mark} ${entry.question.vignette}`,
          prompt: `[Prueba] ${mark} ${entry.question.prompt}`,
          explanation: `[Prueba] ${mark} ${entry.question.explanation}`,
          polarity: entry.question.structure.polarity,
          task: entry.question.structure.task,
          format: entry.question.structure.format,
          difficulty: entry.question.physicianDifficulty,
          variant_of: variantOf.has(entry.key) ? uuidOf(variantOf.get(entry.key) as string) : null,
          canonical: entry.question.canonicalOptionIds.map(uuidOf),
        })),
      ),
    ] as never,
  );
  await sql.unsafe(
    `insert into public.question_options (
       id, question_version_id, option_id, position, letter, text, is_correct, bias_tag, rationale)
     select r.id, r.question_version_id, r.option_id, r.position, r.letter, r.text, r.is_correct, r.bias_tag, r.rationale
     from jsonb_to_recordset($1::text::jsonb) as r(
       id uuid, question_version_id uuid, option_id uuid, position int, letter text, text text, is_correct boolean,
       bias_tag text, rationale text)`,
    [
      JSON.stringify(
        bank.questions.flatMap((entry) =>
          entry.options.map((option, position) => ({
            id: uuidOf(option.id),
            question_version_id: uuidOf(entry.question.id),
            option_id: uuidOf(option.optionId),
            position,
            letter: 'ABCDEFGHIJ'[position],
            text: `[Prueba] ${mark} ${option.text}`,
            is_correct: option.isCorrect,
            bias_tag: option.biasTag,
            rationale: `[Prueba] ${mark} ${option.rationale}`,
          })),
        ),
      ),
    ] as never,
  );
  await sql.unsafe(
    `insert into public.bank_questions (question_id, origin, source_key, latest_version_id)
     select r.question_id, 'sheet', 'sheet:' || r.key, r.version_id
     from jsonb_to_recordset($1::text::jsonb) as r(question_id uuid, key text, version_id uuid)`,
    [
      JSON.stringify(
        bank.questions.map((entry) => ({
          question_id: uuidOf(entry.question.questionId),
          key: `ST-${entry.key}`,
          version_id: uuidOf(entry.question.id),
        })),
      ),
    ] as never,
  );
  const published = (await sql.unsafe(
    `select public.bank_publish(question_id) as result from public.bank_questions`,
  )) as unknown as { result: string }[];
  if (published.some((row) => row.result !== 'published')) {
    throw new RangeError('No se publicaron todas las preguntas de la siembra');
  }

  // ------------------------------------------------------------------ Bitácora
  const clock = { n: 0 };
  const startDay = addDays(endDay, -(days - 1));
  const consentRows: EventRow[] = [];
  const startOfData = `${addDays(startDay, -1)}T12:00:00Z`;
  for (const student of students) {
    if (student.consent === 'undecided') continue;
    if (student.consent === 'old_notice') {
      consentRows.push(
        consentEvent(clock, student.userId, startOfData, 'granted', OLD_NOTICE_VERSION),
      );
      continue;
    }
    consentRows.push(consentEvent(clock, student.userId, startOfData, 'granted', CONSENT_VERSION));
    if (student.consent === 'revoked') {
      consentRows.push(
        consentEvent(
          clock,
          student.userId,
          `${addDays(endDay, -20)}T12:00:00Z`,
          'revoked',
          CONSENT_VERSION,
        ),
      );
    }
  }
  await insertEvents(sql, consentRows);

  // Las piezas de la bitácora de la cohorte, ordenadas en el tiempo entre todos los alumnos
  interface Stub {
    t: number;
    s: number;
    kind: 0 | 1 | 2 | 3 | 4;
    ref: number;
  }
  const stubs: Stub[] = [];
  const motives = new Map<string, string>();
  const reviews = new Map<number, Map<string, number>>();
  const motiveRng = createRng(`${seed}|motivos`);
  const reviewRng = createRng(`${seed}|repasos`);
  const reviewFrom = addDays(endDay, -(REVIEW_DAYS - 1));
  const bankReads = new Map<
    string,
    { user: string; question: string; version: string; day: string }
  >();
  cohort.students.forEach((student, s) => {
    const history = student.history;
    history.sessions.forEach((session, ref) => {
      if (session.kind === 'practice') {
        stubs.push({ t: Date.parse(session.startedAt), s, kind: 0, ref });
      }
    });
    const bySession = new Map<string, number[]>();
    history.responses.forEach((response, ref) => {
      const shownMs = Date.parse(response.shownAt);
      const answerMs = Math.max(Date.parse(response.at), shownMs + 10);
      stubs.push({ t: shownMs, s, kind: 1, ref }, { t: answerMs, s, kind: 2, ref });
      const list = bySession.get(response.session) ?? [];
      list.push(ref);
      bySession.set(response.session, list);
      const entry = bank.byVersionId.get(response.versionId);
      const day = studyDayOf(new Date(response.at), SIM_TIME_ZONE);
      const key = `${s}|${response.versionId}`;
      const read = bankReads.get(key);
      if (entry && (read === undefined || day < read.day)) {
        bankReads.set(key, {
          user: must(students[s], 'un alumno').userId,
          question: uuidOf(entry.question.questionId),
          version: uuidOf(entry.question.id),
          day,
        });
      }
    });
    // Motivos de error. Los del último tercio de sesiones largas marcan Fatiga según la verdad
    for (const refs of bySession.values()) {
      const ordered = [...refs].sort(
        (a, b) => (history.responses[a]?.order ?? 0) - (history.responses[b]?.order ?? 0),
      );
      const minutes = Math.max(...ordered.map((r) => history.responses[r]?.minuteInSession ?? 0));
      const long = minutes > 30 && ordered.length >= 6;
      const third = Math.floor(ordered.length / 3);
      ordered.forEach((ref, position) => {
        const response = history.responses[ref];
        if (!response || response.correct) return;
        const lastThird = long && position >= ordered.length - third;
        let motive: string | null = null;
        if (lastThird) {
          const chance = student.truth.fatigue === null ? 0.05 : 0.3;
          motive = motiveRng.chance(chance) ? 'fatigue' : 'knowledge';
        } else if (motiveRng.chance(0.2)) {
          motive = motiveRng.pick(ERROR_MOTIVES.filter((item) => item !== 'fatigue'));
        }
        if (motive !== null) {
          motives.set(`${s}|${ref}`, motive);
          stubs.push({
            t: Math.max(Date.parse(response.at), Date.parse(response.shownAt) + 10) + 1000,
            s,
            kind: 3,
            ref,
          });
        }
      });
    }
    // Repasos de tarjetas de los últimos días, que son los que mira la comparación
    const perDay = new Map<string, number>();
    for (const day of history.activeDays) {
      if (day < reviewFrom) continue;
      const count = 15 + reviewRng.int(0, 50);
      perDay.set(day, count);
      const [y, m, d] = day.split('-').map(Number) as [number, number, number];
      stubs.push({ t: Date.UTC(y, m - 1, d, 20 + 6, 0), s, kind: 4, ref: count });
    }
    reviews.set(s, perDay);
  });
  stubs.sort((a, b) => a.t - b.t || a.s - b.s || a.kind - b.kind);

  // Las opciones que se muestran. Las variantes listas muestran su set canónico y la opción elegida
  const shownOptionsOf = (
    response: (typeof cohort.students)[number]['history']['responses'][number],
  ) => {
    const entry = must(bank.byVersionId.get(response.versionId), 'una pregunta');
    if (!readyKeys.has(entry.key)) {
      return response.shown.map((option) => ({
        optionVersionId: option.optionId,
        position: option.position,
      }));
    }
    const canonical = entry.question.canonicalOptionIds;
    const ids = canonical.includes(response.chosenOptionId)
      ? [...canonical]
      : [...canonical, response.chosenOptionId];
    return ids.map((optionVersionId, position) => ({ optionVersionId, position }));
  };

  let counter = 0;
  const nextId = () => `ev-${(counter += 1).toString(36).padStart(8, '0')}`;
  const sessionIds = new Map<string, string>();
  const sessionIdOf = (s: number, local: string) => {
    const key = `${s}|${local}`;
    let id = sessionIds.get(key);
    if (!id) {
      id = `ses-${s.toString(36)}-${local}`;
      sessionIds.set(key, id);
    }
    return id;
  };
  let buffer: EventRow[] = [];
  let total = consentRows.length;
  const flush = async (force: boolean) => {
    if (buffer.length >= EVENT_CHUNK || (force && buffer.length > 0)) {
      await insertEvents(sql, buffer);
      total += buffer.length;
      buffer = [];
    }
  };
  for (const stub of stubs) {
    const student = must(cohort.students[stub.s], 'un alumno simulado');
    const userId = must(students[stub.s], 'un alumno').userId;
    const at = new Date(stub.t).toISOString();
    if (stub.kind === 0) {
      const session = must(student.history.sessions[stub.ref], 'una sesión');
      buffer.push({
        id: nextId(),
        userId,
        type: 'session_started',
        at,
        sessionId: sessionIdOf(stub.s, session.id),
        payload: { kind: 'practice', config: { source: 'autotest', simulated: true } },
      });
    } else if (stub.kind === 1 || stub.kind === 2 || stub.kind === 3) {
      const response = must(student.history.responses[stub.ref], 'una respuesta');
      const sessionId = sessionIdOf(stub.s, response.session);
      if (stub.kind === 1) {
        buffer.push({
          id: nextId(),
          userId,
          type: 'question_shown',
          at,
          sessionId,
          payload: {
            questionVersionId: response.versionId,
            shownOptions: shownOptionsOf(response),
            seed: response.samplingSeed.slice(0, 64),
            samplingMode: 'diverse',
            highlightEnabled: true,
            positionInSession: response.order,
          },
        });
      } else if (stub.kind === 2) {
        buffer.push({
          id: nextId(),
          userId,
          type: 'question_answered',
          at,
          sessionId,
          payload: {
            questionVersionId: response.versionId,
            optionVersionId: response.chosenOptionId,
            correct: response.correct,
            confidence: response.confidence,
            msToAnswer: Math.min(response.msToAnswer, 86_400_000),
            changeCount: response.previousOptionIds.length,
            highlightEnabled: true,
          },
        });
      } else {
        const entry = must(bank.byVersionId.get(response.versionId), 'una pregunta');
        buffer.push({
          id: nextId(),
          userId,
          type: 'cause_reported',
          at,
          sessionId,
          payload: {
            targetKind: 'question',
            targetId: entry.question.questionId,
            cause: motives.get(`${stub.s}|${stub.ref}`),
          },
        });
      }
    } else {
      for (let i = 0; i < stub.ref; i += 1) {
        buffer.push({
          id: nextId(),
          userId,
          type: 'card_reviewed',
          at: new Date(stub.t + i * 1000).toISOString(),
          sessionId: null,
          payload: {
            cardId: 'AUTOTEST-CARD',
            deckId: 'AUTOTEST-DECK',
            source: 'card',
            rating: 3,
            confidence: null,
            msToReveal: 3000,
            msToRate: 2000,
          },
        });
      }
    }
    await flush(false);
  }
  await flush(true);

  // Las respuestas inventadas de quienes nunca pidieron la pregunta al servidor
  const forgeRng = createRng(`${seed}|falsas`);
  const forged: EventRow[] = [];
  for (const student of students.filter((s) => s.forger)) {
    for (let i = 0; i < FORGED_PER_STUDENT; i += 1) {
      const entry = forgeRng.pick(bank.questions);
      const wrong = entry.options.filter((option) => !option.isCorrect);
      const at = new Date(
        Date.parse(`${addDays(endDay, -forgeRng.int(0, 29))}T14:00:00Z`) + i * 7000,
      ).toISOString();
      forged.push({
        id: nextId(),
        userId: student.userId,
        type: 'question_answered',
        at,
        sessionId: null,
        payload: {
          questionVersionId: entry.question.id,
          optionVersionId: forgeRng.pick(wrong).id,
          correct: false,
          confidence: 'sure',
          msToAnswer: 30_000,
          changeCount: 0,
          highlightEnabled: true,
        },
      });
    }
  }
  await insertEvents(sql, forged);
  total += forged.length;

  // Las lecturas del banco de cada primera lectura
  const reads = [...bankReads.values()];
  for (let start = 0; start < reads.length; start += EVENT_CHUNK) {
    const chunk = reads.slice(start, start + EVENT_CHUNK);
    await sql.unsafe(
      `insert into public.bank_reads (user_id, question_id, version_id, day, plan, purpose)
       select t.user_id, t.question_id, t.version_id, t.day, 'monthly', 'practice'
       from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::date[]) as t(user_id, question_id, version_id, day)
       on conflict (user_id, question_id, day) do nothing`,
      [
        chunk.map((r) => r.user),
        chunk.map((r) => r.question),
        chunk.map((r) => r.version),
        chunk.map((r) => r.day),
      ] as never,
    );
  }

  // ------------------------------------------------------------------ Pares de etiquetas de dos médicos
  const taggable = biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key);
  const labelRng = createRng(`${seed}|etiquetas`);
  const physician = must(
    students.find((s) => s.role === 'physician'),
    'un médico',
  );
  const labels: { option: string; version: string; author: string; reviewer: string }[] = [];
  for (const entry of bank.questions) {
    if (labels.length >= 60) break;
    const option = entry.options.find(
      (candidate) => !candidate.isCorrect && candidate.biasTag !== null,
    );
    if (!option?.biasTag) continue;
    labels.push({
      option: uuidOf(option.optionId),
      version: uuidOf(entry.question.id),
      author: option.biasTag,
      reviewer: labelRng.chance(0.75) ? option.biasTag : labelRng.pick(taggable),
    });
  }
  await sql.unsafe(
    `insert into public.bias_labels (option_id, labeler_id, question_version_id, tag, author_tag, locked_at)
     select t.option_id, $1::uuid, t.version_id, t.tag, t.author_tag, now()
     from unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[]) as t(option_id, version_id, tag, author_tag)`,
    [
      physician.userId,
      labels.map((l) => l.option),
      labels.map((l) => l.version),
      labels.map((l) => l.reviewer),
      labels.map((l) => l.author),
    ] as never,
  );

  // Sin estadísticas de la siembra el planificador de Postgres elige planes muy lentos. En el proyecto
  // real el autovacuum las mantiene al día
  await sql.unsafe('analyze');

  const variantVersions = (rows: typeof readyEntries) =>
    rows.map((row) => uuidOf(row.entry.question.id));
  return {
    today,
    endDay,
    cohort,
    bank,
    students,
    reviews,
    forgedAnswers: forged.length,
    variants: {
      ready: variantVersions(readyEntries.filter((row) => variantOf.has(row.entry.key))),
      notReady: variantVersions(notReadyEntries.filter((row) => variantOf.has(row.entry.key))),
    },
    secrets: [
      mark,
      mark.toLowerCase(),
      ...students.flatMap((s) => [s.alias, s.email, s.userId, s.userId.toUpperCase()]),
      'sb_secret_',
      'eyJ',
      '@',
    ],
    events: total,
  };
}

/** Quita el permiso, con un evento nuevo, a todos los alumnos con permiso que no están en keep */
export async function revokeAllExcept(
  sql: PgSql,
  universe: Universe,
  keep: ReadonlySet<string>,
): Promise<number> {
  const clock = { n: 1_000_000 };
  const at = new Date().toISOString();
  const rows = universe.students
    .filter((s) => s.consent === 'granted' && s.role === 'student' && !keep.has(s.userId))
    .map((s) => consentEvent(clock, s.userId, at, 'revoked', CONSENT_VERSION));
  await insertEvents(sql, rows);
  return rows.length;
}
