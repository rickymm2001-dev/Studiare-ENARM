// Los documentos de B18 (B18, 7 del diseño). docs/PRIMEROS_ALUMNOS.md es lo que lee Ricardo para invitar a los 5 y para
// decidir cuándo abrir el registro, y la sección de docs/PENDIENTES_DE_RICARDO.md es el paso a paso para alguien que no sabe
// nada de estas cosas. Esta prueba los amarra al código: los nombres que citan existen, no llaman anónima a la encuesta,
// no piden llaves por el chat y cumplen la regla de redacción de los documentos para Ricardo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS } from '@/data/analytics/catalog';
import { SURVEY_RPC, SURVEY_SETTING_KEY } from '@/data/cloud/survey';
import { surveyAdminTexts, surveyTexts } from '@/i18n/survey';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const GUIDE = read('docs/PRIMEROS_ALUMNOS.md');
const PENDING = read('docs/PENDIENTES_DE_RICARDO.md');
/** La sección de B18 de los pendientes, hasta la que sigue */
const PENDING_B18 = PENDING.slice(
  PENDING.indexOf('## Lo que salió de B18'),
  PENDING.indexOf('## Esta semana'),
);

/** La prosa de un documento, sin bloques de código, sin tablas y sin direcciones https:// */
const prose = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, '')
    .replaceAll('https://', 'https//')
    // El nombre del comando lleva dos puntos y no es prosa
    .replaceAll('deploy:supabase', 'deploy supabase')
    .split('\n')
    .filter((line) => !line.startsWith('|'));

describe('docs/PRIMEROS_ALUMNOS.md', () => {
  it('trae el guion, la plantilla de hallazgos, el embudo, el resumen y la regla para abrir el registro', () => {
    for (const heading of [
      '## Antes de invitar',
      '## El día 0, unos 30 minutos',
      '## Qué decirles',
      '## Qué no decirles',
      '## Durante la semana',
      '## Cómo anotar lo que encuentres',
      '## Cómo se mide',
      '### El embudo en PostHog',
      '## El resumen para PROGRESS.md',
      '## Qué recibe la sesión y qué no',
      '## Cuándo abrir el registro',
      '## Si algo sale mal',
      '## Lo que hace la sesión por ti',
      '## Decisiones que esperan tu visto bueno',
    ]) {
      expect(GUIDE, heading).toContain(heading);
    }
    // La plantilla de hallazgos tiene sus campos
    for (const field of ['Pantalla', 'Qué pasó', 'Cuántos de los 5', 'Tipo', 'Decisión']) {
      expect(GUIDE, field).toContain(`| ${field} |`.slice(0, 2 + field.length));
    }
    for (const kind of ['Falla', 'Confusión', 'Contenido', 'Idea']) expect(GUIDE).toContain(kind);
    for (const decision of ['Antes de abrir', 'Después', 'Descartar'])
      expect(GUIDE).toContain(decision);
  });

  it('el embudo cita eventos que existen en el catálogo de la analítica', () => {
    const rows = GUIDE.split('\n').filter((line) => /^\| [1-5] \|/.test(line));
    expect(rows).toHaveLength(5);
    const named = rows.flatMap((row) => row.match(/[a-z]+(?:_[a-z]+)+/g) ?? []);
    for (const event of named) expect(Object.keys(ANALYTICS_EVENTS), event).toContain(event);
    expect(named).toContain('survey_completed');
  });

  it('dice que la encuesta no es anónima y nunca la llama así como algo bueno', () => {
    expect(GUIDE).toMatch(/No es anónima, y nunca se les debe decir que lo es/);
    expect(GUIDE).toMatch(/Que la encuesta es anónima\. Es con un código/);
    // Las únicas veces que aparece la palabra es para negarla
    // (una llamada anónima a la API, la de la prueba de humo, no es la encuesta)
    const mentions = GUIDE.split('\n')
      .filter((item) => /an[oó]nim/i.test(item))
      .filter((item) => !item.includes('llamada anónima'));
    expect(mentions.length).toBeGreaterThan(1);
    for (const line of mentions) {
      expect(line, line).toMatch(/\bno\b|\bNo\b|Que la encuesta es anónima\. Es con un código/);
    }
  });

  it('dice que la sesión no recibe los comentarios, los códigos ni las respuestas una por una', () => {
    expect(GUIDE).toMatch(
      /\*\*No recibe\.\*\* Los comentarios, los códigos ni las respuestas una por una/,
    );
    expect(GUIDE).toMatch(/la sesión no lee los comentarios/);
  });

  it('presenta que la sesión no lea los comentarios como regla de conducta y no como control técnico (D-139)', () => {
    // La función del equipo sí devuelve los comentarios, y una conexión como postgres podría leer la tabla
    expect(GUIDE).toMatch(/regla de conducta \(D-139\) y no un control técnico/);
    expect(GUIDE).toContain('admin_survey_responses devuelve los comentarios');
    expect(GUIDE).toContain('postgres');
    // El control real es la llave de admin y qué se le pasa a la sesión
    expect(GUIDE).toMatch(/no tiene tu llave de admin/);
    expect(GUIDE).toContain('resumen por conteos (admin_survey_summary)');
    // Ya no promete que ninguna función ni comando devuelva los comentarios
    for (const file of [
      'docs/PRIMEROS_ALUMNOS.md',
      'docs/SUPABASE.md',
      'docs/legal/CAMBIOS-B18.md',
      'docs/PENDIENTES_DE_RICARDO.md',
      'supabase/migrations/20261030000001_first_week_survey.sql',
      'src/features/admin/FirstWeekSurveyCard.tsx',
    ]) {
      expect(read(file), file).not.toMatch(
        /ninguna función (de la base )?(ni ningún comando )?que corre la sesión devuelve|ninguna función que corre la sesión devuelve/i,
      );
    }
    expect(read('docs/SUPABASE.md')).toMatch(
      /regla de conducta \(D-139[^)]*\) y no un control técnico/,
    );
    expect(read('docs/legal/CAMBIOS-B18.md')).toMatch(
      /regla de conducta \(D-139\) y no un control técnico/,
    );
    expect(read('supabase/migrations/20261030000001_first_week_survey.sql')).toMatch(
      /regla de conducta \(D-139\) y no un control técnico/,
    );
  });

  it('dice que el filtro del comentario es un apoyo y no una garantía, en la pantalla y en los documentos', () => {
    expect(GUIDE).toMatch(/Es una ayuda y no una garantía/);
    expect(read('docs/SUPABASE.md')).toMatch(/Es un apoyo y no una garantía/);
    expect(read('docs/legal/CAMBIOS-B18.md')).toMatch(/es un apoyo y no una garantía/);
    expect(surveyTexts.comment.hint).toMatch(/solo una ayuda y no lo detecta todo/);
    expect(read('supabase/migrations/20261030000001_first_week_survey.sql')).toMatch(
      /Es un apoyo y no una\s+-- garantía/,
    );
  });

  it('la prueba de humo de SUPABASE.md acepta 401, 403 o 404 como rechazada y explica por qué', () => {
    const doc = read('docs/SUPABASE.md');
    const start = doc.indexOf(
      '### Prueba de humo sin llaves',
      doc.indexOf('## Primeros alumnos y encuesta (B18)'),
    );
    const section = doc.slice(start, doc.indexOf('\n### ', start + 1));
    const rows = section.split('\n').filter((line) => /^\| (POST|GET) /.test(line));
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row, row).toContain('401, 403 o 404');
    expect(section).not.toMatch(/\| 401 o 403 \|/);
    expect(section).toContain('PGRST205');
    expect(section).toMatch(/lo único que no puede salir es un 200/);
    // Un 404 sin sesión no prueba que se aplicó: eso lo dice la comprobación de estructura
    expect(section).toMatch(/también saldría si las migraciones no se aplicaron/);
  });

  it('SUPABASE.md dice que un id de encuesta desconocido usa el de respaldo y que una segunda pide migración', () => {
    const doc = read('docs/SUPABASE.md');
    expect(doc).toMatch(/la única que la base conoce/);
    expect(doc).toMatch(/Con otro id, aunque tenga buena forma, la base usa first-week-v1/);
    expect(doc).toMatch(/pide otra tabla, pero sí una migración/);
  });

  it('las instrucciones coinciden con la tarjeta y con la configuración de la app', () => {
    const settings = surveyAdminTexts.card.settings;
    expect(GUIDE).toContain(settings.until);
    expect(GUIDE).toContain('interruptor');
    expect(GUIDE).toContain(surveyAdminTexts.invitation.copy);
    expect(GUIDE).toContain(surveyTexts.actions.erase);
    expect(GUIDE).toContain('Abrir el registro');
    expect(GUIDE).toContain('2026-10-22b');
    expect(GUIDE).toContain('npm run deploy:supabase -- --plan b18');
    expect(GUIDE).toContain(SURVEY_RPC.status);
    expect(PENDING_B18).toContain(SURVEY_SETTING_KEY);
    expect(PENDING_B18).toContain(settings.until);
  });

  it('cumple la regla de redacción: sin dos puntos en la prosa y sin signos de exclamación', () => {
    for (const line of prose(GUIDE)) {
      expect(line, line).not.toContain(':');
      expect(line, line).not.toMatch(/[¡!]/);
    }
  });
});

