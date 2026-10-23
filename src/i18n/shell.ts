// Los textos de las piezas del armazón de la app que no son de navegación, el encabezado con el nivel y la racha,
// la escalera de niveles, los avisos de otro dispositivo y de entrada, para que el JavaScript inicial no cargue
// features.ts ni accounts.ts completos (14.4). Esos módulos importan estos bloques y los componen en t.
import { plural } from './plural';

export const levelLadderText = {
  title: 'Niveles y títulos',
  current: (level: number, title: string, xp: string) =>
    `Vas en el nivel ${level}, ${title}, con ${xp} XP en total.`,
  close: 'Cerrar',
  toNextLevel: (left: string, level: number) => `Te faltan ${left} XP para el nivel ${level}`,
  nextTitle: (title: string, level: number, left: string) =>
    `Siguiente título, ${title} en el nivel ${level}. Te faltan ${left} XP.`,
  maxTitle: 'Ya tienes el título más alto. Sigue sumando niveles.',
  levels: 'Niveles',
  titleColumn: 'Título',
  xpColumn: 'XP total para llegar',
  range: (from: number, to: number) => `${from} a ${to}`,
  fromLevel: (from: number) => `${from} en adelante`,
  you: 'tú',
  howTo:
    'Ganas XP con cada tarjeta repasada (3), cada pregunta correcta (10 a 30 según dificultad) o intentada (2), y con los retos. La racha suma hasta 50% extra.',
} as const;

export const headerStatsText = {
  streak: (days: number) => `Racha de ${plural(days, 'día', 'días')}`,
  level: (level: number, title: string, into: number, next: number) =>
    `Nivel ${level}, ${title}. ${into.toLocaleString('es-MX')} de ${next.toLocaleString('es-MX')} XP para el siguiente nivel`,
  short: (level: number) => `Nivel ${level}`,
  titled: (level: number, title: string) => `Nivel ${level} · ${title}`,
  left: (xp: number, next: number) => `${xp.toLocaleString('es-MX')} XP para el nivel ${next}`,
  profile: 'Tu perfil',
  openLevels: 'Ver niveles y títulos',
} as const;

export const otherDeviceText = {
  title: 'Tu cuenta se abrió en otro dispositivo',
  body: 'Cada cuenta tiene un solo dispositivo activo, así que cerramos tu sesión aquí. Si quieres seguir en este dispositivo, vuelve a entrar. Eso cerrará la sesión del otro.',
  dismiss: 'Entendido',
} as const;

export const oauthErrorText = {
  title: 'No pudiste entrar con Google',
  linkTitle: 'No pudiste entrar con el enlace',
  invitation_required:
    'Tu correo de Google no tiene invitación. Mientras preparamos el lanzamiento solo entran personas invitadas. Si te invitaron con otro correo, entra con ese.',
  cancelled: 'Cancelaste la entrada con Google. No se creó ninguna cuenta.',
  failed: 'Google o el servidor no respondieron. Intenta de nuevo o entra con tu correo.',
  link_expired:
    'El enlace venció o ya se usó. Pide otro correo en Ya tengo cuenta y entra con su enlace o con su código.',
  link_failed:
    'No pudimos abrir tu sesión con ese enlace. Pide otro correo en Ya tengo cuenta y entra con su enlace o con su código.',
  dismiss: 'Entendido',
} as const;

export const accessGateText = {
  checkingSignup: 'Revisando tu registro…',
  unknownTitle: 'No pudimos revisar tu registro',
  unknownBody:
    'Necesitamos la nube para saber si ya completaste tu registro. Revisa tu conexión e intenta de nuevo.',
  signOut: 'Cerrar sesión',
} as const;

export const mfaCheckingText = 'Revisando tu segundo factor…';
