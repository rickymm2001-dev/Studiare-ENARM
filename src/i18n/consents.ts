// Textos de los tres permisos por finalidad (B14, 6.2 y 6.5 del plan de B14). Fuera de t para que no
// entren al JavaScript inicial. Solo los importan SignupFields (Crear cuenta y Completa tu registro) y
// PrivacySection (Configuración, Privacidad), todas en pantallas diferidas. Una sola fuente, así el
// registro, Completa tu registro y Privacidad dicen lo mismo. Español de México con trato de tú, sin
// signos de exclamación y sin dos puntos en la prosa.
//
// La pista de la mejora dice todo lo que cubre el permiso (6.1). La calibración nocturna de la dificultad,
// el aviso a los médicos de opciones que casi nadie elige, la comparación con otros alumnos por
// percentiles, los reportes de fallas de la app y guardar el puntaje oficial. Los datos son seudónimos y
// no anónimos, y el texto lo dice así. Por eso la etiqueta es Mejora con tus datos sin nombre (10.6). Si
// el abogado prefiere conservar Mejora anónima, solo cambia esa etiqueta y las menciones del permiso en
// los textos de la app y del aviso, que el commit del nombre deja juntas para revertirlas.
import type { ConsentPurposeSchema } from '@/data/schemas/common';
import type { z } from 'zod';

type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

export const consentTexts = {
  /** Etiqueta y pista de cada permiso, en ese orden */
  purposes: {
    party: [
      'Party',
      'Compartir con tus grupos tu alias, tu foto de perfil si subiste una, tu XP de la semana, tu aporte a los retos y tus duelos.',
    ],
    ai_analysis: [
      'Análisis con IA',
      'Usar tus errores para hipótesis del tutor, con IDs seudónimos.',
    ],
    anonymized_improvement: [
      'Mejora con tus datos sin nombre',
      'Usamos tus respuestas y repasos con un identificador seudónimo, sin tu nombre ni tu correo, para calcular cada noche la dificultad real de las preguntas, avisar a los médicos de opciones que casi nadie elige y comparar a los alumnos por percentiles. También sirve para mandar los reportes de fallas de la app y para guardar tu puntaje oficial si lo capturas. Lo puedes retirar cuando quieras.',
    ],
  },
  /** Se suma a la pista de la mejora en Configuración, Privacidad */
  withdrawal:
    'Si lo retiras, desde la noche siguiente tus datos dejan de usarse y tu puntaje oficial se borra.',
} as const satisfies {
  purposes: Record<ConsentPurpose, readonly [string, string]>;
  withdrawal: string;
};

/** La pista de un permiso en Configuración, Privacidad. La mejora suma qué pasa al retirarla */
export function privacyHint(purpose: ConsentPurpose): string {
  const [, hint] = consentTexts.purposes[purpose];
  return purpose === 'anonymized_improvement' ? `${hint} ${consentTexts.withdrawal}` : hint;
}
