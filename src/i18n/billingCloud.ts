// Textos de Suscripción con la cuenta en la nube (Fase P bloque 5, D-096, y B10 del plan del cambio,
// 3.1 y 3.7 del diseño). Forma de pago con sus avisos, estado del plan, pagos pendientes, regreso de la
// pasarela, portal de Stripe y cancelación de Mercado Pago. Español de México con trato de tú y sin dos
// puntos. No van en t, porque solo las usan pantallas que se cargan en diferido y así no pesan en el
// JavaScript inicial (5.6 del diseño). Quien los necesita los importa de aquí.
import { GUARANTEE_DAYS, TRIAL_DAYS, type RegularPlanKey } from '@/config/billing';

export const billingCloudText = {
  notice:
    'Tu plan lo confirma el servidor cuando la pasarela avisa del pago. Los pagos están en modo prueba y no se cobra dinero real hasta que Studiare los active.',
  validUntil: (date: string) => `Vale hasta el ${date}.`,

  // Forma de pago (3.1.2)
  checkoutTitle: (plan: string) => `Cómo quieres pagar el plan ${plan}`,
  optionsLegend: 'Forma de pago',
  passLength: { monthly: '1 mes', annual: '1 año' } satisfies Record<RegularPlanKey, string>,
  every: { monthly: 'mes', annual: 'año' } satisfies Record<RegularPlanKey, string>,
  options: {
    card: {
      label: 'Tarjeta, Apple Pay o Google Pay',
      trial: (price: string, period: string) =>
        `${TRIAL_DAYS} días gratis. Después ${price} ${period} con renovación automática hasta que canceles.`,
      // Sin decir por qué no hay prueba. my_plan solo dice que no la hay, y puede ser porque ya la
      // usó, porque pagó antes o porque está apagada para todos
      noTrial: (price: string, period: string) =>
        `${price} ${period} con renovación automática hasta que canceles. Sin prueba gratis, el primer cobro es hoy.`,
    },
    oxxo: {
      label: 'Efectivo en OXXO',
      description: (length: string, price: string) =>
        `Pase de ${length} por ${price}. Pago único, sin renovación. Tu plan se activa cuando OXXO confirme el pago, normalmente al siguiente día hábil.`,
    },
    spei: {
      label: 'Transferencia SPEI',
      description: (length: string, price: string) =>
        `Pase de ${length} por ${price}. Pago único, sin renovación. Transfiere el monto exacto a la CLABE que te da Stripe. Tu plan se activa cuando llegue la transferencia.`,
    },
    mercadopago: {
      label: 'Mercado Pago con renovación',
      description: (price: string, period: string) =>
        `${price} ${period} con tu cuenta de Mercado Pago, hasta que canceles. Sin prueba gratis ni precio Fundador.`,
    },
    mercadopago_pass: {
      label: 'Mercado Pago, pago único',
      description: (length: string, price: string) =>
        `Pase de ${length} por ${price}, sin renovación. Dentro de Mercado Pago puedes usar tarjeta, saldo, OXXO o SPEI.`,
    },
  },
  // Aviso antes de mandar a la pasarela (4.18)
  summary: {
    trial: (date: string, price: string, every: string) =>
      `Hoy no se cobra nada. Tu prueba termina el ${date}. Ese día se cobran ${price} a tu tarjeta y luego cada ${every} hasta que canceles. Puedes cancelar antes en Administrar suscripción y no se te cobra. Después del primer cobro tienes ${GUARANTEE_DAYS} días de garantía para pedir el reembolso completo.`,
    charge: (price: string, every: string) =>
      `Hoy se cobran ${price} y luego cada ${every} hasta que canceles. Tienes ${GUARANTEE_DAYS} días de garantía desde este cobro para pedir el reembolso completo.`,
    pass: `Es un pago único. No se renueva ni guarda tu tarjeta. Tienes ${GUARANTEE_DAYS} días de garantía desde el pago.`,
    passAdds: (date: string) => `Como ya tienes un pase, este se suma desde el ${date}.`,
    oxxoRefund:
      'Los pagos en OXXO no se pueden devolver en la tienda, así que la garantía te la devolvemos por transferencia.',
    code: '¿Tienes un código de descuento? Lo escribes en la página de pago.',
    terms: 'Términos y condiciones',
  },
  testMode: 'Modo prueba. Usa una tarjeta de prueba de la pasarela, no una tuya.',
  actions: {
    trial: 'Empezar mi prueba gratis',
    oxxo: 'Generar mi ficha OXXO',
    spei: 'Ver los datos para transferir',
    mercadopago: 'Pagar con Mercado Pago',
  },
  go: 'Ir a pagar',
  opening: 'Abriendo la pasarela…',
  back: 'Volver a los planes',
  regularInstead: (price: string) => `Continuar con el precio regular de ${price}`,
  errors: {
    founder_full: 'Los lugares Fundador ya se llenaron. Puedes continuar con el precio regular.',
    founder_lost:
      'El precio Fundador ya no está disponible para tu cuenta porque cancelaste una suscripción Fundador pagada. Puedes continuar con el precio regular.',
    already_subscribed:
      'Ya tienes un plan pagado vigente. Para cambiarlo usa el botón Cambiar a Anual o Cambiar a Mensual, que abre el portal de Stripe.',
    pass_in_force: (date: string) =>
      `Tienes un pase pagado hasta el ${date}. Cuando termine puedes cambiarte a tarjeta con renovación.`,
    passInForceNoDate:
      'Tienes un pase pagado vigente. Cuando termine puedes cambiarte a tarjeta con renovación.',
    trial_mismatch:
      'Tu prueba gratis cambió mientras elegías. Revisa el aviso y vuelve a intentarlo.',
    not_configured: 'Los pagos todavía no están activados. Intenta más tarde.',
    // Un pase o Mercado Pago que el servidor tiene apagado, aunque este navegador lo mostrara
    optionUnavailable: (option: string) =>
      `${option} todavía no está disponible. Elige otra forma de pago o intenta más tarde.`,
    unsafe_url: 'La pasarela mandó una dirección que no reconocemos. No la abrimos.',
    failed: 'No pudimos abrir la pasarela. Intenta de nuevo en unos minutos.',
  },

  // Al volver de la pasarela
  returning: {
    ok: 'Estamos confirmando tu pago. Esto tarda unos segundos.',
    confirmed: 'Tu plan ya está activo. Gracias.',
    trialStarted: 'Tu prueba gratis ya empezó. Hoy no se cobró nada.',
    slow: 'Tu pago sigue sin confirmarse. Puede tardar unos minutos. Si pasa más tiempo, escribe al equipo.',
    canceled: 'Cancelaste el pago. No se cobró nada.',
    pending: {
      oxxo: 'Generaste tu ficha OXXO. Págala en cualquier tienda OXXO antes de que venza. Tu plan se activa cuando OXXO confirme el pago, normalmente al siguiente día hábil.',
      spei: 'Ya tienes los datos para transferir. Tu plan se activa en cuanto llegue tu transferencia SPEI.',
      mercadopago:
        'Tu pago con Mercado Pago está pendiente. Tu plan se activa cuando Mercado Pago lo confirme.',
    },
  },

  // Tarjetas de planes con un plan vigente (3.1.1)
  cancelNote: 'Para cancelar tu plan de pago usa Administrar suscripción, más abajo.',
  changeTo: { monthly: 'Cambiar a Mensual', annual: 'Cambiar a Anual' } satisfies Record<
    RegularPlanKey,
    string
  >,
  changeNote:
    'Se abre el portal seguro de Stripe. Si subes de plan se cobra hoy la diferencia. Si bajas, el cambio se aplica al terminar tu periodo.',
  mercadoPagoChangeNote:
    'Con Mercado Pago, para cambiar de plan cancela tu suscripción y contrata el otro plan cuando termine tu periodo.',
  passNote: (date: string) =>
    `Tienes un pase hasta el ${date}. Cuando termine puedes cambiarte a tarjeta con renovación. Mientras tanto puedes sumar otro mes o año.`,
  addPeriod: { monthly: 'Sumar otro mes', annual: 'Sumar otro año' } satisfies Record<
    RegularPlanKey,
    string
  >,
  portalOpening: 'Abriendo el portal…',
  portalFailed: 'No pudimos abrir el portal. Intenta de nuevo en unos minutos.',

  // Estado del plan (3.1.3)
  status: {
    trialing: (date: string, price: string) =>
      `Prueba gratis hasta el ${date}. Ese día se cobran ${price}.`,
    trialCanceled: (date: string) =>
      `Cancelaste tu prueba. Termina el ${date} y no se te cobrará nada.`,
    renews: (date: string, price: string) => `Se renueva el ${date} por ${price}.`,
    renewsAs: (date: string, plan: string, price: string) =>
      `Se renueva el ${date} como ${plan} por ${price}.`,
    canceled: (date: string) => `Cancelaste tu suscripción. Tu plan vale hasta el ${date}.`,
    pastDue:
      'No pudimos cobrar tu renovación. Actualiza tu tarjeta en Administrar suscripción para no perder tu plan.',
    pastDueMercadoPago:
      'No pudimos cobrar tu renovación con Mercado Pago. Revisa tu medio de pago en tu cuenta de Mercado Pago para no perder tu plan.',
    scheduled: (date: string) => `Tienes un cambio de plan programado para el ${date}.`,
    pass: (date: string) => `Pase pagado hasta el ${date}. No se renueva.`,
    referral: (date: string) => `Tu mes gratis por referido termina el ${date}.`,
    guarantee: (date: string, email: string) =>
      `Tienes garantía de reembolso hasta el ${date}. Para pedirla escríbenos a ${email}.`,
    guaranteeNoEmail: (date: string) =>
      `Tienes garantía de reembolso hasta el ${date}. Para pedirla escribe al equipo de Studiare.`,
    issues: {
      founder_full:
        'Los lugares Fundador se llenaron mientras pagabas. Cancelamos esa prueba o suscripción y no se te cobra. Si ya hubo un cobro, te lo devolvemos.',
      trial_duplicate:
        'Ya tenías una prueba gratis, así que cancelamos la segunda sin cobrarte nada.',
      second_subscription:
        'Ya tenías un plan pagado, así que cancelamos el segundo. Si hubo un cobro, te lo devolvemos.',
    },
  },
  // La línea chica de la prueba en la columna del plan de Inicio (3.4)
  trialUntil: (date: string) => `Prueba gratis hasta el ${date}`,
  pending: {
    oxxo: (price: string) =>
      `Tu ficha OXXO de ${price} está pendiente. Tu plan se activa cuando OXXO confirme el pago. Si perdiste la ficha, genera otra.`,
    oxxoUntil: (price: string, date: string) =>
      `Tu ficha OXXO de ${price} está pendiente. Págala antes del ${date}. Tu plan se activa cuando OXXO confirme el pago. Si perdiste la ficha, genera otra.`,
    spei: (price: string) =>
      `Esperamos tu transferencia SPEI de ${price}. Tu plan se activa en cuanto llegue.`,
    mercadopago:
      'Tu pago con Mercado Pago está pendiente. Tu plan se activa cuando Mercado Pago lo confirme.',
    // El pago de un pase que venció, con las palabras de su método. unknown si no se pudo saber cuál
    voucherExpired: {
      oxxo: 'Tu ficha OXXO venció sin pago. No se cobró nada. Puedes generar otra.',
      spei: 'Tu pago por transferencia SPEI venció sin que llegara la transferencia. No se cobró nada. Puedes empezar otro.',
      mercadopago:
        'Tu pago de Mercado Pago venció sin completarse. No se cobró nada. Puedes intentarlo otra vez.',
      unknown: 'Tu pago pendiente venció sin pago. No se cobró nada. Puedes empezar otro.',
    },
  },

  // Administrar suscripción con Stripe
  portal: {
    title: 'Administrar suscripción',
    description:
      'Se abre el portal seguro de Stripe, donde puedes cambiar de plan, cancelar tu suscripción, cambiar tu tarjeta y ver tus facturas. Lo que hagas ahí cambia tu plan cuando Stripe nos avise.',
    go: 'Abrir el portal',
    opening: 'Abriendo el portal…',
    errors: {
      no_customer:
        'No encontramos una suscripción con Stripe en tu cuenta. Si tienes un pase, no se renueva solo y termina en la fecha indicada. Si es un mes gratis por referido, termina solo.',
      mercadopago:
        'Tu suscripción es con Mercado Pago. Puedes cancelarla aquí mismo, en Administrar suscripción.',
      not_configured:
        'La administración de suscripciones todavía no está activada. Escribe al equipo de Studiare.',
      unsafe_url: 'Stripe mandó una dirección que no reconocemos. No la abrimos.',
      failed: 'No pudimos abrir el portal. Intenta de nuevo en unos minutos.',
    },
  },
  // Administrar suscripción con Mercado Pago, que no tiene portal
  mercadoPago: {
    title: 'Administrar suscripción',
    description:
      'Tu suscripción es con Mercado Pago. Si la cancelas, no se vuelve a cobrar y tu plan vale hasta el fin de lo que ya pagaste.',
    cancel: 'Cancelar suscripción de Mercado Pago',
    confirm: (date: string) =>
      `¿Cancelar tu suscripción de Mercado Pago? Tu plan sigue hasta el ${date} y no se vuelve a cobrar.`,
    confirmNoDate:
      '¿Cancelar tu suscripción de Mercado Pago? Tu plan sigue hasta el fin de lo que ya pagaste y no se vuelve a cobrar.',
    confirmYes: 'Sí, cancelar',
    confirmNo: 'No, conservarla',
    canceling: 'Cancelando tu suscripción…',
    done: (date: string) =>
      `Cancelaste tu suscripción de Mercado Pago. Tu plan vale hasta el ${date}.`,
    doneNoDate:
      'Cancelaste tu suscripción de Mercado Pago. Tu plan vale hasta el fin de lo que ya pagaste.',
    already: 'Tu suscripción de Mercado Pago ya está cancelada y no se vuelve a cobrar.',
    errors: {
      no_subscription: 'No encontramos una suscripción de Mercado Pago vigente en tu cuenta.',
      not_configured:
        'La cancelación con Mercado Pago todavía no está activada. Escribe al equipo de Studiare.',
      failed: 'No pudimos cancelar tu suscripción. Intenta de nuevo en unos minutos.',
    },
  },

  // Con la nube configurada pero este navegador sin sesión. El servidor no sabe quién paga, así que
  // no se ofrece pago alguno, ni el real ni el simulado
  needLink: {
    title: 'Conecta tu cuenta para pagar',
    body: 'Para pagar, este navegador tiene que estar conectado a tu cuenta en la nube. Pide un correo nuevo y abre el enlace aquí, o escribe abajo el código que trae si lo abres en tu teléfono.',
    otherDevice:
      'Tu cuenta se abrió en otro dispositivo. Para pagar aquí, pide un correo nuevo y entra con el enlace o el código. Eso cerrará la sesión del otro dispositivo.',
    send: 'Enviarme un correo nuevo',
    sending: 'Enviando el correo…',
    sent: (email: string) =>
      `Te enviamos un correo a ${email}. Abre el enlace en este navegador o escribe abajo el código que trae. Si no lo ves, revisa la carpeta de spam.`,
    noAccount:
      'No encontramos el correo de tu cuenta en este navegador. Sal y vuelve a entrar desde la pantalla de acceso.',
  },
} as const;
