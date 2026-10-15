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
  updated: '14 de octubre de 2026',
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
        'Cuenta. Tu alias, tu correo, y de forma opcional tu año de nacimiento, sexo, estado, situación, intento del examen y especialidad que buscas.',
        'Edad mínima. Al crear tu cuenta confirmas que tienes 18 años o más. Guardamos solo la fecha y la hora en que lo confirmaste, no tu fecha de nacimiento. Esa fecha ya no cambia y se borra al eliminar tu cuenta.',
        'Entrar con Google. Es opcional. Si lo eliges, Google nos comparte el correo, el nombre y la foto de tu cuenta de Google. Usamos solo tu correo, para tu cuenta. Tu nombre y tu foto de Google quedan guardados en el registro de acceso de Supabase, pero Studiare no los usa ni los muestra. Tu alias y tu foto en Studiare son los que tú eliges. Nunca recibimos tu contraseña de Google.',
        'Cómo nos conociste. Es opcional. Si contestas, guardamos el canal que elegiste, como Instagram, un amigo o tu universidad, el código de influencer si escribiste uno y la fecha. Solo lo usamos para medir, en conteos totales, por dónde llega la gente a Studiare. En la app el equipo solo ve esos conteos, nunca tu respuesta junto a tu cuenta. No la usamos para mandarte publicidad, no va a herramientas de analítica y se borra al eliminar tu cuenta.',
        'Foto de perfil. Es opcional. Si subes una, la guardamos en Supabase Storage, en un espacio privado de tu cuenta. La ves tú y, mientras compartan un grupo activo de Party, los miembros de ese grupo. Si eliges tus iniciales la quitamos de la nube, y se borra al eliminar tu cuenta.',
        'Estudio. Tus respuestas a preguntas y tarjetas, los tiempos, la confianza que marcas, las causas de tus errores, tus mazos y apuntes, tus metas y tus ajustes.',
        'Facturación. Si solicitas factura fiscal (CFDI), tu nombre o razón social, RFC, régimen fiscal, código postal de tu domicilio fiscal y uso de CFDI, únicamente para emitir el comprobante y cumplir la ley.',
        'Puntaje oficial. Solo si tú decides capturarlo en Progreso, con tu permiso de mejora anónima, que das o retiras en Configuración, sección Privacidad.',
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
        'Crear y mantener tu cuenta, confirmar que tienes la edad mínima y que solo tú entres a ella.',
        'Darte tu plan de estudio, tus estadísticas, tu repaso y tus simuladores.',
        'Sincronizar tu estudio entre tus dispositivos, uno activo a la vez.',
        'Cobrar tu plan o pase, emitir tus facturas si las pides y atender aclaraciones.',
        'Cuidar la seguridad de la plataforma y prevenir abusos.',
        'Responder a tus solicitudes y cumplir obligaciones legales y fiscales.',
      ],
    },
    {
      id: 'opcionales',
      title: 'Lo que solo hacemos si lo permites',
      paragraphs: [
        'Estas finalidades son opcionales y empiezan apagadas por omisión. Cada consentimiento se solicita por separado y tú decides cuáles activar al registrarte o en cualquier momento desde Configuración, sección Privacidad. Decir que no a cualquiera de ellas no afecta el funcionamiento del resto del servicio.',
      ],
      bullets: [
        'Party. Compartir tu alias, tu foto de perfil si subiste una, tu XP de la semana y tu aporte a los retos con los miembros de los grupos a los que te unas, y en un duelo tus aciertos y tu tiempo. Tus compañeros nunca ven tu correo ni tus demás datos de cuenta.',
        'Análisis con IA. Usar tus errores para que el tutor te dé hipótesis y un informe con IA.',
        'Mejora anónima. Usar tus datos sin identidad para mejorar el banco de preguntas y medir si lo que se estudia se parece al examen. Aquí entra tu puntaje oficial, si lo capturas. Si retiras este permiso, tu puntaje se borra. También entran los reportes de fallas de la app, que dicen qué falló, en qué pantalla y en qué versión, sin tu nombre, tu correo ni tus identificadores, y se guardan 14 días.',
      ],
    },
    {
      id: 'ia',
      title: 'Qué pasa con la inteligencia artificial',
      paragraphs: [
        'Cuando el análisis con IA está encendido, a la IA solo viajan identificadores seudónimos y texto del banco de preguntas o de tus apuntes. Nunca viaja tu nombre ni tu correo, y un filtro quita correos, teléfonos y nombres antes de enviar.',
        'Lo que escribe la IA queda como borrador, marcado como no validado por un médico. La IA no corrige por su cuenta lo que considera mal, solo lo señala, y no predice tu puntaje del examen.',
        'La IA de la plataforma la presta Anthropic como encargado. OpenAI se utiliza únicamente en evaluaciones internas de calidad y consistencia del banco de preguntas; solo recibe texto del banco con identificadores seudónimos y nunca datos, nombres ni actividad de alumnos.',
      ],
    },
    {
      id: 'terceros',
      title: 'Con quién compartimos tus datos',
      paragraphs: [
        'No vendemos tus datos. Solo los compartimos con encargados y proveedores que nos ayudan a operar la plataforma, y solo lo necesario para su tarea.',
      ],
      bullets: [
        'Supabase, que aloja la base de datos, el inicio de sesión y los archivos, como tu foto de perfil en Supabase Storage.',
        'Google, solo si eliges entrar con Google. Confirma quién eres y nos manda los datos de tu cuenta de Google que se explican arriba. No le mandamos tus datos de estudio.',
        'Stripe y Mercado Pago, que procesan los pagos y suscripciones con tarjeta, OXXO y SPEI. Reciben lo que necesitan para cobrar y facturar.',
        'Resend, que envía los correos transaccionales para entrar a tu cuenta y los avisos de la plataforma.',
        'PostHog, para analítica del producto y métricas de uso, solo si diste tu consentimiento para ello.',
        'Sentry, para registrar errores y fallas técnicas de la aplicación, sin datos personales sensibles.',
        'Anthropic, solo si encendiste el análisis con IA, con identificadores seudónimos y texto de estudio, como se explicó arriba.',
        'El servicio que aloja el proxy de IA, solo si encendiste el análisis con IA. Recibe el identificador seudónimo de tu cuenta, el texto de la llamada de IA y los datos técnicos de tu conexión, como la dirección IP.',
        'El servicio que aloja la página y la red de distribución (como Cloudflare o GitHub Pages), que ve datos técnicos de tu conexión, como la dirección IP.',
        'Autoridades competentes, cuando una ley o una orden fundada y motivada lo exija.',
      ],
    },
    {
      id: 'derechos',
      title: 'Tus derechos y cómo ejercerlos',
      paragraphs: [
        'Tienes derecho a acceder a tus datos, rectificarlos, cancelarlos y oponerte a que se usen, y a retirar tu consentimiento. Casi todo lo haces tú solo en la app.',
      ],
      bullets: [
        'Acceder. En Configuración, sección Privacidad, descargas todos tus datos en un archivo.',
        'Rectificar. Cambias tu alias, tu foto y tus datos de cuenta en Configuración, sección Perfil, y tus ajustes de estudio en Repasar.',
        'Cancelar. En Configuración, sección Privacidad, borras tus datos de estudio, y también puedes eliminar tu cuenta completa con tu foto de perfil. Se borran del dispositivo y de la nube.',
        'Oponerte o retirar un permiso. En Configuración, sección Privacidad.',
        'Por correo. Si prefieres, escribe a nuestro correo de privacidad {correo} con tu nombre y lo que pides, y respondemos en un plazo razonable.',
      ],
    },
    {
      id: 'conservacion',
      title: 'Cuánto tiempo los conservamos',
      paragraphs: [
        'Conservamos tus datos mientras tengas cuenta. Si borras tus datos o eliminas tu cuenta, los quitamos de nuestra base, y al eliminar tu cuenta también quitamos tu foto de perfil de Supabase Storage. Los cobros y datos de facturación se conservan en las pasarelas y registros fiscales durante los plazos que exige la legislación fiscal mexicana, y a nosotros nos queda solo el registro de que existieron.',
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
        'Studiare es para personas de 18 años o más que se preparan para el examen, y al crear tu cuenta lo confirmas. No admitimos el registro de menores de edad. Si crees que una persona menor de edad creó una cuenta, escríbenos y la eliminamos.',
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
  version: '2026-10-13',
  updated: '13 de octubre de 2026',
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
        'Edad mínima. Debes tener al menos 18 años cumplidos para registrarte y usar la plataforma. Nos das datos verdaderos.',
        'Registro por invitación. Mientras dure la fase de lanzamiento, el registro requiere una invitación o código válido. No es posible crear una cuenta sin invitación durante este periodo.',
        'La cuenta es personal. No la compartas ni la vendas.',
        'Solo un dispositivo tiene activa tu cuenta a la vez, y el cambio de dispositivo está limitado. Es una medida de seguridad y de uso personal.',
        'Cuida el acceso a tu correo, porque con él entras a tu cuenta. Avísanos si crees que alguien más entró.',
      ],
    },
    {
      id: 'planes',
      title: 'Planes, pagos y cancelación',
      paragraphs: [
        'El plan Gratis tiene un límite diario de preguntas y funciones básicas. Los planes de pago quitan ese límite y suman funciones, como el análisis con IA y la generación de tarjetas. Los precios en pesos mexicanos se muestran en Suscripción antes de pagar.',
        'Procesamiento de pagos. Los pagos los procesan Stripe y Mercado Pago. El alumno elige su pasarela en Suscripción. Tu plan o pase se activa cuando la pasarela confirma el cobro.',
        'Prueba gratis de 7 días. Las suscripciones con tarjeta incluyen 7 días de prueba sin cobro. La pantalla de pago informa con claridad el cobro automático antes de pedir tu tarjeta. Al concluir los 7 días de prueba se realiza el cobro de tu primera mensualidad o anualidad, a menos que canceles antes de que termine dicho periodo.',
        'Garantía de 7 días. Cuentas con 7 días naturales de garantía a partir de tu primer cobro. Si solicitas la devolución en ese plazo escribiendo a {correo}, te reembolsamos el 100% de ese primer cobro.',
        'Cambio de plan. Puedes cambiar de plan (por ejemplo, entre mensual y anual) desde el portal de suscripción con prorrateo automático de los días no utilizados.',
        'Pases de OXXO y SPEI. Los pagos en OXXO y SPEI son pases de acceso de un solo pago (1 mes o 1 año) sin renovación automática. Al vencer el plazo, la cuenta vuelve al plan Gratis sin cobros sorpresa.',
        'Precio Fundador. Es una promoción con cupo estrictamente limitado a 100 lugares en total (compartidos entre mensual y anual) y requiere suscripción con renovación automática. El lugar se aparta al iniciar la prueba gratis; si cancelas antes del primer cobro, el lugar se libera para otro alumno. Si ya pagaste y cancelas tu suscripción, pierdes el precio Fundador y tu lugar de forma definitiva, y ese cupo no se vuelve a abrir. Cambiar entre Fundador mensual y anual en el portal conserva tu lugar.',
      ],
      bullets: [
        'Cancelas cuando quieras. Conservas tu plan hasta que termine el periodo que ya pagaste.',
        'Reembolsos. Además de la garantía de 7 días del primer cobro, {reembolsos}.',
        'Aclaraciones. Si un cobro sale mal o no lo reconoces, escríbenos a {correo} y lo revisamos.',
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
  pending: '[PENDIENTE DE RICARDO]',
  /** Lo que reemplaza a las marcas que no dependen de variables de entorno, mientras no se decidan */
  pendingPolicy: {
    reembolsos: '[pendiente de definir la política de reembolsos por el abogado]',
    jurisdiccion: '[pendiente de definir los tribunales competentes por el abogado]',
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
