# Lo que falta de Ricardo

Es la sección 9 del plan del cambio V3 (docs/PLAN_DEL_CAMBIO.md), puesta al día por la sesión que lo ejecuta. La última vez fue el 2026-10-14, con el servidor de pagos de B10. Va en el orden en que conviene hacerla. Cada bloque del plan que espera algo de aquí se deja listo y apagado mientras tanto.

Regla que no cambia. Nunca pegues una llave secreta en el chat. Cada una se pega directo en el servicio o en los secretos del entorno. A la sesión le sirven la dirección del proyecto y la llave pública (anon o publishable), nada más.

## Lo que salió del bloque B0

1. **Limpia la prueba de pagos en Stripe.** No se pudo desde la sesión (ver abajo por qué). En Stripe, en modo prueba, abre Customers y busca los dos clientes de tus cuentas de prueba, cus_VQIKjhh9C1h6BU (pagó el Anual y el Fundador el 11 de octubre) y cus_VQPXetXjcQNKay (pagó el Fundador el 11 en la noche). En cada suscripción elige Cancel subscription, Immediately, y marca que se reembolse el último pago. Si el reembolso no sale ahí, hazlo desde Payments, el cobro, Refund. Con eso los avisos de Stripe dejan la base en Gratis solos
2. **Borra las filas de prueba de la base.** Después del paso 1, pega supabase/manual/limpiar-pagos-de-prueba.sql en Supabase, SQL Editor, y ejecútalo una vez. Quita las filas de subscriptions, payments y billing_customers de tus dos cuentas, porque el cupo Fundador cuenta toda fila founder y un cliente de prueba de Stripe rompe el pago en modo real. En la consulta del final, pagos, suscripciones y clientes deben dar cero
3. **Cambia la llave de Stripe del entorno.** La que está hoy en los secretos del entorno de la sesión es la publicable (empieza con pk_test_) y con ella no se puede cancelar, reembolsar ni crear precios. Pon en su lugar una llave restringida de modo prueba (empieza con rk_test_) con permiso de escritura en Products, Prices, Coupons, Promotion codes, Customers, Subscriptions, Checkout Sessions, Customer portal, Payment method domains, Refunds y Test clocks, y de lectura en Events, PaymentIntents, Invoices y Webhook endpoints. Si Stripe pide otro permiso para una herramienta de prueba, por ejemplo fondear el saldo de SPEI, la sesión te dirá cuál. Se crea en Stripe, Developers, API keys, Create restricted key. Sin ella los pasos de Stripe de B10 quedan en esta lista en lugar de hacerse solos
4. **Revisa SUPABASE_ACCESS_TOKEN si lo pusiste.** El entorno inyecta algo en api.supabase.com, pero Supabase lo rechaza con JWT could not be decoded. Es opcional. Si quieres que la sesión configure correos, plantillas y secretos sin preguntarte, genera uno nuevo en supabase.com, Account, Access Tokens, y reemplázalo. Con el conector de Supabase que ya está, la base y las funciones sí se alcanzan

## Lo que salió de B7

- **Pega el archivo de Party en Supabase.** Las migraciones de Party en la nube y de referidos ya están aplicadas en el proyecto. Falta supabase/manual/party-dueno-al-borrar-cuenta.sql, que cambia una llave foránea y el conector no lo puede aplicar. Pégalo completo en Supabase, SQL Editor, New query, y da clic en Run. La consulta del final debe dar regla_al_borrar en n, owner_id_opcional en true y disparador_activo en true. Mientras no lo pegues, si quien creó un grupo borra su cuenta, el grupo se borra para todos sus miembros

## Lo que salió del bloque B10, pagos completos en modo prueba

El código del servidor de pagos ya está y se probó con un Stripe simulado. La corrida real espera estos pasos. Ninguno lleva llaves al chat. El detalle de qué hace Stripe con cada uno está en docs/STRIPE.md.

