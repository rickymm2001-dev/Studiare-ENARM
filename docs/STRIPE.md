# Stripe en Studiare

Escrito el 2026-10-10 y puesto al día el 2026-10-14 con B10, pagos completos, y el 2026-10-22 con B17, los botones de Apple Pay y Google Pay. Qué hace hoy Studiare con Stripe, qué IDs y eventos necesita, cómo dejarlo listo en modo prueba y qué falta confirmar con una corrida real. La corrida real espera la llave restringida de prueba (rk_test_) en el entorno de la sesión. Mientras tanto todo se probó con un Stripe simulado y las banderas siguen apagadas.

## Dónde está hoy

- **Versión fija de la API.** Toda llamada manda el encabezado Stripe-Version con 2026-09-30.endive, y el endpoint del webhook debe usar la misma versión. Así un cambio de Stripe no altera los eventos sin avisar
- **Dos productos.** Studiare, con los cuatro precios con renovación (Mensual Fundador 79, Anual Fundador 749, Mensual 149 y Anual 1,499), y Studiare pase, con dos precios de un solo pago (1 mes 149 y 1 año 1,499). Los cuatro precios con renovación viven en un solo producto porque Stripe solo agenda un cambio de plan al fin del periodo entre precios del mismo producto. Todo en pesos y con el IVA incluido
- **Prueba gratis de 7 días.** Con tarjeta, Apple Pay o Google Pay. Hoy no se cobra nada y el primer cobro llega al terminar la prueba, salvo que el alumno cancele antes. Una sola prueba por persona, también entre cuentas con el mismo correo. Quién tiene prueba lo decide la base y la app solo lo muestra. La página de pago repite el aviso con la fecha del cobro y la garantía
- **Un solo plan pagado a la vez.** Con una suscripción vigente no se abre otro pago. Con un pase vigente se puede pagar otro pase, que se suma desde el fin del que ya tiene
- **Fundador.** Los 100 lugares los comparten el Mensual Fundador y el Anual Fundador. La prueba aparta el lugar, el primer cobro lo confirma y cancelar la prueba lo libera. Quien ya tuvo el precio Fundador y lo dejó no lo recupera, tampoco con otra suscripción ni cambiando el precio desde el panel de Stripe. Pasar al precio Fundador en la misma suscripción pide lugar como una nueva y, sin lugar, la base deja el plan como estaba y cancela esa suscripción
- **Pases con OXXO o SPEI.** Un pago único de 1 mes o de 1 año. La ficha de OXXO vence a los 3 días, al final del día en Ciudad de México. Con SPEI Stripe da una CLABE y el pase llega cuando entra la transferencia. Mientras tanto la app muestra el pago pendiente
- **Códigos de descuento.** La página de pago deja teclear un código. El código queda en el pago y en la prueba, y el admin ve cuántas pruebas y cobros trajo cada uno en Admin, Pagos
- **Portal del cliente con dos configuraciones.** Una para Fundadores, que deja cambiar entre 79 y 749, y otra regular, que deja cambiar entre 149 y 1,499. Subir cobra la diferencia al momento. Bajar o pasar de anual a mensual se agenda al fin del periodo. Cambiar de plan en la prueba no la termina. Cancelar deja el plan hasta el fin del periodo pagado. La app abre el portal directo en cambiar de plan o en cancelar
- **Acciones que decide la base.** Si una prueba resulta repetida, si llega una segunda suscripción, si ya no hay lugar Fundador o si se reembolsa un cobro de suscripción, la base deja una acción de cancelar y el webhook la ejecuta en Stripe al momento, sin prorrateo ni factura final. Una que falla se reintenta con el siguiente aviso
- **Avisos de Stripe.** El webhook verifica la firma con tolerancia de 5 minutos y cada evento se aplica una sola vez aunque Stripe lo reenvíe. Si la base o la lectura a Stripe fallan contesta 500 y Stripe lo reintenta. Un evento que no usa, o que no trae lo que necesita, lo contesta con 200 Ignorado y no lo guarda, así que solo se ve en los registros de Stripe. Los que sí usa quedan en payment_webhook_events con lo que respondió la base en su columna result, por ejemplo applied, duplicate, stale, ignored o unknown_user. Lo que se guarda del evento va sin los datos del pagador (correo, nombre, teléfono, domicilio, RFC, tarjeta, recibo y evidencia de una disputa) y conserva los ids, los montos, la metadata y la hora del cargo
- **Banderas en el servidor.** freeTrial, cashPasses y mercadoPago viven en platform_settings, clave feature_flags, la misma que lee la app, y la base también las cumple. Sin freeTrial en true nadie tiene prueba. Sin cashPasses en true create-checkout contesta 503 not_configured a los pases con OXXO o SPEI. Solo cuenta el booleano true. Una prueba o un pago que ya empezó sigue igual aunque se apague la bandera. La bandera expressWallets, de los botones de Apple Pay y Google Pay, es solo de la app y el servidor no la consulta (más abajo)
- **Cliente único.** Toda sesión de pago lleva un cliente de Stripe, que SPEI exige. Si el alumno no tiene uno se crea y se liga en el acto. Si el guardado ya no existe en Stripe se crea otro y se reintenta una vez
- **Reembolsos.** Uno completo desde el panel de Stripe quita lo que pagó ese cobro. Un pase deja de contar y una suscripción se cancela en Stripe con su acción, solo si es la suscripción de ese cobro. Si el alumno ya tiene otra, la nueva sigue. Uno parcial no cambia nada y lo atiendes tú. Desde la versión basil el cargo ya no dice su factura, así que el webhook la busca en los pagos de factura de su PaymentIntent (GET /v1/invoice_payments) y la base encuentra el cobro por ese id exacto. Un pase se encuentra por su PaymentIntent. Un reembolso que no es de ningún cobro guardado queda como ignored y no se adivina por monto
- **Contracargos.** Abrir uno no cambia nada y queda en el registro de la función. Si se pierde, Stripe ya le regresó el dinero al alumno y la base lo trata como un reembolso completo de ese cobro. La disputa no trae el cliente, así que el webhook lee su PaymentIntent (lectura en PaymentIntents) para saber de quién es y si fue por todo el cobro. Uno ganado o parcial no cambia el acceso
- **Garantía de 7 días.** Cuenta desde el primer cobro de la suscripción o desde el pago del pase. Los pagos en OXXO no se pueden devolver en la tienda, así que la garantía de un pase con OXXO se devuelve por transferencia y se marca como devuelta en Admin, Pagos
- **Referidos.** El mes gratis por referido lo da la base con el primer cobro del referido, la primera factura pagada de más de 0 pesos. La sesión de pago y la factura de 0 pesos de una prueba no cuentan, el mismo cobro con otro aviso no se cuenta dos veces y un aviso repetido no da otro mes. Si ese primer cobro se devuelve completo, por ejemplo con la garantía, el referido queda revertido, sin borrar nada, y el mes de quien invitó termina en ese momento (migración 20261019000001, bloque B7)
- **Facturas.** Stripe genera un recibo por cada cobro y lo deja en el portal. La factura fiscal (CFDI) la pide el alumno en Perfil, Facturas, y el equipo la emite a mano. El correo al equipo queda en la cola hasta B15
- **Correos.** El aviso de fin de prueba y el de pase por vencer quedan en una cola de la base, apagada, hasta que B15 conecte el envío

