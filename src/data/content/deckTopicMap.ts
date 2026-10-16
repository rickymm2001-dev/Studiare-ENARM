// Rama y tema de la taxonomía para cada submazo de un mazo de Anki (B11, 4.8 del plan de B11). Las
// tablas de los mazos de Paco viven aquí para usarlas en los dos lados, en el script que arma los mazos
// de la demo (scripts/content/import-paco-decks.ts) y en el Catálogo de mazos del admin, que propone la
// rama y el tema de cada submazo por su nombre y deja que el admin los corrija. Sin dependencias, para
// que Node lo importe sin el alias @ ni JSON.

export interface DeckBranchTopic {
  branch: string | null;
  topic: string | null;
}

/** Submazos del mazo de Medicina interna de Paco en la taxonomía */
export const PACO_MI_TOPICS: Readonly<Record<string, string>> = {
  Gastroenterología: 'gastroenterology',
  Hematología: 'hematology',
  Infectología: 'infectious_diseases',
  Nefrología: 'nephrology',
  Neumología: 'pulmonology',
  Neurología: 'neurology',
  Reumatología: 'rheumatology',
};

// Subtemas del mazo de Ginecología y obstetricia en la taxonomía. Juicio de Claude, por revisar
export const PACO_GYO_TOPICS: Readonly<Record<string, string | null>> = {
  Amenorreas: 'reproductive_endocrinology',
  AnticonceptivosyMPF: 'contraception',
  Infectología: 'gynecologic_infections',
  Infertilidad: 'reproductive_endocrinology',
  Menopausia: 'reproductive_endocrinology',
  Oncología: 'gynecologic_oncology',
  Patología_Mamaria: 'gynecologic_oncology',
  SUA: 'reproductive_endocrinology',
  Torsion_Ovarica: null,
  APP: 'labor_delivery',
  Cesárea: 'labor_delivery',
  Control_Prenatal: 'prenatal_care',
  Corioamnionitis: 'labor_delivery',
  DG: 'prenatal_care',
  Distocias: 'labor_delivery',
  Embarazo_Multiple: 'prenatal_care',
  Enfermedades_Hipertensivas: 'hypertensive_pregnancy',
  Hemorragias1T: 'early_pregnancy',
  Hemorragias3T: 'obstetric_hemorrhage',
  HigadoGraso: null,
  'Induccion/Conduccion': 'labor_delivery',
  Misceláneos: null,
  'Oligo/Polihidramnios': 'prenatal_care',
  Parto_Normal: 'labor_delivery',
  Patologia_Puerperal: 'puerperium',
  Puerperio: 'puerperium',
  RPM: 'labor_delivery',
};

export interface PacoDeckConfig {
  key: string;
  name: string;
  description: string;
  /** Raíces de etiqueta que pertenecen a este mazo */
  roots: readonly string[];
  branchOf: (segments: readonly string[]) => DeckBranchTopic;
}

/** Los mazos de Paco de la demo, con la rama y el tema de cada submazo (D-053) */
export const PACO_DECKS: readonly PacoDeckConfig[] = [
  {
    key: 'paco-mi',
    name: 'Medicina interna (Paco)',
    description:
      'Mazo de Paco, compartido con su autorización. Demostración, no validado por médicos.',
    roots: ['Medicina-Interna'],
    branchOf: (segments) => ({
      branch: 'internal_medicine',
      topic: PACO_MI_TOPICS[segments[1] ?? ''] ?? null,
    }),
  },
  {
    key: 'paco-gyo',
    name: 'Ginecología y obstetricia (Paco)',
    description:
      'Mazo de Paco, compartido con su autorización. Demostración, no validado por médicos.',
    roots: ['Ginecología', 'Obstetricia'],
    branchOf: (segments) => ({
      branch: 'obstetrics_gynecology',
      topic: PACO_GYO_TOPICS[segments[1] ?? ''] ?? null,
    }),
  },
  {
    key: 'paco-urgencias',
    name: 'Urgencias (Paco)',
    description:
      'Mazo de Paco, compartido con su autorización. Urgencias no es rama de la taxonomía todavía (D-013). Demostración, no validado por médicos.',
    roots: ['Urgencias'],
    branchOf: (segments) =>
      segments[1] === 'Quemaduras'
        ? { branch: 'general_surgery', topic: 'burns' }
        : { branch: null, topic: null },
  },
];

/** Las ramas y temas que se pueden proponer, con sus nombres */
export interface TaxonomyNames {
  branches: readonly {
    key: string;
    name: string;
    /** clinical o english. Sin el campo es clinical */
    section?: string | undefined;
    topics: readonly { key: string; name: string }[];
  }[];
}

/** El tema de los submazos del mazo de vocabulario médico en inglés (B13), que viven en Inglés médico */
export const VOCABULARY_TOPIC = 'medical_vocabulary';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * La rama y el tema que se proponen para un submazo. Primero las tablas de Paco por la raíz y el
 * submazo de la etiqueta, después el nombre del submazo contra los nombres de los temas, dentro de la
 * rama si ya se sabe. Los submazos de un mazo de Inglés médico son del tema de vocabulario. null en lo
 * que no se encuentra. El admin siempre revisa la propuesta
 */
export function proposeDeckTopic(
  segments: readonly string[],
  taxonomy: TaxonomyNames,
): DeckBranchTopic {
  const root = segments[0] ?? '';
  const paco = PACO_DECKS.find((deck) => deck.roots.includes(root));
  if (paco) {
    const known = paco.branchOf(segments);
    if (known.topic !== null || known.branch === null) return known;
  }
  const subject = normalize(segments[1] ?? root);
  const rootName = normalize(root);
  const branch =
    (paco ? paco.branchOf(segments).branch : null) ??
    taxonomy.branches.find((item) => normalize(item.name) === rootName)?.key ??
    null;
  const candidates = taxonomy.branches.filter((item) => branch === null || item.key === branch);
  for (const item of candidates) {
    const topic = item.topics.find((entry) => {
      const name = normalize(entry.name);
      return (
        subject !== '' && (name === subject || name.startsWith(subject) || subject.startsWith(name))
      );
    });
    if (topic) return { branch: item.key, topic: topic.key };
  }
  // Un mazo cuyo primer nivel es Inglés médico es el de vocabulario, y todos sus submazos son de ese tema.
  // Es solo una propuesta que el admin revisa. De quién es el mazo no sale de aquí: la fuente de MedlinePlus
  // se reconoce por la clave o por el autor del mazo (deckSource.ts), así el mazo de un tercero que cae en
  // este mismo tema conserva su crédito
  const english = taxonomy.branches.find(
    (item) => item.key === branch && item.section === 'english',
  );
  if (english?.topics.some((entry) => entry.key === VOCABULARY_TOPIC))
    return { branch, topic: VOCABULARY_TOPIC };
  return { branch, topic: null };
}