describe('docs/PENDIENTES_DE_RICARDO.md, sección de B18', () => {
  it('trae un paso por cada cosa que solo Ricardo puede hacer, numerados B18.1 en adelante', () => {
    const steps = [...PENDING_B18.matchAll(/\*\*Paso B18\.(\d+)\./g)].map((match) =>
      Number(match[1]),
    );
    expect(steps).toEqual(Array.from({ length: steps.length }, (_, index) => index + 1));
    expect(steps.length).toBeGreaterThanOrEqual(10);
    // Los pasos de antes de invitar están, con su porqué
    expect(PENDING_B18).toMatch(/Paso B18\.1\. Que B17 haya quedado/);
    expect(PENDING_B18).toMatch(/Paso B18\.2\. Activa y prueba el gancho/);
    expect(PENDING_B18).toMatch(/Paso B18\.3\. Plan de pago de Supabase/);
    expect(PENDING_B18).toContain('docs/PRIMEROS_ALUMNOS.md');
  });

  it('no pide pegar ninguna llave en el chat y cumple la regla de redacción', () => {
    expect(PENDING_B18).toMatch(/Ningún paso lleva llaves al chat/);
    // Ningún paso le pide a Ricardo escribir una llave, ni nombra una con su forma real
    expect(PENDING_B18).not.toMatch(
      /\b(?:sk|pk|rk)_(?:live|test)_|whsec_|sb_secret_|sb_publishable_/,
    );
    for (const line of prose(PENDING_B18)) {
      expect(line, line).not.toContain(':');
      expect(line, line).not.toMatch(/[¡!]/);
    }
  });
});
