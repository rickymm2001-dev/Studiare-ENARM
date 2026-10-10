// Pone los datos del responsable en los textos legales y los pasa a Markdown para el abogado. Es
// puro, sin React, y lo usan la página y el script npm run legal:export, así lo que ve el alumno y
// lo que revisa el abogado es el mismo texto.
import type { LegalIdentity } from '../../config/legal.ts';
import { legalText, type LegalDoc } from '../../i18n/legal.ts';

/** Reemplaza las marcas {nombre}, {domicilio}, {correo}, {reembolsos} y {jurisdiccion} */
export function fillLegal(text: string, identity: LegalIdentity): string {
  const pending = legalText.pending;
  const values: Record<string, string> = {
    nombre: identity.name ?? pending,
    domicilio: identity.address ?? pending,
    correo: identity.email ?? pending,
    reembolsos: legalText.pendingPolicy.reembolsos,
    jurisdiccion: legalText.pendingPolicy.jurisdiccion,
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** El documento completo en Markdown, para mandárselo al abogado */
export function legalToMarkdown(doc: LegalDoc, identity: LegalIdentity): string {
  const fill = (text: string) => fillLegal(text, identity);
  const lines: string[] = [
    `# ${doc.title}`,
    '',
    `${legalText.version(doc.version)}. ${legalText.updated(doc.updated)}`,
    '',
    `> ${legalText.draftNotice}`,
    '',
    ...doc.intro.flatMap((paragraph) => [fill(paragraph), '']),
  ];
  for (const section of doc.sections) {
    lines.push(`## ${section.title}`, '');
    for (const paragraph of section.paragraphs ?? []) lines.push(fill(paragraph), '');
    if (section.bullets) {
      lines.push(...section.bullets.map((bullet) => `- ${fill(bullet)}`), '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
