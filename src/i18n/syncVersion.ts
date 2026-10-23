// Textos del aviso de versión nueva de la sincronización (D-146). Viven aparte de t y solo los cargan el aviso
// y el estado de la sincronización, en español de México con trato de tú.
export const syncVersionText = {
  title: 'Hay una versión nueva de Studiare',
  body: 'Otro de tus dispositivos ya usa una versión más nueva y guardó datos que esta versión todavía no entiende. Lo que haces aquí sigue guardándose y subiéndose, y lo nuevo llega completo cuando actualices.',
  update: 'Actualizar ahora',
  updating: 'Actualizando',
  /** Si tras unos segundos no recargó, por ejemplo porque la recarga se canceló o el aviso nuevo no tomó el control */
  retry: 'Reintentar',
  /** Después de actualizar, la pausa sigue. La versión nueva todavía no llegó a este dispositivo */
  stuckTitle: 'La versión nueva todavía no está disponible',
  stuckBody:
    'Ya intentaste actualizar y esta versión sigue sin entender los datos nuevos. Puede tardar un poco en llegar a este dispositivo. Vuelve a intentarlo más tarde. Mientras tanto lo que haces aquí se sigue guardando y subiendo.',
  dismiss: 'Cerrar aviso',
  /** Una línea en Tu sesión, donde se ve el estado de la sincronización */
  profileLine:
    'La bajada de tus datos está en pausa porque hay información de una versión más nueva. No se pierde nada y sigue en cuanto actualices la app.',
} as const;
