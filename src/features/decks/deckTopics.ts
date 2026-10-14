// Temas de cada mazo (comentario 8 de PLAN_DEL_CAMBIO.md).
// Cada mazo en Repasar y en Mazos muestra su rama y debajo todos sus temas,
// en orden alfabético del español (Intl.Collator con es-MX, sin distinguir acentos),
// sin repetidos y sin recortes. Si un mazo tiene varias ramas, se agrupa por rama.
import { topicTaxonomy } from '@/demo/content';
import { displayTopicName } from '@/demo/content/topicDisplayNames';

/** Colacionador del español de México, numérico e insensible a acentos/mayúsculas */
export const SPANISH_COLLATOR = new Intl.Collator('es-MX', {
  sensitivity: 'base',
  numeric: true,
});

export interface DeckTopicItem {
  key: string;
  name: string;
  count: number;
}

export interface DeckBranchGroup {
  branchKey: string;
  branchName: string;
  topics: DeckTopicItem[];
}

/** Nombre legible de una rama troncal por su clave o valor original */
export function branchName(branchKey: string): string {
  const branch = topicTaxonomy.branches.find((b) => b.key === branchKey);
  if (branch) return branch.name;
  return displayTopicName(branchKey);
}

interface NoteLike {
  branch?: string | null;
  topic?: string | null;
  sourceTag?: string | null;
  tags?: readonly string[];
}

/**
 * Traduce una clave o etiqueta técnica a su nombre legible en español.
 * Primero consulta el diccionario médico de Paco, luego la taxonomía oficial del ENARM.
 */
export function humanizeTopic(raw: string): string {
  if (!raw) return 'General';
  // Revisar si existe en la taxonomía ENARM por clave directa
  const taxonomyTopic = topicTaxonomy.branches
    .flatMap((b) => b.topics)
    .find((t) => t.key === raw);
  if (taxonomyTopic) return taxonomyTopic.name;

  const taxonomyBranch = topicTaxonomy.branches.find((b) => b.key === raw);
  if (taxonomyBranch) return taxonomyBranch.name;

  // Revisar en el diccionario de visualización de Paco
  return displayTopicName(raw);
}

/**
 * Extrae la información de rama y tema (clave y nombre legible) de una nota.
 */
export function extractNoteTopicInfo(
  note: NoteLike,
  deckKey?: string,
): { topicKey: string; topicName: string; branchKey: string; branchName: string } {
  // 1. Determinar la rama de la nota
  let bKey = note.branch;
  if (!bKey && note.sourceTag) {
    const parts = note.sourceTag.split('::');
    if (parts.length > 1) {
      bKey = parts[0];
    }
  }
  if (!bKey && deckKey) {
    if (deckKey.includes('mi')) bKey = 'internal_medicine';
    else if (deckKey.includes('gyo')) bKey = 'obstetrics_gynecology';
    else if (deckKey.includes('urgencias')) bKey = 'emergency_medicine';
    else bKey = 'general';
  }
  const branchKey = bKey ?? 'general';

  // 2. Determinar el tema de la nota
  let rawTopic: string | null = null;
  if (note.sourceTag) {
    const parts = note.sourceTag.split('::');
    if (parts.length >= 3) {
      rawTopic = parts.slice(2).join('::');
    } else if (parts.length === 2) {
      rawTopic = parts[1] ?? null;
    }
  }
  if (!rawTopic && note.topic) {
    rawTopic = note.topic;
  }
  if (!rawTopic && note.tags && note.tags.length > 0) {
    rawTopic = note.tags[note.tags.length - 1] ?? null;
  }
  const topicKey = rawTopic ?? 'General';
  const topicDisplayName = humanizeTopic(topicKey);

  return {
    branchKey,
    branchName: branchName(branchKey),
    topicKey,
    topicName: topicDisplayName,
  };
}

/**
 * Extrae todos los temas de un archivo o notas de mazo y los agrupa por rama.
 * Los temas quedan ordenados alfabéticamente en español, sin repetidos y sin recortes.
 */
export function deckTopicsGrouped(
  deck: { key?: string; notes: readonly NoteLike[] },
): DeckBranchGroup[] {
  // Map: branchKey -> Map: topicName -> DeckTopicItem
  const branches = new Map<string, Map<string, DeckTopicItem>>();

  for (const note of deck.notes) {
    const { branchKey, topicKey, topicName } = extractNoteTopicInfo(note, deck.key);

    let topicsMap = branches.get(branchKey);
    if (!topicsMap) {
      topicsMap = new Map();
      branches.set(branchKey, topicsMap);
    }
    const existing = topicsMap.get(topicName);
    if (existing) {
      existing.count += 1;
    } else {
      topicsMap.set(topicName, {
        key: topicKey,
        name: topicName,
        count: 1,
      });
    }
  }

  const groups: DeckBranchGroup[] = [];
  for (const [branchKey, topicsMap] of branches) {
    const topics = Array.from(topicsMap.values()).sort((a, b) =>
      SPANISH_COLLATOR.compare(a.name, b.name),
    );
    groups.push({
      branchKey,
      branchName: branchName(branchKey),
      topics,
    });
  }

  // Ordenar las ramas alfabéticamente
  groups.sort((a, b) => SPANISH_COLLATOR.compare(a.branchName, b.branchName));
  return groups;
}

/** Lista plana de todos los temas sin recortes, ordenada alfabéticamente en español */
export function allDeckTopics(
  deck: { key?: string; notes: readonly NoteLike[] },
): { key: string; name: string; count: number; branchKey: string; branchName: string }[] {
  const grouped = deckTopicsGrouped(deck);
  const flat: { key: string; name: string; count: number; branchKey: string; branchName: string }[] = [];
  for (const group of grouped) {
    for (const item of group.topics) {
      flat.push({
        ...item,
        branchKey: group.branchKey,
        branchName: group.branchName,
      });
    }
  }
  return flat.sort((a, b) => SPANISH_COLLATOR.compare(a.name, b.name));
}
