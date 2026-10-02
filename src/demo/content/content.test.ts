// Contenido en datos de la Fase B, bloque 7. Valida esquemas, conteos y referencias cruzadas.
import { describe, expect, it } from 'vitest';
import {
  biasTaxonomy,
  biasTips,
  structureDictionary,
  taggableBiasKeys,
  topicTaxonomy,
} from './index';

describe('taxonomía de temas (13.4)', () => {
  const topics = topicTaxonomy.branches.flatMap((branch) => branch.topics);
  const subtopics = topics.flatMap((topic) => topic.subtopics);

  it('tiene las 4 ramas con pesos iguales y unos 40 temas', () => {
    expect(topicTaxonomy.branches.map((branch) => branch.key)).toEqual([
      'internal_medicine',
      'pediatrics',
      'obstetrics_gynecology',
      'general_surgery',
    ]);
    expect(new Set(topicTaxonomy.branches.map((branch) => branch.weight)).size).toBe(1);
    expect(topics).toHaveLength(40);
    for (const branch of topicTaxonomy.branches) expect(branch.topics).toHaveLength(10);
  });

  it('las claves de tema y de subtema son únicas en toda la taxonomía', () => {
    expect(new Set(topics.map((topic) => topic.key)).size).toBe(topics.length);
    expect(new Set(subtopics.map((subtopic) => subtopic.key)).size).toBe(subtopics.length);
    expect(subtopics.length).toBeGreaterThanOrEqual(100);
  });

  it('cada tema base existe y no se apunta a sí mismo', () => {
    const keys = new Set(topics.map((topic) => topic.key));
    const withBase = topics.filter((topic) => topic.baseTopic !== null);
    expect(withBase.length).toBeGreaterThanOrEqual(10);
    for (const topic of withBase) {
      expect(keys.has(topic.baseTopic ?? ''), topic.key).toBe(true);
      expect(topic.baseTopic).not.toBe(topic.key);
    }
  });
});

describe('taxonomía de sesgos (D-029, D-042)', () => {
  it('son exactamente los 24 sesgos de la lista de Ricardo', () => {
    expect(biasTaxonomy.biases.map((bias) => bias.englishName)).toEqual([
      'Premature closure',
      'Anchoring bias',
      'Availability heuristic',
      'Base rate fallacy',
      'Framing effect',
      'Sunk cost fallacy',
      "Gambler's fallacy",
      'Clustering illusion',
      'Loss aversion',
      'Inattentional blindness',
      'Serial position effect',
      'Representativeness heuristic',
      'Halo / Horn effect',
      'Ambiguity effect',
      'Complexity bias',
      'Zeigarnik effect',
      'Confirmation bias',
      'Status quo bias / Endowment effect',
      'Belief bias',
      'Overconfidence effect',
      'Information bias',
      'Focusing illusion',
      'Omission bias',
      'Decision fatigue',
    ]);
    expect(new Set(biasTaxonomy.biases.map((bias) => bias.key)).size).toBe(24);
  });

  it('no incluye las trampas de formato que Ricardo quitó', () => {
    const keys = biasTaxonomy.biases.map((bias) => bias.key);
    for (const removed of ['sequence', 'commission', 'other', 'SEC', 'COM', 'OTR'])
      expect(keys).not.toContain(removed);
  });

  it('los 8 sesgos de conducta tienen señales y solo 3 no se usan como etiqueta', () => {
    const withSignals = biasTaxonomy.biases
      .filter((bias) => bias.behaviorSignals.length > 0)
      .map((bias) => bias.key);
    expect(withSignals.sort()).toEqual(
      [
        'clustering_illusion',
        'decision_fatigue',
        'gamblers_fallacy',
        'overconfidence_effect',
        'serial_position_effect',
        'status_quo_bias',
        'sunk_cost_fallacy',
        'zeigarnik_effect',
      ].sort(),
    );
    const notTaggable = biasTaxonomy.biases
      .filter((bias) => !bias.taggable)
      .map((bias) => bias.key);
    expect(notTaggable.sort()).toEqual([
      'decision_fatigue',
      'overconfidence_effect',
      'zeigarnik_effect',
    ]);
    expect(taggableBiasKeys.size).toBe(21);
  });
});

describe('consejos base y diccionario', () => {
  it('hay un consejo por sesgo y todos apuntan a un sesgo que existe', () => {
    const keys = new Set(biasTaxonomy.biases.map((bias) => bias.key));
    expect(biasTips.tips).toHaveLength(24);
    for (const tip of biasTips.tips) expect(keys.has(tip.biasKey), tip.biasKey).toBe(true);
    expect(new Set(biasTips.tips.map((tip) => tip.biasKey)).size).toBe(24);
  });

  it('todo el contenido en datos está pendiente de revisión médica', () => {
    for (const status of [
      topicTaxonomy.status,
      biasTaxonomy.status,
      biasTips.status,
      structureDictionary.status,
    ]) {
      expect(status).toBe('pending_physician_review');
    }
  });
});
