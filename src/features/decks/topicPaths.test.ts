// La ruta de temas de cada tarjeta y los temas completos de los mazos de Paco (B4 del plan del
// cambio, comentario 8). Reumatología lleva Artritis reumatoide y Lupus eritematoso sistémico, como
// en el ejemplo de Ricardo, y Ginecología y obstetricia se agrupa en sus dos ramas.
import { describe, expect, it } from 'vitest';
import type { Deck } from '@/data/schemas/decks';
import { TOPIC_TAG_PREFIX } from '@/data/usecases/errorCards';
import { deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { loadDemoDecks } from '@/demo/content/decks';
import { compareTopicNames, topicNamesAt } from '@/engines/deckTopics';
import {
  catalogTopicOutline,
  catalogTopicPath,
  deckTopicOutlines,
  noteTopicPath,
} from './topicPaths';

const files = await loadDemoDecks();
const fileOf = (key: string) => {
  const file = files.find((entry) => entry.key === key);
  if (!file) throw new Error(key);
  return file;
};

describe('ruta de temas de una tarjeta', () => {
  it('en los mazos de Paco sale de la etiqueta, con nombres legibles', () => {
    expect(catalogTopicPath({ sourceTag: 'Medicina-Interna::Reumatología::AR' })).toEqual([
      'Medicina interna',
      'Reumatología',
      'Artritis reumatoide',
    ]);
    expect(
      noteTopicPath(
        { tags: ['Ginecología::AnticonceptivosyMPF::DIU::Cobre'], origin: 'preloaded' },
        ['Anticonceptivos y métodos de planificación familiar'],
      ),
    ).toEqual([
      'Ginecología',
      'Anticonceptivos y métodos de planificación familiar',
      'Dispositivo intrauterino',
      'DIU de cobre',
    ]);
  });

  it('en Mis errores sale de las claves de rama y tema de la taxonomía', () => {
    expect(
      noteTopicPath({ tags: [`${TOPIC_TAG_PREFIX}rheumatology`], origin: 'generated' }, []),
    ).toEqual(['Medicina interna', 'Reumatología']);
    expect(
      noteTopicPath({ tags: [`${TOPIC_TAG_PREFIX}no-existe`], origin: 'generated' }, []),
    ).toEqual([]);
  });

  it('en los importados y propios sale del submazo o, sin submazo, de la etiqueta', () => {
    expect(
      noteTopicPath({ tags: ['Otra::Cosa'], origin: 'imported' }, ['Cardiología', 'Arritmias']),
    ).toEqual(['Cardiología', 'Arritmias']);
    expect(
      noteTopicPath({ tags: ['alto_rendimiento', 'Cardio::Arritmias'], origin: 'imported' }, []),
    ).toEqual(['Cardio', 'Arritmias']);
    expect(noteTopicPath({ tags: ['alto_rendimiento'], origin: 'manual' }, [])).toEqual([
      'alto rendimiento',
    ]);
    expect(noteTopicPath({ tags: [], origin: 'manual' }, [])).toEqual([]);
  });

  it('la tabla de Paco no renombra los niveles de un mazo importado o propio', () => {
    // Primarias es Amenorreas primarias solo en los mazos de Paco
    expect(
      noteTopicPath({ tags: ['Neurología::Cefaleas::Primarias'], origin: 'imported' }, []),
    ).toEqual(['Neurología', 'Cefaleas', 'Primarias']);
    expect(noteTopicPath({ tags: ['Hematología::Linfoma::LH'], origin: 'manual' }, [])).toEqual([
      'Hematología',
      'Linfoma',
      'LH',
    ]);
    expect(
      noteTopicPath({ tags: ['Medicina-Interna::Reumatología::AR'], origin: 'generated' }, []),
    ).toEqual(['Medicina-Interna', 'Reumatología', 'AR']);
    // Solo los guiones bajos vuelven a ser espacios
    expect(
      noteTopicPath({ tags: ['Cardio_Pediátrica::Soplos_inocentes'], origin: 'imported' }, []),
    ).toEqual(['Cardio Pediátrica', 'Soplos inocentes']);
  });

  it('en una nota precargada y en el catálogo sí se aplica, en todos los niveles', () => {
    expect(
      noteTopicPath({ tags: ['Ginecología::Amenorreas::Primarias::HSC'], origin: 'preloaded' }, [
        'Amenorreas',
      ]),
    ).toEqual([
      'Ginecología',
      'Amenorreas',
      'Amenorreas primarias',
      'Hiperplasia suprarrenal congénita',
    ]);
    expect(catalogTopicPath({ sourceTag: 'Medicina-Interna::Hematología::Linfoma::LH' })).toEqual([
      'Medicina interna',
      'Hematología',
      'Linfomas',
      'Linfoma de Hodgkin',
    ]);
  });
});

describe('temas completos de los mazos de Paco', () => {
  it('Reumatología dice todos sus temas en orden alfabético, como pidió Ricardo', () => {
    const outline = catalogTopicOutline(fileOf('paco-mi').notes);
    expect(outline.branches.map((branch) => branch.name)).toEqual(['Medicina interna']);
    const subjects = outline.branches[0]?.children ?? [];
    expect(subjects.map((subject) => subject.name)).toEqual([
      'Gastroenterología',
      'Hematología',
      'Infectología',
      'Nefrología',
      'Neumología',
      'Neurología',
      'Reumatología',
    ]);
    const rheumatology = subjects.find((subject) => subject.name === 'Reumatología');
    const topics = rheumatology?.children.map((topic) => topic.name) ?? [];
    expect(topics).toContain('Artritis reumatoide');
    expect(topics).toContain('Lupus eritematoso sistémico');
    expect(topics.indexOf('Artritis reumatoide')).toBeLessThan(
      topics.indexOf('Lupus eritematoso sistémico'),
    );
    // Los 15 temas de Reumatología, sin repetidos y en orden
    expect(topics).toHaveLength(15);
    expect([...topics].sort(compareTopicNames)).toEqual(topics);
    // Todas las tarjetas tienen su lugar, salvo la que solo dice la rama
    expect(outline.leaves).toBe(51);
    expect(outline.untagged).toBe(0);
  });

  it('Ginecología y obstetricia se agrupa en sus dos ramas, sin nombres pegados', () => {
    const outline = catalogTopicOutline(fileOf('paco-gyo').notes);
    expect(outline.branches.map((branch) => branch.name)).toEqual(['Ginecología', 'Obstetricia']);
    const subjects = topicNamesAt(outline, 1);
    expect(subjects).toContain('Anticonceptivos y métodos de planificación familiar');
    expect(subjects).toContain('Hemorragias del primer trimestre');
    expect(subjects).not.toContain('AnticonceptivosyMPF');
    expect(subjects.some((name) => /_|\p{Ll}\p{Lu}|\d/u.test(name))).toBe(false);
  });

  it('cuenta todos los temas de cada mazo sin recortar ninguno', () => {
    for (const file of files) {
      const outline = catalogTopicOutline(file.notes);
      const thirdLevel = new Set(
        file.notes
          .map((note) => catalogTopicPath(note)[2])
          .filter((name): name is string => name !== undefined),
      );
      expect(topicNamesAt(outline, 2).length, file.key).toBe(thirdLevel.size);
    }
  });
});

describe('temas por mazo con las tarjetas guardadas', () => {
  it('agrupa por el mazo que se elige y no por la raíz ENARM 2027', () => {
    const root = deckIds.deck(ROOT_DECK_KEY);
    const deck = (id: string, name: string, parentId: string | null): Deck => ({
      id,
      name,
      parentId,
      description: '',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      isDemo: true,
      createdAt: '2026-10-01T00:00:00.000Z',
    });
    const branch = deckIds.deck('paco-urgencias');
    const subject = deckIds.subject('paco-urgencias', 'Toxíndromes');
    const decks = [
      deck(root, 'ENARM 2027', null),
      deck(branch, 'Urgencias (Paco)', root),
      deck(subject, 'Toxíndromes', branch),
    ];
    const notes = new Map([
      ['n1', { tags: ['Urgencias::Toxíndromes::Opiáceo'], origin: 'preloaded' as const }],
      ['n2', { tags: ['Urgencias::Toxíndromes::Etanol'], origin: 'preloaded' as const }],
    ]);
    const outlines = deckTopicOutlines({
      decks,
      notes,
      cards: [
        { deckId: subject, noteId: 'n1' },
        { deckId: subject, noteId: 'n2' },
        { deckId: subject, noteId: 'falta' },
      ],
    });
    expect([...outlines.keys()]).toEqual([branch]);
    const outline = outlines.get(branch);
    expect(topicNamesAt(outline ?? { branches: [], leaves: 0, untagged: 0, cards: 0 }, 2)).toEqual([
      'Intoxicación por etanol',
      'Intoxicación por opiáceos',
    ]);
    expect(outline?.untagged).toBe(1);
  });
});
