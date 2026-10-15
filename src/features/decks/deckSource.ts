// La fuente de un mazo precargado (B13, 4.2 y 4.4 del plan de B13). Los mazos de Paco se comparten con su
// autorización y dicen De quién son. El mazo de vocabulario médico en inglés se arma con los temas de
// salud de MedlinePlus.gov, de la Biblioteca Nacional de Medicina de EE. UU. (NLM), que son de dominio
// público, y NLM pide decir que la información viene de MedlinePlus.gov. Ese mazo no se comparte con
// autorización de nadie, así que dice su fuente y su licencia en lugar del crédito de un autor. Lo mismo
// vale para el mazo de la demo y para el del catálogo de la nube. Funciones puras.
import { branchSection } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';

/** De dónde sale la información de un mazo y con qué licencia se puede usar */
export interface DeckSource {
  name: string;
  license: string;
}

/** La clave del mazo de vocabulario, la que escribe el script y la que lleva en el catálogo */
export const VOCABULARY_DECK_KEY = 'vocabulario-ingles';

/** El tema de la taxonomía de los submazos del vocabulario. Una prueba revisa que exista */
export const VOCABULARY_TOPIC = 'medical_vocabulary';

export const MEDLINEPLUS_SOURCE: DeckSource = {
  name: 'MedlinePlus.gov (NLM)',
  license: 'Dominio público',
};

const englishBranches = new Set(
  topicTaxonomy.branches.filter((branch) => branchSection(branch) === 'english').map((b) => b.key),
);

/**
 * Lo que se sabe de un mazo para decir su fuente. Las ramas y los temas son los de sus notas, en el mazo de
 * la demo, o los de sus materias, en el catálogo de la nube. null en un tema o una rama sin asignar
 */
export interface DeckSourceInput {
  key: string;
  branches: readonly (string | null)[];
  topics: readonly (string | null)[];
}

/** Si todas las ramas del mazo son de Inglés médico, como las del vocabulario */
export function isEnglishDeck(deck: Pick<DeckSourceInput, 'branches'>): boolean {
  const known = deck.branches.filter((branch): branch is string => branch !== null);
  return known.length > 0 && known.every((branch) => englishBranches.has(branch));
}

/**
 * La fuente del mazo, o null si es un mazo compartido con autorización, que dice su autor. El mazo de
 * vocabulario se reconoce por su clave o porque todos sus temas son los del vocabulario. Si Ricardo lo sube
 * al catálogo con otra clave y el tema asignado, sigue diciendo su fuente
 */
export function deckSourceOf(deck: DeckSourceInput): DeckSource | null {
  const known = deck.topics.filter((topic): topic is string => topic !== null);
  const vocabulary =
    deck.key === VOCABULARY_DECK_KEY ||
    (known.length > 0 && known.every((topic) => topic === VOCABULARY_TOPIC));
  return vocabulary ? MEDLINEPLUS_SOURCE : null;
}
