# Mercado Pago en Studiare

Escrito el 2026-10-14 en el bloque B10 (paquete C del diseño). Qué hace hoy el código, cómo se deja listo en modo prueba cuando exista la cuenta, qué escenarios se corren en el sandbox y qué falta confirmar ahí. Todo es modo prueba. Nada aquí toca dinero real (regla 0.1 del plan del cambio).

La documentación web de Mercado Pago no abre desde el entorno de la sesión. Lo que se sabe sale del SDK oficial de Node (npm `mercadopago` 3.6.1, sus tipos y su validador de firmas), de su guía de webhooks en GitHub (`mercadopago/sdk-nodejs`, `docs/webhooks.md`) y del digest de documentación del 2026-10-13. Lo que no se pudo confirmar dice **por confirmar en el sandbox**.

## Qué hay

- **Pase de un solo pago.** 1 mes por $149 o 1 año por $1,499, sin renovación. Se paga en Checkout Pro, la página de Mercado Pago, donde el alumno usa tarjeta, saldo, OXXO o SPEI. Si ya tiene un pase, el nuevo se suma desde la fecha de fin (lo decide la base)
- **Suscripción con renovación automática.** Mensual a $149 o anual a $1,499, con la suscripción sin plan de Mercado Pago (preapproval). El alumno la autoriza con su cuenta de Mercado Pago y se cobra sola hasta que cancele
- **Sin prueba gratis, sin precio Fundador y sin códigos de descuento** en Mercado Pago (8.3 del diseño y respuesta 21). Eso va solo con tarjeta en Stripe
- **Avisos.** La función `payment-webhook-mercadopago` entiende los temas payment, subscription_preapproval y subscription_authorized_payment. Verifica la firma, consulta el recurso a Mercado Pago con el token del servidor y lo aplica en la base una sola vez
- **Cancelar desde la app.** Mercado Pago no tiene portal como Stripe. La función nueva `cancel-subscription` cancela la suscripción del alumno y su plan vale hasta el fin de lo pagado
- **Reembolsos.** Se hacen desde el panel de Mercado Pago. Un reembolso completo o un contracargo quitan el pase o el plan, igual que con Stripe
- **Apagado.** La bandera `mercadoPago` está apagada en todos los entornos y la app no muestra la opción hasta que exista la cuenta y el aviso esté desplegado. El servidor cumple la misma bandera. Sin `mercadoPago` en true en platform_settings, clave feature_flags, `create-checkout` contesta 503 not_configured a todo pago con Mercado Pago. Cancelar desde la app y los avisos de pagos que ya empezaron siguen funcionando

## Cómo funciona por dentro

| Paso | Qué pasa | Qué recibe la base |
|---|---|---|
| Pagar un pase | `create-checkout` crea una preferencia con la referencia `user_id\|plan` y regresa a Suscripción con `pago=ok`, `pago=pendiente&metodo=mercadopago` o `pago=cancelado` | Nada todavía |
| Contratar la suscripción | `create-checkout` crea un preapproval en `pending` con la referencia `user_id\|plan\|sub` y el correo de la cuenta. El alumno la autoriza en la dirección que devuelve Mercado Pago | Nada todavía |
| Tema payment, aprobado | Pase pagado, o cobro de la suscripción si la referencia dice `sub` | `apply_charge` paid |
| Tema payment, ficha OXXO o transferencia pendiente de un pase | Pago pendiente con su vencimiento | `apply_charge` pending |
| Tema payment, pase rechazado o cancelado | Si había un pendiente, pasa a vencido. Si no, nada | `apply_charge` expired, sin plan ni monto |
| Tema payment, devuelto o contracargo | Reembolso del mismo pago | `apply_charge` refunded |
| Tema subscription_preapproval | authorized queda activa, paused queda con cobro fallido, cancelled queda cancelada. pending se ignora | `apply_subscription_state` |
| Tema subscription_authorized_payment, aprobado | Cobro de la suscripción con el mismo id de pago que trae el tema payment | `apply_charge` paid |
| Cancelar en la app | `PUT /preapproval/{id}` con `cancelled` y el estado se aplica en el acto con el evento `cancel:{id}` | `apply_subscription_state` canceled |

