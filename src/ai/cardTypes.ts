// Contrato entre la app y el proxy de IA para crear tarjetas desde un PDF o un texto del alumno
// (Fase C2, Etapa 5, D-091). Solo importa zod, así lo leen igual la app y el proxy. Las reglas de
// fondo, cita literal, cifras y dosis que sí están en la fuente, y señales de controversia que solo
// nombran textos de la lista cerrada, las comprueba src/engines/cardDrafts.ts del lado de la app.
import { z } from 'zod';

export const GENERATE_LIMITS = {
  maxPassages: 12,
  maxPassageChars: 4000,
  maxTotalChars: 24_000,
  maxCards: 30,
  maxQuoteChars: 600,
  maxFieldChars: 1200,
  maxReasonChars: 600,
  maxTitleChars: 200,
} as const;

/** Un pasaje del texto que aporta el alumno, con la página de donde sale */
export const PassageSchema = z.strictObject({
  id: z.string().regex(/^p\d{1,3}$/),
  page: z.int().min(1).max(5000).nullable(),
  text: z.string().min(20).max(GENERATE_LIMITS.maxPassageChars),
});
export type Passage = z.infer<typeof PassageSchema>;

export const GenerateRequestSchema = z.strictObject({
  /** Nombre del documento. Nunca datos personales */
  title: z.string().trim().max(GENERATE_LIMITS.maxTitleChars),
  passages: z.array(PassageSchema).min(1).max(GENERATE_LIMITS.maxPassages),
  maxCards: z.int().min(1).max(GENERATE_LIMITS.maxCards),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/** Una señal de que algo puede estar mal. Nunca cambia la tarjeta, solo la explica */
export const ControversySchema = z.strictObject({
  reason: z.string().trim().min(1).max(GENERATE_LIMITS.maxReasonChars),
  /** Ids de la lista cerrada de src/config/academicSources.ts */
  sources: z.array(z.string().min(1).max(40)).min(1).max(4),
});
export type Controversy = z.infer<typeof ControversySchema>;

const DraftBase = {
  /** Pasaje de donde sale la tarjeta */
  passageId: z.string().regex(/^p\d{1,3}$/),
  /** Frase literal del pasaje que respalda la tarjeta */
  quote: z.string().trim().min(1).max(GENERATE_LIMITS.maxQuoteChars),
  controversy: ControversySchema.nullable(),
};

export const DraftCardSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('basic'),
    front: z.string().trim().min(1).max(GENERATE_LIMITS.maxFieldChars),
    back: z.string().trim().min(1).max(GENERATE_LIMITS.maxFieldChars),
    ...DraftBase,
  }),
  z.strictObject({
    kind: z.literal('cloze'),
    /** Texto con huecos al estilo Anki, por ejemplo {{c1::dato}} */
    text: z.string().trim().min(1).max(GENERATE_LIMITS.maxFieldChars),
    extra: z.string().trim().max(GENERATE_LIMITS.maxFieldChars),
    ...DraftBase,
  }),
]);
export type DraftCard = z.infer<typeof DraftCardSchema>;

export const GenerateResponseSchema = z.strictObject({
  cards: z.array(DraftCardSchema).max(GENERATE_LIMITS.maxCards),
});
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
