// Aviso de privacidad y términos y condiciones (Fase G, G2). Son un BORRADOR escrito para que lo
// revise un abogado antes de abrir a alumnos de pago. La app los muestra como páginas y
// docs/legal los exporta con este mismo texto, para que el abogado revise exactamente lo que ve el
// alumno. Los datos del responsable salen de src/config/legal.ts y entran por las marcas
// {nombre}, {domicilio} y {correo}. Trato de tú, frases cortas y sin promesas que el producto no
// cumpla. Si cambia lo que se hace con los datos, cambia este texto y sube la versión.

import { PRIVACY_NOTICE_VERSION } from '../config/legal.ts';

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
}

export interface LegalDoc {
  title: string;
  /** Versión del documento. La del aviso de privacidad es la que acepta el alumno */
  version: string;
  /** Fecha de la versión, en texto, como se lee en la página */
  updated: string;
  intro: readonly string[];
  sections: readonly LegalSection[];
}

const privacy: LegalDoc = {
  title: 'Aviso de privacidad',
  version: PRIVACY_NOTICE_VERSION,
  updated: '10 de octubre de 2026',
  intro: [
    'En Studiare cuidamos tus datos. Este aviso explica quién los trata, cuáles son, para qué los usamos, con quién se comparten y cómo ejerces tus derechos. Si algo no queda claro, escríbenos.',
  ],
  sections: [
    {
      id: 'responsable',
      title: 'Quién es el responsable',
      paragraphs: [
        'El responsable de tus datos personales es {nombre}, con domicilio en {domicilio}.',
        'Para cualquier duda sobre este aviso o sobre tus datos, escribe a {correo}.',
      ],
    },
    {
      id: 'datos',
      title: 'Qué datos tratamos',
      bullets: [
        'Cuenta. Tu alias, tu correo, y de forma opcional tu año de nacimiento, sexo, estado, situación, intento del examen y especialidad que buscas, además del avatar que elijas.',
        'Estudio. Tus respuestas a preguntas y tarjetas, los tiempos, la confianza que marcas, las causas de tus errores, tus mazos y apuntes, tus metas y tus ajustes.',
        'Puntaje oficial. Solo si tú decides capturarlo, con tu permiso de mejora anónima.',
        'Pagos. El identificador y el estado de tus pagos y de tu plan. Nunca vemos ni guardamos los datos de tu tarjeta, que viven en la pasarela de pagos.',
        'Técnicos. Qué dispositivo tiene activa tu cuenta, la zona horaria y los avisos de seguridad de tu sesión.',
      ],
      paragraphs: [
        'Tratamos los datos de la lista. No tratamos datos sensibles de salud tuyos, porque los textos médicos de la plataforma son material de estudio y no información sobre ti.',
      ],
    },
    {
      id: 'finalidades',
      title: 'Para qué los usamos',
      paragraphs: ['Para lo que necesitamos hacer para darte el servicio.'],
      bullets: [
        'Crear y mantener tu cuenta, y que solo tú entres a ella.',
        'Darte tu plan de estudio, tus estadísticas, tu repaso y tus simuladores.',
        'Sincronizar tu estudio entre tus dispositivos, uno activo a la vez.',
        'Cobrar tu plan y atender tus pagos y aclaraciones.',
        'Cuidar la seguridad de la plataforma y prevenir abusos.',
        'Responder a tus solicitudes y cumplir obligaciones legales.',
      ],
    },
    {
      id: 'opcionales',
      title: 'Lo que solo hacemos si lo permites',
      paragraphs: [
        'Estas finalidades son opcionales. Las das al crear tu perfil y las cambias cuando quieras en Configuración, Privacidad. Decir que no a una no te quita el resto del servicio.',
      ],
      bullets: [
        'Party. Compartir tu alias, XP, nivel y racha con los grupos a los que te unas.',
        'Análisis con IA. Usar tus errores para que el tutor te dé hipótesis y un informe con IA.',
        'Mejora anónima. Usar tus datos sin identidad para mejorar el banco de preguntas y medir si lo que se estudia se parece al examen. Aquí entra tu puntaje oficial, si lo capturas. Si retiras este permiso, tu puntaje se borra.',
      ],
    },
    {
      id: 'ia',
      title: 'Qué pasa con la inteligencia artificial',
      paragraphs: [
        'Cuando el análisis con IA está encendido, a la IA solo viajan identificadores seudónimos y texto del banco de preguntas. Nunca viaja tu nombre ni tu correo, y un filtro quita correos, teléfonos y nombres antes de enviar.',
        'Lo que escribe la IA queda como borrador, marcado como no validado por un médico. La IA no corrige por su cuenta lo que considera mal, solo lo señala, y no predice tu puntaje del examen.',
        'La IA la presta Anthropic, que actúa como proveedor de la plataforma. Si agregamos otro proveedor de IA, actualizamos este aviso antes.',
      ],
    },
    {
      id: 'terceros',
      title: 'Con quién compartimos tus datos',
      paragraphs: [
        'No vendemos tus datos. Solo los compartimos con proveedores que nos ayudan a operar la plataforma, y solo lo necesario para su tarea.',
      ],
      bullets: [
        'Supabase, que aloja la base de datos y el inicio de sesión.',
        'Stripe y Mercado Pago, que procesan los pagos. Reciben lo que necesitan para cobrar y no lo usamos para otra cosa.',
        'Anthropic, solo si encendiste el análisis con IA, con lo que se explicó arriba.',
        'El proveedor que envía los correos de acceso a tu cuenta.',
        'El servicio que aloja la página, como GitHub Pages o Cloudflare, que ve datos técnicos de tu conexión, como la dirección IP.',
        'Autoridades, cuando una ley o una orden de autoridad competente lo exija.',
      ],
    },
    {
      id: 'derechos',
      title: 'Tus derechos y cómo ejercerlos',
      paragraphs: [
        'Tienes derecho a acceder a tus datos, rectificarlos, cancelarlos y oponerte a que se usen, y a retirar tu consentimiento. Casi todo lo haces tú solo en la app.',
      ],
      bullets: [
        'Acceder. En Configuración, Cuenta, descargas todos tus datos en un archivo.',
        'Rectificar. Cambias tu alias, tus datos de cuenta y tus ajustes en Perfil y Configuración.',
        'Cancelar. En Configuración, Cuenta, borras tus datos de estudio, y también puedes eliminar tu cuenta completa. Se borran del dispositivo y de la nube.',
        'Oponerte o retirar un permiso. En Configuración, Privacidad.',
        'Por correo. Si prefieres, escribe a {correo} con tu nombre y lo que pides, y respondemos en un plazo razonable.',
      ],
    },
    {
      id: 'conservacion',
      title: 'Cuánto tiempo los conservamos',
      paragraphs: [
        'Conservamos tus datos mientras tengas cuenta. Si borras tus datos o eliminas tu cuenta, los quitamos de nuestra base. Los cobros que ya procesó la pasarela de pagos se conservan allá el tiempo que la ley fiscal exige, y a nosotros nos queda solo el registro de que existieron.',
      ],
    },
    {
      id: 'almacenamiento',
      title: 'Cookies y almacenamiento en tu navegador',
      paragraphs: [
        'Studiare guarda en tu navegador tus datos de estudio y tus preferencias, para funcionar sin conexión. No usamos cookies de publicidad ni herramientas de rastreo de terceros.',
      ],
    },
    {
      id: 'menores',
      title: 'Personas menores de edad',
      paragraphs: [
        'Studiare es para personas mayores de 18 años que se preparan para el examen. Si crees que una persona menor de edad creó una cuenta, escríbenos y la eliminamos.',
      ],
    },
    {
      id: 'cambios',
      title: 'Cambios a este aviso',
      paragraphs: [
        'Si cambia lo que hacemos con tus datos, actualizamos este aviso, cambiamos su fecha y su versión, y te pedimos aceptarlo de nuevo. La versión que aceptaste queda guardada con la fecha en que la aceptaste.',
      ],
    },
  ],
};

