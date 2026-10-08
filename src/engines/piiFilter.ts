/**
 * Filtro de datos personales (4.5, D-085).
 *
 * Qué hace. Antes de que un texto del alumno viaje a un modelo de IA, oculta lo que identifica a una
 * persona. Correos, teléfonos y otras secuencias largas de dígitos como el NSS, CURP, RFC, enlaces
 * y los nombres que se le pasen, como el alias y el nombre del propio alumno. Al modelo solo le
 * llega texto del material y nunca quién lo estudia.
 * Entradas. El texto y, opcionalmente, nombres propios que deben desaparecer.
 * Salidas. El texto filtrado y cuántas cosas se ocultaron de cada tipo.
 * Método. Expresiones regulares por tipo. El texto filtrado es el que se manda y el que se usa para
 * validar las citas, así lo que el modelo cita siempre existe en lo que recibió.
 * Umbrales. Una secuencia de 10 a 15 dígitos, con espacios, guiones, puntos o paréntesis entre
 * ellos, se toma por teléfono o por identificador. Un valor clínico con decimales no se oculta.
 */

export type PiiCounts = Record<'email' | 'phone' | 'curp' | 'rfc' | 'url' | 'name', number>;

export interface PiiResult {
  text: string;
  counts: PiiCounts;
  /** Cuántas cosas se ocultaron en total */
  total: number;
}

const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/gu;
// El enlace no se come el punto o la coma con que termina la frase
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>()"']*[^\s<>()"'.,;:!?]/giu;
const CURP = /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g;
const RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g;
// Una corrida que empieza y termina en dígito, con separadores comunes entre ellos
const DIGIT_RUN = /\+?\d(?:[\d\s().-]{8,18})\d/g;

export const PII_TOKENS = {
  email: '[correo]',
  phone: '[número]',
  curp: '[CURP]',
  rfc: '[RFC]',
  url: '[enlace]',
  name: '[nombre]',
} as const;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scrubPersonalData(text: string, names: readonly string[] = []): PiiResult {
  const counts: PiiCounts = { email: 0, phone: 0, curp: 0, rfc: 0, url: 0, name: 0 };
  let out = text;
  const swap = (pattern: RegExp, kind: keyof PiiCounts, check?: (match: string) => boolean) => {
    out = out.replace(pattern, (match) => {
      if (check && !check(match)) return match;
      counts[kind] += 1;
      return PII_TOKENS[kind];
    });
  };
  // Los enlaces primero, porque un correo o un número pueden estar dentro de uno
  swap(URL_PATTERN, 'url');
  swap(EMAIL, 'email');
  swap(CURP, 'curp');
  swap(RFC, 'rfc');
  swap(DIGIT_RUN, 'phone', (match) => {
    const digits = match.replace(/\D/g, '');
    // Un valor con decimales, como 12.345678901, es una medida y no un teléfono
    return digits.length >= 10 && digits.length <= 15 && !/^\d+[.,]\d+$/.test(match.trim());
  });
  for (const name of names) {
    const clean = name.trim();
    if (clean.length < 3) continue;
    out = out.replace(
      new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(clean)}(?![\\p{L}\\d])`, 'giu'),
      () => {
        counts.name += 1;
        return PII_TOKENS.name;
      },
    );
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return { text: out, counts, total };
}
