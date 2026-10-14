# Stripe en Studiare

Escrito el 2026-10-10 y puesto al día el 2026-10-14 con B10, pagos completos. Qué hace hoy Studiare con Stripe, qué IDs y eventos necesita, cómo dejarlo listo en modo prueba y qué falta confirmar con una corrida real. La corrida real espera la llave restringida de prueba (rk_test_) en el entorno de la sesión. Mientras tanto todo se probó con un Stripe simulado y las banderas siguen apagadas.

## Dónde está hoy

- **Versión fija de la API.** Toda llamada manda el encabezado Stripe-Version con 2026-09-30.endive, y el endpoint del webhook debe usar la misma versión. Así un cambio de Stripe no altera los eventos sin avisar
- **Dos productos.** Studiare, con los cuatro precios con renovación (Mensual Fundador 79, Anual Fundador 749, Mensual 149 y Anual 1,499), y Studiare pase, con dos precios de un solo pago (1 mes 149 y 1 año 1,499). Los cuatro precios con renovación viven en un solo producto porque Stripe solo agenda un cambio de plan al fin del periodo entre precios del mismo producto. Todo en pesos y con el IVA incluido
- **Prueba gratis de 7 días.** Con tarjeta, Apple Pay o Google Pay. Hoy no se cobra nada y el primer cobro llega al terminar la prueba, salvo que el alumno cancele antes. Una sola prueba por persona, también entre cuentas con el mismo correo. Quién tiene prueba lo decide la base y la app solo lo muestra. La página de pago repite el aviso con la fecha del cobro y la garantía
- **Un solo plan pagado a la vez.** Con una suscripción vigente no se abre otro pago. Con un pase vigente se puede pagar otro pase, que se suma desde el fin del que ya tiene
- **Fundador.** Los 100 lugares los comparten el Mensual Fundador y el Anual Fundador. La prueba aparta el lugar, el primer cobro lo confirma y cancelar la prueba lo libera. Quien ya tuvo el precio Fundador y lo dejó no lo recupera
- **Pases con OXXO o SPEI.** Un pago único de 1 mes o de 1 año. La ficha de OXXO vence a los 3 días, al final del día en Ciudad de México. Con SPEI Stripe da una CLABE y el pase llega cuando entra la transferencia. Mientras tanto la app muestra el pago pendiente
- **Códigos de descuento.** La página de pago deja teclear un código. El código queda en el pago y en la prueba, y el admin ve cuántas pruebas y cobros trajo cada uno en Admin, Pagos
- **Portal del cliente con dos configuraciones.** Una para Fundadores, que deja cambiar entre 79 y 749, y otra regular, que deja cambiar entre 149 y 1,499. Subir cobra la diferencia al momento. Bajar o pasar de anual a mensual se agenda al fin del periodo. Cambiar de plan en la prueba no la termina. Cancelar deja el plan hasta el fin del periodo pagado. La app abre el portal directo en cambiar de plan o en cancelar
- **Acciones que decide la base.** Si una prueba resulta repetida, si llega una segunda suscripción, si ya no hay lugar Fundador o si se reembolsa un cobro de suscripción, la base deja una acción de cancelar y el webhook la ejecuta en Stripe al momento, sin prorrateo ni factura final. Una que falla se reintenta con el siguiente aviso
- **Avisos de Stripe.** El webhook verifica la firma con tolerancia de 5 minutos y cada evento se aplica una sola vez aunque Stripe lo reenvíe. Si la base o la lectura a Stripe fallan contesta 500 y Stripe lo reintenta. Lo que no entiende lo contesta con 200 y queda guardado en payment_webhook_events con el motivo en su columna result
- **Cliente único.** Toda sesión de pago lleva un cliente de Stripe, que SPEI exige. Si el alumno no tiene uno se crea y se liga en el acto. Si el guardado ya no existe en Stripe se crea otro y se reintenta una vez
- **Reembolsos.** Uno completo desde el panel de Stripe quita lo que pagó ese cobro. Un pase deja de contar y una suscripción se cancela en Stripe con su acción. Uno parcial no cambia nada y lo atiendes tú
- **Garantía de 7 días.** Cuenta desde el primer cobro de la suscripción o desde el pago del pase. Los pagos en OXXO no se pueden devolver en la tienda, así que la garantía de un pase con OXXO se devuelve por transferencia y se marca como devuelta en Admin, Pagos
- **Referidos.** El mes gratis por referido lo da la base con el primer cobro del referido, la primera factura pagada de más de 0 pesos. La sesión de pago y la factura de 0 pesos de una prueba no cuentan, el mismo cobro con otro aviso no se cuenta dos veces y un aviso repetido no da otro mes. Si ese primer cobro se devuelve completo, por ejemplo con la garantía, el referido queda revertido, sin borrar nada, y el mes de quien invitó termina en ese momento (migración 20261019000001, bloque B7)
- **Facturas.** Stripe genera un recibo por cada cobro y lo deja en el portal. La factura fiscal (CFDI) la pide el alumno en Perfil, Facturas, y el equipo la emite a mano. El correo al equipo queda en la cola hasta B15
- **Correos.** El aviso de fin de prueba y el de pase por vencer quedan en una cola de la base, apagada, hasta que B15 conecte el envío