const terms: LegalDoc = {
  title: 'Términos y condiciones',
  version: '2026-10-10',
  updated: '10 de octubre de 2026',
  intro: [
    'Estos términos son el acuerdo entre tú y {nombre} para usar Studiare. Al crear tu cuenta aceptas lo que dicen. Léelos con calma.',
  ],
  sections: [
    {
      id: 'servicio',
      title: 'Qué es Studiare y qué no es',
      paragraphs: [
        'Studiare es una herramienta de estudio para prepararte para el examen ENARM. Te da repaso con tarjetas, simuladores, estadísticas y un tutor.',
        'No es un servicio médico ni da consejo médico. Los textos del banco, las tarjetas y las explicaciones son material de estudio y pueden contener errores. Lo que escribe la IA es un borrador que ningún médico ha validado. Antes de tomar una decisión clínica real, consulta una fuente oficial.',
        'Studiare no predice tu puntaje en el examen y no garantiza que lo apruebes ni que obtengas la plaza que buscas.',
      ],
    },
    {
      id: 'cuenta',
      title: 'Tu cuenta',
      bullets: [
        'Debes ser mayor de 18 años y darnos datos verdaderos.',
        'La cuenta es personal. No la compartas ni la vendas.',
        'Solo un dispositivo tiene activa tu cuenta a la vez, y el cambio de dispositivo está limitado. Es una medida de seguridad y de uso personal.',
        'Cuida el acceso a tu correo, porque con él entras a tu cuenta. Avísanos si crees que alguien más entró.',
      ],
    },
    {
      id: 'planes',
      title: 'Planes, pagos y cancelación',
      paragraphs: [
        'El plan Gratis tiene un límite de preguntas distintas por día. Los planes de pago quitan ese límite y suman funciones, como el análisis con IA y la generación de tarjetas. Los precios en pesos mexicanos se muestran en Suscripción antes de pagar.',
        'Los pagos los procesan Stripe y Mercado Pago, y tu plan se activa cuando la pasarela nos avisa que el pago se confirmó. El plan Fundador tiene un cupo limitado y se conserva mientras no lo canceles.',
      ],
      bullets: [
        'Cancelas cuando quieras. Conservas tu plan hasta que termine el periodo que ya pagaste.',
        'Reembolsos. {reembolsos}',
        'Si un cobro sale mal o no lo reconoces, escríbenos a {correo} y lo revisamos.',
      ],
    },
    {
      id: 'uso',
      title: 'Cómo puedes usar la plataforma',
      paragraphs: ['Tu uso es personal y para estudiar. Está prohibido'],
      bullets: [
        'Copiar, descargar de forma masiva, revender o publicar el banco de preguntas, las tarjetas o las explicaciones.',
        'Usar programas para automatizar el uso, saltarte los límites de tu plan o probar la seguridad sin permiso.',
        'Subir contenido sobre el que no tengas derechos, o que sea ilegal u ofensivo.',
        'Intentar entrar a la cuenta de otra persona.',
      ],
    },
    {
      id: 'contenido',
      title: 'Contenido y propiedad intelectual',
      paragraphs: [
        'La plataforma, su diseño, su software y su banco de preguntas son de Studiare o de quienes nos los licencian. Te damos permiso de usarlos para estudiar mientras tengas cuenta, y nada más.',
        'Lo que tú creas o importas, como tus apuntes, tus tarjetas y tus mazos, sigue siendo tuyo. Nos das permiso de guardarlo y procesarlo solo para darte el servicio, y no lo compartimos con otras personas sin tu consentimiento. Si importas material de otra persona, como un mazo de Anki, tú te aseguras de tener derecho a usarlo.',
      ],
    },
    {
      id: 'ia',
      title: 'Sobre la inteligencia artificial',
      paragraphs: [
        'Las funciones de IA explican, resumen y proponen, siempre sobre el banco o sobre el texto que tú aportas. No hay chat libre. La IA puede equivocarse. Lo que genera queda marcado como borrador y no es un consejo médico.',
      ],
    },
    {
      id: 'disponibilidad',
      title: 'Disponibilidad y cambios',
      paragraphs: [
        'Hacemos lo posible por que la plataforma funcione siempre, pero no podemos prometer que no tendrá fallas ni interrupciones. Podemos mejorar, cambiar o quitar funciones, avisándote cuando afecte a tu plan.',
        'Si incumples estos términos, podemos suspender o cerrar tu cuenta.',
      ],
    },
    {
      id: 'responsabilidad',
      title: 'Límites de nuestra responsabilidad',
      paragraphs: [
        'En la medida que la ley lo permite, Studiare no responde por decisiones que tomes con base en el material de estudio ni por resultados del examen. Nuestra responsabilidad frente a ti se limita, como máximo, a lo que hayas pagado en los últimos 12 meses.',
      ],
    },
    {
      id: 'cambios',
      title: 'Cambios a estos términos',
      paragraphs: [
        'Si los cambiamos, publicamos la versión nueva aquí con su fecha y te avisamos. Si sigues usando Studiare después de un cambio, aceptas la versión nueva. Si no estás de acuerdo, puedes eliminar tu cuenta.',
      ],
    },
    {
      id: 'ley',
      title: 'Ley aplicable',
      paragraphs: [
        'Estos términos se rigen por las leyes de México. {jurisdiccion}',
        'Si tienes una duda o una queja, escríbenos primero a {correo}. Casi siempre se resuelve ahí.',
      ],
    },
  ],
};