## Los doce eventos del webhook

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
| charge.refunded | Un reembolso completo, con la factura que pagó su PaymentIntent. Uno parcial se ignora |
| charge.dispute.created | Se abrió un contracargo. No cambia el acceso. Queda una línea en el registro de la función, sin datos del alumno, para que alguien responda la disputa en el panel |
| charge.dispute.closed | Solo uno perdido (lost) cuenta, como un reembolso completo del cobro. Ganado o parcial no cambian nada |

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

Además siguen STRIPE_SECRET_KEY (recomendado cambiarla por una rk_test_ restringida para las funciones), STRIPE_WEBHOOK_SECRET (cambia con el endpoint nuevo), STRIPE_AUTOMATIC_TAX (apagado), APP_URL y FUNCTIONS_URL. Un Price ID que falte o que empiece con prod_ lo dice create-checkout en sus registros, con el nombre del secreto que hay que cambiar. Sin STRIPE_PORTAL_CONFIG_FOUNDER o STRIPE_PORTAL_CONFIG_REGULAR, create-portal-session contesta 503 y lo dice en sus registros. No abre la configuración por omisión de Stripe, porque esa deja elegir cualquier precio, también el Fundador sin pasar por el cupo.

## Qué crea setup-test.ts

- Los productos con id fijo, studiare_plan y studiare_pase
- Los seis precios con su clave de búsqueda, que lleva el monto. Por ejemplo studiare_founder_79_mxn_month o studiare_pass_year_1499_mxn. Si una clave está en un precio de antes de B10, el precio nuevo se la lleva y el viejo se archiva solo si se corre con --archive-old, cuando los secretos nuevos ya estén puestos
- El cupón PRUEBA10 de 10% con duración repeating de 1 mes, que cubre el primer cobro con o sin prueba, y su código PRUEBA10 solo para clientes nuevos
- Las dos configuraciones del portal, que encuentra al volver a correr por su metadata studiare_key y pone al día con los precios de hoy
- Solo acepta llaves de prueba y nunca imprime la llave. Se puede correr las veces que haga falta
- En la sesión en la nube corre sin STRIPE_SECRET_KEY, con la llave que pone el proxy del entorno. Antes de crear nada lee el saldo y sigue solo si dice livemode false. Cualquier respuesta en modo real la detiene
- Con --write-ids=private/stripe-test-ids.json guarda además los ocho IDs en ese archivo, que no va al repo. La sesión los pone en los secretos de Supabase con npm run deploy:supabase -- --plan b10 --secrets-from private/stripe-test-ids.json (docs/DESPLIEGUE.md)

