import { describe, expect, it } from 'vitest';
import { ulidToUuid } from '@/data/cloud/cloudIds';
import {
  comparableQuestionId,
  isEnglishQuestion,
  isMarked,
  isNonFunctional,
  marksOf,
  restructureMarks,
} from './restructureEligibility';

const Q1 = '01J00000000000000000000001';
const Q2 = '01J00000000000000000000002';
const Q3 = '01J00000000000000000000003';

const report = (questionId: string, status: 'open' | 'resolved' | 'dismissed') => ({
  questionId,
  status,
});
const flag = (
  questionId: string,
  attraction: number,
  exposures = 120,
  status: 'open' | 'edited' | 'kept' | 'dismissed' = 'open',
) => ({ questionId, status, attraction, exposures });

describe('preguntas marcadas para reestructurar', () => {
  it('una pregunta con un reporte de error abierto está marcada', () => {
    const marks = restructureMarks({ reports: [report(Q1, 'open')], distractors: [] });
    expect(isMarked(marks, Q1)).toBe(true);
    expect(marksOf(marks, Q1)).toEqual(['open_report']);
  });

  it('un reporte resuelto o descartado no marca', () => {
    const marks = restructureMarks({
      reports: [report(Q1, 'resolved'), report(Q2, 'dismissed')],
      distractors: [],
    });
    expect(marks.size).toBe(0);
  });

  it('un distractor que casi nadie elige, con 100 exposiciones o más, marca la pregunta', () => {
    const marks = restructureMarks({ reports: [], distractors: [flag(Q2, 0.04, 100)] });
    expect(marksOf(marks, Q2)).toEqual(['non_functional_distractor']);
  });

  it('con menos de 100 exposiciones el distractor todavía calibra y no marca', () => {
    expect(restructureMarks({ reports: [], distractors: [flag(Q2, 0.01, 99)] }).size).toBe(0);
  });

  it('un distractor que sí se elige, o ya atendido, no marca', () => {
    const marks = restructureMarks({
      reports: [],
      distractors: [flag(Q1, 0.05), flag(Q2, 0.2), flag(Q3, 0.01, 200, 'kept')],
    });
    expect(marks.size).toBe(0);
  });

  it('sin reportes ni distractores no hay marcas', () => {
    expect(restructureMarks({ reports: [], distractors: [] }).size).toBe(0);
  });

  it('una pregunta con las dos cosas lleva los dos motivos, una vez cada uno', () => {
    const marks = restructureMarks({
      reports: [report(Q1, 'open'), report(Q1, 'open')],
      distractors: [flag(Q1, 0.02), flag(Q1, 0.01)],
    });
    expect(marksOf(marks, Q1)).toEqual(['open_report', 'non_functional_distractor']);
  });

  it('usa los umbrales que se le pasan', () => {
    const lenient = { nonFunctionalRate: 0.1, nonFunctionalExposures: 50 };
    expect(isNonFunctional(flag(Q1, 0.08, 60), lenient)).toBe(true);
    expect(isNonFunctional(flag(Q1, 0.08, 60), { ...lenient, nonFunctionalRate: 0.05 })).toBe(
      false,
    );
    const marks = restructureMarks({
      reports: [],
      distractors: [flag(Q1, 0.08, 60)],
      thresholds: lenient,
    });
    expect(isMarked(marks, Q1)).toBe(true);
  });

  it('el banco local y la nube hablan del mismo id aunque uno sea ULID y el otro uuid', () => {
    const uuid = ulidToUuid(Q1) ?? '';
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(comparableQuestionId(uuid)).toBe(comparableQuestionId(Q1));
    const fromCloud = restructureMarks({ reports: [report(uuid, 'open')], distractors: [] });
    expect(isMarked(fromCloud, Q1)).toBe(true);
    expect(isMarked(fromCloud, Q2)).toBe(false);
    // Un id que no es ninguno de los dos se compara tal cual
    expect(comparableQuestionId('abc')).toBe('ABC');
  });

  it('una pregunta que no está marcada no se puede reestructurar', () => {
    const marks = restructureMarks({ reports: [report(Q1, 'open')], distractors: [] });
    expect(isMarked(marks, Q3)).toBe(false);
    expect(marksOf(marks, Q3)).toEqual([]);
  });
});

describe('preguntas en inglés', () => {
  it('una pregunta de Inglés médico o con language en es una pregunta en inglés', () => {
    expect(isEnglishQuestion({ branch: 'medical_english' })).toBe(true);
    expect(isEnglishQuestion({ branch: 'medical_english', language: 'en' })).toBe(true);
    // El idioma de la pregunta cuenta aunque la rama no sea la de inglés
    expect(isEnglishQuestion({ branch: 'internal_medicine', language: 'en' })).toBe(true);
  });

  it('las del banco en español, con o sin idioma, no lo son', () => {
    expect(isEnglishQuestion({ branch: 'internal_medicine' })).toBe(false);
    expect(isEnglishQuestion({ branch: 'pediatrics', language: 'es' })).toBe(false);
    expect(isEnglishQuestion({ branch: 'public_health', language: 'es' })).toBe(false);
  });

  it('estar marcada no la vuelve elegible, porque la marca y el idioma son cosas distintas', () => {
    const marks = restructureMarks({ reports: [report(Q1, 'open')], distractors: [] });
    expect(isMarked(marks, Q1)).toBe(true);
    expect(isEnglishQuestion({ branch: 'medical_english' })).toBe(true);
  });
});
