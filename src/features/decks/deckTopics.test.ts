import { describe, expect, it } from 'vitest';
import {
  deckTopicsGrouped,
  humanizeTopic,
  SPANISH_COLLATOR,
} from './deckTopics';

describe('deckTopics (B4, comentario 8)', () => {
  it('ordena alfabéticamente en español sin distinguir acentos', () => {
    const words = [
      'Asbestosis',
      'Ácido úrico',
      'anemia ferropénica',
      'Artritis reactiva',
      'Árbol bronquial',
      'Anemias hemolíticas',
      'Artritis reumatoide',
    ];
    const sorted = [...words].sort((a, b) => SPANISH_COLLATOR.compare(a, b));

    expect(sorted).toEqual([
      'Ácido úrico',
      'anemia ferropénica',
      'Anemias hemolíticas',
      'Árbol bronquial',
      'Artritis reactiva',
      'Artritis reumatoide',
      'Asbestosis',
    ]);
  });

  it('traduce abreviaturas y nombres pegados de Paco a nombres médicos legibles', () => {
    expect(humanizeTopic('AR')).toBe('Artritis reumatoide');
    expect(humanizeTopic('LES')).toBe('Lupus eritematoso sistémico');
    expect(humanizeTopic('EPOC')).toBe('Enfermedad pulmonar obstructiva crónica');
    expect(humanizeTopic('EVC')).toBe('Enfermedad vascular cerebral');
    expect(humanizeTopic('BH')).toBe('Biometría hemática');
    expect(humanizeTopic('Hemorragias1T')).toBe('Hemorragias del primer trimestre');
    expect(humanizeTopic('AnticonceptivosyMPF')).toBe('Anticonceptivos y planificación familiar');
    expect(humanizeTopic('GW')).toBe('Granulomatosis con poliangitis (Wegener)');
    expect(humanizeTopic('EHGNA')).toBe('Enfermedad por hígado graso no alcohólico');
  });

  it('agrupa por rama cuando un mazo tiene varias ramas', () => {
    const multiBranchDeck = {
      key: 'paco-urgencias',
      notes: [
        {
          branch: 'emergency_medicine',
          sourceTag: 'Urgencias::Toxíndromes::Anticolinérgico',
          tags: ['Toxíndromes', 'Anticolinérgico'],
        },
        {
          branch: 'emergency_medicine',
          sourceTag: 'Urgencias::Toxíndromes::Colinérgico',
          tags: ['Toxíndromes', 'Colinérgico'],
        },
        {
          branch: 'general_surgery',
          sourceTag: 'Cirugía::Quemaduras',
          tags: ['Quemaduras'],
        },
      ],
    };

    const grouped = deckTopicsGrouped(multiBranchDeck);
    expect(grouped).toHaveLength(2);

    const branchNames = grouped.map((g) => g.branchName);
    // Ordenado alfabéticamente por nombre de rama
    expect(branchNames).toEqual(['Cirugía general', 'Urgencias']);

    const urgenciasGroup = grouped.find((g) => g.branchName === 'Urgencias');
    expect(urgenciasGroup).toBeDefined();
    if (!urgenciasGroup) throw new Error('urgenciasGroup missing');
    expect(urgenciasGroup.topics).toHaveLength(2);
    expect(urgenciasGroup.topics.map((t) => t.name)).toEqual([
      'Toxíndrome anticolinérgico',
      'Toxíndrome colinérgico',
    ]);

    const cirugiaGroup = grouped.find((g) => g.branchName === 'Cirugía general');
    expect(cirugiaGroup).toBeDefined();
    if (!cirugiaGroup) throw new Error('cirugiaGroup missing');
    expect(cirugiaGroup.topics).toHaveLength(1);
    expect(cirugiaGroup.topics[0]?.name).toBe('Quemaduras');
  });

  it('muestra todos los temas completos sin repetidos y sin recortes', () => {
    const notes = [
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::AR' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::AR' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::LES' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::OA' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::EA' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::AP' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::AReactiva' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::GW' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::PAN' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::AIJ' },
      { branch: 'internal_medicine', sourceTag: 'Medicina-Interna::Reumatología::ACG' },
    ];

    const grouped = deckTopicsGrouped({ notes });
    expect(grouped).toHaveLength(1);

    const reuma = grouped[0];
    expect(reuma).toBeDefined();
    if (!reuma) throw new Error('reuma missing');
    // No hay recorte a 6 (como hacía antes topTopics.slice(0, 6))
    expect(reuma.topics.length).toBe(10);

    // Sin duplicados (AR aparecía dos veces pero es un solo tema con count = 2)
    const arTopic = reuma.topics.find((t) => t.name === 'Artritis reumatoide');
    expect(arTopic).toBeDefined();
    if (!arTopic) throw new Error('arTopic missing');
    expect(arTopic.count).toBe(2);

    // Todos los nombres ordenados en español
    const topicNames = reuma.topics.map((t) => t.name);
    const sortedCopy = [...topicNames].sort((a, b) => SPANISH_COLLATOR.compare(a, b));
    expect(topicNames).toEqual(sortedCopy);
  });
});