## Los diez eventos del webhook

El endpoint va a https://bkjbcdwglyllizupokqm.supabase.co/functions/v1/payment-webhook-stripe, con la versión 2026-09-30.endive y estos eventos.

| Evento | Qué hace |
|---|---|
| checkout.session.completed | Lee la sesión y su suscripción de Stripe, liga al cliente y aplica la prueba, la suscripción o el pase pendiente |
| checkout.session.async_payment_succeeded | El pago de la ficha OXXO o de la transferencia SPEI. Da el pase |
| checkout.session.async_payment_failed | La ficha OXXO venció. No da nada y la app lo avisa |
| invoice.paid | Un cobro de la suscripción, también el primero después de la prueba. La factura de 0 pesos de la prueba se ignora |
| invoice.payment_failed | Un cobro fallido. El plan sigue mientras dure el periodo pagado |
| customer.subscription.created | La suscripción nueva, en prueba o activa |
| customer.subscription.updated | Cambio de plan por su Price ID, cambio agendado, cancelación al fin del periodo o cobro fallido |
| customer.subscription.deleted | La suscripción terminó |
| customer.subscription.trial_will_end | Tres días antes del fin de la prueba. Deja el correo de aviso en la cola |
| charge.refunded | Un reembolso completo. Uno parcial se ignora |

## Los ocho IDs

Van en Supabase, Edge Functions, Secrets. No son secretos, pero viven ahí para no estar en el repo. scripts/stripe/setup-test.ts los crea o los reutiliza en modo prueba y los imprime.

| Nombre | Qué es |
|---|---|
| STRIPE_PRICE_FOUNDER | price_ de 79 al mes, en el producto Studiare |
| STRIPE_PRICE_FOUNDER_ANNUAL | price_ de 749 al año |
| STRIPE_PRICE_MONTHLY | price_ de 149 al mes |
| STRIPE_PRICE_ANNUAL | price_ de 1,499 al año |
| STRIPE_PRICE_PASS_MONTHLY | price_ único de 149, en el producto Studiare pase |
| STRIPE_PRICE_PASS_ANNUAL | price_ único de 1,499 |
| STRIPE_PORTAL_CONFIG_FOUNDER | bpc_ de la configuración del portal de Fundadores |
| STRIPE_PORTAL_CONFIG_REGULAR | bpc_ de la configuración regular |

Además siguen STRIPE_SECRET_KEY (recomendado cambiarla por una rk_test_ restringida para las funciones), STRIPE_WEBHOOK_SECRET (cambia con el endpoint nuevo), STRIPE_AUTOMATIC_TAX (apagado), APP_URL y FUNCTIONS_URL. Un Price ID que falte o que empiece con prod_ lo dice create-checkout en sus registros, con el nombre del secreto que hay que cambiar.

## Qué crea setup-test.ts

- Los productos con id fijo, studiare_plan y studiare_pase
- Los seis precios con su clave de búsqueda, que lleva el monto. Por ejemplo studiare_founder_79_mxn_month o studiare_pass_year_1499_mxn. Si una clave está en un precio de antes de B10, el precio nuevo se la lleva y el viejo se archiva solo si se corre con --archive-old, cuando los secretos nuevos ya estén puestos
- El cupón PRUEBA10 de 10% con duración repeating de 1 mes, que cubre el primer cobro con o sin prueba, y su código PRUEBA10 solo para clientes nuevos
- Las dos configuraciones del portal, que encuentra al volver a correr por su metadata studiare_key y pone al día con los precios de hoy
- Solo acepta llaves de prueba y nunca imprime la llave. Se puede correr las veces que haga falta

