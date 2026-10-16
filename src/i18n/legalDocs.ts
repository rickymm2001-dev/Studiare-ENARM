// Aviso de privacidad y términos y condiciones (Fase G, G2, y B16 del plan del cambio). Son un BORRADOR
// escrito para que lo revise el abogado de Ricardo antes de abrir a alumnos de pago (respuesta 44). La
// app los muestra como páginas y docs/legal los exporta con este mismo texto, para que el abogado
// revise exactamente lo que ve el alumno. Los datos del responsable salen de src/config/legal.ts y
// entran por las marcas {nombre}, {domicilio}, {contactoPrivacidad} y {contactoSoporte}. Lo que decide
// el abogado entra por {reembolsos} y {jurisdiccion}. Lo que falta nunca se le muestra al alumno como
// marca (src/features/legal/fillLegal.ts). Trato de tú, frases cortas y sin promesas que el producto no
// cumpla. Lo que todavía no está activo lo dice. Si cambia lo que se hace con los datos, cambia este
// texto y sube la versión. La lista de cambios de B16 está en docs/legal/CAMBIOS-B16.md.
//
// Vive aparte de src/i18n/legal.ts para que el texto completo solo cargue con la página legal, que el
// router abre en diferido, y no pese en el JavaScript inicial (presupuesto de 300 KB, B11).

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
  updated: '15 de octubre de 2026',
  intro: [
    'En Studiare cuidamos tus datos. Este aviso explica quién los trata, cuáles son, para qué los usamos, con quién se comparten y cómo ejerces tus derechos. Si algo no queda claro, escríbenos.',
  ],
  sections: [
    {
      id: 'responsable',
      title: 'Quién es el responsable',
      paragraphs: [
        'El responsable de tus datos personales es {nombre}.',
        'Su domicilio es {domicilio}.',
        'Para cualquier duda sobre este aviso o sobre tus datos, escribe {contactoPrivacidad}.',
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
        'Invitación. Mientras el registro sea solo con invitación, guardamos el correo invitado, quién del equipo lo invitó y la fecha. Sirve para dejarte crear tu cuenta y se borra al eliminarla.',
        'Foto de perfil. Es opcional. Si subes una, la guardamos en Supabase Storage, en un espacio privado de tu cuenta. La ves tú y, mientras compartan un grupo activo de Party, los miembros de ese grupo. Si eliges tus iniciales la quitamos de la nube, y se borra al eliminar tu cuenta.',
        'Estudio. Tus respuestas a preguntas y tarjetas, los tiempos, la confianza que marcas, los motivos de tus errores, tus mazos y apuntes, tus metas, tus ajustes y los reportes de error que mandas sobre una pregunta.',
        'Lecturas del banco. Qué preguntas del banco abres cada día de estudio, con el plan que tenías y para qué las abriste, como práctica, examen o duelo. Con ellas el servidor cuenta el tope diario del plan Gratis y frena las descargas masivas del banco. Si un día lees mucho más de lo normal, si en una semana abres buena parte del banco o si llegas al freno de descargas, el equipo ve un aviso con tu alias y la cifra. También guardamos qué mazos del catálogo descargas, con su versión, su tamaño y la fecha, para el mismo fin.',
        'Uso de la IA. Cuántas veces usas cada función de IA al día y cuánto cuesta, sin el texto que mandas ni la respuesta, para los límites diarios y el presupuesto de la plataforma.',
        'Puntaje oficial. Solo si tú decides capturarlo en Progreso, con tu permiso Mejora con tus datos sin nombre, que das o retiras en Configuración, sección Privacidad.',
        'Pagos. El identificador y el estado de tus pagos, de tu plan o pase y de tu prueba gratis, la pasarela que usaste y el código de descuento si escribiste uno. Para dar una sola prueba gratis por persona, la ligamos a tu correo. Si pides el reembolso de un pago hecho en OXXO, también la cuenta bancaria a la que te lo transferimos. Nunca vemos ni guardamos los datos de tu tarjeta, que viven en la pasarela de pagos.',
        'Prueba gratis usada. Si empiezas una prueba gratis, guardamos una huella de tu correo, que es un hash SHA-256 de tu correo escrito de forma normalizada, junto con la pasarela, el identificador de esa suscripción en la pasarela y la fecha en que empezó. La huella no guarda tu correo y solo sirve para comparar, es decir, para saber si el mismo correo ya usó su prueba gratis. Al eliminar tu cuenta se conserva, ya sin ligarla a tu cuenta, para que nadie repita la prueba con el mismo correo.',
        'Factura. Solo si pides una factura (CFDI), tu RFC, tu nombre o razón social, tu régimen fiscal, el código postal de tu domicilio fiscal, el uso del CFDI y el correo donde quieres recibirla. Los usamos solo para emitir esa factura y los ve solo el equipo que la emite.',
        'Referidos. Tu código de invitación y, si entraste con el de un compañero, quién te invitó y si ya hiciste tu primer cobro, para darle su mes gratis. Quien te invitó solo ve cuántos de sus referidos ya se concretaron y cuántos todavía no, nunca tu nombre ni tu correo.',
        'Técnicos. Qué dispositivo tiene activa tu cuenta, la zona horaria, los avisos de seguridad de tu sesión y el registro de acceso de Supabase, con la dirección IP desde la que entras.',
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
        'Entender cómo vas con lo que registras en mazos, apuntes, repasos, simuladores y motivos de error, como tu dominio por rama y tema, los sesgos a los que eres propenso, tu ritmo y tu constancia, para recomendarte qué reforzar. Ese modelo es solo para ti y no predice tu puntaje del examen.',
        'Sincronizar tu estudio entre tus dispositivos, uno activo a la vez.',
        'Aplicar los límites de tu plan en la app y en el servidor, como el tope diario de preguntas del plan Gratis.',
        'Cobrar tu plan o tu pase, dar una sola prueba gratis por persona, atender la garantía, los reembolsos y las aclaraciones, y emitir tu factura si la pides.',
        'Darte un mes gratis cuando alguien que invitaste hace su primer cobro.',
        'Mandarte los correos que necesita tu cuenta, como el de acceso, el aviso de que termina tu prueba gratis o el de que vence tu pase.',
        'Cuidar la seguridad de la plataforma y prevenir abusos, como la descarga masiva del banco.',
        'Responder a tus solicitudes y cumplir obligaciones legales y fiscales.',
      ],
    },
    {
      id: 'opcionales',
      title: 'Lo que solo hacemos si lo permites',
      paragraphs: [
        'Estas finalidades son opcionales. Cada una se pide por separado y empieza apagada. Las prendes o las apagas cuando quieras en Configuración, sección Privacidad. Decir que no a una no te quita el resto del servicio.',
        'Cuando activemos la analítica del producto o los recordatorios de repaso por correo, también serán opcionales, se pedirán por separado y empezarán apagados.',
      ],
      bullets: [
        'Party. Compartir tu alias, tu foto de perfil si subiste una, tu XP de la semana y tu aporte a los retos con los miembros de los grupos a los que te unas, y en un duelo tus aciertos y tu tiempo. Tus compañeros nunca ven tu correo ni tus demás datos de cuenta.',
        'Análisis con IA. Usar tus errores para que el tutor te dé hipótesis de por qué fallas y un informe con IA.',
        'Mejora con tus datos sin nombre. Usar tus datos con un identificador seudónimo, sin tu nombre ni tu correo, junto con los de otros alumnos que también dieron este permiso, para mejorar Studiare para todos. Con ellos se calcula la dificultad real de cada pregunta, los distractores que no funcionan, los temas que más cuestan y los motivos de error que más pesan, y se arma la comparación con otros alumnos de la sección siguiente. Aquí entra tu puntaje oficial, si lo capturas. Si retiras este permiso, tu puntaje se borra. También entran los reportes de fallas de la app, que dicen qué falló, en qué pantalla y en qué versión, sin tu nombre, tu correo ni tus identificadores, y se guardan 14 días.',
      ],
    },
    {
      id: 'comparacion',
      title: 'Comparación con otros alumnos',
      paragraphs: [
        'Cuando esté disponible, en Progreso verás cómo vas frente a otros alumnos, en percentiles de lo que ya pasó, como tus aciertos en simuladores de los últimos 30 días, por rama, tus repasos y tu constancia. Se compara contra todos los alumnos y contra los que buscan tu misma especialidad.',
        'Esa comparación se calcula solo con los datos de quienes dieron el permiso Mejora con tus datos sin nombre. Solo se muestra con grupos de al menos 30 alumnos con datos, y si no hay suficientes dice calibrando. Nadie ve los datos de otro alumno, solo percentiles, y nunca es un puntaje estimado del examen ni una probabilidad de plaza.',
      ],
    },
    {
      id: 'ia',
      title: 'Qué pasa con la inteligencia artificial',
      paragraphs: [
        'La IA de Studiare la presta Anthropic. A la IA viaja solo lo que necesita cada función, con identificadores seudónimos. Nunca viaja tu nombre ni tu correo, y un filtro quita correos, teléfonos y nombres antes de enviar.',
        'Con el permiso de análisis con IA, el tutor manda tus errores y el texto de las preguntas y tarjetas en las que fallaste, incluidas las de tus mazos, para darte hipótesis y un informe.',
        'Cuando pides tarjetas con IA en un plan de pago, viaja el texto que eliges para eso, que puede ser una pregunta del banco, tus apuntes o un texto o PDF que tú subes. Pasa solo cuando tú lo pides.',
        'Lo que escribe la IA queda como borrador, marcado como no validado por un médico. La IA no corrige por su cuenta lo que considera mal, solo lo señala, y no predice tu puntaje del examen.',
        'OpenAI no recibe datos tuyos. Lo usamos solo en evaluaciones internas para comparar la calidad de la IA, con texto del banco de preguntas. Si agregamos otro proveedor de IA que reciba datos tuyos, actualizamos este aviso antes.',
      ],
    },
    {
      id: 'terceros',
      title: 'Con quién compartimos tus datos',
      paragraphs: [
        'No vendemos tus datos. Solo los compartimos con proveedores que nos ayudan a operar la plataforma, que los tratan por encargo nuestro y solo para su tarea. Algunos los guardan fuera de México, por ejemplo en Estados Unidos. Algunos todavía no están activos y lo decimos en cada uno. Esos no reciben ningún dato tuyo hasta que se activen.',
      ],
      bullets: [
        'Supabase, que aloja la base de datos, el inicio de sesión, los archivos, como tu foto de perfil en Supabase Storage, y las funciones del servidor. Hoy también envía los correos de acceso a tu cuenta.',
        'Google, solo si eliges entrar con Google. Confirma quién eres y nos manda los datos de tu cuenta de Google que se explican arriba. No le mandamos tus datos de estudio. Aparte, el banco de preguntas que escriben los médicos vive en una hoja de Google Sheets que Studiare solo lee, y ahí no va ningún dato tuyo.',
        'Stripe, que procesa los pagos con tarjeta, Apple Pay, Google Pay, OXXO y SPEI. Recibe tu correo y el identificador de tu cuenta para ligar el pago, y lo que escribes en su página de pago, como los datos de tu tarjeta.',
        'Mercado Pago, cuando se active y solo si lo eliges para pagar. Recibirá tu correo y el identificador de tu cuenta, y lo que escribas en su página de pago.',
        'Anthropic, cuando usas una función de IA, con lo que se explica en la sección de inteligencia artificial.',
        'El servicio que aloja el proxy de IA, cuando usas una función de IA. Recibe el identificador seudónimo de tu cuenta, el texto de la llamada de IA y los datos técnicos de tu conexión, como la dirección IP.',
        'Resend, cuando se active. Enviará los correos de acceso a tu cuenta, los avisos de tu plan, como el de que termina tu prueba gratis o vence tu pase, y los recordatorios de repaso si los prendes. Recibirá tu correo y el texto de cada correo.',
        'PostHog, cuando se active, para medir cómo se usa la app. Solo recibirá datos si das el permiso de analítica, que se pedirá aparte y empezará apagado, y recibirá los eventos de uso con tu identificador seudónimo, sin tu nombre ni tu correo.',
        'Sentry, cuando se active, para enterarnos de las fallas. Recibirá los reportes de fallas de la app solo con tu permiso Mejora con tus datos sin nombre, y los errores de nuestras funciones del servidor. Ninguno lleva tu nombre ni tu correo.',
        'GitHub, cuando se active la calibración de las preguntas. Ahí corre cada noche el cálculo con los datos de quienes dieron el permiso Mejora con tus datos sin nombre, con identificadores seudónimos y sin nombres ni correos.',
        'El servicio que aloja la página, hoy GitHub Pages y después Cloudflare, que ve datos técnicos de tu conexión, como la dirección IP.',
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
        'Acceder. En Configuración, sección Privacidad, descargas en un archivo tus datos de estudio, tus ajustes, tus permisos y lo tuyo en Party. Para una copia de lo demás, como tus pagos, tus solicitudes de factura o tus lecturas del banco, escribe {contactoPrivacidad}.',
        'Rectificar. Cambias tu alias, tu foto y tus datos de cuenta en Configuración, sección Perfil, y tus ajustes de estudio en Repasar. Para cambiar tu correo o los datos de una factura, escribe {contactoPrivacidad}.',
        'Cancelar. En Configuración, sección Privacidad, borras tus datos de estudio del dispositivo y de la nube. De tu estudio solo se quedan las preguntas del banco que abriste y tu uso de la IA del día de estudio en curso, para que borrar no reinicie los límites de ese día, y los avisos de lectura del banco que ya vio el equipo. También puedes eliminar tu cuenta completa, y entonces se borra todo eso, tu foto de perfil, tus solicitudes de factura y el correo de tu invitación. Si usaste una prueba gratis, se queda solo la huella de tu correo que se explica arriba.',
        'Oponerte o retirar un permiso. En Configuración, sección Privacidad.',
        'Por escrito. Si prefieres, escribe {contactoPrivacidad} con tu nombre y lo que pides, y respondemos en un plazo razonable.',
      ],
    },
    {
      id: 'conservacion',
      title: 'Cuánto tiempo los conservamos',
      paragraphs: [
        'Conservamos tus datos mientras tengas cuenta. Si borras tus datos o eliminas tu cuenta, los quitamos de nuestra base como se explica arriba, y al eliminar tu cuenta también quitamos tu foto de perfil de Supabase Storage. El registro de costos de la IA se queda sin tu identificador. La huella del correo de una prueba gratis usada se queda sin tu cuenta y sin fecha de borrado, solo para evitar pruebas repetidas. En Studiare tus pagos se borran con tu cuenta. Los avisos de cobro que manda la pasarela se guardan sin tu nombre ni tu correo, con el identificador de tu cuenta y los del cobro y la suscripción en la pasarela, para poder revisar los cobros. Los cobros que ya procesó la pasarela de pagos se conservan allá, y las facturas ya emitidas en el sistema de facturación, el tiempo que exige la ley fiscal.',
      ],
    },
    {
      id: 'almacenamiento',
      title: 'Cookies y almacenamiento en tu navegador',
      paragraphs: [
        'Studiare guarda en tu navegador tu sesión, tus datos de estudio y tus preferencias, para funcionar sin conexión. No usamos cookies de publicidad. Hoy no usamos herramientas de analítica ni de rastreo de terceros. Cuando activemos PostHog, solo funcionará en tu navegador si das el permiso de analítica.',
      ],
    },
    {
      id: 'menores',
      title: 'Personas menores de edad',
      paragraphs: [
        'Studiare es para personas de 18 años o más que se preparan para el examen, y al crear tu cuenta lo confirmas. Si crees que una persona menor de edad creó una cuenta, escríbenos y la eliminamos.',
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
  version: '2026-10-15',
  updated: '15 de octubre de 2026',
  intro: [
    'Estos términos son el acuerdo entre tú y {nombre} sobre el uso de Studiare. Al crear tu cuenta aceptas lo que dicen. Léelos con calma.',
  ],
  sections: [
    {
      id: 'servicio',
      title: 'Qué es Studiare y qué no es',
      paragraphs: [
        'Studiare es una herramienta de estudio para prepararte para el examen ENARM. Te da repaso con tarjetas, simuladores, estadísticas y un tutor.',
        'No es un servicio médico ni da consejo médico. Los textos del banco, las tarjetas y las explicaciones son material de estudio y pueden contener errores. Lo que escribe la IA es un borrador que ningún médico ha validado. Antes de tomar una decisión clínica real, consulta una fuente oficial.',
        'Studiare no predice tu puntaje en el examen y no garantiza que lo apruebes ni que obtengas la plaza que buscas. La comparación con otros alumnos, cuando esté disponible, muestra percentiles de lo que ya pasó y no es un puntaje estimado.',
      ],
    },
    {
      id: 'cuenta',
      title: 'Tu cuenta',
      bullets: [
        'Edad mínima. Debes tener 18 años o más y darnos datos verdaderos. Al crear tu cuenta lo confirmas.',
        'Registro con invitación. Hasta que Studiare abra el registro, solo puede crear su cuenta un correo que el equipo invitó.',
        'La cuenta es personal. No la compartas ni la vendas.',
        'Solo un dispositivo tiene activa tu cuenta a la vez, y el cambio de dispositivo está limitado. Es una medida de seguridad y de uso personal.',
        'Cuida el acceso a tu correo y, si entras con Google, a tu cuenta de Google, porque con ellos entras a Studiare. Avísanos si crees que alguien más entró.',
      ],
    },
    {
      id: 'planes',
      title: 'Planes y precios',
      paragraphs: [
        'El plan Gratis incluye hasta 20 preguntas al día con su explicación. El examen completo, el tutor con IA, Party, Apuntes, Importar mazos y seguir mazos nuevos del catálogo son de los planes de pago.',
        'Los planes de pago no tienen tope diario de preguntas, aunque tampoco permiten la descarga masiva del banco, y suman funciones como el análisis con IA y la generación de tarjetas.',
        'Los precios están en pesos mexicanos, con IVA incluido, y se muestran en Suscripción antes de pagar. Al publicar esta versión son estos.',
      ],
      bullets: [
        'Mensual, 149 pesos al mes, y Anual, 1,499 pesos al año, con renovación automática.',
        'Fundador, 79 pesos al mes o 749 pesos al año, con las condiciones de la sección Precio Fundador.',
        'Pases de un solo pago, 149 pesos por 1 mes y 1,499 pesos por 1 año.',
      ],
    },
    {
      id: 'pagos',
      title: 'Formas de pago y prueba gratis',
      paragraphs: [
        'Pagas con tarjeta, Apple Pay o Google Pay con renovación automática, o con un pase de un solo pago en efectivo en OXXO o por transferencia SPEI. Los procesa Stripe. Cuando se active Mercado Pago también podrás pagar con él, con renovación o con un pase, sin prueba gratis ni precio Fundador. Tu plan se activa cuando la pasarela nos confirma el pago. Solo puedes tener un plan pagado a la vez.',
      ],
      bullets: [
        'Prueba gratis. Los planes con tarjeta en Stripe empiezan con 7 días gratis, una sola vez por persona. No se repite si eliminas tu cuenta y vuelves con el mismo correo, ni en una cuenta que ya pagó antes. Antes de pedirte la tarjeta te decimos la fecha y el monto del primer cobro. Ese cobro es automático al terminar la prueba, y luego cada mes o cada año, hasta que canceles. Si cancelas durante la prueba, no se te cobra nada y la prueba sigue hasta su fecha.',
        'Pases. Un pase no se renueva ni guarda tu tarjeta. Al vencer, tu cuenta vuelve a Gratis sin ningún cobro. Si pagas otro pase antes de que venza, se suma desde la fecha en que termina el que tienes.',
        'Códigos de descuento. Un código se escribe en la página de pago de Stripe y descuenta solo el primer cobro.',
      ],
    },
    {
      id: 'cambios-plan',
      title: 'Cambio de plan, cancelación y garantía',
      bullets: [
        'Cambiar de plan. En Suscripción cambias entre mensual y anual, en el portal de Stripe. Si subes de mensual a anual, se cobra ese día la diferencia con prorrateo, descontando la parte de tu periodo que no usaste. Si bajas de anual a mensual, el cambio se aplica al terminar el periodo que ya pagaste. Con Mercado Pago, cancelas y contratas el otro plan al terminar tu periodo.',
        'Cancelar. Cancelas cuando quieras en Suscripción. Conservas tu plan hasta que termine el periodo que ya pagaste y no se te vuelve a cobrar.',
        'Cobro fallido. Si no se puede cobrar una renovación, te lo decimos en Suscripción para que actualices tu forma de pago. Si al final no se logra, tu plan pasa a Gratis.',
        'Garantía de 7 días. Tienes 7 días naturales desde el primer cobro de tu suscripción, o desde el pago de cada pase, para pedir el reembolso completo de ese pago. Lo pides escribiendo {contactoSoporte}. Con el reembolso termina el plan o el pase de ese pago. Si pagaste en OXXO te lo devolvemos por transferencia, porque OXXO no hace devoluciones en tienda.',
        'Fuera de la garantía. {reembolsos}',
        'Aclaraciones. Si un cobro sale mal o no lo reconoces, escribe {contactoSoporte} y lo revisamos.',
      ],
    },
    {
      id: 'fundador',
      title: 'Precio Fundador',
      bullets: [
        'Es una promoción del mensual y del anual, a 79 pesos al mes o 749 pesos al año, con 100 lugares en total que comparten los dos.',
        'Solo se paga con tarjeta en Stripe y con renovación automática. No aplica a los pases ni a Mercado Pago.',
        'Tu lugar se aparta al empezar la prueba gratis y se confirma con el primer cobro. Si cancelas la prueba antes de ese cobro, el lugar se libera para otra persona.',
        'Conservas el precio mientras tu suscripción siga activa, también si cambias entre el Fundador mensual y el anual en el portal.',
        'Si cancelas después de haber pagado, pierdes el precio Fundador y tu lugar, y ese lugar no se vuelve a abrir. Si regresas, pagas el precio regular.',
        'Si los lugares se llenan mientras pagas, cancelamos esa prueba o suscripción sin cobrarte, y si ya hubo un cobro te lo devolvemos.',
        'Podemos terminar la promoción antes de que se llenen los lugares. Quien ya tiene el precio Fundador lo conserva con estas mismas condiciones.',
      ],
    },
    {
      id: 'referidos',
      title: 'Invita y gana un mes',
      paragraphs: [
        'Cuando una persona que invitaste con tu enlace o tu código hace su primer cobro confirmado de más de 0 pesos, ganas un mes gratis, hasta 12 meses en total. La prueba gratis no cuenta como cobro. Si ese primer cobro se reembolsa completo, por ejemplo con la garantía, tu mes termina en ese momento.',
        'El código de quien te invitó se canjea en los primeros 14 días después de crear tu cuenta y antes de tu primer pago. Dos compañeros no pueden invitarse entre sí.',
      ],
    },
    {
      id: 'uso',
      title: 'Cómo puedes usar la plataforma',
      paragraphs: ['Tu uso es personal y para estudiar. Está prohibido'],
      bullets: [
        'Copiar, descargar de forma masiva, revender o publicar el banco de preguntas, las tarjetas, las explicaciones o los mazos del catálogo.',
        'Usar programas para automatizar el uso, saltarte los límites de tu plan o probar la seguridad sin permiso.',
        'Subir contenido sobre el que no tengas derechos, o que sea ilegal u ofensivo.',
        'Usar en Party un alias o un nombre de grupo que ofenda a otras personas o que suplante a alguien.',
        'Intentar entrar a la cuenta de otra persona.',
      ],
    },
    {
      id: 'contenido',
      title: 'Contenido y propiedad intelectual',
      paragraphs: [
        'La plataforma, su diseño, su software y su banco de preguntas son de {nombre} o de quienes le dan licencia. Te damos permiso de usarlos para estudiar mientras tengas cuenta, y nada más.',
        'El catálogo de mazos incluye mazos de otras personas que autorizaron por escrito su uso en Studiare. Los estudias dentro de la plataforma, sin copiarlos ni compartirlos fuera de ella.',
        'Lo que tú creas o importas, como tus apuntes, tus tarjetas y tus mazos, sigue siendo tuyo. Nos das permiso de guardarlo y procesarlo solo para darte el servicio, y no lo compartimos con otras personas sin tu consentimiento. Si importas material de otra persona, como un mazo de Anki, tú te aseguras de tener derecho a usarlo.',
      ],
    },
    {
      id: 'ia',
      title: 'Sobre la inteligencia artificial',
      paragraphs: [
        'Las funciones de IA explican, resumen y proponen, siempre sobre el banco o sobre el texto que tú aportas. No hay chat libre. La IA puede equivocarse. Lo que genera queda marcado como borrador, no validado por un médico, y no es un consejo médico.',
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
        'En la medida que la ley lo permite, no respondemos por decisiones que tomes con base en el material de estudio ni por resultados del examen. Nuestra responsabilidad frente a ti se limita, como máximo, a lo que hayas pagado en los últimos 12 meses.',
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
        'Estos términos se rigen por las leyes de México.',
        'Tribunales. {jurisdiccion}',
        'Si tienes una duda o una queja, escribe primero {contactoSoporte}. Casi siempre se resuelve ahí.',
      ],
    },
  ],
};

/** Los dos documentos legales completos */
export const legalDocs = { privacy, terms } as const;
