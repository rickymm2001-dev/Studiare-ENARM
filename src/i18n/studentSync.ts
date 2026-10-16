// Textos de lo que viaja y lo que no entre los dispositivos de un alumno (B14, 2 del plan de B14). Fuera de
// t para que no entren al JavaScript inicial. Español de México con trato de tú, sin signos de exclamación
// y sin dos puntos en la prosa.
export const studentSyncTexts = {
  /**
   * El puntaje oficial no viaja entre dispositivos, porque el número no entra a la bitácora (D-101). Lo
   * que sí viaja es que retirar el permiso lo borra donde esté. Va en Configuración, Privacidad
   */
  officialScoreStaysHere:
    'Tu puntaje oficial se guarda solo en el dispositivo donde lo capturas. Si retiras este permiso en cualquiera de tus dispositivos, se borra en todos.',
} as const;
