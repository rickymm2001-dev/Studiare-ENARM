// Exporta el aviso de privacidad y los términos a Markdown, con el mismo texto que ve el alumno en
// la app, para mandárselos al abogado (Fase G, G2). Los datos del responsable salen de
// VITE_LEGAL_NAME, VITE_LEGAL_ADDRESS y VITE_SUPPORT_EMAIL. Los que falten quedan marcados como
// pendientes. Uso: node scripts/legal-export.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLegalIdentity } from '../src/config/legal.ts';
import { legalToMarkdown } from '../src/features/legal/fillLegal.ts';
import { legalText } from '../src/i18n/legal.ts';

export const LEGAL_FILES = {
  privacy: 'aviso-de-privacidad.md',
  terms: 'terminos-y-condiciones.md',
} as const;

if (process.argv[1]?.endsWith('legal-export.ts')) {
  const dir = join(import.meta.dirname, '..', 'docs', 'legal');
  mkdirSync(dir, { recursive: true });
  const identity = readLegalIdentity(process.env);
  for (const key of ['privacy', 'terms'] as const) {
    writeFileSync(join(dir, LEGAL_FILES[key]), legalToMarkdown(legalText[key], identity));
  }
  console.log(`Textos legales escritos en ${dir}`);
}
