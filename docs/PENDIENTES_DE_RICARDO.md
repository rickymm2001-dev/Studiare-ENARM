# Lo que falta de Ricardo

Es la sección 9 del plan del cambio V3 (docs/PLAN_DEL_CAMBIO.md), puesta al día por la sesión que lo ejecuta. La última vez fue el 2026-10-15, con la herramienta de despliegue (docs/DESPLIEGUE.md). Va en el orden en que conviene hacerla. Cada bloque del plan que espera algo de aquí se deja listo y apagado mientras tanto.

Regla que no cambia. Nunca pegues una llave secreta en el chat. Cada una se pega directo en el servicio o en los secretos del entorno. A la sesión le sirven la dirección del proyecto y la llave pública (anon o publishable), nada más.

## Lo que salió del bloque B0

1. **Hecho el 2026-10-15. Limpia la prueba de pagos en Stripe.** La sesión canceló en modo prueba las tres suscripciones de cus_VQIKjhh9C1h6BU y cus_VQPXetXjcQNKay y reembolsó sus tres cobros (79, 1,499 y 79). Los avisos de Stripe llegaron a Supabase y se procesaron
2. **Borra las filas de prueba de la base.** El paso 1 ya está. Falta tu autorización directa en el chat para que la sesión lo corra, porque el control de permisos de la sesión frena borrar o leer datos de cobro de la base real. Si prefieres hacerlo tú, pega supabase/manual/limpiar-pagos-de-prueba.sql en Supabase, SQL Editor, y ejecútalo una vez. Quita las filas de subscriptions, payments y billing_customers de tus dos cuentas, porque el cupo Fundador cuenta toda fila founder y un cliente de prueba de Stripe rompe el pago en modo real. En la consulta del final, pagos, suscripciones y clientes deben dar cero
3. **Hecho el 2026-10-15. Llave de Stripe del entorno.** Ya es una sk_test_ y responde en modo prueba (livemode false). Con ella la sesión creó precios, cupón, portales y el webhook nuevo
4. **Hecho el 2026-10-15. Token de Supabase del entorno.** Ya responde y con él la sesión aplicó el plan b10 con npm run deploy:supabase (docs/DESPLIEGUE.md)

## Lo que salió de B7

- **Hecho el 2026-10-15. El archivo de Party en Supabase.** La sesión aplicó supabase/manual/party-dueno-al-borrar-cuenta.sql con el plan b10 y su comprobación salió en verde. Si quien creó un grupo borra su cuenta, el grupo pasa al miembro más antiguo

## Lo que salió de B9, cuentas y acceso

La sesión aplica la migración y publica la función admin-reset-mfa al fusionar el bloque. Lo que sigue es tuyo, con el detalle paso a paso en docs/SUPABASE.md, sección Cuentas y acceso (B9).

- **Activa el gancho del registro.** En Supabase, Authentication, Hooks, Before User Created, tipo Postgres, función public.before_user_created_hook. Sin este paso cualquiera crea su cuenta aunque la app diga que es solo con invitación. Después prueba en incógnito con un correo que no invitaste
- **Entrar con Google.** En Google Cloud, cliente OAuth web con la dirección de regreso https://bkjbcdwglyllizupokqm.supabase.co/auth/v1/callback, sus datos en Supabase, Authentication, Providers, Google, y al final la bandera googleSignIn. Va con el paso 13
- **Segundo factor del equipo.** Prende la bandera requireMfa con la consulta de docs/SUPABASE.md y da de alta tu código con una app de autenticación la próxima vez que entres. Desde ahí, sin el código no tienes tu rol de dueño
- **Invita a tus aspirantes** en Usuarios, Invitaciones. El día del lanzamiento abres el registro con Abrir el registro

## Lo que salió del bloque B10, pagos completos en modo prueba

El código del servidor de pagos ya está y se probó con un Stripe simulado. La corrida real espera estos pasos. Ninguno lleva llaves al chat. El detalle de qué hace Stripe con cada uno está en docs/STRIPE.md.

