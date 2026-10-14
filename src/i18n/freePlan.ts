// Textos del plan Gratis (B8 del plan del cambio, respuestas 18, 19 y 20, 4.3 y 4.25). Los candados de
// Party, Subir tus mazos y el catálogo de mazos precargados, con su vista previa, y lo que se sugiere en
// Gratis en lugar de seguir un mazo del catálogo. El botón de todos los candados es el de
// src/features/shared/lockedCta.ts. Español de México con trato de tú. Se integran en t.freePlan desde
// es-MX.ts.
import type { AccessFlag } from '@/config/billing';

export const freePlanText = {
  // Party en Gratis (respuesta 20, 4.3). Se cierran grupos, tabla, retos y duelos. Comparte tu semana y
  // Invita y gana un mes siguen abiertas
  party: {
    title: 'Party es parte de los planes de pago',
    // Lo mismo que dice t.partyCloud.privacy de lo que se comparte
    intro:
      'Estudia con tus amigos en grupos privados. Ven tu alias, tu foto de perfil si subiste una, tu XP de la semana, tu aporte a los retos y tus resultados en los duelos. Nunca tu correo.',
    points: [
      'Grupos con invitación por código o enlace',
      'Tabla de la semana con el XP de cada quien',
      'Retos del grupo con su meta y su avance',
      'Duelos con las mismas preguntas para los dos',
    ],
    kept: 'Si ya estabas en un grupo, sigues en él hasta que salgas, y tus compañeros te siguen viendo con tu alias, tu foto y tus últimas cifras. Lo vuelves a ver con un plan de pago. Para salir, quita el permiso de Party en Configuración, Privacidad.',
  },
  // Mientras llega el plan de la nube, en lugar de un candado
  checking: 'Revisando tu plan…',
  // El reto de Party en Inicio
  widget: 'Grupos, retos y duelos con tus amigos vienen con los planes de pago.',

  // Subir tus mazos en Gratis (respuesta 20). Se llama igual en la tabla de planes
  importDecks: {
    title: 'Subir tus mazos es parte de los planes de pago',
    intro:
      'Trae tus tarjetas de Anki o de un archivo y entran al mismo repaso y a tus estadísticas.',
    points: [
      'Paquetes .apkg de Anki, CSV, Excel (.xlsx) y Word (.docx)',
      'Vista previa con avisos antes de guardar',
      'Submazos, etiquetas y tarjetas con huecos',
      'Subir el mismo archivo otra vez no duplica nada',
    ],
    kept: 'Los mazos que ya subiste siguen en Mazos y en Repasar, y los puedes exportar cuando quieras.',
  },

  // El catálogo de mazos precargados en Gratis (4.25). Lo que el alumno ya tiene sigue a su alcance
  catalog: {
    // Cuenta como suyo un mazo que ya está en este dispositivo o del que ya repasó alguna tarjeta, en
    // este o en otro dispositivo
    notice:
      'Seguir mazos nuevos del catálogo es parte de los planes de pago. Los que ya estudiaste o tienes en este dispositivo los sigues repasando y los puedes volver a seguir.',
    rowLocked: 'Plan de pago',
    // Repasar sin mazos en Gratis. Sin el catálogo, el repaso sale de los mazos propios y de los errores
    reviewEmpty:
      'Crea un mazo propio en Mazos para empezar a repasar. Las preguntas que falles en Simular pasan a tu repaso en Mis errores.',
    // La semana en Progreso sin mazos
    plannerEmpty:
      'Sin mazos el plan solo trae práctica de preguntas. Crea un mazo propio en Mazos para sumar repasos, y las preguntas que falles pasan a Mis errores.',
    // Explorar sin tarjetas
    exploreEmpty:
      'Todavía no tienes tarjetas. Crea un mazo propio en Mazos y aparecerán aquí, junto con las de Mis errores cuando falles preguntas en Simular.',
  },

  // El aviso corto de un candado sin vista previa, para las banderas de acceso de sí o no
  accessLocked: {
    fullExam: 'Tu plan no incluye el examen completo.',
    aiTutor: 'Tu plan no incluye el tutor con IA.',
    importDecks: 'Tu plan no incluye subir tus mazos.',
    deckCatalog: 'Tu plan no incluye seguir mazos nuevos del catálogo.',
    party: 'Tu plan no incluye Party.',
  } satisfies Record<AccessFlag, string>,
} as const;