Reglas que conviene saber
- El estado de la suscripción no da acceso por sí solo. Solo un cobro aprobado alarga el periodo, un mes o un año desde el día del cobro. Así una tarjeta que Mercado Pago autoriza pero no logra cobrar no regala un mes
- El mismo cobro llega por dos temas (payment y subscription_authorized_payment). Los dos avisos llevan el mismo id de pago y el mismo fin de periodo, así la base no lo cuenta dos veces
- Un cobro rechazado de la suscripción no la marca con cobro fallido. Mercado Pago reintenta y un aviso tardío del intento malo podría llegar después del cobro bueno. Si Mercado Pago se rinde, el cambio llega por subscription_preapproval
- Si un cobro llega sin la referencia, se lee la de su suscripción
- Si el cobro llega antes que el aviso de su suscripción y sin su id, la base crea la fila con ese cobro y la suscripción que llega después es la misma. Adopta su id y no se marca como segunda suscripción ni se cancela
- Lo que se guarda del recurso en payment_webhook_events va sin los datos del pagador (correo, nombre, identificación, tarjeta y cuenta de banco)
- Si la base deja una acción de cancelar una suscripción de Mercado Pago (por ejemplo después de un reembolso completo, 8.6), el aviso la ejecuta después de aplicar. Falta que `runtime.ts` le pase `claimBillingActions` y `finishBillingAction` (ver Pendientes del código)

## Guía para Ricardo, en modo prueba

### 1. Cuenta de negocio
- Abre una cuenta de Mercado Pago a nombre de la empresa, no la personal. Mercado Pago pide el RFC, los datos del representante y su identificación, y una cuenta bancaria para retirar. Lo exacto lo dice Mercado Pago al registrarte
- Con la cuenta lista, entra a Mercado Pago Developers (`https://www.mercadopago.com.mx/developers`) con esa cuenta

### 2. Aplicación
- En Tus integraciones, Crear aplicación. Nombre Studiare. Tipo de solución pagos en línea. Elige Checkout Pro y Suscripciones si te pregunta qué productos vas a integrar
- La aplicación te da credenciales de prueba y de producción. Solo se usan las de prueba hasta la lista de lanzamiento

### 3. Cuentas de prueba
- En Tus integraciones, Cuentas de prueba, crea dos cuentas de país México. Una **vendedor** y una **comprador**. A la de comprador puedes cargarle saldo ficticio
- Guarda sus usuarios y contraseñas en tu gestor de contraseñas, no en el chat
- Mercado Pago no deja mezclar cuentas reales con cuentas de prueba en un mismo pago. Para la corrida, el alumno de Studiare debe pagar entrando a Mercado Pago con el comprador de prueba (**por confirmar en el sandbox**)

### 4. Credenciales de prueba
- En la aplicación, Credenciales de prueba, copia el Access Token. Empieza con `TEST-`
- Si Mercado Pago ya no muestra credenciales de prueba para aplicaciones nuevas, entra con la cuenta vendedor de prueba, crea ahí la aplicación y usa sus credenciales de producción, que solo mueven dinero de prueba porque la cuenta es de prueba (**por confirmar en el sandbox**, la documentación cambió esto en los últimos años)
- Nunca pegues un token en el chat

### 5. Avisos (Webhooks) y clave secreta
- En la aplicación, Webhooks, Configurar notificaciones. Usa la URL de modo prueba si el panel separa prueba y producción
- Dirección `https://bkjbcdwglyllizupokqm.supabase.co/functions/v1/payment-webhook-mercadopago`
- Temas **Pagos** (payment), **Planes y suscripciones** con suscripciones (subscription_preapproval) y pagos recurrentes (subscription_authorized_payment). El tema de planes (subscription_preapproval_plan) no hace falta porque Studiare no usa planes
- Guarda y copia la **clave secreta** que muestra el panel. Con ella se firma cada aviso
- El botón para simular una notificación del panel sirve para comprobar la firma. Con un id de pago que no existe la función responde 502, que es lo esperado