- **Hecho. Paso B10.1. Llave para la sesión.** Es el paso 3 de arriba
- **Paso B10.2. Llave restringida para las funciones, recomendada.** En Stripe, Developers, API keys, Create restricted key, en modo prueba, otra rk_test_ con escritura en Checkout Sessions, Customers, Customer portal y Subscriptions, y lectura en Promotion codes y PaymentIntents. Pégala en Supabase, Edge Functions, Secrets, como STRIPE_SECRET_KEY en lugar de la sk_test_ de hoy. Sin ella todo funciona con la de hoy
- **Paso B10.3. Medios de pago.** En Stripe, Settings, Payment methods, activa OXXO, transferencias bancarias de México (SPEI), Apple Pay y Google Pay. Es el paso 16
- **Paso B10.4. Portal por omisión.** En Settings, Billing, Customer portal, guarda la configuración por omisión aunque Studiare use las dos suyas. La sesión crea esas dos
- **Paso B10.5. Reintentos y correos de Stripe.** En Settings, Billing, Subscriptions and emails, reintentos inteligentes, por ejemplo 4 intentos en 2 semanas, y al final cancelar la suscripción. Enciende los correos de cobro fallido y de tarjeta por vencer, y los recibos de pago
- **Hecho el 2026-10-15. Paso B10.6. Webhook nuevo.** La sesión creó en modo prueba el endpoint con la dirección de payment-webhook-stripe, la versión 2026-09-30.endive y los doce eventos, puso su secreto en STRIPE_WEBHOOK_SECRET sin verlo en pantalla y desactivó el viejo. Las tres cancelaciones y los tres reembolsos de la limpieza llegaron firmados y se procesaron
- **Hecho el 2026-10-15. Paso B10.7. pagos-b10.sql.** La sesión lo aplicó con el plan b10, con su comprobación en verde y las 46 funciones iguales al repo. También publicó cancel-subscription
- **Paso B10.8. Pruebas con tu navegador y tu teléfono.** Cuando la sesión te avise, con tus cuentas de prueba. Empezar una prueba gratis, cancelarla, cambiar de plan en el portal, pagar un pase con OXXO y con SPEI, usar el código PRUEBA10 y pedir una factura. En tu iPhone con Safari y en un Android con Chrome confirma que aparecen Apple Pay y Google Pay
- **Paso B10.9. Influencers.** El nombre de cada uno, su código y el descuento. El código lleva letras mayúsculas, números y guion, sin guion bajo. La sesión crea en modo prueba el cupón PRUEBA10 de ejemplo. Los reales se crean al lanzar. Es el paso 25
- **Paso B10.10. Mercado Pago.** Cuando exista la cuenta de la empresa. Es el paso 15

Hecho el 2026-10-15 por la sesión. El plan b10 (pagos-b10.sql, el archivo de Party y cancel-subscription), scripts/stripe/setup-test.ts con los seis precios, el cupón y el código PRUEBA10 y los dos portales, y los ocho IDs en los secretos de Supabase. Falta correr contigo los escenarios del paso B10.8 y, con todo en verde, prender las banderas de la prueba gratis y de los pases.

## Lo que salió de B11, el banco en la nube

El servidor del banco ya está con sus pruebas. Todo queda apagado hasta tus pasos. El guion completo está en la sección 8 del plan de B11 y el detalle técnico en docs/BANCO_EN_LA_NUBE.md y docs/SUPABASE.md. Ninguno lleva llaves al chat.

