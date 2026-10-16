import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FOUNDER_SEATS,
  GUARANTEE_DAYS,
  PASS_PRICES_MXN,
  PLANS,
  TRIAL_DAYS,
} from '../../config/billing';
import { PRIVACY_NOTICE_VERSION, type LegalIdentity } from '../../config/legal';
import { ConsentPurposeSchema } from '../../data/schemas/common';
import { consentTexts } from '../../i18n/consents';
import { legalText, type LegalDoc } from '../../i18n/legal';
import { legalDocs } from '../../i18n/legalDocs';
import { LEGAL_MARKS, fillLegal, legalLines, legalToMarkdown } from './fillLegal';

const EMPTY: LegalIdentity = { name: null, address: null, email: null, privacyEmail: null };
const FULL: LegalIdentity = {
  name: 'Studiare Educación SA de CV',
  address: 'Calle 60 número 100, Mérida, Yucatán',
  email: 'soporte@studiare.mx',
  privacyEmail: 'privacidad@studiare.mx',
};
const PLEXUS = 'Plexus Medica S. de R.L. de C.V.';

/** Todo lo que lee el alumno de un documento, como lo muestra la página */
const studentText = (doc: LegalDoc, identity: LegalIdentity = EMPTY) =>
  legalToMarkdown(doc, identity, 'student');
const section = (doc: LegalDoc, id: string) => {
  const found = doc.sections.find((item) => item.id === id);
  if (!found) throw new Error(`No existe la sección ${id}`);
  return found;
};
const mxn = (amount: number) => amount.toLocaleString('es-MX');

describe('fillLegal', () => {
  it('pone los datos del responsable donde van sus marcas, con el correo de cada cosa', () => {
    expect(
      fillLegal('{nombre} en {domicilio}. Escribe {contactoPrivacidad} o {contactoSoporte}.', FULL),
    ).toBe(
      'Studiare Educación SA de CV en Calle 60 número 100, Mérida, Yucatán. Escribe a privacidad@studiare.mx o a soporte@studiare.mx.',
    );
  });

  it('al alumno nunca le muestra una marca de pendiente. Lee un texto neutro y una línea sin su dato no va (B16)', () => {
    expect(fillLegal('El responsable es {nombre}.', EMPTY)).toBe(
      'El responsable es la empresa que opera Studiare.',
    );
    expect(fillLegal('Escribe {contactoSoporte}.', EMPTY)).toBe(
      'Escribe al equipo de Studiare por el medio donde te dieron acceso.',
    );
    expect(fillLegal('Su domicilio es {domicilio}.', EMPTY)).toBeNull();
    expect(fillLegal('Tribunales. {jurisdiccion}', FULL)).toBeNull();
    expect(fillLegal('Fuera de la garantía. {reembolsos}', FULL)).toBeNull();
  });

  it('al abogado le dice qué falta y quién lo pone, y nunca le esconde una línea (B16)', () => {
    expect(fillLegal('Su domicilio es {domicilio}.', EMPTY, 'lawyer')).toBe(
      'Su domicilio es [Pendiente de Ricardo. Domicilio del responsable].',
    );
    expect(fillLegal('Escribe {contactoPrivacidad}.', EMPTY, 'lawyer')).toBe(
      'Escribe a [Pendiente de Ricardo. Correo de privacidad].',
    );
    expect(fillLegal('Tribunales. {jurisdiccion}', FULL, 'lawyer')).toBe(
      'Tribunales. [Pendiente del abogado. Tribunales competentes]',
    );
  });

  it('una marca que no existe se queda como está, para que se note', () => {
    expect(fillLegal('hola {desconocida}', FULL)).toBe('hola {desconocida}');
  });
});

