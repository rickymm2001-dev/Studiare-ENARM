// Todos los textos de la interfaz, en español de México con trato de tú (4.9).
// El código usa claves en inglés y nunca escribe texto visible fuera de este archivo.
import { BRAND } from '@/config/brand';
import type { Phase, ScreenKey } from '@/app/screens';
import { accountsText } from './accounts';
import { cardSearchText } from './cardSearch';
import { examText } from './exam';
import { examReviewText } from './examReview';
import { featureText } from './features';
import { outlineText } from './outlines';
import { partyCloudText } from './partyCloud';
import { qualityText } from './quality';
import { settingsPageText } from './settingsPage';
import { tutorText } from './tutor';
import { vocabularyText } from './vocabulary';
import { weekPlanText } from './weekPlan';
import { b7ExtrasText } from './b7extras';
import { freePlanText } from './freePlan';
import { cloudBankText } from './cloudBank';
import { bankAdminNavText } from './bankAdminNav';

interface ScreenText {
  title: string;
  description: string;
}

const screens: Record<ScreenKey, ScreenText> = {
  onboarding: {
    title: 'Bienvenida',
    description:
      'Tu fecha del ENARM, minutos diarios, ramas, meta diaria, aviso de privacidad y permisos por finalidad.',
  },
  home: {
    title: 'Inicio',
    description: 'Tu tablero de widgets. Agrega, quita, acomoda y configura los que te sirvan.',
  },
  review: {
    title: 'Repasar',
    description:
      'Repaso de tarjetas con repetición espaciada. Marcas tu confianza, calificas y anotas el motivo si fallas.',
  },
  question: {
    title: 'Pregunta',
    description:
      'Caso clínico con opciones, resaltado de negaciones, confianza, temporizador y reporte de error.',
  },
  feedback: {
    title: 'Retroalimentación',
    description:
      'Explicación, por qué atrae la opción que elegiste, el motivo del error y la tarjeta que puedes crear.',
  },
  sessionSummary: {
    title: 'Resumen de sesión',
    description: 'XP, exactitud, tiempo y hallazgos nuevos de la sesión que terminaste.',
  },
  simulatorSetup: {
    title: 'Simular',
    description:
      'Arma un simulador por rama, dificultad, trampa, estructura o mezcla, en práctica o examen completo.',
  },
  exam: {
    title: 'Examen completo',
    description:
      'Examen con navegación, marcar para revisar y tiempo total. La retroalimentación llega al final.',
  },
  examResults: {
    title: 'Resultados del examen',
    description:
      'Resultados por rama, estructura y trampa. Tus errores pasan al repaso y cada pregunta se puede volver tarjeta.',
  },
  progress: {
    title: 'Progreso',
    description:
      'Temas, trampas, estructura, conducta, calibración, dificultad y carga futura, cada uno con su estado.',
  },
  tutor: {
    title: 'Tutor',
    description:
      'Hipótesis sobre tus errores con su evidencia, informe semanal, consejos por trampa y tarjetas en borrador.',
  },
  decks: {
    title: 'Mazos',
    description: 'Mazos precargados que sigues o dejas, los que importas y los que creas a mano.',
  },
  explore: {
    title: 'Buscar tarjetas',
    description:
      'Encuentra cualquier tarjeta al teclear, fíltrala y ábrela al lado para verla o editarla. Suspende, mueve, etiqueta o reinicia varias a la vez.',
  },
  outlines: {
    title: 'Apuntes',
    description:
      'Escribe en esquema y vuelve tarjeta cualquier línea con una marca. Enlaza apuntes entre sí.',
  },
  party: {
    title: 'Party',
    description: 'Grupos con código de invitación, tabla semanal, retos de grupo y duelos.',
  },
  // Su descripción vive en admin.ts, que carga la pantalla (B11)
  adminUsers: { title: 'Usuarios', description: '' },
  settings: {
    title: 'Configuración',
    description: 'Tu perfil y tu plan, cómo se ve la app y tu privacidad, en una sola página.',
  },
  subscription: {
    title: 'Suscripción',
    description: 'Planes y pago simulados. Nada aquí cobra dinero real.',
  },
  // Las pantallas del médico dicen su descripción desde physician.ts, que cargan perezosas, para no
  // pasar del presupuesto del JavaScript inicial (B11)
  questionBank: { title: 'Banco de preguntas', description: '' },
  questionEditor: { title: 'Editor de pregunta', description: '' },
  agreement: { title: 'Acuerdo del etiquetado', description: '' },
  aiDrafts: { title: 'Borradores de IA', description: '' },
  contentReports: { title: 'Reportes de contenido', description: '' },
  bankImport: { title: 'Importar banco', description: '' },
  aiCosts: {
    title: 'Costos de IA',
    description: 'Costo acumulado, costo por motor, proyección por alumno y bitácora de llamadas.',
  },
  demoData: {
    title: 'Datos de demostración',
    description: 'Genera, borra y ajusta alumnos simulados, y regenera al alumno de la demo.',
  },
  // Banco en la nube (B11, 4.3 del plan de B11)
  ...bankAdminNavText.screens,
  adminBilling: {
    title: 'Pagos',
    description:
      'Lugares Fundador, pruebas y pases, solicitudes de factura, códigos de influencer y pagos recientes.',
  },
  adminSettings: { title: 'Configuración', description: '' },
  privacyNotice: {
    title: 'Aviso de privacidad',
    description:
      'Quién trata tus datos, para qué, con quién se comparten y cómo ejerces tus derechos.',
  },
  terms: {
    title: 'Términos y condiciones',
    description: 'Las reglas para usar Studiare, tus planes y tus pagos.',
  },
  roleSelector: {
    title: 'Cambiar de rol',
    description:
      'Sin inicio de sesión en la nube. Elige con qué rol quieres ver la app en este dispositivo.',
  },
};