- **Paso B10.1. Llave restringida para la sesión.** Es el paso 3 de arriba. Va al entorno de la sesión como STRIPE_SECRET_KEY
- **Paso B10.2. Llave restringida para las funciones, recomendada.** En Stripe, Developers, API keys, Create restricted key, en modo prueba, otra rk_test_ con escritura en Checkout Sessions, Customers, Customer portal y Subscriptions, y lectura en Promotion codes y PaymentIntents. Pégala en Supabase, Edge Functions, Secrets, como STRIPE_SECRET_KEY en lugar de la sk_test_ de hoy. Sin ella todo funciona con la de hoy
- **Paso B10.3. Medios de pago.** En Stripe, Settings, Payment methods, activa OXXO, transferencias bancarias de México (SPEI), Apple Pay y Google Pay. Es el paso 16
- **Paso B10.4. Portal por omisión.** En Settings, Billing, Customer portal, guarda la configuración por omisión aunque Studiare use las dos suyas. La sesión crea esas dos
- **Paso B10.5. Reintentos y correos de Stripe.** En Settings, Billing, Subscriptions and emails, reintentos inteligentes, por ejemplo 4 intentos en 2 semanas, y al final cancelar la suscripción. Enciende los correos de cobro fallido y de tarjeta por vencer, y los recibos de pago
- **Paso B10.6. Webhook nuevo.** En Developers, Webhooks, crea un endpoint con la dirección https://bkjbcdwglyllizupokqm.supabase.co/functions/v1/payment-webhook-stripe, la versión de la API 2026-09-30.endive y estos diez eventos. checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, invoice.paid, invoice.payment_failed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, customer.subscription.trial_will_end y charge.refunded. Copia su secreto de firma (empieza con whsec_) a Supabase, Edge Functions, Secrets, como STRIPE_WEBHOOK_SECRET, y desactiva el endpoint viejo
- **Paso B10.7. SQL Editor si la sesión lo pide.** Si el conector no puede con las piezas con drop o delete de la migración de B10, pega supabase/manual/pagos-b10.sql en Supabase, SQL Editor, y ejecútalo una vez. Si sigue pendiente lo del paso 2, pega también supabase/manual/limpiar-pagos-de-prueba.sql
- **Paso B10.8. Pruebas con tu navegador y tu teléfono.** Cuando la sesión te avise, con tus cuentas de prueba. Empezar una prueba gratis, cancelarla, cambiar de plan en el portal, pagar un pase con OXXO y con SPEI, usar el código PRUEBA10 y pedir una factura. En tu iPhone con Safari y en un Android con Chrome confirma que aparecen Apple Pay y Google Pay
- **Paso B10.9. Influencers.** El nombre de cada uno, su código y el descuento. El código lleva letras mayúsculas, números y guion, sin guion bajo. La sesión crea en modo prueba el cupón PRUEBA10 de ejemplo. Los reales se crean al lanzar. Es el paso 25
- **Paso B10.10. Mercado Pago.** Cuando exista la cuenta de la empresa. Es el paso 15

Lo que hace la sesión después, sin pedirte nada más. Corre scripts/stripe/setup-test.ts, pone los ocho IDs en los secretos de Supabase, aplica las tres migraciones, corre la consulta de comprobación de docs/SUPABASE.md, despliega las funciones, corre contigo los escenarios y, con todo en verde, prende las banderas de la prueba gratis y de los pases.

## Esta semana

5. **Borra la función vacía stripe-config-check** (respuesta 4). En Supabase, Edge Functions, stripe-config-check, Delete function. Desde la sesión no se puede borrar
6. **Agrega el código a los correos de acceso** (respuesta 23). En Supabase, Authentication, Emails, abre la plantilla Magic Link y después Confirm signup. Debajo del enlace agrega esta línea y guarda

   `<p>Si abriste este correo en otro dispositivo, escribe en la app este código <strong>{{ .Token }}</strong></p>`