- **Paso B11.1. Cuenta de servicio de Google.** En console.cloud.google.com, en el proyecto Studiare, activa Google Sheets API, crea la cuenta de servicio studiare-banco sin roles y una llave JSON. Si sale que crear llaves está desactivado, el proyecto está en una organización con la política iam.managed.disableServiceAccountKeyCreation, y conviene crear el proyecto con tu cuenta personal o cambiar esa política solo para este proyecto. Es el paso 13
- **Paso B11.2. Secretos de la función.** En Supabase, Edge Functions, Secrets, crea GOOGLE_SA_KEY con el contenido completo del archivo JSON y GOOGLE_BANK_SHEET_ID con el ID de tu Sheet, lo que va entre /d/ y /edit. Después borra el archivo bajado
- **Paso B11.3. Compartir el Sheet.** En Banco de preguntas, Compartir, pega el correo de la cuenta de servicio (termina en iam.gserviceaccount.com) como Lector, sin notificar. Deja apagado que los editores cambien permisos y el acceso general en Restringido
- **Paso B11.4. Sheet de prueba.** La sesión te deja Studiare-banco-prueba.xlsx en tu Drive (`npm run bank:sheet-test`). Ábrelo con Hojas de cálculo de Google, Archivo, Guardar como Hojas de cálculo de Google, compártelo igual con la cuenta de servicio y crea el secreto GOOGLE_BANK_TEST_SHEET_ID con su ID. Ahí revisa si las listas de Subespecialidad y Subtema cambian con la rama
- **Paso B11.5. Ya no pegas banco-b11.sql.** Con el token de Supabase (paso 4 de arriba) la sesión aplica las seis migraciones y la pieza de Borrar mis datos con npm run deploy:supabase -- --plan b11 y revisa su comprobación. Solo si el token no llega, pega supabase/manual/banco-b11.sql en SQL Editor después de ejecutar-en-sql-editor.sql
- **Paso B11.6. Cambios de estructura de tu Sheet** (los hacen tú o Paco, no cambian el texto de ninguna pregunta)
  - Haz una copia de seguridad del Sheet
  - Fija los ID antes de la primera sincronización que aplique. Hoy son una fórmula que cambia al ordenar renglones, y mientras lo sean la sincronización solo reporta
  - Agrega las columnas Caso, Orden en el caso, Autor y Revisor. Paco llena Caso y Orden de las 13 preguntas que dependen de otra y del caso partido entre los renglones 77 y 79, y Autor en las 108
  - Deja en cada encabezado solo su primera línea y la ayuda como nota de la celda
  - Copia la pestaña Listas que te deja la sesión (`npm run bank:sheet-lists`) y crea las validaciones de Subespecialidad y Subtema como en el Sheet de prueba
  - Cambia la lista de Estado a Borrador, Lista para revisión y Retirar
  - Reemplaza el texto de la pestaña Instrucciones con el de docs/SHEET_DEL_BANCO.md
- **Paso B11.7. Claves y revisores.** Una clave corta para cada médico (por ejemplo PM para Paco), quién revisa cada subespecialidad y, si la quieres en el reporte de pagos, la tarifa por revisión. Se ponen en Studiare, Administración, Usuarios y Banco y Sheet
- **Paso B11.8. Mazos.** Sube en Catálogo de mazos los de Paco (incluidos Pediatría y Cirugía, que van solo a Storage) y confirma su autorización como dueño. El de Fer espera su autorización escrita
- **Paso B11.9. Abrir el banco.** Cuando haya 300 aprobadas, prende cloudBank. Mientras tanto los alumnos siguen con la demo

Lo que hace la sesión después, sin pedirte nada más. Aplica las seis migraciones, guarda project_url en Vault, despliega bank-sync sin verificación de JWT, revisa que conteste 401 sin ficha ni sesión y skipped con disabled a la de Cron, y con tu aviso prende la sincronización en solo reporte contra el Sheet de prueba y contra el real. Pasa a aplicar solo cuando los ID sean fijos y tú lo apruebes.

Decisiones de B11 que esperan tu visto bueno, con la opción recomendada ya tomada. Subespecialidad deducida del subtema (8.2), De control con casilla para el revisor (8.4), la tarifa (8.8), el freno de los planes de pago (8.10), el día de abrir el banco (8.14), los temas de Salud pública (8.15), los pesos del examen completo (8.17), Pediatría y Cirugía solo en Storage (8.18), un médico con decisiones que quiere borrar su cuenta (8.33), las listas dependientes (8.34) y cómo se cuenta la meta de 300 (8.35). Ya aplicadas con el plan. El pago a médicos cuenta cada pregunta revisada una vez al mes (respuesta 58) y una Tarea que no se detecta entra como pendiente para aprobar (D-080). Queda tuya cómo cierras la cuenta de un médico con decisiones sin perder lo que respalda sus pagos.

