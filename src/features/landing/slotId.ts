// El id de un lugar de texto de la portada. Va aparte de slots.ts, que trae las reglas del texto ajeno, para
// que la portada pueda marcar sus elementos sin cargar esas reglas (solo las pruebas y la vista previa
// las bajan).

/** El id de un lugar numerado. slotId('features.N.title', 2) es features.2.title */
export function slotId(family: string, position?: number): string {
  return position === undefined ? family : family.replace('N', String(position));
}