```bash
STRIPE_SECRET_KEY=rk_test_... node scripts/stripe/setup-test.ts --app-url=https://rickymm2001-dev.github.io/Studiare-ENARM/
```

## Cómo dejarlo listo en modo prueba

Los pasos de los paneles están en docs/PENDIENTES_DE_RICARDO.md, sección de B10. En resumen

1. Ricardo crea las dos llaves restringidas de prueba, activa OXXO, SPEI, Apple Pay y Google Pay, guarda el portal por omisión, ajusta reintentos y correos, y crea el endpoint nuevo del webhook con los doce eventos
2. La sesión corre setup-test.ts y pone los ocho IDs en los secretos de Supabase
3. La sesión aplica las tres migraciones de B10 y corre la consulta de comprobación de docs/SUPABASE.md, sección Pagos completos
4. La sesión despliega create-checkout, create-portal-session y payment-webhook-stripe
5. La sesión prende freeTrial y cashPasses en feature_flags, porque sin ellas el servidor no da prueba ni abre pases, y juntos corren los escenarios de la sección 7.3 del diseño de B10 con relojes de prueba de Stripe, revisando cada paso en la base y en Stripe. Si la app publicada ya usa este proyecto, mientras tanto también ve la prueba y los pases
6. Con todo en verde se dejan prendidas. Si algo falla se apagan otra vez

## Apple Pay y Google Pay en Suscripción (B17)

Hay dos caminos y los dos usan la misma suscripción, el mismo precio, la misma prueba y el mismo webhook.

| | Página de pago de Stripe (la de siempre) | Botones de un toque en Suscripción |
|---|---|---|
| Dónde se paga | En checkout.stripe.com, a donde la app manda al alumno | Dentro de la pantalla Suscripción, sin salir de Studiare |
| Apple Pay y Google Pay | Aparecen solos en los aparatos que los tienen | Un botón por billetera, solo si el aparato la tiene |
| Registrar el dominio en Stripe | No hace falta | Sí, por dominio y por modo (prueba y real) |
| Código de descuento | Hay campo en la página | No hay campo. Quien tenga un código paga con la página de Stripe |
| Pases con OXXO o SPEI y Mercado Pago | Sí | No, siguen por la página de Stripe o de Mercado Pago |
| Estado | Prendido | Construido y **apagado** |

Si los botones no salen bien en los teléfonos, se dejan apagados y no se pierde nada, porque la página de pago de Stripe ya muestra Apple Pay y Google Pay.

### Cómo se prende y se apaga

