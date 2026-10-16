// Registro de las pantallas de la sección 10, más Configuración (D-065), Usuarios (D-070),
// Explorar (D-085), Apuntes (D-092), el aviso de privacidad y los términos (Fase G), Admin, Pagos
// (B10) y las tres del banco en la nube del admin (B11) y la Auditoría de la IA (B12), con su ruta, área y fase. Planificador, Perfil y Logros se quitaron en B3 del plan del cambio
// (comentarios 6, 13 y 14) y sus rutas llevan a donde quedó lo suyo.
// Es solo datos. Lo usan el router, la navegación y la prueba de humo que recorre cada ruta.
// Las rutas visibles van en español y las claves en inglés (D-035).

export type Phase = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Quién puede abrir la pantalla. physician deja pasar a médico y admin, admin solo a admin */
export type ScreenArea = 'student' | 'physician' | 'admin' | 'shared';

export const SCREEN_KEYS = [
  'onboarding',
  'home',
  'review',
  'question',
  'feedback',
  'sessionSummary',
  'simulatorSetup',
  'exam',
  'examResults',
  'progress',
  'tutor',
  'decks',
  'party',
  'subscription',
  'questionBank',
  'questionEditor',
  'agreement',
  'aiDrafts',
  'contentReports',
  'bankImport',
  'aiCosts',
  'demoData',
  'adminSettings',
  'roleSelector',
  'settings',
  'adminUsers',
  'explore',
  'outlines',
  'privacyNotice',
  'terms',
  'adminBilling',
  'bankAdmin',
  'physicianReviews',
  'deckCatalogAdmin',
  'aiAudit',
] as const;

export type ScreenKey = (typeof SCREEN_KEYS)[number];

export interface ScreenDef {
  /** Número de la pantalla en la sección 10 de la especificación. No se reusa al quitar una */
  number: number;
  path: string;
  area: ScreenArea;
  /** Fase en la que la pantalla deja de ser esqueleto */
  phase: Phase;
}

export const SCREENS: Record<ScreenKey, ScreenDef> = {
  onboarding: { number: 1, path: '/bienvenida', area: 'student', phase: 'C' },
  home: { number: 2, path: '/', area: 'student', phase: 'C' },
  review: { number: 3, path: '/repasar', area: 'student', phase: 'C' },
  question: { number: 4, path: '/simular/pregunta', area: 'student', phase: 'C' },
  feedback: { number: 5, path: '/simular/retroalimentacion', area: 'student', phase: 'C' },
  sessionSummary: { number: 6, path: '/sesion/resumen', area: 'student', phase: 'C' },
  simulatorSetup: { number: 7, path: '/simular', area: 'student', phase: 'C' },
  exam: { number: 8, path: '/simular/examen', area: 'student', phase: 'C' },
  examResults: { number: 9, path: '/simular/examen/resultados', area: 'student', phase: 'C' },
  progress: { number: 10, path: '/progreso', area: 'student', phase: 'C' },
  tutor: { number: 11, path: '/tutor', area: 'student', phase: 'C' },
  decks: { number: 12, path: '/mazos', area: 'student', phase: 'C' },
  party: { number: 14, path: '/party', area: 'student', phase: 'C' },
  subscription: { number: 16, path: '/suscripcion', area: 'student', phase: 'E' },
  questionBank: { number: 17, path: '/medico/banco', area: 'physician', phase: 'E' },
  questionEditor: { number: 18, path: '/medico/editor', area: 'physician', phase: 'E' },
  agreement: { number: 19, path: '/medico/acuerdo', area: 'physician', phase: 'E' },
  aiDrafts: { number: 20, path: '/medico/borradores', area: 'physician', phase: 'E' },
  contentReports: { number: 21, path: '/medico/reportes', area: 'physician', phase: 'E' },
  bankImport: { number: 22, path: '/medico/importar', area: 'physician', phase: 'E' },
  aiCosts: { number: 23, path: '/admin/costos', area: 'admin', phase: 'D' },
  demoData: { number: 24, path: '/admin/demo', area: 'admin', phase: 'D' },
  adminSettings: { number: 25, path: '/admin/configuracion', area: 'admin', phase: 'D' },
  roleSelector: { number: 26, path: '/rol', area: 'shared', phase: 'A' },
  // Configuración (D-065). Desde B3 también es el Perfil, en una sola página (comentarios 5 y 6)
  settings: { number: 27, path: '/configuracion', area: 'shared', phase: 'C' },
  // Usuarios, roles y asignaciones a médicos (D-070)
  adminUsers: { number: 28, path: '/admin/usuarios', area: 'admin', phase: 'C' },
  // Buscar tarjetas, antes Explorar, tercera pestaña de Repasar y Mazos (D-085, B4 del plan del cambio)
  explore: { number: 29, path: '/mazos/explorar', area: 'student', phase: 'C' },
  // Apuntes en esquema que se vuelven tarjetas (D-092). Con su lugar en el menú (comentario 12)
  outlines: { number: 30, path: '/apuntes', area: 'student', phase: 'C' },
  // Aviso de privacidad y términos, públicos y sin sesión (Fase G, G2)
  privacyNotice: { number: 32, path: '/privacidad', area: 'shared', phase: 'F' },
  terms: { number: 33, path: '/terminos', area: 'shared', phase: 'F' },
  // Admin, Pagos (B10 del plan del cambio, 3.3)
  adminBilling: { number: 34, path: '/admin/pagos', area: 'admin', phase: 'E' },
  // Banco en la nube (B11, 4.3 del plan de B11). Banco y Sheet, revisiones para pagar a los médicos y
  // el catálogo compartido de mazos
  bankAdmin: { number: 35, path: '/admin/banco', area: 'admin', phase: 'E' },
  physicianReviews: { number: 36, path: '/admin/revisiones', area: 'admin', phase: 'E' },
  deckCatalogAdmin: { number: 37, path: '/admin/mazos', area: 'admin', phase: 'E' },
  // Auditoría de la IA (B12, 5.3). La compuerta 1 de la IA, para los dos médicos y el administrador
  aiAudit: { number: 38, path: '/medico/auditoria-ia', area: 'physician', phase: 'E' },
};

export function screenPath(key: ScreenKey): string {
  return SCREENS[key].path;
}

/**
 * Rutas de pantallas que ya no existen y la pantalla a la que llevan, para no romper enlaces
 * guardados ni marcadores (B3 del plan del cambio). Perfil vive en Configuración, y lo que servía
 * del planificador pasó a Progreso. Logros se quitó y Progreso es lo más cercano
 */
export const LEGACY_REDIRECTS: Readonly<Record<string, ScreenKey>> = {
  '/perfil': 'settings',
  '/planificador': 'progress',
  '/logros': 'progress',
};
