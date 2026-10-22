// Textos de la portada de venta (D-060, D-068) y lugares marcados para el texto de la agencia o del
// influencer (B17, 5.2 y 5.3 del plan de B17). Salieron de features.ts con la misma forma de t.landing,
// que sigue en t porque la leen la portada y varias pruebas. Cada texto tiene un id y un largo máximo
// (src/features/landing/slots.ts) que vigila landing.test.ts, y docs/PORTADA.md es el documento que
// se le da a quien escribe el texto. El texto de partida es el neutro de B0 y se queda como está hasta
// que lleguen los de la agencia o del influencer. Ninguna sesión escribe texto de venta, y lo que
// llegue cambia aquí y en ningún otro archivo.
//
// Los dos bloques de abajo, creator y testimonials, no se muestran mientras estén vacíos. Con texto
// aparecen entre las funciones y los planes. La foto del creador se guarda en public/landing y se
// declara aquí, con su texto alternativo. Los precios y las promesas de plan no son un lugar: salen
// de src/config/billing.ts y de las banderas, para que el texto de venta nunca contradiga el cobro.
// Español de México con trato de tú, sin signos de exclamación y sin dos puntos en la prosa.

/** La foto del creador. El archivo vive en public/landing y se muestra solo si trae su texto alternativo */
export interface LandingPhoto {
  /** Nombre del archivo dentro de public/landing, por ejemplo creador.webp */
  file: string;
  /** Lo que lee un lector de pantalla. Máximo 120 caracteres */
  alt: string;
}

/** Quién está detrás de Studiare, con sus propias palabras. Opcional */
export interface LandingCreator {
  name: string;
  role: string;
  quote: string;
  photo: LandingPhoto | null;
}

/** Un testimonio de una persona real que lo autorizó por escrito, y la fecha de ese permiso (AAAA-MM-DD) */
export interface LandingTestimonial {
  quote: string;
  who: string;
  permissionOn: string;
}

export const landingText = {
  documentTitle: 'Prepara el ENARM',
  badge: 'Para médicos generales que van por su residencia',
  title: 'Prepara el ENARM entendiendo cómo respondes',
  subtitle:
    'Repaso espaciado con FSRS, preguntas tipo ENARM y estadísticas que te dicen cómo lees, dónde te equivocas y qué trampa te atrapa. Con un toque de juego para que vuelvas cada día.',
  cta: 'Crear cuenta gratis',
  login: 'Ya tengo cuenta',
  trust: 'Gratis para empezar. Sin tarjeta.',
  featuresTitle: 'Lo que nos hace distintos',
  features: {
    technique: [
      'Entrenador de técnica de examen',
      'Medimos tu ritmo, tus cambios de respuesta, tu confianza y tu fatiga para enseñarte a contestar mejor, no solo a saber más.',
    ],
    fsrs: [
      'Repaso que no se te olvida',
      'FSRS, un algoritmo moderno de repaso espaciado, decide qué repasar y cuándo. Tú ajustas qué tan seguido.',
    ],
    biases: [
      'Sesgos en cada distractor',
      'Cada opción incorrecta lleva el sesgo cognitivo que explota. Te decimos cuál te atrapa más y cómo evitarlo.',
    ],
    game: [
      'Estudio que se juega',
      'XP, niveles de R0 a Eminencia, rachas, retos de grupo y tablas semanales con tus amigos.',
    ],
    decks: [
      'Tus mazos también cuentan',
      'Usa los mazos precargados o sube los tuyos y entran al mismo repaso y a tus estadísticas.',
    ],
    physicians: [
      'Contenido con médicos detrás',
      'El contenido médico generado por IA queda como borrador marcado hasta que un médico lo aprueba.',
    ],
  },
  personasTitle: 'Para tu forma de estudiar',
  personas: [
    ['Si estudias todo el día', 'Te decimos si tu esfuerzo rinde y cuándo te estás cansando.'],
    ['Si estudias porque toca', 'Misiones cortas y una racha que no vas a querer romper.'],
    ['Si te va bien sin matarte', 'Duelos con tus amigos y preguntas que suben de nivel contigo.'],
    ['Si estás de guardia', 'Sesiones de 5 minutos que funcionan sin conexión.'],
    [
      'Si vas por segunda vez',
      'Evidencia de por qué fallaste y tu avance contra tu intento anterior.',
    ],
    [
      'Si estudias en grupo',
      'Grupos con tu generación, tabla semanal, retos y duelos para estudiar juntos.',
    ],
  ],
  pricingTitle: 'Planes',
  bestValue: 'Mejor precio',
  founderBadge: 'Promoción Fundador',
  startWith: (plan: string) => `Empezar con ${plan}`,
  faqTitle: 'Preguntas frecuentes',
  faq: [
    [
      '¿Me dicen qué puntaje voy a sacar?',
      'No. Nadie puede predecir tu puntaje del ENARM con honestidad. Te mostramos tu dominio por rama y por subespecialidad y cómo mejorar tu técnica.',
    ],
    [
      '¿Funciona en el teléfono?',
      'Sí. Es una página web que funciona completa en el navegador y, si quieres, la instalas como app desde el navegador.',
    ],
    [
      '¿Qué pasa con mis datos?',
      'Tu correo y tus datos personales nunca viajan a la IA. Puedes exportarlos o borrarlos cuando quieras.',
    ],
  ],
  finalTitle: 'Tu residencia empieza con el siguiente repaso',
  /** Nombre de la sección de testimonios. Descriptivo, no es texto de venta */
  testimonialsTitle: 'Testimonios',
  /** Etiqueta visible de todo bloque que no sea el contenido real, como el de las capturas y las pruebas */
  sampleLabel: 'Contenido de prueba',
  /** Vacío hasta que llegue el texto del creador, con su permiso. Mientras tanto no se muestra */
  creator: null as LandingCreator | null,
  /** Vacío hasta que haya testimonios con permiso por escrito. Mientras tanto no se muestra */
  testimonials: [] as readonly LandingTestimonial[],
} as const;