- **La bandera es solo de la app.** expressWallets está en false en desarrollo, en la demo y en producción. Se prende y se apaga escribiendo platform_settings, clave feature_flags, con el SQL de abajo (en el editor SQL de Supabase, o la sesión con el conector). Ninguna pantalla del admin cambia banderas, así que no hay un interruptor en Plataforma. El único módulo que escribe feature_flags desde la app es el del Banco, y solo para cloudBank. La app copia lo que dice el servidor cada vez que abre con nube. Sin la bandera no sale la sección y no se pide nada a Stripe, en ninguna pantalla
- **Decisión de B17.** El servidor no consulta esa bandera. create-checkout acepta ui wallet sin mirar feature_flags, porque solo cambia el modo de la pantalla de pago (misma suscripción, mismo precio, misma prueba, mismo webhook) y no concede nada nuevo. Una persona que armara la petición a mano obtendría lo mismo que con el botón de siempre. Por eso no hay migración ni compuerta de servidor, y ya no se prueba un 503 por esa bandera. Si algún día se quisiera cerrar desde el servidor, sería leer expressWallets en checkout_context, igual que freeTrial y cashPasses
- **Hace falta además la llave publicable.** La variable VITE_STRIPE_PUBLISHABLE_KEY, con una pk_test_ (después una pk_live_), se pone como variable de GitHub y entra al build. Con la bandera prendida pero sin esa llave, o con una que no tenga forma de llave publicable, la sección no aparece. La llave es pública por diseño. Una llave secreta o restringida (sk_ o rk_) pegada ahí por error se ignora y no llega al navegador ni abre la política de seguridad
- **La política de seguridad solo abre Stripe con esa llave.** Con ella, el build suma js.stripe.com a script-src, frame-src y connect-src, y deja la API de pagos del navegador en el Permissions-Policy. Sin ella, la política queda como estaba y no nombra a Stripe. Nunca hay unsafe-inline ni unsafe-eval
- **Qué significa apagada.** Significa que la app no la ofrece, no que el servidor la cierre. Como create-checkout no consulta la bandera, quien prenda la copia de banderas de su propio navegador y use un build que traiga la llave publicable puede cargar Stripe.js y abrir sesiones de este modo. No consigue nada que la página de pago de siempre no dé, porque las revisiones de plan vigente, lugar Fundador y prueba corren antes. Lo que sí pasa es que abrir la forma de pago con Tarjeta, con la bandera prendida, crea una sesión de Stripe y, si no existía, un cliente de Stripe, aunque el aparato no tenga billeteras. Por eso no es un control de seguridad, y si W2 sale mal en teléfonos basta con dejarla apagada para que ningún alumno la vea
- **Apagarla.** Pon expressWallets en false con el SQL de abajo. Quien ya estaba en la pantalla la ve desaparecer al recargar

```sql
-- Prender en modo prueba, después de las pruebas en teléfonos
insert into public.platform_settings (key, value) values ('feature_flags', '{"expressWallets": true}')
on conflict (key) do update set value = public.platform_settings.value || '{"expressWallets": true}', updated_at = now();

-- Apagar
insert into public.platform_settings (key, value) values ('feature_flags', '{"expressWallets": false}')
on conflict (key) do update set value = public.platform_settings.value || '{"expressWallets": false}', updated_at = now();
```

### Qué cambia en la sesión de pago

- **create-checkout con ui wallet.** Solo para suscripción con Stripe. Con pases o con Mercado Pago responde 400. Responde { clientSecret, trial } en lugar de una dirección, con cache-control no-store. Las revisiones de siempre valen igual (plan vigente, pase vigente, lugar Fundador, trial_mismatch) y la prueba la decide el servidor
- **La sesión es ui_mode elements.** Lleva return_url en lugar de success_url y cancel_url. Con ese modo Stripe no admite custom_text, branding_settings, custom_fields, submit_type, optional_items ni allow_promotion_codes en esta versión, y la sesión no los manda. No limita los medios de pago, y la app pide solo Apple Pay y Google Pay y apaga Link, PayPal, Klarna y Amazon Pay
- **El aviso del cobro automático de la prueba es de la pantalla.** Como no hay custom_text, el resumen de la forma de pago (billingCloudText.summary, con la fecha del primer cobro, la garantía de 7 días y la liga a los términos) está arriba de los botones, y la sección dice que usar la billetera acepta ese aviso
- **El secreto de la sesión.** El clientSecret es del navegador que lo pidió. No se guarda ni se registra, y storedEvent también lo quita de lo que se guarda de un aviso de Stripe
- **El webhook no cambia.** checkout.session.completed de una sesión ui_mode elements se lee y se aplica igual que el de la página de pago. Una prueba de las funciones lo comprueba con una sesión de ejemplo

### Qué pasa en la pantalla