7. **Empieza la activación de Stripe** a nombre de Plexus Medica S. de R.L. de C.V. (respuestas 5, 6 y 42). Te pedirá el RFC de la empresa, el domicilio fiscal, los datos del representante legal y la CLABE de una cuenta de la empresa. Puede tardar días
8. **Platica con tu contador** (respuestas 6, 12, 13 y 14). Que la empresa cobre y facture, facturas a mano a quien las pida, precios con IVA incluido y si conviene Stripe Tax más adelante
9. **Crea tu cuenta de Anthropic y carga saldo** (respuesta 33). En console.anthropic.com crea una clave y pégala tú en Supabase, Edge Functions, Secrets, con el nombre ENARM_ANTHROPIC_KEY. En el entorno de la sesión ya hay una con ese nombre
10. **Dile a la sesión cuál es tu dominio** (respuesta 50) y empieza a pasarlo a nombre de tu empresa (respuesta 24)
11. **Crea los correos de privacidad y de soporte** en tu dominio (pregunta 43), por ejemplo privacidad y soporte arroba tu dominio. Después van como variables VITE_SUPPORT_EMAIL, VITE_LEGAL_NAME y VITE_LEGAL_ADDRESS en GitHub y luego en Cloudflare

## Entorno de la sesión (sección 10 del plan)

12. **Red, secretos, conectores y modo Auto.** Ya están GitHub, Supabase y Google Drive como conectores, y en la red api.stripe.com, api.supabase.com y api.cloudflare.com. Faltan o hay que corregir
    - STRIPE_SECRET_KEY con la llave restringida de prueba (paso 3)
    - MP_ACCESS_TOKEN con la credencial de prueba de Mercado Pago, cuando exista la cuenta (paso 15)
    - ENARM_OPENAI_KEY para comparar calidad en las evaluaciones (B12)
    - CLOUDFLARE_API_TOKEN junto al CLOUDFLARE_ACCOUNT_ID que ya está (paso 20)
    - En Allowed domains, api.mercadopago.com, drive.google.com y drive.usercontent.google.com, y la documentación que la sesión debe leer antes de usar cada servicio. docs.stripe.com, www.mercadopago.com.mx, supabase.com, developers.google.com, resend.com, posthog.com, docs.sentry.io y developers.cloudflare.com
    - Los secretos y conectores nuevos solo se leen al abrir una sesión. Ponlos antes del siguiente mensaje de arranque
    - Revisión del 2026-10-13. La llave que el entorno inyecta en api.stripe.com sigue siendo la publicable (pk_test_), así que la limpieza de pagos y lo de Stripe de B10 siguen en esta lista. El token que el entorno inyecta en api.cloudflare.com responde Invalid API Token. Los sitios de documentación (docs.stripe.com, supabase.com, mercadopago, developers.google.com, resend.com, posthog.com, docs.sentry.io y developers.cloudflare.com) están bloqueados por la red del entorno, y la sesión tuvo que consultar la documentación oficial por GitHub y npm. Agrégalos en Allowed domains

## Cuentas que solo tú puedes crear

Cada una desbloquea un bloque. Mientras no existan, la sesión deja el código listo y apagado con una bandera.

13. **Google Cloud** (B9 y B11). Un proyecto Studiare
    - Pantalla de consentimiento de OAuth con la marca Studiare y tu dominio
    - Cliente OAuth de tipo web. Copia su Client ID y su secreto en Supabase, Authentication, Providers, Google
    - Activa la API de Google Sheets, crea una cuenta de servicio sin roles y crea una llave JSON. Bájala una sola vez
    - Pega tú la llave en Supabase, Edge Functions, Secrets, como GOOGLE_SA_KEY, y el ID de tu Sheet como GOOGLE_BANK_SHEET_ID. Después borra el archivo bajado
    - Comparte tu Sheet Banco de preguntas con el correo de la cuenta de servicio como Lector, sin notificar. Deja apagado que los editores puedan compartir y el acceso general en Restringido
