// Textos académicos fundamentales del ENARM (D-085). Cuando la IA marca una controversia en una
// tarjeta generada, su explicación solo puede apoyarse en estos textos, nunca en otra cosa. La lista
// es cerrada y por ahora provisional. La confirma Ricardo o un médico, y agregar un texto es agregar
// una fila aquí. La IA nunca corrige la tarjeta por su cuenta, solo la señala con una de estas fuentes.

export const ACADEMIC_SOURCES = [
  {
    key: 'harrison',
    name: 'Harrison. Principios de Medicina Interna',
    branch: 'internal_medicine',
  },
  { key: 'cecil', name: 'Cecil. Tratado de Medicina Interna', branch: 'internal_medicine' },
  { key: 'nelson', name: 'Nelson. Tratado de Pediatría', branch: 'pediatrics' },
  { key: 'williams', name: 'Williams. Obstetricia', branch: 'obstetrics_gynecology' },
  { key: 'berek', name: 'Berek y Novak. Ginecología', branch: 'obstetrics_gynecology' },
  { key: 'schwartz', name: 'Schwartz. Principios de Cirugía', branch: 'general_surgery' },
  { key: 'sabiston', name: 'Sabiston. Tratado de Cirugía', branch: 'general_surgery' },
  { key: 'tintinalli', name: 'Tintinalli. Medicina de Urgencias', branch: 'emergency_medicine' },
  {
    key: 'gpc_cenetec',
    name: 'Guías de Práctica Clínica del CENETEC',
    branch: null,
  },
  {
    key: 'nom',
    name: 'Normas Oficiales Mexicanas de la Secretaría de Salud',
    branch: null,
  },
  // Ciencias básicas, que sumó el contrato de tarjetas de la Etapa 5 (D-100)
  { key: 'guyton', name: 'Guyton y Hall. Tratado de Fisiología Médica', branch: null },
  {
    key: 'robbins',
    name: 'Robbins y Cotran. Patología estructural y funcional',
    branch: null,
  },
  { key: 'katzung', name: 'Katzung. Farmacología básica y clínica', branch: null },
] as const;

export type AcademicSourceKey = (typeof ACADEMIC_SOURCES)[number]['key'];

export const ACADEMIC_SOURCE_KEYS = ACADEMIC_SOURCES.map((source) => source.key) as [
  AcademicSourceKey,
  ...AcademicSourceKey[],
];

export function academicSourceName(key: string): string {
  return ACADEMIC_SOURCES.find((source) => source.key === key)?.name ?? key;
}

/** Si la clave pertenece a la lista cerrada */
export function isAcademicSourceId(id: string): boolean {
  return ACADEMIC_SOURCES.some((source) => source.key === id);
}

/** El nombre de un texto de la lista, o null si no está en ella */
export function academicSourceTitle(id: string): string | null {
  return ACADEMIC_SOURCES.find((source) => source.key === id)?.name ?? null;
}
