// Textos cortos de la parte legal, como los enlaces, el aviso de borrador y lo que se escribe donde
// falta un dato. Cargan con la app. El aviso de privacidad y los términos completos viven en
// src/i18n/legalDocs.ts y solo cargan con la página legal (B16 del plan del cambio).

export type { LegalDoc, LegalSection } from './legalDocs.ts';

/** Lo que el alumno lee donde falta un dato del responsable, como en el aviso del límite de dispositivos */
const neutralContact = 'al equipo de Studiare por el medio donde te dieron acceso';

export const legalText = {
  /** Aviso que se muestra arriba de cada documento mientras el abogado no lo apruebe (respuesta 44) */
  draftNotice: 'Borrador para revisión del abogado. Todavía no es el texto legal definitivo.',
  /**
   * Lo que se escribe donde falta un dato. El alumno nunca ve una marca entre corchetes. Lee un texto
   * neutro y, si la línea no dice nada sin el dato (null), no la ve. El abogado ve qué falta y quién lo
   * pone. Las de contacto llevan su preposición, igual que el valor configurado
   */
  missing: {
    student: {
      nombre: 'la empresa que opera Studiare',
      domicilio: null,
      contactoPrivacidad: neutralContact,
      contactoSoporte: neutralContact,
      reembolsos: null,
      jurisdiccion: null,
    },
    lawyer: {
      nombre: '[Pendiente de Ricardo. Razón social del responsable]',
      domicilio: '[Pendiente de Ricardo. Domicilio del responsable]',
      contactoPrivacidad: 'a [Pendiente de Ricardo. Correo de privacidad]',
      contactoSoporte: 'a [Pendiente de Ricardo. Correo de soporte]',
      reembolsos: '[Pendiente del abogado. Qué reembolsos hay después de los 7 días]',
      jurisdiccion: '[Pendiente del abogado. Tribunales competentes]',
    },
  },
  updated: (date: string) => `Última actualización, ${date}`,
  version: (version: string) => `Versión ${version}`,
  links: {
    privacy: 'Aviso de privacidad',
    terms: 'Términos y condiciones',
    legal: 'Información legal',
    backHome: 'Volver al inicio',
    contents: 'En esta página',
  },
  onboarding: {
    accept: 'Leí y acepto el aviso de privacidad y los términos y condiciones',
    summary:
      'Usamos tus datos para darte tu plan de estudio, tus estadísticas y tu repaso. Party, el análisis con IA y la mejora anónima son opcionales, empiezan apagados y los cambias cuando quieras. A la IA viajan identificadores seudónimos y el texto del banco o el que tú eliges, nunca tu nombre ni tu correo. Puedes descargar o borrar tus datos y eliminar tu cuenta cuando quieras. Es un borrador para revisión del abogado.',
    read: 'Leer el aviso de privacidad completo',
    readTerms: 'Leer los términos y condiciones',
    newTab: 'se abre en otra pestaña',
  },
} as const;

export type LegalKey = 'privacy' | 'terms';
