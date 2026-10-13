// Textos de Party en la nube (B7 del plan del cambio, respuestas 69 y 77) y del modo enfoque dentro de
// Party (respuesta 82). Los de la Party de la demostración siguen en features.ts, bajo party.
import type { PartyFailure } from '@/data/cloud/party';
import { plural } from './features';

const failures: Record<PartyFailure, string> = {
  no_session: 'Tu sesión venció. Vuelve a entrar con tu correo.',
  other_device: 'Tu cuenta está abierta en otro dispositivo. Party funciona en el que está activo.',
  closed: 'Party no está incluida en tu plan.',
  not_member: 'Ya no estás en ese grupo.',
  invalid: 'No se aceptaron los datos. Revísalos e intenta de nuevo.',
  unavailable: 'Party en la nube todavía no está lista. Intenta más tarde.',
  network: 'No hay conexión con la nube. Intenta de nuevo en un momento.',
  unknown: 'Algo salió mal. Intenta de nuevo.',
};

export const partyCloudText = {
  privacy:
    'En un grupo compartes tu alias y tu XP de la semana. En un duelo, además, cuántas aciertas y cuánto tardas en esas preguntas. Nunca tu correo, tu exactitud por tema, tus sesgos ni tu conducta de estudio.',
  privacyDemo:
    'En la demostración los grupos viven en este navegador y los compañeros son simulados. Con una cuenta real Party vive en la nube y compartes solo tu alias y tu XP de la semana.',
  focusNote: 'Modo enfoque activo. La tabla, el XP y los retos están ocultos.',
  needsCloud: {
    title: 'Party en la nube',
    off: 'Party es para estudiar con otras personas, así que necesita una cuenta en la nube. Esta versión guarda todo solo en tu navegador.',
    signedOut:
      'Party necesita tu cuenta en la nube. Entra con tu correo en este navegador para crear un grupo o unirte a uno.',
    checking: 'Conectando con tu cuenta en la nube…',
    error: 'No pudimos conectar con la nube. Lo intentamos de nuevo en un momento.',
  },
  consent: {
    title: 'Activa Party',
    body: 'Party comparte con tus grupos tu alias y tu XP de la semana, y en un duelo tus aciertos y tu tiempo. Nunca tu correo.',
    hint: 'Lo puedes quitar cuando quieras en Configuración, Privacidad. Al quitarlo sales de tus grupos.',
    allow: 'Activar Party',
    failed: 'No se pudo guardar tu permiso. Intenta de nuevo.',
    stillIn: (n: number) =>
      `Sigues en ${plural(n, 'grupo', 'grupos')} con tu alias. Si ya no quieres compartir, sal de todos.`,
    leaveAll: 'Salir de todos mis grupos',
    leftAll: 'Listo, ya no estás en ningún grupo.',
  },
  loading: 'Cargando tus grupos…',
  failures,
  retry: 'Intentar de nuevo',
  createHint:
    'Aún no estás en ningún grupo. Crea uno o únete con el código o el enlace que te compartan.',
  createResults: {
    too_many: 'Ya estás en 10 grupos. Sal de alguno para crear otro.',
    limit: 'Hoy ya creaste 5 grupos. Mañana puedes crear más.',
  },
  joinHint:
    'Escribe el código de 6 caracteres que te compartieron. Si abriste un enlace de invitación, ya está escrito.',
  joinResults: {
    joined: 'Listo, ya estás en el grupo.',
    already: 'Ya estás en ese grupo.',
    invalid: 'El código tiene 6 letras o números, sin 0, O, 1, I ni L.',
    not_found: 'No hay ningún grupo con ese código. Revísalo con quien te invitó.',
    full: 'Ese grupo ya tiene 50 miembros.',
    too_many: 'Ya estás en 10 grupos. Sal de alguno para entrar a otro.',
    rate_limited: 'Hiciste demasiados intentos. Espera una hora e intenta de nuevo.',
  },
  members: (n: number) => plural(n, 'miembro', 'miembros'),
  membersTitle: 'Miembros',
  invite: {
    copyCode: 'Copiar código',
    codeCopied: 'Código copiado',
    copyLink: 'Copiar enlace',
    linkCopied: 'Enlace copiado',
    copyFailed: 'No se pudo copiar. Copia el código a mano.',
  },
  weekNote: 'XP desde el lunes a las 4 a. m. Cada quien publica el suyo al abrir Party o Inicio.',
  challengeLimit: 'El grupo ya tiene 10 retos activos. Espera a que termine alguno.',
  needOwnContribution:
    'Tu grupo ya cumplió la meta, pero tú todavía no aportas nada. Estudia algo y vuelve a reclamar tus 100 XP.',
  challengeEnded: 'Este reto ya terminó.',
  duels: {
    title: 'Duelos',
    empty: 'Todavía no tienes duelos en este grupo.',
    noRivals: 'Un duelo necesita a otro miembro del grupo. Comparte el código para que entren.',
    demoNoRivals:
      'Un duelo necesita un compañero. Crea el grupo con compañeros simulados para probarlo. Con una cuenta real retas a tus compañeros de verdad.',
    formerMember: 'alguien que salió del grupo',
    rivalLeft: 'Tu compañero salió del grupo, así que este duelo ya no se decide.',
    yourResult: (correct: number, total: number, time: string) =>
      `Tu resultado, ${correct} de ${total} en ${time}.`,
    waiting: (alias: string) => `Esperando a ${alias}. El resultado sale cuando los dos terminen.`,
    results: {
      rival_gone: 'Ese compañero ya salió del grupo.',
      limit: 'Ya tienes 10 duelos esperando a tu rival. Espera a que jueguen.',
    },
    playFailed: 'No se pudo abrir el duelo. Intenta de nuevo en un momento.',
  },
  widget: {
    needsCloud: 'Party funciona con tu cuenta en la nube.',
    consent: 'Activa Party para estudiar con tu grupo.',
    failed: 'No pudimos cargar tu grupo.',
  },
} as const;