14. **Resend** (B15 y B17). Crea la cuenta, agrega tu dominio y pon en tu DNS los registros SPF, DKIM y DMARC que te da. En Supabase, Authentication, SMTP Settings, pon sus datos. Crea una clave de API y pégala en Supabase, Edge Functions, Secrets, como RESEND_API_KEY
15. **Mercado Pago** (B10). Cuenta de negocio de tu empresa. Con ella, sus credenciales de prueba, un usuario de prueba vendedor y uno comprador de México, y en Webhooks la dirección https://bkjbcdwglyllizupokqm.supabase.co/functions/v1/payment-webhook-mercadopago con los temas payment, subscription_preapproval y subscription_authorized_payment, y su clave secreta. En Supabase, Edge Functions, Secrets, van MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET. En el entorno de la sesión va MP_ACCESS_TOKEN. La guía completa está en docs/MERCADOPAGO.md
16. **Stripe en modo prueba** (B10). En Settings, Payment methods, activa OXXO, transferencias bancarias de México, Apple Pay y Google Pay (comentario 19). La sesión crea en modo prueba los precios, los cupones y las configuraciones del portal con la llave restringida del paso 3. El resto de los pasos de Stripe están en la sección de B10 de arriba
17. **PostHog** (B15). Crea la cuenta y un proyecto. Su clave pública va como variable VITE_POSTHOG_KEY, junto con su dirección, en GitHub y después en Cloudflare
18. **Sentry** (B15). Crea la cuenta y un proyecto. Su DSN va como variable VITE_SENTRY_DSN. Pon tu correo en sus alertas. Crea un token para subir los mapas de código y guárdalo como secreto de GitHub SENTRY_AUTH_TOKEN
19. **Secreto de GitHub para la calibración** (B14). En Supabase crea una llave secreta dedicada a ese proceso y guárdala en GitHub, Settings, Secrets and variables, Actions, como SUPABASE_CALIBRATION_KEY
20. **Cloudflare** (B17). Crea la cuenta, conecta tu dominio y crea un token con permiso solo para Pages y DNS. Va al entorno de la sesión como CLOUDFLARE_API_TOKEN, junto con CLOUDFLARE_ACCOUNT_ID
21. **Supabase de pago** antes de abrir a alumnos de pago (respuesta 27). Después activa la protección de contraseñas filtradas en Authentication (respuesta 28)
22. **Repo privado** al pasar a Cloudflare (respuesta 48). En GitHub, Settings, Danger zone, Change visibility

## Personas

23. **Médicos.** Los dos de la compuerta 1 (respuesta 40). De 3 a 5 revisores con pago por pregunta revisada (respuestas 57 y 58). Acuerda la tarifa
24. **Tu Sheet** (sección 7 del plan). Que los médicos llenen Explicación y Referencias, corrijan Subespecialidad y Subtema según la lista, confirmen el Tipo de reactivo De control y sigan escribiendo hasta 300 preguntas en las siete ramas y en inglés
25. **Influencers.** Sus nombres y el descuento de cada código (respuesta 21), y quién escribe los textos de venta (respuesta 53)
26. **Fer.** Su autorización escrita para el catálogo compartido (respuesta 49)
27. **Paco.** Que comparta Pedia.apkg y Cirugia.apkg con tu cuenta de Drive o con cualquiera con el enlace mientras se suben (respuesta 47). Al terminar se revoca el enlace
28. **Abogado.** Revisa el aviso, los términos y los reembolsos cuando B16 los deje listos (respuesta 44)
29. **Tus 5 aspirantes.** Invítalos desde la pantalla de invitaciones cuando exista (B9 y B18)

## Al lanzar y después

30. **Stripe y Mercado Pago en modo real**, con la lista de lanzamiento de la sección 11 del plan
31. **Más adelante.** La prueba de penetración al crecer (respuesta 31) y el piloto con una universidad (respuesta 94)

## De la lista anterior, que sigue vivo

- **Tu cuenta de dueño.** Si todavía no lo hiciste, márcala con el SQL del paso 3 de docs/SUPABASE.md. La app no puede asignar ese rol, a propósito
- **Portal del cliente y webhook de Stripe.** Pasaron a los pasos B10.4 y B10.6 de arriba

## Por qué la limpieza de pagos no la hizo la sesión

- La credencial de Stripe que el entorno inyecta en api.stripe.com es la llave publicable (pk_test_). Stripe contesta que con ella no se pueden hacer llamadas de servidor, y cancelar o reembolsar lo son
- El camino alterno, una función temporal en Supabase que usara la llave que ya vive en los secretos del proyecto, lo bloqueó el modo Auto de la sesión por tocar recursos compartidos. Por eso quedan los pasos 1 y 2 arriba
