// Registro de las 26 pantallas de la sección 10, más Configuración (D-065), Usuarios (D-070) y
// Explorar (D-085), con su ruta, área y fase.
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
  'planner',
  'party',
  'profile',
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
] as const;

export type ScreenKey = (typeof SCREEN_KEYS)[number];

export interface ScreenDef {
  /** Número de la pantalla en la sección 10 de la especificación */
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
  planner: { number: 13, path: '/planificador', area: 'student', phase: 'C' },
  party: { number: 14, path: '/party', area: 'student', phase: 'C' },
  profile: { number: 15, path: '/perfil', area: 'shared', phase: 'C' },
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
  // Configuración separada de Perfil por decisión de Ricardo (D-065)
  settings: { number: 27, path: '/configuracion', area: 'shared', phase: 'C' },
  // Usuarios, roles y asignaciones a médicos (D-070)
  adminUsers: { number: 28, path: '/admin/usuarios', area: 'admin', phase: 'C' },
  // Explorar tarjetas, tercera pestaña de Repasar y Mazos (D-085)
  explore: { number: 29, path: '/mazos/explorar', area: 'student', phase: 'C' },
};

export function screenPath(key: ScreenKey): string {
  return SCREENS[key].path;
}