### 6. Secretos
| Dónde | Nombre | Valor |
|---|---|---|
| Supabase, Edge Functions, Secrets | `MERCADOPAGO_ACCESS_TOKEN` | El Access Token de prueba |
| Supabase, Edge Functions, Secrets | `MERCADOPAGO_WEBHOOK_SECRET` | La clave secreta de Webhooks |
| Entorno de la sesión de Claude | `MP_ACCESS_TOKEN` | El mismo Access Token de prueba, para que la sesión opere el sandbox |

- En Supabase van con el nombre largo, que es el que lee el código (8.13). `MP_ACCESS_TOKEN` solo va en el entorno de la sesión
- `APP_URL` y `FUNCTIONS_URL` ya existen y no cambian. Sin `FUNCTIONS_URL` el pase no manda `notification_url` y depende solo de los avisos del panel
- En el acceso a la red del entorno debe estar permitido `api.mercadopago.com`

### 7. Despliegue (lo hace la sesión cuando exista la cuenta)
```
supabase functions deploy payment-webhook-mercadopago --no-verify-jwt
supabase functions deploy cancel-subscription
```
- El aviso va sin verificación de JWT porque quien llama es Mercado Pago y se identifica con su firma. cancel-subscription sí la verifica, porque la llama el alumno con su sesión
- Las migraciones de B10 (apply_charge, apply_subscription_state y checkout_context) deben estar aplicadas antes

### 8. Prender la opción
- Con la corrida de abajo en verde, la sesión prende `mercadoPago` en `platform_settings.feature_flags`. Antes no

## Corrida en el sandbox

| N. | Pasos | Qué debe quedar |
|---|---|---|
| MP1 | El alumno A paga un pase de 1 mes con tarjeta de prueba aprobada (titular APRO, **por confirmar**) | payments en paid con method mercadopago, plan_passes con un mes, my_plan con source pass |
| MP2 | El alumno A paga otro pase de 1 mes antes de que venza | El segundo pase empieza donde termina el primero |
| MP3 | El alumno B elige OXXO dentro de Checkout Pro y no paga | payments en pending con su vencimiento. Al vencer, expired y el aviso de ficha vencida |
| MP4 | El alumno C contrata la suscripción mensual y la autoriza con el comprador de prueba | subscriptions con provider mercadopago, plan monthly y status active. El acceso empieza con el primer cobro, no con la autorización |
| MP5 | Llega el primer cobro de MP4 | Un solo cobro en payments aunque lleguen los temas payment y subscription_authorized_payment. current_period_end un mes después del cobro. Si C llegó por un referido, el mes de quien lo invitó |
| MP6 | C cancela en Studiare, Suscripción, Cancelar suscripción de Mercado Pago | La suscripción cancelada en Mercado Pago, status canceled con el mismo fin de periodo y sin otro cobro. El aviso que llega después responde duplicate o stale |
| MP7 | Reembolso completo desde el panel de un pase y de un cobro de suscripción | Pase refunded. Suscripción sin acceso y su acción de cancelar en done, cuando el aviso ya ejecute acciones |
| MP8 | Reenviar un aviso desde el panel | result duplicate en payment_webhook_events y nada cambia |

- En cada paso la sesión revisa payment_webhook_events (columna result), subscriptions, payments, plan_passes y billing_actions con el conector
- Si un aviso no aplica, el recurso queda en payment_webhook_events sin datos del pagador y el motivo en Edge Functions, Logs

## Lo que falta confirmar en el sandbox