```bash
STRIPE_SECRET_KEY=rk_test_... node scripts/stripe/setup-test.ts --app-url=https://rickymm2001-dev.github.io/Studiare-ENARM/
```

## Cómo dejarlo listo en modo prueba

Los pasos de los paneles están en docs/PENDIENTES_DE_RICARDO.md, sección de B10. En resumen

1. Ricardo crea las dos llaves restringidas de prueba, activa OXXO, SPEI, Apple Pay y Google Pay, guarda el portal por omisión, ajusta reintentos y correos, y crea el endpoint nuevo del webhook con los diez eventos
2. La sesión corre setup-test.ts y pone los ocho IDs en los secretos de Supabase
3. La sesión aplica las tres migraciones de B10 y corre la consulta de comprobación de docs/SUPABASE.md, sección Pagos completos
4. La sesión despliega create-checkout, create-portal-session y payment-webhook-stripe
5. Juntos corren los escenarios de la sección 7.3 del diseño de B10 con relojes de prueba de Stripe, revisando cada paso en la base y en Stripe
6. Con todo en verde se prenden las banderas freeTrial y cashPasses

## Lo que falta confirmar con la corrida real

- Si la sesión de pago trae el código de descuento en sus descuentos cuando el alumno lo teclea. Si no, el webhook lo toma de la suscripción o lee el código que aparece en el desglose de la sesión. Esa lectura necesita permiso de lectura en Promotion codes
- Si el cupón repeating de 1 mes descuenta solo el primer cobro también con prueba, en mensual y en anual (escenario S8)
- Que en modo prueba Apple Pay y Google Pay aparezcan en un iPhone con Safari y en un Android con Chrome (escenario S11)
- Que los eventos lleguen con api_version 2026-09-30.endive
- Si un pase pagado con SPEI se puede devolver desde Stripe a la cuenta de origen. Si no, la garantía se devuelve por transferencia como con OXXO

## Impuestos y facturas, para revisar con tu contador

- **IVA.** Los precios quedan con el impuesto incluido, que es como se muestra el precio a un consumidor en México. Si tu contador prefiere el IVA aparte, corre el script con --tax=exclusive
- **Stripe Tax.** Para encenderlo hay que activarlo en el panel, poner el domicilio fiscal del negocio y, según tu situación, registrarte donde corresponda. Después pones STRIPE_AUTOMATIC_TAX=true y pruebas un pago en modo prueba. Con Stripe Tax sin configurar Stripe rechaza abrir el pago, por eso va apagado
- **Correos de Stripe.** En Settings, Billing, ajusta qué correos manda Stripe (recibos, cobros fallidos y tarjeta por vencer)
- **CFDI.** Stripe no emite facturas fiscales mexicanas. El alumno la pide en Perfil y tú la emites con tu contador o con un servicio aparte. La app guarda la solicitud y su estado

## Recomendado y todavía no hecho

- **Llave restringida para las funciones.** Una rk_test_ con escritura en Checkout Sessions, Customers, Customer portal y Subscriptions, y lectura en Promotion codes y PaymentIntents. Sin ella todo funciona con la sk_test_ de hoy
- **Alertas.** Que alguien mire los webhooks fallidos del panel de Stripe, porque la app no manda alertas
- **Modo real.** Antes de cobrar de verdad, la lista de lanzamiento de la sección 11 del plan del cambio, con los diez eventos y los ocho IDs nuevos en modo real

## Llaves

- Nunca pegues una llave sk_ ni rk_ en un chat. Va solo en los secretos de Supabase o del entorno de la sesión
- El revisor de secretos de npm run build marca cualquier llave sk_ o rk_ dentro del build. La publicable pk_ es pública por diseño, pero no hace falta, porque el cobro es Checkout hospedado
- La llave secreta de prueba que se pegó en el chat el 2026-10-10 no quedó en ningún archivo. Cámbiala con Roll key cuando termines de configurar