1. El alumno abre la forma de pago del plan, que empieza con Tarjeta. Solo entonces la app descarga Stripe.js, con import() dinámico dentro de la sección, y pide la sesión. Stripe.js no entra al JavaScript inicial ni a ninguna otra pantalla (npm run budget y architecture.test.ts lo vigilan)
2. Al estar listo el elemento, la app lee qué billeteras tiene el aparato. Con alguna, muestra el botón. Sin ninguna, dice que el aparato no tiene Apple Pay ni Google Pay y deja el botón de pagar con tarjeta
3. El alumno autoriza en la hoja de su billetera y la app confirma con redirect if_required, sin salir de Studiare. Un segundo toque mientras confirma no hace nada
4. Con el pago confirmado, la app vuelve a Suscripción con ?pago=ok y reusa lo de siempre. Revisa el plan hasta verlo y dice que la prueba empezó o que el plan está activo
5. Un pago rechazado cierra la hoja con error y la pantalla lo dice con el foco, sin el texto en crudo de Stripe, y deja intentar otra vez
6. La medición checkout_started se manda al autorizar el pago en la hoja, porque el elemento de Checkout no avisa el toque del botón. En la billetera cuenta como tarjeta

### Registrar el dominio en Stripe

El Checkout hospedado no lo pide. Los botones sí, y por dominio y por modo, así que registrar tudominio.mx en modo real no lo registra en modo prueba. Se registra el dominio donde vive la app, sin www, y nunca pages.dev ni las vistas previas. Las billeteras solo se prueban en el dominio real.

```bash
STRIPE_SECRET_KEY=rk_test_... node scripts/stripe/register-domain.ts tudominio.mx
node --use-env-proxy scripts/stripe/register-domain.ts tudominio.mx   # en la sesión en la nube
node scripts/stripe/register-domain.ts tudominio.mx --validate        # después de publicar el archivo de Apple
```

- **Qué hace.** Comprueba que la llave sea de prueba, busca el dominio antes de crearlo (así se repite sin duplicar), lo crea con POST /v1/payment_method_domains si no está, y con --validate llama a /validate. Imprime el estado de Apple Pay y Google Pay con el mensaje de Stripe si hay uno, y dice qué sigue. Si Stripe rechaza la llave (401 o 403), lo dice con palabras propias y no repite el mensaje de Stripe, que trae el prefijo y los últimos caracteres de la llave
- **Salida.** 0 con las dos billeteras activas, 3 si el dominio quedó registrado pero falta un paso, 1 si algo falló y 2 si las opciones no sirven
- **Solo modo prueba.** Rechaza llaves reales y corta si Stripe contesta algo en modo real. --live es un error a propósito. El registro en modo real lo agrega B19 con su confirmación escrita
- **No corre solo.** Está escrito y probado contra una API falsa, y lo corre quien tiene el dominio, cuando exista y esté activo en Cloudflare. La llave restringida de prueba necesita permiso de lectura y escritura sobre Payment Method Domains. Nunca imprime la llave
- **Rechaza** esquema, rutas, puertos, comodines, direcciones IP, dominios locales, pages.dev y github.io, y avisa si lleva www

### El archivo de Apple

Stripe intenta verificar Apple Pay solo al registrar el dominio. Si Apple Pay queda inactivo, hay que publicar un archivo, que se baja del panel de Stripe y no por la API.

1. En Stripe, con el modo prueba, abre Settings, Payment method domains, el dominio, Apple Pay, y baja el archivo. No es un secreto
2. Guárdalo sin extensión con el nombre apple-developer-merchantid-domain-association en public/.well-known/ del repositorio
3. Publica. El build lo copia a dist/.well-known y _headers le pone Content-Type text/plain. La prueba de humo con --apple revisa que abra y que no sea la portada
4. Corre otra vez register-domain.ts con --validate hasta que Apple Pay diga activo
5. El archivo de modo prueba y el de modo real son distintos. En B19 se repite con el del modo real

Google Pay no pide archivo. Si queda inactivo, revisa que el dominio abra por https y corre con --validate.

### Probar en teléfonos reales, en modo prueba

Las billeteras no se prueban en un simulador ni en pages.dev. Hace falta el dominio real registrado en modo prueba, un iPhone con Safari y una tarjeta guardada en Wallet, y un Android con Chrome y una tarjeta real en Google Wallet. En modo prueba Stripe toma la tarjeta real de la billetera como una tarjeta de prueba y no cobra. Con la bandera prendida en modo prueba, la tabla de la pantalla Suscripción.