- **Unidad de ts en la firma.** El validador del SDK la trata como segundos y hay ejemplos reales de 13 dígitos. El código acepta las dos por número de dígitos. Confirmar cuál manda Mercado Pago y que cada reintento firma con un ts nuevo, porque la tolerancia es de 5 minutos y Mercado Pago reintenta a los 15 minutos, 30 minutos, 6 horas, 48 horas y 96 horas
- **data.id en minúsculas.** La guía en español lo pide en minúsculas y el SDK lo usa tal cual. El código acepta las dos. Confirmar con el id de una suscripción, que tiene letras
- **Firma de notification_url.** Confirmar que los avisos que llegan a la `notification_url` del pase vienen firmados. Si llegan también avisos IPN sin firma (`?topic=payment&id=...`), la función los rechaza con 401. Se pueden evitar agregando `?source_news=webhooks` a la `notification_url`, que hoy no se agrega porque la prueba de create-checkout del paquete A revisa la dirección exacta
- **Campos del cobro de una suscripción.** Que el pago traiga `point_of_interaction.transaction_data.subscription_id` y `billing_date`, que el cobro de authorized_payments traiga `preapproval_id`, `external_reference`, `debit_date` y `payment.id` igual al id del tema payment, y que `debit_date` y `billing_date` sean el mismo día. Salen de los tipos del SDK, no de una respuesta real
- **Referencia en los cobros de la suscripción.** Si el pago de un cobro no trae `external_reference`, el aviso la lee de la suscripción. Confirmar cuál de los dos caminos se usa
- **payer_email (8.15).** Si debe ser el correo de la cuenta de Mercado Pago de quien paga. En el sandbox casi seguro debe ser el del comprador de prueba. Si en modo real también lo exige, la forma de pago tendría que pedirlo, detrás de la misma bandera
- **Primer cobro de la suscripción.** Si se cobra al autorizar o hasta una hora después, y qué estado trae el preapproval en ese tiempo
- **Cobro rechazado.** Cuántos reintentos hace Mercado Pago y en qué estado deja la suscripción al rendirse (paused o cancelled)
- **Cancelar una suscripción ya cancelada.** Qué responde `PUT /preapproval/{id}`. El código lo cuenta como hecho si después la consulta dice cancelled
- **Fechas.** Que `last_modified`, `date_of_expiration` y `debit_date` lleguen en ISO 8601 con zona. El tipo del SDK para la respuesta de `PUT /preapproval/{id}` las pone como números, por eso la cancelación no las lee
- **Vencimiento de la ficha OXXO.** Que un pago en efectivo vencido llegue como cancelled con su `date_of_expiration`
- **Tarjetas y titulares de prueba de México.** Los números los publica Mercado Pago en Tarjetas de prueba. APRO aprueba y OTHE rechaza según la documentación conocida
- **Apple Pay y Google Pay.** No aparecen en la documentación de Mercado Pago México. Van solo por Stripe (4.29)

## Pendientes del código

- **Acciones de Mercado Pago.** `MercadoPagoWebhookDeps` (billingTypes.ts) y `mercadoPagoWebhookDeps()` (runtime.ts) son del paquete A y no traen `claimBillingActions` ni `finishBillingAction`. El aviso ya sabe ejecutarlas con `MercadoPagoActionDeps` de mercadopago.ts. Falta pasarle `claimBillingActions` con `claimBillingActionsViaRest(supabase, { limit, provider: 'mercadopago' })` y `finishBillingAction` con `finishBillingActionViaRest(supabase, result)`. Sin eso una suscripción reembolsada o una segunda suscripción de Mercado Pago no se cancelan solas y hay que cancelarlas desde el panel
- **create-checkout.** Hoy pasa siempre el modo pass y un contexto vacío. Con B10 debe pasar el modo de la petición y el checkout_context real (paquete A)
- **Página simulada y e2e** (paso 4 del paquete C). Esperan la interfaz FakeBilling del paquete B y la opción de Mercado Pago en Suscripción

## Fuentes consultadas el 2026-10-14

- SDK oficial `mercadopago` 3.6.1 de npm (publicado el 2026-10-13). Tipos de `clients/preApproval` (create, get, update), `clients/invoice` (`GET /authorized_payments/{id}`, con `preapproval_id`, `external_reference`, `debit_date` y `payment { id, status, status_detail }`), `clients/payment` (`point_of_interaction.transaction_data.subscription_id`, `billing_date`, `date_of_expiration`, `payment_type_id`) y `utils/webhook` (validador de x-signature)
- `https://raw.githubusercontent.com/mercadopago/sdk-nodejs/master/docs/webhooks.md`, guía de validación del SDK (tolerancia de 300 segundos, el recurso consultado manda sobre el aviso, los avisos se repiten o llegan en desorden)
- Ejemplos del SDK en `src/examples/preApproval` y `src/examples/preference`
- `/home/user/wt/docs-digest.md`, sección 6
- Bloqueados por la red del entorno `www.mercadopago.com.mx` y `api.github.com`. La sesión que tenga acceso debe revisar las páginas del Anexo A del diseño de B10 y anotar aquí lo que cambie