## Lo que salió de B16, legal y privacidad

El aviso de privacidad y los términos quedaron al día (el aviso en la versión 2026-10-15b y los términos en la 2026-10-15), todavía como borrador para revisión del abogado. La lista de cambios, las preguntas para el abogado y las tuyas están en docs/legal/CAMBIOS-B16.md.

- **Los datos del responsable** (pregunta 43). Mientras falten, el alumno lee un texto neutro y el abogado ve la marca de lo que falta. Ponlos en GitHub, Settings, Secrets and variables, Actions, pestaña Variables, y después en Cloudflare (B17). Son públicos por diseño
  - VITE_LEGAL_NAME con Plexus Medica S. de R.L. de C.V.
  - VITE_LEGAL_ADDRESS con el domicilio de la empresa, cuando lo confirme tu contador
  - VITE_PRIVACY_EMAIL con el correo de privacidad, por ejemplo privacidad arroba tu dominio
  - VITE_SUPPORT_EMAIL con el correo de soporte. Si quieres un solo buzón, pon solo este y el aviso lo usa también para privacidad
  - Después corre la publicación en Actions, con el flujo pages y Run workflow
- **Manda los textos a tu abogado** (respuesta 44). Son docs/legal/aviso-de-privacidad.md, docs/legal/terminos-y-condiciones.md y docs/legal/CAMBIOS-B16.md. La marca de borrador se quita solo cuando me digas que los aprobó
- **Contesta las cinco preguntas de CAMBIOS-B16.md**, sección Preguntas para Ricardo. Entre ellas con qué sistema emitirás las facturas y cómo le pedirás al alumno su cuenta para devolverle una garantía pagada en OXXO

## Esta semana

5. **Borra la función vacía stripe-config-check** (respuesta 4). En Supabase, Edge Functions, stripe-config-check, Delete function. Desde la sesión no se puede borrar
6. **Agrega el código a los correos de acceso** (respuesta 23). En Supabase, Authentication, Emails, abre la plantilla Magic Link y después Confirm signup. Debajo del enlace agrega esta línea y guarda

   `<p>Si abriste este correo en otro dispositivo, escribe en la app este código <strong>{{ .Token }}</strong></p>`
7. **Empieza la activación de Stripe** a nombre de Plexus Medica S. de R.L. de C.V. (respuestas 5, 6 y 42). Te pedirá el RFC de la empresa, el domicilio fiscal, los datos del representante legal y la CLABE de una cuenta de la empresa. Puede tardar días
8. **Platica con tu contador** (respuestas 6, 12, 13 y 14). Que la empresa cobre y facture, facturas a mano a quien las pida, precios con IVA incluido y si conviene Stripe Tax más adelante
9. **Crea tu cuenta de Anthropic y carga saldo** (respuesta 33). En console.anthropic.com crea una clave y pégala tú en Supabase, Edge Functions, Secrets, con el nombre ENARM_ANTHROPIC_KEY. En el entorno de la sesión ya hay una con ese nombre
10. **Dile a la sesión cuál es tu dominio** (respuesta 50) y empieza a pasarlo a nombre de tu empresa (respuesta 24)
11. **Crea los correos de privacidad y de soporte** en tu dominio (pregunta 43), por ejemplo privacidad y soporte arroba tu dominio. Después van como variables VITE_PRIVACY_EMAIL, VITE_SUPPORT_EMAIL, VITE_LEGAL_NAME y VITE_LEGAL_ADDRESS en GitHub y luego en Cloudflare, como dice Lo que salió de B16

## Entorno de la sesión (sección 10 del plan)

12. **Red, secretos, conectores y modo Auto.** Ya están GitHub, Supabase y Google Drive como conectores, y en la red api.stripe.com, api.supabase.com y api.cloudflare.com. Faltan o hay que corregir
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
28. **Abogado.** Revisa el aviso, los términos y los reembolsos (respuesta 44). B16 ya los dejó listos en docs/legal, con la lista de cambios y sus preguntas en docs/legal/CAMBIOS-B16.md
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
