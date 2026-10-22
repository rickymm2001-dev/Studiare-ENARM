// Textos de Apple Pay y Google Pay dentro de Suscripción (B17, 6.5 y 6.2 del plan de B17). Fuera de t para que
// no entren al JavaScript inicial, que está al límite de los 300 KB (14.4). Solo los importa WalletPay, que
// carga con lazy desde CheckoutOptions y solo con la bandera expressWallets y la llave publicable de Stripe,
// como lo hacen consents.ts y engagement.ts, y no se integran en t.
//
// El aviso del cobro automático de la prueba gratis vive en el resumen que CheckoutOptions ya muestra arriba
// de los botones (billingCloudText.summary, con la fecha del primer cobro, la garantía de 7 días y la liga a
// los términos), porque la sesión ui_mode elements de Stripe no admite custom_text. Aquí solo se dice que al
// usar la billetera se acepta ese aviso. Los errores de Stripe se traducen a estos textos y nunca se muestran
// en crudo.
//
// Español de México con trato de tú, sin signos de exclamación y sin dos puntos en la prosa. Ningún texto
// promete resultados médicos ni de puntaje

export const walletTexts = {
  title: 'Pago rápido con Apple Pay o Google Pay',
  intro: 'Paga con un toque, sin escribir los datos de tu tarjeta.',
  // Antes de los botones. Remite al resumen de arriba, que es el aviso del cobro
  consentTrial:
    'Al usar tu billetera empiezas la prueba gratis y aceptas el cobro automático del primer pago que dice el resumen de arriba.',
  consentCharge: 'Al usar tu billetera aceptas el cobro que dice el resumen de arriba.',
  noCode:
    'Aquí no hay campo para un código de descuento. Si tienes uno, usa el botón de abajo para pagar con tu tarjeta.',
  preparing: 'Preparando Apple Pay y Google Pay…',
  noWallet:
    'Tu aparato no tiene Apple Pay ni Google Pay. Usa el botón de abajo para pagar con tu tarjeta.',
  unavailable:
    'Apple Pay y Google Pay no están disponibles en este momento. Usa el botón de abajo para pagar con tu tarjeta.',
  confirming: 'Estamos confirmando tu pago…',
  errors: {
    // El banco o la billetera dijeron que no. No hay pago hecho
    declined:
      'Tu banco o tu billetera rechazó el pago y no se cobró nada. Prueba con otra tarjeta o paga con el botón de abajo.',
    // Stripe dijo que no se pudo completar, con un código que no es el del rechazo. Por ejemplo un fallo de red de
    // Stripe.js: no se puede asegurar que no se cobró, así que se pide revisar el plan, igual que si no llegó la respuesta
    failed:
      'No pudimos completar el pago. Revisa tu plan en unos minutos antes de volver a intentarlo, para no pagar dos veces.',
    // La respuesta no llegó y no sabemos si el pago pasó
    unknown:
      'No pudimos confirmar el pago. Revisa tu plan en unos minutos antes de volver a intentarlo, para no pagar dos veces.',
  },
} as const;

/** Qué le pasó al pago con la billetera, para escoger el texto de walletTexts.errors */
export type WalletProblem = keyof typeof walletTexts.errors;
