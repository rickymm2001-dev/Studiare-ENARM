// Textos de cuentas y acceso (B9 del plan del cambio). Registro con la edad mínima, cómo nos conociste
// y los permisos opcionales, entrar con Google, registro por invitación, segundo factor del equipo y lo
// que el admin ve de todo eso. Español de México con trato de tú.
import type { HeardFromChannel } from '@/config/signup';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export const accountsText = {
  signup: {
    specialtyHint:
      'La usamos para compararte con quienes buscan la misma especialidad. La cambias cuando quieras en Configuración.',
    heardFrom: {
      label: 'Cómo nos conociste',
      hint: 'Opcional. Solo la contamos junto con las respuestas de los demás, nunca con tu nombre.',
      none: 'Prefiero no decir',
      channels: {
        instagram: 'Instagram',
        tiktok: 'TikTok',
        facebook: 'Facebook',
        youtube: 'YouTube',
        influencer: 'Un influencer',
        friend: 'Un amigo',
        google: 'Google',
        university: 'Mi universidad',
        other: 'Otro',
      } satisfies Record<HeardFromChannel, string>,
      code: 'Código de influencer',
      codeHint: 'Si te dieron uno.',
      codeError: 'Escribe el código como te lo dieron, de 2 a 32 letras o números, sin espacios.',
    },
    consentsTitle: 'Permisos opcionales',
    consentsDescription:
      'Empiezan apagados. Prende solo los que quieras. Los cambias cuando quieras en Configuración, Privacidad.',
    adultAccept: (age: number) => `Confirmo que tengo ${String(age)} años o más`,
    adultError: (age: number) =>
      `Studiare es para personas de ${String(age)} años o más. Confírmalo para continuar.`,
    or: 'o',
    google: 'Continuar con Google',
    googleOpening: 'Abriendo Google…',
    googleFailed: 'No pudimos abrir Google. Intenta de nuevo o usa tu correo.',
    googleCreateHint:
      'Con Google no escribes tu correo. Usamos el de tu cuenta de Google y nada más de ella.',
    invitationOnly:
      'Por ahora Studiare abre solo con invitación. Usa el correo con el que te invitaron.',
    invitationRequired:
      'Ese correo no tiene invitación. Mientras preparamos el lanzamiento solo entran personas invitadas. Si te invitaron, usa el mismo correo de la invitación.',
  },
  oauthError: {
    title: 'No pudiste entrar con Google',
    invitation_required:
      'Tu correo de Google no tiene invitación. Mientras preparamos el lanzamiento solo entran personas invitadas. Si te invitaron con otro correo, entra con ese.',
    cancelled: 'Cancelaste la entrada con Google. No se creó ninguna cuenta.',
    failed: 'Google o el servidor no respondieron. Intenta de nuevo o entra con tu correo.',
    dismiss: 'Entendido',
  },
  completeSignup: {
    title: 'Completa tu registro',
    description:
      'Entraste con Google. Antes de empezar confirma tu edad y acepta el aviso de privacidad.',
    save: 'Guardar y empezar',
    saving: 'Guardando…',
    failed: 'No se pudo guardar. Intenta de nuevo.',
    signOut: 'Salir sin completar',
  },
  mfa: {
    enrollTitle: 'Activa tu segundo factor',
    enrollDescription: (role: string) =>
      `Como ${role} entras a herramientas y datos del equipo, así que tu cuenta pide un segundo factor. Usa una app de autenticación en tu teléfono, por ejemplo Google Authenticator o Microsoft Authenticator.`,
    steps: [
      'Abre la app de autenticación y agrega una cuenta nueva.',
      'Escanea el código QR o escribe la clave.',
      'Escribe aquí el código de 6 dígitos que te muestra la app.',
    ],
    qrAlt: 'Código QR para agregar Studiare a tu app de autenticación',
    secretLabel: 'Clave para escribirla a mano',
    preparing: 'Preparando tu código…',
    prepareFailed: 'No pudimos preparar el código. Revisa tu conexión e intenta de nuevo.',
    retry: 'Intentar de nuevo',
    challengeTitle: 'Escribe tu código de seguridad',
    challengeDescription:
      'Abre tu app de autenticación y escribe el código de 6 dígitos de Studiare.',
    codeLabel: 'Código de 6 dígitos',
    codeFormat: 'Escribe los 6 dígitos que muestra tu app.',
    verify: 'Verificar',
    verifying: 'Revisando…',
    errors: {
      invalid: 'El código no coincide o ya cambió. Escribe el que muestra ahora tu app.',
      rate_limited: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
      failed: 'No pudimos revisar el código. Revisa tu conexión e intenta de nuevo.',
    },
    lost: 'Si perdiste tu teléfono, pide al dueño de la plataforma que restablezca tu segundo factor.',
    signOut: 'Cerrar sesión',
    checking: 'Revisando tu segundo factor…',
  },
  admin: {
    invitations: {
      title: 'Invitaciones',
      description:
        'Mientras el registro esté cerrado, solo crean cuenta los correos invitados, con el correo o con Google. Las cuentas que ya existen no cambian.',
      email: 'Correo para invitar',
      invite: 'Invitar',
      inviting: 'Invitando…',
      invited: (email: string) => `Invitaste a ${email}.`,
      revoke: 'Quitar',
      revokeLabel: (email: string) => `Quitar la invitación de ${email}`,
      revoked: (email: string) => `Quitaste la invitación de ${email}.`,
      registered: 'Ya creó su cuenta',
      pending: 'Sin cuenta todavía',
      invitedOn: (iso: string) => `Invitado el ${date(iso)}`,
      empty: 'Todavía no hay invitaciones.',
      loading: 'Cargando invitaciones…',
      errors: {
        invalid: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
        duplicate: 'Ese correo ya tiene invitación.',
        not_admin:
          'Solo el dueño y los admins manejan invitaciones. Si eres del equipo, confirma tu segundo factor.',
        no_session: 'Tu sesión venció. Entra de nuevo.',
        network: 'Sin conexión con el servidor. Intenta de nuevo.',
        unknown: 'El servidor no pudo con la invitación. Intenta más tarde.',
      },
      registration: {
        label: 'Registro abierto para todos',
        hint: 'Apagado, solo entran los correos invitados. Préndelo el día del lanzamiento.',
        open: 'El registro está abierto. Cualquiera puede crear su cuenta.',
        closed: 'El registro está cerrado. Solo entran los correos invitados.',
        unknown: 'No se pudo leer si el registro está abierto.',
        failed: 'No se pudo cambiar el registro. Intenta de nuevo.',
        openAction: 'Abrir el registro',
        closeAction: 'Cerrar el registro',
        confirmOpen: 'Al abrir el registro cualquiera podrá crear una cuenta. ¿Lo abres?',
        confirm: 'Sí, abrir el registro',
        cancel: 'Cancelar',
      },
    },
    sources: {
      title: 'Cómo nos conocieron',
      description:
        'Conteos de la respuesta opcional del registro. Nadie ve la respuesta de una persona.',
      channelsTitle: 'Por canal',
      codesTitle: 'Por código de influencer',
      people: (n: number) => (n === 1 ? '1 persona' : `${n.toLocaleString('es-MX')} personas`),
      empty: 'Todavía no hay respuestas.',
      noCodes: 'Nadie ha usado un código todavía.',
      loading: 'Cargando conteos…',
      errors: {
        not_admin: 'Solo el dueño y los admins ven estos conteos.',
        network: 'Sin conexión con el servidor. Intenta de nuevo.',
        unknown: 'El servidor no pudo leer los conteos. Intenta más tarde.',
      },
    },
    device: {
      release: 'Liberar dispositivo',
      releaseLabel: (alias: string) => `Liberar el dispositivo de ${alias}`,
      confirm: (alias: string) =>
        `Se cierra la sesión de ${alias} en su dispositivo actual y su conteo de cambios vuelve a cero. ¿Lo liberas?`,
      released: (alias: string) =>
        `Liberaste la cuenta de ${alias}. El siguiente dispositivo que entre se queda con ella.`,
      noDevice: (alias: string) => `${alias} no tenía un dispositivo activo.`,
      failed: 'No se pudo liberar el dispositivo. Intenta de nuevo.',
    },
    mfaReset: {
      action: 'Restablecer segundo factor',
      label: (alias: string) => `Restablecer el segundo factor de ${alias}`,
      confirm: (alias: string) =>
        `${alias} tendrá que dar de alta su segundo factor otra vez al entrar y se cerrarán sus sesiones. ¿Lo restableces?`,
      done: (alias: string) => `Restableciste el segundo factor de ${alias}.`,
      errors: {
        not_owner:
          'Solo el dueño restablece el segundo factor, con su propio segundo factor confirmado.',
        self: 'Tu propio segundo factor se restablece desde el panel de Supabase.',
        not_found: 'Esa cuenta ya no existe.',
        not_configured: 'La función del servidor todavía no está publicada.',
        failed: 'No se pudo restablecer. Intenta de nuevo.',
      },
    },
    confirm: 'Confirmar',
    cancel: 'Cancelar',
  },
  profile: {
    specialtyEmpty:
      'Todavía no eliges. Con ella te comparamos con quienes buscan la misma especialidad.',
  },
} as const;