| Prueba | Aparato | Qué se ve |
|---|---|---|
| W1 | iPhone con Safari y una tarjeta en Wallet | El botón de Apple Pay aparece en Suscripción, con Tarjeta elegida |
| W2 | Igual | La hoja muestra el plan, la prueba de 7 días y el cobro siguiente. Al pagar, el plan queda en prueba |
| W3 | Android con Chrome y una tarjeta real en Google Wallet | El botón de Google Pay aparece, y la hoja y el pago salen bien |
| W4 | Computadora con Chrome o Safari | El botón aparece o se oculta según la billetera, sin errores |
| W5 | Cualquiera | En Admin, Pagos y en Stripe la prueba y la suscripción coinciden, y el correo de fin de prueba queda en la cola |
| W6 | Cualquiera | Con un plan ya vigente no se ofrece pagar otro |
| W7 | Cualquiera | Cancelar la hoja no deja nada raro y se puede reintentar |
| W8 | Sin billetera | Dice que no hay y deja el botón de pagar con tarjeta |

En cada prueba abre la consola del navegador y revisa que no haya violaciones de la política de seguridad. Si alguna dice que bloqueó un origen de Stripe, Apple o Google, ese origen se suma a src/config/csp.ts con su porqué y su prueba, y nada más.

**Riesgo mayor, la prueba gratis con total de hoy en 0.** La suscripción con prueba cobra 0 pesos hoy. Apple Pay y Google Pay pueden no aceptar bien una hoja con total de hoy en 0, o mostrarla de forma confusa. W2 es la prueba que lo decide, en un iPhone y en un Android reales, con la prueba gratis disponible (cuenta nueva con freeTrial prendida). Qué hacer según lo que salga.

- **La hoja se ve bien y el plan queda en prueba.** Se prende la bandera
- **La hoja no acepta el total en 0, o confunde al alumno.** La opción recomendada es ofrecer los botones solo a quien ya no tiene prueba (el primer cobro es hoy), y dejar la prueba en la página de pago de Stripe, que ya soporta billeteras. Es una condición en la forma de pago (trialAvailable en false) y su prueba, y la hace la sesión con el resultado de W2 en la mano
- **Tampoco sirve para quien paga hoy.** La bandera se queda apagada para siempre y no se pierde nada

Con el resultado de W1 a W8 en la mano, Ricardo decide. No se mide la segunda parte contra la primera hasta tener datos de pagos reales.

### Lo que falta confirmar con documentación y pruebas vivas

docs.stripe.com no abre desde el entorno de la sesión. Los nombres de la API se leyeron el 2026-10-22 en los tipos de @stripe/stripe-js 10.1.0 (Stripe.js endive, con initCheckoutElementsSdk y createExpressCheckoutElement) y de stripe-node 23.0.0 (los campos que ui_mode elements no admite). Falta confirmar en vivo

- Que checkout.session.completed llegue igual para una sesión ui_mode elements, y que esa sesión traiga la suscripción y su prueba como la hospedada
- Que la hoja de Apple Pay y la de Google Pay muestren bien una suscripción con prueba y total de hoy en 0 (el riesgo mayor, arriba)
- Que la sesión sin payment_method_types y sin payment_method_collection sea la que Stripe espera para estos botones, y que las opciones del elemento (Link y demás en never) dejen solo Apple Pay y Google Pay
- Que loadStripe con locale es-419 sea una opción válida para Stripe.js. Los tipos la aceptan
- La lista exacta de la política de seguridad, con la consola abierta en un Chrome y un Safari reales (sección anterior)
- Con Stripe Tax prendido (STRIPE_AUTOMATIC_TAX), que la billetera entregue la dirección que pide el impuesto. Si no, el elemento pide billingAddressRequired. Hoy Stripe Tax está apagado

### Lo que se repite en modo real (B19)

1. Registrar el dominio con la llave real. El script hoy solo trabaja en modo prueba, y B19 le agrega el modo real con su confirmación escrita
2. Bajar el archivo de Apple del panel en modo real y publicarlo
3. Cambiar la variable VITE_STRIPE_PUBLISHABLE_KEY por la pk_live_ y volver a publicar
4. Repetir W1 a W8 con una tarjeta real, pagar de verdad con un monto chico y devolverlo desde el panel
5. Prender expressWallets en producción solo después de que todo lo anterior salga limpio

## Lo que falta confirmar con la corrida real