export const legalText = {
  /** Aviso que se muestra arriba de cada documento mientras no lo apruebe un abogado */
  draftNotice:
    'Borrador pendiente de revisión de un abogado. Todavía no es el texto legal definitivo.',
  /** Lo que se escribe donde falta un dato del responsable */
  pending: '[pendiente de completar]',
  /** Lo que reemplaza a las marcas que no dependen de variables de entorno, mientras no se decidan */
  pendingPolicy: {
    reembolsos: '[pendiente de definir la política de reembolsos]',
    jurisdiccion: '[pendiente de definir los tribunales competentes]',
  },
  updated: (date: string) => `Última actualización, ${date}`,
  version: (version: string) => `Versión ${version}`,
  privacy,
  terms,
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
      'Usamos tus datos para darte tu plan de estudio, tus estadísticas y tu repaso. El análisis con IA, Party y la mejora anónima son opcionales y los cambias cuando quieras. A la IA solo viajan identificadores seudónimos y texto del banco, nunca tu nombre ni tu correo. Puedes descargar o borrar tus datos y eliminar tu cuenta cuando quieras. Es un borrador pendiente de revisión legal.',
    read: 'Leer el aviso de privacidad completo',
    readTerms: 'Leer los términos y condiciones',
    newTab: 'se abre en otra pestaña',
  },
} as const;

export type LegalKey = 'privacy' | 'terms';
