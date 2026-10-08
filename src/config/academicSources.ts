// Lista cerrada de textos académicos fundamentales del ENARM (Fase C2, Etapa 5, D-085 y D-091). La IA
// solo puede apoyar una señal de controversia en estos textos y nunca en otro. Es una lista
// PROVISIONAL que Ricardo o un médico deben confirmar. Este archivo no importa nada, así lo leen
// igual la app y el proxy de IA.
export interface AcademicSource {
  /** Identificador estable que viaja entre la app y el proxy */
  id: string;
  /** Nombre como se muestra al alumno */
  title: string;
  /** Área donde suele ser la referencia */
  area: string;
}

export const ACADEMIC_SOURCES_PROVISIONAL = true;

export const ACADEMIC_SOURCES: readonly AcademicSource[] = [
  { id: 'harrison', title: 'Harrison. Principios de Medicina Interna', area: 'Medicina interna' },
  { id: 'williams', title: 'Williams. Obstetricia', area: 'Ginecología y obstetricia' },
  { id: 'nelson', title: 'Nelson. Tratado de Pediatría', area: 'Pediatría' },
  { id: 'schwartz', title: 'Schwartz. Principios de Cirugía', area: 'Cirugía' },
  { id: 'guyton', title: 'Guyton y Hall. Tratado de Fisiología Médica', area: 'Ciencias básicas' },
  {
    id: 'robbins',
    title: 'Robbins y Cotran. Patología estructural y funcional',
    area: 'Ciencias básicas',
  },
  { id: 'katzung', title: 'Katzung. Farmacología básica y clínica', area: 'Farmacología' },
  {
    id: 'gpc_cenetec',
    title: 'Guías de Práctica Clínica del CENETEC vigentes',
    area: 'Guías mexicanas',
  },
  {
    id: 'nom',
    title: 'Normas Oficiales Mexicanas de la Secretaría de Salud vigentes',
    area: 'Normas mexicanas',
  },
] as const;

const IDS: ReadonlySet<string> = new Set(ACADEMIC_SOURCES.map((source) => source.id));

/** Si el id pertenece a la lista cerrada */
export function isAcademicSourceId(id: string): boolean {
  return IDS.has(id);
}

/** El nombre de un texto de la lista, o null si no está en ella */
export function academicSourceTitle(id: string): string | null {
  return ACADEMIC_SOURCES.find((source) => source.id === id)?.title ?? null;
}
