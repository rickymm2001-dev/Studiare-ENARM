// Topes de seguridad de los apuntes y el tipo de su árbol de líneas (Fase C2, Etapa 3). Viven aparte
// de outline.ts para que el esquema de apuntes, que va en el JavaScript inicial, los use sin cargar el
// motor que lee las marcas y arma las tarjetas. outline.ts los reexporta.

export interface OutlineNode {
  id: string;
  text: string;
  children: OutlineNode[];
}

export const OUTLINE_LIMITS = {
  maxNodes: 2000,
  maxDepth: 8,
  /** Igual que el tope de campo de las tarjetas hechas a mano */
  maxFieldLength: 3000,
  maxCards: 500,
  maxTitleLength: 120,
} as const;

/** Largo máximo del nombre de una materia libre */
export const FREE_SUBJECT_MAX_LENGTH = 80;

/** Cuántas líneas tiene el árbol, para el tope de seguridad */
export function countNodes(nodes: readonly OutlineNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
}

/** Qué tan hondo llega el árbol. Un árbol de una línea tiene profundidad 1 */
export function outlineDepth(nodes: readonly OutlineNode[]): number {
  return nodes.reduce((deepest, node) => Math.max(deepest, 1 + outlineDepth(node.children)), 0);
}
