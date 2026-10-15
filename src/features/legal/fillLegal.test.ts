import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE_VERSION, type LegalIdentity } from '../../config/legal';
import { legalText } from '../../i18n/legal';
import { fillLegal, legalToMarkdown } from './fillLegal';

const EMPTY: LegalIdentity = { name: null, address: null, email: null };
const FULL: LegalIdentity = {
  name: 'Studiare Educación SA de CV',
  address: 'Calle 60 número 100, Mérida, Yucatán',
  email: 'privacidad@studiare.mx',
};

describe('fillLegal', () => {
  it('pone los datos del responsable donde van sus marcas', () => {
    expect(fillLegal('Escribe a {correo}. {nombre} en {domicilio}.', FULL)).toBe(
      'Escribe a privacidad@studiare.mx. Studiare Educación SA de CV en Calle 60 número 100, Mérida, Yucatán.',
    );
  });

  it('sin datos deja claro que falta completarlos y nunca inventa uno', () => {
    const filled = fillLegal('{nombre} {domicilio} {correo}', EMPTY);
    expect(filled).toBe(`${legalText.pending} ${legalText.pending} ${legalText.pending}`);
  });

  it('las políticas que no se han decidido también quedan marcadas como pendientes', () => {
    expect(fillLegal('{reembolsos} {jurisdiccion}', FULL)).toContain('pendiente de definir');
  });

  it('una marca que no existe se queda como está, para que se note', () => {
    expect(fillLegal('hola {desconocida}', FULL)).toBe('hola {desconocida}');
  });
});

describe('textos legales', () => {
  const docs = [legalText.privacy, legalText.terms];

  it('toda marca de los textos es una que fillLegal sabe llenar', () => {
    for (const doc of docs) {
      const everything = JSON.stringify(doc);
      const marks = [...everything.matchAll(/\{(\w+)\}/g)].map(([, name]) => name);
      for (const name of marks) {
        expect(['nombre', 'domicilio', 'correo', 'reembolsos', 'jurisdiccion']).toContain(name);
      }
    }
  });

  it('cada sección tiene un identificador único y contenido', () => {
    for (const doc of docs) {
      const ids = doc.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const section of doc.sections) {
        expect((section.paragraphs?.length ?? 0) + (section.bullets?.length ?? 0)).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it('la versión del aviso es la que se guarda al aceptarlo', () => {
    expect(legalText.privacy.version).toBe(PRIVACY_NOTICE_VERSION);
    // Una fecha, con una letra al final si es la segunda versión del mismo día
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}[a-z]?$/);
  });

  it('las versiones se comparan como texto, así que 2026-10-14b va después de 2026-10-14 (B9)', () => {
    // Como noticeNeedsAcceptance (<) y acceptedNoticeVersion (sort) en src/data/usecases/profile.ts
    const isAfter = (later: string, earlier: string) => later > earlier;
    expect(isAfter('2026-10-14b', '2026-10-14')).toBe(true);
    expect(isAfter('2026-10-15', '2026-10-14b')).toBe(true);
    expect(['2026-10-15', '2026-10-14b', '2026-10-14'].sort()).toEqual([
      '2026-10-14',
      '2026-10-14b',
      '2026-10-15',
    ]);
    // La versión vigente nunca queda antes de la de B9, para que quien aceptó una anterior lo vuelva a ver
    expect(isAfter('2026-10-14b', PRIVACY_NOTICE_VERSION)).toBe(false);
  });

  it('dice qué se guarda al entrar con Google, de cómo nos conociste y de la edad (B9)', () => {
    const text = legalToMarkdown(legalText.privacy, EMPTY);
    expect(text).toMatch(/Entrar con Google\. Es opcional/);
    expect(text).toMatch(/Usamos solo tu correo/);
    expect(text).toMatch(/Nunca recibimos tu contraseña de Google/);
    expect(text).toMatch(/Google, solo si eliges entrar con Google/);
    expect(text).toMatch(/Cómo nos conociste\. Es opcional/);
    expect(text).toMatch(/en conteos totales/);
    expect(text).toMatch(/no va a herramientas de analítica/);
    expect(text).toMatch(
      /Guardamos solo la fecha y la hora en que lo confirmaste, no tu fecha de nacimiento/,
    );
    expect(text).toMatch(/18 años o más/);
  });

  it('el aviso nombra a quienes reciben datos y dice cómo ejercer los derechos', () => {
    const text = legalToMarkdown(legalText.privacy, FULL);
    for (const word of ['Supabase', 'Stripe', 'Mercado Pago', 'Anthropic']) {
      expect(text).toContain(word);
    }
    // Los lugares de la app después de B3. Perfil para los datos y la foto, Privacidad para lo demás
    expect(text).toContain('Configuración, sección Perfil');
    expect(text).toContain('Configuración, sección Privacidad');
    expect(text).not.toContain('Configuración, Cuenta');
    expect(text).toContain('privacidad@studiare.mx');
  });

  it('dice dónde vive la foto de perfil, quién la ve y que se borra con la cuenta (B2)', () => {
    const text = legalToMarkdown(legalText.privacy, EMPTY);
    expect(text).toContain('Supabase Storage');
    expect(text).toMatch(/Foto de perfil\. Es opcional/);
    expect(text).toMatch(/La ves tú y, mientras compartan un grupo activo de Party/);
    expect(text).toMatch(/se borra al eliminar tu cuenta/);
    expect(text).toMatch(/Party\. Compartir tu alias, tu foto de perfil/);
  });

  it('dice que la IA no manda el nombre ni el correo y que no hay chat libre ni predicción', () => {
    const privacy = legalToMarkdown(legalText.privacy, EMPTY);
    expect(privacy).toMatch(/nunca viaja tu nombre ni tu correo/i);
    const terms = legalToMarkdown(legalText.terms, EMPTY);
    expect(terms).toMatch(/No hay chat libre/);
    expect(terms).toMatch(/no predice tu puntaje/i);
  });
});

describe('Markdown para el abogado', () => {
  it('lleva el borrador, la versión y todas las secciones', () => {
    const markdown = legalToMarkdown(legalText.terms, EMPTY);
    expect(markdown.startsWith('# Términos y condiciones\n')).toBe(true);
    expect(markdown).toContain(legalText.draftNotice);
    expect(markdown).toContain(legalText.version(legalText.terms.version));
    for (const section of legalText.terms.sections)
      expect(markdown).toContain(`## ${section.title}`);
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('los archivos de docs/legal están al día con el texto de la app', () => {
    // Si falla, corre npm run legal:export y revisa el cambio antes de mandarlo al abogado
    const dir = join(import.meta.dirname, '..', '..', '..', 'docs', 'legal');
    expect(readFileSync(join(dir, 'aviso-de-privacidad.md'), 'utf8')).toBe(
      legalToMarkdown(legalText.privacy, EMPTY),
    );
    expect(readFileSync(join(dir, 'terminos-y-condiciones.md'), 'utf8')).toBe(
      legalToMarkdown(legalText.terms, EMPTY),
    );
  });
});