describe('textos legales', () => {
  const docs = [legalDocs.privacy, legalDocs.terms];

  it('toda marca de los textos es una que fillLegal sabe llenar', () => {
    for (const doc of docs) {
      const everything = JSON.stringify(doc);
      const marks = [...everything.matchAll(/\{(\w+)\}/g)].map(([, name]) => name);
      for (const name of marks) expect(LEGAL_MARKS).toContain(name);
    }
  });

  it('cada sección tiene un identificador único y contenido', () => {
    for (const doc of docs) {
      const ids = doc.sections.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const item of doc.sections) {
        expect((item.paragraphs?.length ?? 0) + (item.bullets?.length ?? 0)).toBeGreaterThan(0);
      }
    }
  });

  it('sin ningún dato del responsable cada sección le sigue diciendo algo al alumno (B16)', () => {
    for (const doc of docs) {
      for (const item of doc.sections) {
        const lines = [
          ...legalLines(item.paragraphs, EMPTY, 'student'),
          ...legalLines(item.bullets, EMPTY, 'student'),
        ];
        expect(lines.length, `${doc.title}, ${item.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('el alumno nunca lee una marca de pendiente ni un corchete, aunque falte todo (B16)', () => {
    const shown = [
      studentText(legalDocs.privacy),
      studentText(legalDocs.terms),
      legalText.draftNotice,
      ...Object.values(legalText.onboarding),
      ...Object.values(legalText.links),
    ].join('\n');
    expect(shown).not.toContain('[');
    expect(shown).not.toContain(']');
    expect(shown).not.toMatch(/\bpendiente/i);
    expect(shown).not.toContain('{');
    // Y no inventa un correo ni un domicilio
    expect(shown).not.toContain('@');
    expect(shown).not.toMatch(/domicilio es/);
  });

  it('el abogado sí ve qué falta en docs/legal (B16)', () => {
    const privacy = legalToMarkdown(legalDocs.privacy, EMPTY);
    expect(privacy).toContain('[Pendiente de Ricardo. Razón social del responsable]');
    expect(privacy).toContain('[Pendiente de Ricardo. Domicilio del responsable]');
    expect(privacy).toContain('a [Pendiente de Ricardo. Correo de privacidad]');
    const terms = legalToMarkdown(legalDocs.terms, EMPTY);
    expect(terms).toContain('a [Pendiente de Ricardo. Correo de soporte]');
    expect(terms).toContain('[Pendiente del abogado. Tribunales competentes]');
    expect(terms).toContain('[Pendiente del abogado. Qué reembolsos hay después de los 7 días]');
  });

  it('la razón social sale de VITE_LEGAL_NAME y nunca va escrita en el texto (respuestas 24 y 42)', () => {
    expect(JSON.stringify(legalText)).not.toMatch(/Plexus/i);
    const identity: LegalIdentity = { ...EMPTY, name: PLEXUS };
    expect(
      legalLines(section(legalDocs.privacy, 'responsable').paragraphs, identity, 'student'),
    ).toEqual([
      `El responsable de tus datos personales es ${PLEXUS}.`,
      'Para cualquier duda sobre este aviso o sobre tus datos, escribe al equipo de Studiare por el medio donde te dieron acceso.',
    ]);
    expect(studentText(legalDocs.terms, identity)).toContain(
      `Estos términos son el acuerdo entre tú y ${PLEXUS} sobre el uso de Studiare.`,
    );
  });

  it('la versión del aviso es la que se guarda al aceptarlo', () => {
    expect(legalDocs.privacy.version).toBe(PRIVACY_NOTICE_VERSION);
    // Una fecha, con una letra al final si es la segunda versión del mismo día
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}[a-z]?$/);
  });

  it('aviso y términos llevan su versión y la fecha de B16 a la vista', () => {
    // El aviso lleva la versión que acepta el alumno, 2026-10-15b, del mismo día que el primer borrador
    expect(legalDocs.privacy.version).toBe('2026-10-15b');
    expect(legalDocs.terms.version).toBe('2026-10-15');
    for (const doc of docs) expect(doc.updated).toBe('15 de octubre de 2026');
  });

  it('las versiones se comparan como texto, así que la de B16 va después de todas las anteriores', () => {
    // Como noticeNeedsAcceptance (<) y acceptedNoticeVersion (sort) en src/data/usecases/profile.ts
    const isAfter = (later: string, earlier: string) => later > earlier;
    expect(isAfter('2026-10-14b', '2026-10-14')).toBe(true);
    expect(isAfter('2026-10-15', '2026-10-14b')).toBe(true);
    expect(isAfter('2026-10-15b', '2026-10-15')).toBe(true);
    expect(isAfter('2026-10-16', '2026-10-15b')).toBe(true);
    // Las que hubo, en desorden, quedan en este orden: B7, B9, el primer borrador de B16 y B16
    expect(['2026-10-15b', '2026-10-14', '2026-10-15', '2026-10-14b'].sort()).toEqual([
      '2026-10-14',
      '2026-10-14b',
      '2026-10-15',
      '2026-10-15b',
    ]);
    // La versión vigente es la mayor de todas las conocidas, para que quien aceptó una anterior,
    // incluido el primer borrador de B16, vuelva a aceptar
    const earlier = ['2026-10-14', '2026-10-14b', '2026-10-15'];
    for (const version of earlier) {
      expect(isAfter(PRIVACY_NOTICE_VERSION, version), version).toBe(true);
    }
    expect([...earlier, PRIVACY_NOTICE_VERSION].sort().at(-1)).toBe(PRIVACY_NOTICE_VERSION);
  });

  it('dice qué se guarda al entrar con Google, de cómo nos conociste y de la edad (B9)', () => {
    const text = legalToMarkdown(legalDocs.privacy, EMPTY);
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
    const text = studentText(legalDocs.privacy, FULL);
    for (const word of ['Supabase', 'Stripe', 'Mercado Pago', 'Anthropic']) {
      expect(text).toContain(word);
    }
    // Los lugares de la app después de B3. Perfil para los datos y la foto, Privacidad para lo demás
    expect(text).toContain('Configuración, sección Perfil');
    expect(text).toContain('Configuración, sección Privacidad');
    expect(text).not.toContain('Configuración, Cuenta');
    expect(text).toContain('privacidad@studiare.mx');
  });

  it('cada encargado de B16 está en el aviso con lo que recibe, y los que no están activos lo dicen', () => {
    const bullets = section(legalDocs.privacy, 'terceros').bullets ?? [];
    const of = (name: string) => {
      const found = bullets.find((bullet) => bullet.startsWith(name));
      if (!found) throw new Error(`Falta ${name} en Con quién compartimos tus datos`);
      return found;
    };
    expect(of('Supabase')).toMatch(/base de datos.*inicio de sesión.*Supabase Storage/);
    expect(of('Google')).toMatch(/solo si eliges entrar con Google/);
    expect(of('Google')).toMatch(
      /Google Sheets que Studiare solo lee, y ahí no va ningún dato tuyo/,
    );
    expect(of('Stripe')).toMatch(/Recibe tu correo y el identificador de tu cuenta/);
    expect(of('Anthropic')).toMatch(/cuando usas una función de IA/);
    // Los que todavía no están activos (B10, B14, B15 y B17)
    for (const name of ['Mercado Pago', 'Resend', 'PostHog', 'Sentry', 'GitHub,']) {
      expect(of(name)).toMatch(/cuando se active/);
    }
    expect(of('Mercado Pago')).toMatch(/solo si lo eliges para pagar/);
    expect(of('Resend')).toMatch(/correos de acceso/);
    expect(of('Sentry')).toMatch(/solo con tu permiso Mejora con tus datos sin nombre/);
    expect(of('GitHub,')).toMatch(/permiso Mejora con tus datos sin nombre/);
  });

  it('PostHog solo con un permiso aparte de analítica, que empieza apagado (respuesta 78 y 4.27)', () => {
    const text = studentText(legalDocs.privacy);
    expect(text).toMatch(
      /PostHog, cuando se active.*Solo recibirá datos si das el permiso de analítica, que se pedirá aparte y empezará apagado/,
    );
    expect(text).toMatch(
      /Cuando activemos PostHog, solo funcionará en tu navegador si das el permiso/,
    );
  });

  it('OpenAI solo recibe texto del banco en evaluaciones internas, nunca datos del alumno (respuesta 38)', () => {
    const ia = (section(legalDocs.privacy, 'ia').paragraphs ?? []).join(' ');
    expect(ia).toMatch(/OpenAI no recibe datos tuyos/);
    expect(ia).toMatch(
      /evaluaciones internas para comparar la calidad de la IA, con texto del banco/,
    );
    // Y lo que el alumno pide con la IA, con su propio texto, también se dice
    expect(ia).toMatch(/tus apuntes o un texto o PDF que tú subes/);
  });

  it('las finalidades opcionales son justo los permisos que guarda la app, cada uno aparte y apagado (4.27)', () => {
    const optional = section(legalDocs.privacy, 'opcionales');
    const labels = ConsentPurposeSchema.options.map((purpose) => consentTexts.purposes[purpose][0]);
    expect(optional.bullets?.map((bullet) => bullet.split('.')[0])).toEqual(labels);
    expect(optional.paragraphs?.[0]).toMatch(/Cada una se pide por separado y empieza apagada/);
  });

  it('dice la huella del correo de una prueba gratis, que se conserva al eliminar la cuenta (B10, trial_history)', () => {
    const text = studentText(legalDocs.privacy);
    expect(text).toMatch(
      /Prueba gratis usada\. Si empiezas una prueba gratis, guardamos una huella de tu correo, que es un hash SHA-256/,
    );
    expect(text).toMatch(/La huella no guarda tu correo y solo sirve para comparar/);
    expect(text).toMatch(/Al eliminar tu cuenta se conserva, ya sin ligarla a tu cuenta/);
    expect(text).toMatch(/Si usaste una prueba gratis, se queda solo la huella de tu correo/);
    expect(text).toMatch(/sin fecha de borrado, solo para evitar pruebas repetidas/);
    expect(studentText(legalDocs.terms)).toMatch(
      /una sola vez por persona\. No se repite si eliminas tu cuenta y vuelves con el mismo correo/,
    );
  });

  it('dice la comparación con otros alumnos, solo con permiso, en percentiles y con grupos de 30 (B14)', () => {
    const text = studentText(legalDocs.privacy);
    expect(text).toMatch(/en percentiles de lo que ya pasó/);
    expect(text).toMatch(
      /solo con los datos de quienes dieron el permiso Mejora con tus datos sin nombre/,
    );
    expect(text).toMatch(/grupos de al menos 30 alumnos/);
    expect(text).toMatch(/nunca es un puntaje estimado del examen/);
    expect(text).toMatch(/Ese modelo es solo para ti y no predice tu puntaje/);
  });

  it('dice la factura, las lecturas del banco y los referidos, y qué deja Borrar mis datos (B7, B10 y B11)', () => {
    const text = studentText(legalDocs.privacy);
    expect(text).toMatch(
      /Factura\. Solo si pides una factura \(CFDI\), tu RFC, tu nombre o razón social, tu régimen fiscal, el código postal de tu domicilio fiscal, el uso del CFDI/,
    );
    expect(text).toMatch(/Lecturas del banco\..*el servidor cuenta el tope diario del plan Gratis/);
    expect(text).toMatch(
      /De tu estudio solo se quedan las preguntas del banco que abriste y tu uso de la IA del día de estudio en curso/,
    );
    expect(text).toMatch(/eliminar tu cuenta completa, y entonces se borra todo eso/);
    expect(text).toMatch(
      /Referidos\..*solo ve cuántos de sus referidos ya se concretaron y cuántos todavía no/,
    );
    expect(text).toMatch(/En Studiare tus pagos se borran con tu cuenta/);
  });

  it('dice dónde vive la foto de perfil, quién la ve y que se borra con la cuenta (B2)', () => {
    const text = legalToMarkdown(legalDocs.privacy, EMPTY);
    expect(text).toContain('Supabase Storage');
    expect(text).toMatch(/Foto de perfil\. Es opcional/);
    expect(text).toMatch(/La ves tú y, mientras compartan un grupo activo de Party/);
    expect(text).toMatch(/se borra al eliminar tu cuenta/);
    expect(text).toMatch(/Party\. Compartir tu alias, tu foto de perfil/);
  });

  it('dice que la IA no manda el nombre ni el correo y que no hay chat libre ni predicción', () => {
    const privacy = legalToMarkdown(legalDocs.privacy, EMPTY);
    expect(privacy).toMatch(/nunca viaja tu nombre ni tu correo/i);
    const terms = legalToMarkdown(legalDocs.terms, EMPTY);
    expect(terms).toMatch(/No hay chat libre/);
    expect(terms).toMatch(/no predice tu puntaje/i);
  });
});

describe('términos de B16', () => {
  const terms = studentText(legalDocs.terms);

  it('los precios son los de la configuración de pagos, con el IVA incluido', () => {
    expect(terms).toMatch(/con IVA incluido/);
    expect(terms).toContain(`Mensual, ${mxn(PLANS.monthly.priceMxn)} pesos al mes`);
    expect(terms).toContain(`Anual, ${mxn(PLANS.annual.priceMxn)} pesos al año`);
    expect(terms).toContain(`Fundador, ${mxn(PLANS.founder.priceMxn)} pesos al mes`);
    expect(terms).toContain(`con ${FOUNDER_SEATS} lugares en total`);
    expect(terms).toContain(`hasta ${PLANS.free.access.dailyQuestions ?? 0} preguntas al día`);
    // El Fundador anual, los pases, la prueba y la garantía salen de la configuración de B10
    expect(terms).toContain(`${mxn(PLANS.founder_annual.priceMxn)} pesos al año`);
    expect(terms).toContain(
      `Pases de un solo pago, ${mxn(PASS_PRICES_MXN.monthly)} pesos por 1 mes y ${mxn(PASS_PRICES_MXN.annual)} pesos por 1 año`,
    );
    expect(terms).toContain(`empiezan con ${TRIAL_DAYS} días gratis`);
    expect(terms).toContain(
      `Garantía de ${GUARANTEE_DAYS} días. Tienes ${GUARANTEE_DAYS} días naturales`,
    );
  });

  it('la prueba gratis dice el cobro automático antes de pedir la tarjeta (4.18)', () => {
    expect(terms).toMatch(
      /Antes de pedirte la tarjeta te decimos la fecha y el monto del primer cobro\. Ese cobro es automático al terminar la prueba/,
    );
    expect(terms).toMatch(/una sola vez por persona/);
    expect(terms).toMatch(/Si cancelas durante la prueba, no se te cobra nada/);
  });

  it('dice la garantía, el cambio con prorrateo y los pases sin renovación (4.4 y respuestas 9 y 10)', () => {
    expect(terms).toMatch(/reembolso completo de ese pago/);
    expect(terms).toMatch(/se cobra ese día la diferencia con prorrateo/);
    expect(terms).toMatch(/el cambio se aplica al terminar el periodo que ya pagaste/);
    expect(terms).toMatch(/OXXO o por transferencia SPEI/);
    expect(terms).toMatch(/Un pase no se renueva ni guarda tu tarjeta/);
  });

  it('dice el registro con invitación y la edad mínima (respuesta 52 y pregunta 45)', () => {
    expect(terms).toMatch(/Registro con invitación\. Hasta que Studiare abra el registro/);
    expect(terms).toMatch(/Debes tener 18 años o más/);
  });

  it('dice las condiciones del Fundador (4.5, 4.6 y respuesta 17)', () => {
    const fundador = (section(legalDocs.terms, 'fundador').bullets ?? []).join(' ');
    expect(fundador).toMatch(/100 lugares en total que comparten los dos/);
    expect(fundador).toMatch(/Solo se paga con tarjeta en Stripe y con renovación automática/);
    expect(fundador).toMatch(/Tu lugar se aparta al empezar la prueba gratis/);
    expect(fundador).toMatch(/el lugar se libera para otra persona/);
    expect(fundador).toMatch(
      /pierdes el precio Fundador y tu lugar, y ese lugar no se vuelve a abrir/,
    );
  });
});

describe('Markdown para el abogado', () => {
  it('lleva el borrador, la versión y todas las secciones', () => {
    const markdown = legalToMarkdown(legalDocs.terms, EMPTY);
    expect(markdown.startsWith('# Términos y condiciones\n')).toBe(true);
    expect(markdown).toContain(legalText.draftNotice);
    expect(markdown).toContain(legalText.version(legalDocs.terms.version));
    for (const item of legalDocs.terms.sections) expect(markdown).toContain(`## ${item.title}`);
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('el borrador sigue marcado para revisión del abogado (0.1 del plan del cambio)', () => {
    expect(legalText.draftNotice).toMatch(/^Borrador para revisión del abogado\./);
  });

  it('los archivos de docs/legal están al día con el texto de la app', () => {
    // Si falla, corre npm run legal:export y revisa el cambio antes de mandarlo al abogado
    const dir = join(import.meta.dirname, '..', '..', '..', 'docs', 'legal');
    expect(readFileSync(join(dir, 'aviso-de-privacidad.md'), 'utf8')).toBe(
      legalToMarkdown(legalDocs.privacy, EMPTY),
    );
    expect(readFileSync(join(dir, 'terminos-y-condiciones.md'), 'utf8')).toBe(
      legalToMarkdown(legalDocs.terms, EMPTY),
    );
  });
});
