// Pone los datos del responsable en los textos legales y los pasa a Markdown para el abogado. Es
// puro, sin React, y lo usan la página y el script npm run legal:export, así lo que ve el alumno y
// lo que revisa el abogado es el mismo texto.
//
// La única diferencia es lo que falta (B16 del plan del cambio). El abogado ve una marca entre
// corchetes que dice qué falta y quién lo pone. El alumno nunca ve esa marca. Donde falta un dato lee
// un texto neutro, como en el aviso del límite de dispositivos, y una línea que sin el dato no dice
// nada, como la del domicilio o la de los tribunales, no se le muestra.
import type { LegalIdentity } from '../../config/legal.ts';
import { legalText, type LegalDoc } from '../../i18n/legal.ts';

/** Quién lee el texto. El alumno en la app, o el abogado en docs/legal */
export type LegalAudience = 'student' | 'lawyer';

/** Las marcas que pueden ir en los textos legales */
export const LEGAL_MARKS = [
  'nombre',
  'domicilio',
  'contactoPrivacidad',
  'contactoSoporte',
  'reembolsos',
  'jurisdiccion',
] as const;
export type LegalMark = (typeof LEGAL_MARKS)[number];

/** El valor configurado de cada marca, o null si falta */
function markValues(identity: LegalIdentity): Record<LegalMark, string | null> {
  return {
    nombre: identity.name,
    domicilio: identity.address,
    // Las marcas de contacto llevan su preposición, así el texto neutro se lee bien sin el correo
    contactoPrivacidad: identity.privacyEmail ? `a ${identity.privacyEmail}` : null,
    contactoSoporte: identity.email ? `a ${identity.email}` : null,
    // Las políticas que decide el abogado todavía no tienen texto
    reembolsos: null,
    jurisdiccion: null,
  };
}

const isMark = (key: string): key is LegalMark => (LEGAL_MARKS as readonly string[]).includes(key);

/**
 * Reemplaza las marcas {nombre}, {domicilio}, {contactoPrivacidad}, {contactoSoporte}, {reembolsos} y
 * {jurisdiccion}. Para el alumno devuelve null si la línea depende de un dato que falta y no tiene un
 * texto neutro, y quien la muestra la omite. Para el abogado siempre devuelve la línea, con la marca
 * de lo que falta
 */
export function fillLegal(
  text: string,
  identity: LegalIdentity,
  audience: LegalAudience = 'student',
): string | null {
  const values = markValues(identity);
  const marks = [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').filter(isMark);
  const hidden = marks.some(
    (key) => values[key] === null && legalText.missing.student[key] === null,
  );
  if (audience === 'student' && hidden) return null;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!isMark(key)) return match;
    return (
      values[key] ??
      (audience === 'lawyer' ? legalText.missing.lawyer[key] : legalText.missing.student[key]) ??
      ''
    );
  });
}

/** Las líneas de un documento que lee esta audiencia, ya llenas y en orden */
export function legalLines(
  lines: readonly string[] | undefined,
  identity: LegalIdentity,
  audience: LegalAudience,
): string[] {
  return (lines ?? []).flatMap((line) => {
    const filled = fillLegal(line, identity, audience);
    return filled === null ? [] : [filled];
  });
}

/**
 * El documento completo en Markdown. Por omisión es el del abogado, con las marcas de lo que falta. Con
 * la audiencia del alumno es lo mismo que muestra la página
 */
export function legalToMarkdown(
  doc: LegalDoc,
  identity: LegalIdentity,
  audience: LegalAudience = 'lawyer',
): string {
  const lines: string[] = [
    `# ${doc.title}`,
    '',
    `${legalText.version(doc.version)}. ${legalText.updated(doc.updated)}`,
    '',
    `> ${legalText.draftNotice}`,
    '',
    ...legalLines(doc.intro, identity, audience).flatMap((paragraph) => [paragraph, '']),
  ];
  for (const section of doc.sections) {
    lines.push(`## ${section.title}`, '');
    for (const paragraph of legalLines(section.paragraphs, identity, audience)) {
      lines.push(paragraph, '');
    }
    const bullets = legalLines(section.bullets, identity, audience);
    if (bullets.length > 0) lines.push(...bullets.map((bullet) => `- ${bullet}`), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
