// Todos los textos de la interfaz, en español de México con trato de tú (4.9).
// El código usa claves en inglés y nunca escribe texto visible fuera de este archivo.
import { BRAND } from '@/config/brand';
import type { Phase, ScreenKey } from '@/app/screens';
import { examText } from './exam';
import { featureText } from './features';
import { outlineText } from './outlines';
import { qualityText } from './quality';
import { tutorText } from './tutor';
import { vocabularyText } from './vocabulary';

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
      'Repaso de tarjetas con repetición espaciada. Marcas tu confianza, calificas y anotas la causa si fallas.',
  },
  question: {
    title: 'Pregunta',
    description:
      'Caso clínico con opciones, resaltado de negaciones, confianza, temporizador y reporte de error.',
  },
  feedback: {
    title: 'Retroalimentación',
    description:
      'Explicación, por qué atrae la opción que elegiste, causa del error y botón para generar tarjetas.',
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
    description: 'Resultados por rama, estructura y trampa. Tus errores pasan al repaso.',
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
    title: 'Explorar',
    description:
      'Busca, filtra y ordena todas tus tarjetas. Suspende, etiqueta o muévelas por lote.',
  },
  outlines: {
    title: 'Apuntes',
    description:
      'Escribe en esquema y vuelve tarjeta cualquier línea con una marca. Enlaza apuntes entre sí.',
  },
  planner: {
    title: 'Planificador',
    description: 'Tu plan del día y de la semana según tu fecha del ENARM y tu carga de repaso.',
  },
  party: {
    title: 'Party',
    description: 'Grupos con código de invitación, tabla semanal, retos de grupo y duelos.',
  },
  rewards: {
    title: 'Logros',
    description: 'Tus misiones del día y de la semana, tu liga y tus insignias.',
  },
  profile: {
    title: 'Perfil',
    description: 'Quién eres en Studiare. Tu nivel, tu racha, tu cuenta y tu plan.',
  },
  adminUsers: {
    title: 'Usuarios',
    description: 'Roles y asignaciones de preguntas a médicos.',
  },
  settings: {
    title: 'Configuración',
    description: 'Apariencia, metas, repaso, Pomodoro y tus datos.',
  },
  subscription: {
    title: 'Suscripción',
    description: 'Planes y pago simulados. Nada aquí cobra dinero real.',
  },
  questionBank: {
    title: 'Banco de preguntas',
    description:
      'Preguntas con filtros, estado de calibración y alertas de distractores que no funcionan.',
  },
  questionEditor: {
    title: 'Editor de pregunta',
    description:
      'Caso, enunciado, hasta 10 opciones con su etiqueta, set canónico, explicación, referencias y versiones.',
  },
  agreement: {
    title: 'Acuerdo del etiquetado',
    description: 'Cola de doble etiquetado y tablero de acuerdo entre médicos con kappa.',
  },
  aiDrafts: {
    title: 'Borradores de IA',
    description:
      'Preguntas reestructuradas, tarjetas para mazos públicos y consejos que esperan tu revisión.',
  },
  contentReports: {
    title: 'Reportes de contenido',
    description: 'Errores de contenido que reportan los alumnos.',
  },
  bankImport: {
    title: 'Importar banco',
    description:
      'Importa el banco desde CSV o JSON con una plantilla y un reporte de errores por fila.',
  },
  aiCosts: {
    title: 'Costos de IA',
    description: 'Costo acumulado, costo por motor, proyección por alumno y bitácora de llamadas.',
  },
  demoData: {
    title: 'Datos de demostración',
    description: 'Genera, borra y ajusta alumnos simulados, y regenera al alumno de la demo.',
  },
  adminSettings: {
    title: 'Configuración',
    description: 'Umbrales, pesos del ENARM, precios y modelos por motor.',
  },
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
      'Sin inicio de sesión en el prototipo. Elige con qué rol quieres ver la app en este dispositivo.',
  },
};

export const t = {
  ...featureText,
  ...examText,
  ...outlineText,
  ...qualityText,
  ...tutorText,
  ...vocabularyText,
  app: {
    name: BRAND.name,
    logoAlt: 'Studiare, ir al inicio',
    skipToContent: 'Saltar al contenido',
    documentTitle: (screenTitle: string) => `${screenTitle} · ${BRAND.name}`,
    aboutScreen: (screenTitle: string) => `Qué hay en ${screenTitle}`,
  },
  nav: {
    label: 'Navegación principal',
    more: 'Más secciones',
  },
  studyTabs: {
    label: 'Repasar, mazos, explorar y apuntes',
    review: 'Repasar',
    decks: 'Mazos',
    explore: 'Explorar',
    outlines: 'Apuntes',
  },
  navItems: {
    home: 'Inicio',
    review: 'Repasar',
    simulate: 'Simular',
    progress: 'Progreso',
    profile: 'Perfil',
    bank: 'Banco',
    agreement: 'Acuerdo',
    drafts: 'Borradores',
    reports: 'Reportes',
    costs: 'Costos',
    demo: 'Demo',
    settings: 'Configuración',
    users: 'Usuarios',
    platform: 'Plataforma',
    decks: 'Mazos',
    planner: 'Plan',
    tutor: 'Tutor',
    party: 'Party',
    rewards: 'Logros',
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
      'En el prototipo no hay inicio de sesión. El rol solo cambia lo que ves en este dispositivo.',
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
  demoData: {
    title: 'Datos de demostración',
    empty:
      'La demostración está vacía. Genera al alumno de demostración con 60 días de historial, 300 alumnos simulados y los mazos de Paco. Tarda unos segundos.',
    ready: (profiles: number) =>
      `Hay ${profiles.toLocaleString('es-MX')} perfiles simulados, el alumno de demostración con 60 días de historial y los alumnos simulados con sus parámetros verdaderos. Los mazos precargados son de Paco, compartidos con su autorización.`,
    generate: 'Generar datos de demostración',
    regenerate: 'Regenerar desde cero',
    confirm: 'Sí, borrar y regenerar',
    cancel: 'Cancelar',
    confirmText:
      'Se borra toda la base de demostración y se vuelve a generar igual. Tu cuenta real no se toca.',
    working: 'Generando datos simulados…',
    done: (events: number) =>
      `Listo. Se guardaron ${events.toLocaleString('es-MX')} eventos simulados.`,
    error: 'No se pudieron generar los datos de demostración. Intenta de nuevo.',
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
  labels: {
    demoContent: 'Demostración, no validado por médicos',
    simulatedData: 'Datos simulados',
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