- Que un contracargo perdido en modo prueba (tarjeta 4000 0000 0000 0259, que abre una disputa por fraude, respondida con la evidencia de prueba losing_evidence) llegue como charge.dispute.closed con status lost y payment_intent, y que quite el plan
- Que GET /v1/invoice_payments con payment[type]=payment_intent y payment[payment_intent] devuelva la factura de un cobro de suscripción, y que la llave restringida con lectura en Invoices pueda leerlo
- Si la sesión de pago trae el código de descuento en sus descuentos cuando el alumno lo teclea. Si no, el webhook lo toma de la suscripción o lee el código que aparece en el desglose de la sesión. Esa lectura necesita permiso de lectura en Promotion codes
- Si el cupón repeating de 1 mes descuenta solo el primer cobro también con prueba, en mensual y en anual (escenario S8)
- Que en modo prueba Apple Pay y Google Pay aparezcan en un iPhone con Safari y en un Android con Chrome (escenario S11). Es la página de pago de Stripe. Los botones de Suscripción tienen su propia lista, arriba
- Que los eventos lleguen con api_version 2026-09-30.endive
- Si un pase pagado con SPEI se puede devolver desde Stripe a la cuenta de origen. Si no, la garantía se devuelve por transferencia como con OXXO

## Fuentes de los campos nuevos

docs.stripe.com no abre desde el entorno de la sesión. Los campos que se agregaron en la revisión de B10 se leyeron el 2026-10-14 de los tipos del SDK oficial de Stripe para Node (npm stripe 23.0.0, cuya versión fija es 2026-09-30.endive, la misma de Studiare), que se generan de la especificación de la API

- Dispute (docs.stripe.com/api/disputes/object). status con lost, won, warning_closed y prevented, amount, currency, payment_intent y charge. No trae el cliente. Los eventos charge.dispute.created y charge.dispute.closed están en la lista de eventos de los endpoints
- InvoicePayment (docs.stripe.com/api/invoice-payment). GET /v1/invoice_payments filtra por payment[type]=payment_intent y payment[payment_intent], y cada pago trae su invoice. La factura solo lleva payments si se pide, y desde basil ni la factura trae payment_intent ni el cargo su factura
- PaymentIntent (docs.stripe.com/api/payment_intents/object). customer, amount_received y currency

## Impuestos y facturas, para revisar con tu contador

- **IVA.** Los precios quedan con el impuesto incluido, que es como se muestra el precio a un consumidor en México. Si tu contador prefiere el IVA aparte, corre el script con --tax=exclusive
- **Stripe Tax.** Para encenderlo hay que activarlo en el panel, poner el domicilio fiscal del negocio y, según tu situación, registrarte donde corresponda. Después pones STRIPE_AUTOMATIC_TAX=true y pruebas un pago en modo prueba. Con Stripe Tax sin configurar Stripe rechaza abrir el pago, por eso va apagado
- **Correos de Stripe.** En Settings, Billing, ajusta qué correos manda Stripe (recibos, cobros fallidos y tarjeta por vencer)
- **CFDI.** Stripe no emite facturas fiscales mexicanas. El alumno la pide en Perfil y tú la emites con tu contador o con un servicio aparte. La app guarda la solicitud y su estado

## Recomendado y todavía no hecho

- **Llave restringida para las funciones.** Una rk_test_ con escritura en Checkout Sessions, Customers, Customer portal y Subscriptions, y lectura en Promotion codes, PaymentIntents e Invoices, para los pagos de factura que busca un reembolso. Sin ella todo funciona con la sk_test_ de hoy
- **Alertas.** Que alguien mire los webhooks fallidos del panel de Stripe, porque la app no manda alertas
- **Modo real.** Antes de cobrar de verdad, la lista de lanzamiento de la sección 11 del plan del cambio, con los doce eventos y los ocho IDs nuevos en modo real

## Llaves

- Nunca pegues una llave sk_ ni rk_ en un chat. Va solo en los secretos de Supabase o del entorno de la sesión
- El revisor de secretos de npm run build marca cualquier llave sk_ o rk_ dentro del build. La publicable pk_ es pública por diseño. Solo la usan los botones de Apple Pay y Google Pay (VITE_STRIPE_PUBLISHABLE_KEY, apagados), y el cobro con la página de Stripe no la necesita
- La llave secreta de prueba que se pegó en el chat el 2026-10-10 no quedó en ningún archivo. Cámbiala con Roll key cuando termines de configurar
