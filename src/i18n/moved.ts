// Textos del aviso de la mudanza de la demo de GitHub Pages (B17, 3.4 del plan de B17). Fuera de t para que no
// entren al JavaScript inicial, que está al límite de los 300 KB (14.4). Solo los importa MovedNotice, que carga
// con lazy desde MovedNoticeLauncher y solo si el build trae VITE_MOVED_TO y VITE_MOVED_ON. Como consents.ts y
// engagement.ts, no se integran en t. El aviso dice el día de la mudanza, que quien tiene cuenta toca Sincronizar
// ahora y entra allá con su correo, y que quien usa la demo sin cuenta descargue sus datos en Configuración,
// Privacidad antes de esa fecha. Se puede cerrar por el día. Español de México con trato de tú, sin signos de
// exclamación y sin dos puntos en la prosa

export const movedTexts = {
  title: 'Studiare cambia de dirección',
  /** Antes del día de la mudanza. date es "15 de diciembre", con el año si no es el actual */
  before: (host: string, date: string) =>
    `Studiare se muda a ${host} el ${date}. Con cuenta, toca Sincronizar ahora en Configuración y entra allá con tu correo, y tu estudio se sincroniza. Sin cuenta, descarga tus datos en Configuración, Privacidad antes de esa fecha.`,
  /** Desde el día de la mudanza, mientras esta dirección siga publicada */
  after: (host: string) =>
    `Studiare ya se mudó a ${host}. Con cuenta, entra allá con tu correo y tu estudio se sincroniza. Sin cuenta, lo que guardaste aquí no pasa solo, así que descarga tus datos en Configuración, Privacidad.`,
  go: (host: string) => `Ir a ${host}`,
  dismiss: 'Cerrar por hoy',
  dismissLabel: 'Cerrar el aviso de la mudanza por hoy',
} as const;
