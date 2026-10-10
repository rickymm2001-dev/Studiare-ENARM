# Stripe en Studiare

Escrito el 2026-10-10. Qué hay hoy de Billing, Facturas e Impuestos con Stripe, qué se mejoró en esta sesión, cómo dejarlo listo en modo prueba y qué falta. No pude abrir la documentación de Stripe ni su servidor MCP desde este entorno, así que la revisión sale del código y de lo que conozco de Stripe. Lo que dependa de un detalle del panel va marcado para verificarlo ahí.

## Dónde está hoy

- **Billing.** El alumno elige un plan en Suscripción y pasa a Stripe Checkout, la página de pago de Stripe, en modo suscripción con un Price por plan (Fundador 79, Mensual 150 y Anual 1,200 pesos). Studiare no toca datos de tarjeta
- **Cliente único.** Quien paga otra vez vuelve a su mismo cliente de Stripe, para que sus facturas, su portal y un reembolso no queden repartidos
- **Avisos de Stripe.** El webhook verifica la firma con tolerancia de tiempo, compara sin atajos, y cada evento se aplica una sola vez aunque Stripe lo reenvíe. Entiende las dos formas de la factura que usa Stripe según su versión
- **Portal del cliente.** Cancelar, cambiar la tarjeta y ver las facturas. Se abre desde Suscripción
- **Reembolsos.** Uno completo desde el panel de Stripe quita el plan solo. Uno parcial lo atiendes tú
- **Facturas.** Stripe genera una factura por cada cobro de una suscripción y la deja en el portal. No hay nada que programar en la app
- **Impuestos.** Hasta esta sesión no había cálculo de impuestos

## Qué se mejoró en esta sesión

- **Página de pago en español.** Checkout se abre en español de América Latina (`locale es-419`)
- **Stripe Tax listo para encender.** Si pones el secreto `STRIPE_AUTOMATIC_TAX` en `true`, Checkout calcula el impuesto, pide la dirección y deja capturar el RFC. Va apagado por defecto porque con Stripe Tax sin configurar Stripe rechaza abrir el pago. Solo se enciende con la palabra `true`
- **Configuración de prueba con un comando.** `scripts/stripe/setup-test.ts` crea los tres productos y sus precios en pesos, con el impuesto incluido, y te imprime los tres Price para Supabase. Se puede correr varias veces, porque reutiliza lo que ya existe. Rechaza cualquier llave que no sea de prueba
- **El build rechaza llaves de Stripe.** El revisor de secretos de `npm run build` ahora marca cualquier llave `sk_` o `rk_` dentro del build. La publicable `pk_` es pública por diseño y puede ir

## Cómo dejarlo listo en modo prueba

1. Crea los productos. Con tu llave de prueba en tu computadora, `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe/setup-test.ts`. Si prefieres el panel, sigue el paso 1 de la guía de Stripe en `docs/SUPABASE.md`
2. En Stripe, Developers, Webhooks, agrega la dirección de la función `payment-webhook-stripe` con los seis eventos que enumera `docs/SUPABASE.md` y copia el secreto de firma
3. En Supabase, Edge Functions, Secrets, pon `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, los tres `STRIPE_PRICE_...`, `APP_URL` y `FUNCTIONS_URL`
4. Activa el portal del cliente en Stripe, Settings, Billing, Customer portal
5. Paga un plan con una tarjeta de prueba, cancela desde el portal, y reenvía un evento desde el panel para confirmar que no cambia nada

## Impuestos y facturas, para revisar con tu contador

- **IVA.** Los precios quedan con el impuesto incluido, que es como se muestra el precio a un consumidor en México. Si tu contador prefiere el IVA aparte, corre el script con `--tax=exclusive`
- **Stripe Tax.** Para encenderlo hay que activarlo en el panel, poner el domicilio fiscal del negocio y, según tu situación, registrarte donde corresponda. Después pones `STRIPE_AUTOMATIC_TAX=true` y pruebas un pago en modo prueba. Verifica en el panel que Stripe Tax soporte tu caso
- **Facturas por correo.** En Settings, Billing, ajusta qué correos manda Stripe (recibos, facturas y cobros fallidos)
- **CFDI.** Stripe no emite facturas fiscales mexicanas. Si un alumno pide factura con RFC, hay que resolverlo con tu contador o con un servicio aparte. No está resuelto

## Recomendado y todavía no hecho

- **Llave restringida.** En vez de la llave secreta completa, crea una restringida (`rk_`) con permiso solo para Checkout Sessions, Customer portal, Customers y lo que lean las funciones, y úsala como `STRIPE_SECRET_KEY`
- **Versión de la API fija.** Mandar el encabezado `Stripe-Version` en cada llamada y usar la misma versión en el endpoint del webhook, para que un cambio de Stripe no altere los eventos sin avisar
- **Idempotencia al crear la sesión.** Un `Idempotency-Key` evitaría dos sesiones por un doble clic. Hay que armarlo con el cliente, porque el reintento sin cliente cambia los datos
- **Cobros fallidos.** Revisar en Settings, Billing, Subscriptions and emails los reintentos automáticos y los correos de pago fallido
- **Alertas.** Que alguien mire los webhooks fallidos del panel de Stripe, porque la app no manda alertas

## La llave que pegaste en el chat

- Es una llave secreta de prueba y quedó en el historial de la conversación. No quedó en ningún archivo ni commit del repositorio
- Cámbiala cuando termines de configurar. En Stripe, Developers, API keys, la llave secreta, Roll key. Una de prueba no mueve dinero, pero es una buena costumbre
- Nunca pegues una llave `sk_live_` ni `rk_live_` en un chat. Va solo en los secretos de Supabase
- La llave publicable `pk_test_` no hace falta, porque el cobro es Checkout hospedado y la app solo recibe la dirección de pago

## Lo que no se pudo hacer en este entorno

- El plugin de Stripe no estaba en el marketplace `claude-plugins-official`. Se instaló desde el directorio que sí existe aquí, `anthropic-plugin-directory`
- El servidor MCP de Stripe (`mcp.stripe.com`) y su planeador de integración no se pudieron usar. La red del entorno bloquea `mcp.stripe.com`, `api.stripe.com` y `docs.stripe.com`, y además pide autorizar en un navegador
- Por eso no se llamó a la API de Stripe y no se crearon productos
- Para que lo haga yo, permite esos tres dominios en el acceso a la red del entorno y guarda la llave como secreto del entorno y no en el chat
