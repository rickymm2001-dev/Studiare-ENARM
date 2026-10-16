// Los mensajes en español que el proxy de IA devuelve con cada código de error (B12, 2.2). La app
// los muestra tal cual, así que van con trato de tú y nunca traen datos de la petición ni lo que
// contestó la API. Un solo lugar para el camino al momento, los trabajos por lote y la sesión.
import type { AiErrorCode } from './engines/aiContracts.ts';
import type { WhoAmIFailure } from './ports.ts';

export const ERROR_MESSAGES: Record<AiErrorCode, string> = {
  invalid_request: 'La petición no tiene el formato esperado.',
  pii_blocked:
    'El texto trae datos personales, como un correo, un teléfono o un nombre. Quítalos e intenta de nuevo.',
  input_too_large: 'El texto es demasiado largo para este motor. Envía una parte más corta.',
  student_limit: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
  budget_exceeded: 'La IA está en pausa por hoy. Vuelve mañana.',
  rate_limited: 'El servicio de IA está saturado. Intenta de nuevo en unos minutos.',
  invalid_output: 'La IA no dio una respuesta que se pueda usar. Se usa la versión sin IA.',
  provider_error: 'No se pudo usar la IA en este momento. Se usa la versión sin IA.',
  unauthorized: 'Tu sesión venció. Entra otra vez con tu correo.',
  plan_required: 'La IA es de los planes de pago. Mira los planes en Suscripción.',
  gate_closed:
    'El análisis con IA se abre cuando dos médicos terminen de revisarlo. Mientras tanto ves la versión sin IA.',
  staff_only: 'Esta función es solo para médicos y administradores.',
  refused: 'La IA no atendió esta petición. Se usa la versión sin IA.',
  generation_limit: 'Llegaste al límite de generaciones de tarjetas con IA de hoy. Vuelve mañana.',
  not_configured: 'La IA no está disponible ahora. Ves la versión sin IA.',
  paused: 'La IA está en pausa por ahora. Ves la versión sin IA.',
};

/** Por qué no se reconoció la sesión. Las tres usan el código unauthorized con su propio texto */
export const SESSION_MESSAGES: Record<WhoAmIFailure, string> = {
  unauthenticated: ERROR_MESSAGES.unauthorized,
  other_device: 'Tu cuenta está activa en otro dispositivo. Entra aquí otra vez para tomarla.',
  unavailable: 'No pudimos comprobar tu cuenta ahora. Inténtalo en unos minutos.',
};

/** Demasiados trabajos por lote en espera. Sale con student_limit */
export const TOO_MANY_PENDING_MESSAGE =
  'Tienes varias explicaciones con IA en camino. Espera a que lleguen antes de pedir otra.';

/** Un trabajo listo cuya salida ya se limpió del servidor, 14 días después de entregarla (3.4) */
export const EXPIRED_OUTPUT_MESSAGE = 'Esta explicación con IA ya no está disponible.';
