// La siembra de la taxonomía en la base es igual a la de la app (B11, 1.3 del plan de B11). El servidor
// valida rama, subespecialidad, subtema y etiquetas de sesgo con bank_taxonomy y bank_bias_tags, que
// siembra 20261023000001_bank_taxonomy.sql. Si alguien cambia topic-taxonomy.json o bias-taxonomy.json
// sin una migración nueva, esta prueba falla.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { branchSection } from '@/data/schemas/content';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';

const migration = readFileSync(
  resolve(import.meta.dirname, '../../supabase/migrations/20261023000001_bank_taxonomy.sql'),
  'utf8',
);

function insertedRows(table: string): string[][] {
  const start = migration.indexOf(`insert into public.${table}`);
  const end = migration.indexOf('on conflict', start);
  expect(start).toBeGreaterThan(-1);
  return [...migration.slice(start, end).matchAll(/\(([^()]*)\)/g)]
    .map((match) => [...(match[1] ?? '').matchAll(/'([^']*)'/g)].map((value) => value[1] ?? ''))
    .filter((values) => values.length > 0);
}

describe('siembra de la taxonomía en la base', () => {
  it('bank_taxonomy trae cada rama, subespecialidad y subtema con su sección, ni uno más', () => {
    const seeded = insertedRows('bank_taxonomy').map((values) => values.join('|'));
    const expected = topicTaxonomy.branches.flatMap((branch) =>
      branch.topics.flatMap((topic) =>
        topic.subtopics.map((subtopic) =>
          [branch.key, topic.key, subtopic.key, branchSection(branch)].join('|'),
        ),
      ),
    );
    expect(seeded.sort()).toEqual(expected.sort());
    expect(new Set(seeded).size).toBe(seeded.length);
  });

  it('bank_bias_tags trae solo las etiquetas que se usan en un distractor', () => {
    const seeded = insertedRows('bank_bias_tags').map((values) => values[0]);
    const taggable = biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key);
    expect(seeded.sort()).toEqual(taggable.sort());
  });

  it('Salud pública e Inglés médico ya están en la base con su sección', () => {
    const seeded = insertedRows('bank_taxonomy');
    expect(seeded.some((values) => values[0] === 'public_health' && values[3] === 'clinical')).toBe(
      true,
    );
    expect(
      seeded.filter((values) => values[0] === 'medical_english').every((v) => v[3] === 'english'),
    ).toBe(true);
  });
});