export const t = {
  ...featureText,
  ...examText,
  ...outlineText,
  ...qualityText,
  ...tutorText,
  ...vocabularyText,
  ...cardSearchText,
  weekPlan: weekPlanText,
  examReview: examReviewText,
  partyCloud: partyCloudText,
  app: {
    name: BRAND.name,
    logoAlt: 'Studiare, ir al inicio',
    skipToContent: 'Saltar al contenido',
    documentTitle: (screenTitle: string) => `${screenTitle} · ${BRAND.name}`,
    aboutScreen: (screenTitle: string) => `Qué hay en ${screenTitle}`,
  },
  nav: {
    label: 'Navegación principal',
    // Título de la hoja que abre Más en el teléfono (4.28 del plan del cambio)
    more: 'Más secciones',
    closeMore: 'Cerrar',
    toggle: 'Menú lateral',
    hide: 'Ocultar el menú lateral',
    show: 'Mostrar el menú lateral',
  },
  studyTabs: {
    label: 'Repasar, mazos y buscar tarjetas',
    review: 'Repasar',
    decks: 'Mazos',
    explore: 'Buscar tarjetas',
  },
  navItems: {
    home: 'Inicio',
    review: 'Repasar',
    outlines: 'Apuntes',
    simulate: 'Simular',
    progress: 'Progreso',
    bank: 'Banco',
    agreement: 'Acuerdo',
    drafts: 'Borradores',
    reports: 'Reportes',
    costs: 'Costos',
    settings: 'Configuración',
    users: 'Usuarios',
    billing: 'Pagos',
    platform: 'Plataforma',
    decks: 'Mazos',
    tutor: 'Tutor',
    party: 'Party',
    more: 'Más',
    admin: 'Administración',
  },
  screens,
  phase: {
    builtIn: (phase: Phase) => `Se construye en la Fase ${phase}`,
    skeleton: (screenNumber: number, total: number) => `Esqueleto · ${screenNumber} de ${total}`,
    allScreens: 'Todas las pantallas del esqueleto',
    comingSoonTitle: 'Próximamente',
    comingSoonBody:
      'Estamos construyendo esta sección. Mientras tanto puedes seguir estudiando con Repasar y Simular.',
  },
  states: {
    previewLabel: 'Vista previa de estados',
    previewOptions: {
      vacio: 'Vacío',
      cargando: 'Cargando',
      error: 'Error',
      'sin-conexion': 'Sin conexión',
      calibrando: 'Calibrando',
    },
    exampleUnit: 'errores etiquetados',
    empty: {
      title: 'Todavía no hay nada aquí',
      description: 'Cuando haya contenido lo verás en esta pantalla.',
    },
    loading: {
      label: 'Cargando',
    },
    error: {
      title: 'Algo salió mal',
      description:
        'No pudimos cargar esta pantalla. Tus datos siguen guardados en este dispositivo.',
      retry: 'Intentar de nuevo',
    },
    offline: {
      title: 'Sin conexión',
      description:
        'Puedes seguir repasando con lo que ya está en este dispositivo. Las funciones de IA necesitan conexión.',
    },
    calibrating: {
      title: 'Calibrando',
      description: 'Esta función necesita más datos para darte un resultado confiable.',
      progress: (current: number, target: number, unit: string) =>
        `${current.toLocaleString('es-MX')} de ${target.toLocaleString('es-MX')} ${unit}`,
      remaining: (missing: number, unit: string) =>
        `Faltan ${missing.toLocaleString('es-MX')} ${unit}`,
    },
  },
  roles: {
    names: { student: 'Alumno', physician: 'Médico', admin: 'Admin', owner: 'Dueño' },
    descriptions: {
      student: 'Repaso, simuladores, progreso, tutor y Party.',
      physician: 'Banco de preguntas, etiquetado, acuerdo, borradores de IA y reportes.',
      admin:
        'Usuarios, asignaciones, costos de IA, datos de demostración y configuración. También ve el panel médico.',
      owner: 'Todo lo del admin. Además nombra o quita admins y nadie le puede quitar el rol.',
    },
    legend: 'Rol en este dispositivo',
    notice:
      'Sin la nube conectada no hay inicio de sesión. El rol solo cambia lo que ves en este dispositivo.',
    enterAs: (roleName: string) => `Entrar como ${roleName}`,
    current: (roleName: string) => `Rol actual, ${roleName}`,
    change: 'Cambiar de rol',
    cardTitle: 'Rol',
  },
  access: {
    physicianTitle: 'Esta sección es para médicos',
    adminTitle: 'Esta sección es para admin',
    description: 'Solo un administrador puede darte acceso a esta sección.',
  },
  database: {
    legend: 'Cuenta activa',
    description: 'Los datos viven solo en este dispositivo, en dos bases separadas.',
    real: 'Mi cuenta',
    realDescription: 'Tus datos reales. Nada sale de este dispositivo.',
    demo: 'Demostración',
    demoDescription:
      'Alumno de demostración y alumnos simulados. Todo lo que ves son datos simulados.',
    banner: 'Estás en la demostración. Todo lo que ves son datos simulados.',
    backToReal: 'Volver a Mi cuenta',
    storedIn: (name: string) => `Base local ${name}`,
    users: (count: number) =>
      count === 1 ? '1 perfil guardado' : `${count.toLocaleString('es-MX')} perfiles guardados`,
    openError: 'No se pudo abrir la base local. Revisa que el navegador permita guardar datos.',
  },
  ai: {
    cardTitle: 'Inteligencia artificial',
    badge: {
      checking: 'IA, revisando',
      real: 'IA real',
      mock: 'IA simulada',
      'no-proxy': 'IA simulada',
      offline: 'IA sin conexión',
    },
    detail: {
      checking: 'Revisando el proxy local de IA.',
      real: 'El proxy local tiene clave. Los motores de IA llaman al modelo y todo lo que generan queda en borrador.',
      mock: 'El proxy local no tiene clave. Las respuestas de IA son fijas, de demostración.',
      'no-proxy':
        'No hay proxy local, como en la demo publicada. Las respuestas de IA son fijas, de demostración.',
      offline: 'Las funciones de IA necesitan conexión. Lo demás sigue funcionando.',
    },
  },
  // Cuando cambia el aviso de privacidad, como el propio aviso promete (Fase H)
  noticeUpdate: {
    title: 'Actualizamos el aviso de privacidad',
    body: (version: string) =>
      `Cambió el texto con el que decidiste qué usamos de tus datos. Léelo y acéptalo para dejar constancia. La versión nueva es la ${version}. Tus permisos siguen como estaban.`,
    read: 'Leer el aviso',
    accept: 'Aceptar la versión nueva',
    saving: 'Guardando…',
    failed: 'No se pudo guardar. Inténtalo de nuevo.',
  },
  accounts: accountsText,
  configUpdate: {
    title: 'Hay una configuración nueva',
    body: 'La plataforma actualizó su configuración. Recarga para aplicarla cuando termines lo que estás haciendo.',
    reload: 'Recargar ahora',
    later: 'Después',
  },
  pwa: {
    updateAvailable: 'Hay una versión nueva de la app.',
    offlineReady: 'Lista. La app ya abre sin conexión en este dispositivo.',
    reload: 'Actualizar',
    dismiss: 'Cerrar aviso',
  },
  offlineBanner: 'Sin conexión. Lo que ya está en este dispositivo sigue funcionando.',
  // Modo enfoque, resumen semanal, enlace de referidos y producción sin demo (B7 del plan del cambio)
  b7: b7ExtrasText,
  settingsPage: settingsPageText,
  // Candados del plan Gratis con su vista previa (B8 del plan del cambio)
  freePlan: freePlanText,
  // Banco en la nube y Google Sheets (B11 del plan del cambio). Del alumno y del admin
  cloudBank: cloudBankText,
  // Los textos de Inglés médico (B13) viven en english.ts y se importan donde se usan, como los de
  // cloudBankScreens.ts, para no pesar en el JavaScript inicial, que está al límite de los 300 KB
  labels: {
    simulatedData: 'Datos simulados',
    // Aviso global y discreto mientras la app usa el banco de demostración (4.1 del plan del cambio)
    demoVersion: 'Versión de demostración',
    demoVersionHint: 'Las preguntas y los mazos son de muestra.',
  },
  theme: {
    legend: 'Tema visual',
    system: 'Igual que el sistema',
    light: 'Claro',
    dark: 'Oscuro',
  },
  notFound: {
    title: 'No encontramos esta página',
    description: 'Revisa la dirección o vuelve al inicio.',
    goHome: 'Ir al inicio',
  },
  routeError: {
    title: 'Algo salió mal',
    description: 'Ocurrió un error inesperado en esta pantalla.',
    reload: 'Recargar',
  },
} as const;
