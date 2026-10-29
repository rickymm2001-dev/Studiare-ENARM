# Guía de cuentas para el plan V5, paso a paso y para principiante

Son las ocho entregas de la sección 4 de docs/PLAN_V5.md, en el orden en que desbloquean bloques. Cada una dice para qué sirve, cuándo la necesitas de verdad, cuánto cuesta, los pasos con los nombres de los menús tal como aparecen hoy, cómo sabes que quedó y qué no hacer. Los menús cambian de nombre de vez en cuando. Si no encuentras uno, dime lo que ves en pantalla.

Tres reglas para todas
- Ninguna llave, contraseña ni token se pega en el chat. Cada una se pega directo en el servicio que la necesita y se cierra la ventana.
- Antes de empezar, activa la verificación en dos pasos en GitHub, Supabase, Cloudflare, Stripe y Resend, y guarda los códigos de respaldo en tu gestor de contraseñas. Toma 10 minutos y con esas cuentas se publica, se cobra y se manda correo en tu nombre.
- Cuando termines un punto, escribe en el chat de la sesión nueva "ya quedó el punto N". La sesión comprueba lo que puede sin ver llaves.

## Punto 1. Supabase, tu cuenta de dueño y el plan Pro

Para qué. Supabase es la base de datos y el inicio de sesión de la app. Tu cuenta de dueño es la única que puede nombrar administradores y médicos. El plan Pro hace copias diarias y evita que el proyecto se pause por falta de uso.

Cuándo. La cuenta de dueño, ahora, es gratis y la sesión la necesita en el bloque B1. El plan Pro no es necesario ahora. Hazlo antes de invitar a los primeros 5 alumnos (bloque B3, semana 3), porque el plan gratis no guarda copias y pausa el proyecto tras una semana sin uso.

Cuánto. Pro cuesta 25 dólares al mes por proyecto, más uso si creces mucho. Puedes cancelarlo cuando quieras.

Pasos de la cuenta de dueño
1. Entra a supabase.com y abre tu proyecto, el que se llama como la app.
2. En el menú de la izquierda abre Authentication y luego Users. Si tu correo no aparece, toca Add user, Create new user, escribe tu correo y una contraseña, y marca Auto Confirm User.
3. En el menú de la izquierda abre SQL Editor y toca New query.
4. Pega esto, cambiando el correo por el tuyo, y toca Run.

```sql
update public.user_roles set role = 'owner'
where user_id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
```

5. Debe decir Success y 1 row. Si dice 0 rows, el correo no coincide con el del paso 2.

Pasos del plan Pro, cuando toque
1. En supabase.com, arriba a la izquierda, abre tu organización y luego Billing.
2. Toca Change plan, elige Pro y paga con tarjeta.
3. Abre tu proyecto, Settings, luego Compute and Disk o Backups, y confirma que diga Daily backups.

Cómo sabes que quedó. Al entrar a la app con tu correo aparece Usuarios en el menú Más.

Qué no hacer. No corras ningún otro SQL que no venga de esta guía o de la sesión. No compartas la contraseña del proyecto.

## Punto 2. La clave de Anthropic, para la IA del servidor

Para qué. Con ella las funciones del servidor llaman a Claude para los motores de IA (tarjetas, pistas, controversias). Sin ella la app funciona completa y dice IA simulada.

Cuándo. Bloque B1, pero puede esperar sin bloquear nada. Si no la pones, todo sigue y la IA queda apagada.

Cuánto. Se paga por uso. Carga 20 dólares para empezar y pon un tope mensual.

Pasos
1. Entra a console.anthropic.com y crea tu cuenta con el correo de la empresa.
2. En Billing carga saldo y en Limits pon un tope mensual, por ejemplo 50 dólares.
3. En API Keys toca Create Key, nómbrala studiare-produccion y cópiala. Se muestra una sola vez.
4. En Supabase abre tu proyecto, Edge Functions, Secrets, toca Add new secret, nombre ENARM_ANTHROPIC_KEY, valor la clave, y guarda.
5. Cierra la ventana de Anthropic sin guardar la clave en ningún otro lado.

Cómo sabes que quedó. Avisas a la sesión y ella hace una llamada de prueba y te dice si contesta.

Qué no hacer. Nunca pegues la clave en GitHub, en el chat ni en un archivo. El nombre tiene que ser exactamente ENARM_ANTHROPIC_KEY.

## Punto 3. Resend, Sentry y PostHog

Son tres cuentas gratis. Resend manda los correos de acceso y recordatorios. Sentry avisa cuando algo falla en el navegador de un alumno. PostHog mide el uso de la app con permiso de cada alumno.

Cuándo. Resend y Sentry antes de la beta de 5 (bloque B2). PostHog puede esperar a la beta de 20 a 50.

### 3a. Resend, correo propio

Necesitas antes el punto 4, porque Resend pide tu dominio.

1. Entra a resend.com y crea la cuenta.
2. Abre Domains, Add Domain y escribe mail seguido de un punto y tu dominio, por ejemplo mail.tudominio.mx. Es un subdominio a propósito, para que el correo de acceso no se mezcle con tu correo normal.
3. Resend muestra una tabla de registros DNS. Déjala abierta.
4. En otra pestaña entra a dash.cloudflare.com, tu dominio, DNS, Records. Por cada fila de Resend toca Add record, copia tipo, nombre y valor tal cual, y pon Proxy status en DNS only (nube gris). Si Cloudflare te muestra el dominio ya puesto al final del nombre, escribe solo la parte que Resend muestra antes de tu dominio.
5. Regresa a Resend y toca Verify DNS Records. Puede tardar de minutos a horas. Debe quedar en Verified.
6. En Resend abre API Keys, toca Create API Key, nombre supabase-smtp, permiso Sending access, dominio el tuyo. Cópiala.
7. En Supabase abre Authentication, SMTP Settings, prende Enable Custom SMTP y llena. Sender email no-responder@mail.tudominio.mx. Sender name Studiare. Host smtp.resend.com. Port 465. Username resend. Password la llave del paso 6. Guarda.
8. En Resend crea una segunda llave, nombre funciones, mismo permiso. En Supabase, Edge Functions, Secrets, agrégala con el nombre RESEND_API_KEY.
9. Avisa a la sesión. Ella pone los otros secretos de correo y el registro DMARC, o te pasa el registro para que lo agregues igual que en el paso 4.

Cómo sabes que quedó. Pide un código de acceso desde la app a tu Gmail. Llega en menos de un minuto y el remitente es tu dominio.

### 3b. Sentry, alertas de errores

1. Entra a sentry.io y crea la cuenta con el plan Developer, que es gratis.
2. Crea un proyecto, plataforma Browser JavaScript, nombre studiare-web. Copia el DSN que te muestra, es una dirección que empieza con https.
3. Crea un segundo proyecto, plataforma Node o Deno si existe, nombre studiare-funciones. Copia su DSN.
4. En cada proyecto abre Settings, Security & Privacy y prende Prevent Storing of IP Addresses.
5. En cada proyecto abre Alerts, Create Alert, elige Issues, condición "a new issue is created", acción enviar correo a tu cuenta, y guarda.
6. En GitHub abre tu repositorio, Settings, Secrets and variables, Actions, pestaña Variables, New repository variable, nombre VITE_SENTRY_DSN, valor el DSN de studiare-web.
7. En Supabase, Edge Functions, Secrets, agrega SENTRY_DSN con el DSN de studiare-funciones.
8. Avisa a la sesión. Ella manda un error de prueba y tú confirmas que te llegó el correo.

### 3c. PostHog, medición de uso

1. Entra a posthog.com y crea la cuenta eligiendo la nube de Estados Unidos.
2. Crea un proyecto llamado Studiare.
3. En Settings del proyecto prende Discard client IP data y deja apagadas Session replay, Surveys y Autocapture.
4. Copia la Project API key, que empieza con phc, y la dirección de captura, https seguida de us.i.posthog.com. Nunca una llave personal, que empieza con phx.
5. En GitHub, Variables, crea VITE_POSTHOG_KEY con la llave y VITE_POSTHOG_HOST con la dirección.
6. En Supabase, Edge Functions, Secrets, agrega POSTHOG_PROJECT_KEY y POSTHOG_HOST con los mismos valores.
7. Avisa a la sesión. Ella prende la medición cuando llegue la beta de 20 a 50.

## Si el dominio es el de la empresa (Plexus Medica)

Studiare es un producto de Plexus Medica y el dominio de la empresa es el que se usa. No hace falta comprar otro. Donde la guía dice tudominio.mx, lee así.

- La app vive en studiare.plexusmedica.mx (o .com, el que exista). Es un subdominio, para no tocar la página ni el correo de la empresa. SITE_URL y las direcciones de Supabase llevan ese subdominio.
- El correo que manda la app sale de mail.plexusmedica.mx, con remitente no-responder@mail.plexusmedica.mx. Es un subdominio aparte para que los correos automáticos no afecten la reputación del correo normal de la empresa.
- Los buzones de privacidad y soporte son correos normales de la empresa, privacidad@plexusmedica.mx y soporte@plexusmedica.mx, creados donde ya está el correo de la empresa como alias.
- Al meter el dominio a Cloudflare, antes de cambiar los nameservers, confirma que la lista que Cloudflare copió tenga los registros MX y TXT del correo de la empresa y el de su página, si la hay. Con eso, nada de la empresa deja de funcionar.

## Punto 4. Dominio en Cloudflare, token para publicar y buzones

Para qué. Que la app viva en tu dominio con candado, publicada por Cloudflare Pages, y que existan los correos de privacidad y soporte que exige la ley.

Cuándo. Bloque B2, antes de la beta de 5. Empieza ya porque el cambio de nameservers tarda hasta un día.

Cuánto. Cloudflare plan Free. El dominio cuesta lo que ya pagas al año.

### 4a. El dominio
1. Dime en el chat cuál es tu dominio, dónde lo compraste y si ya tiene correo. Sin contraseñas.
2. Entra a dash.cloudflare.com y crea tu cuenta.
3. Toca Add a domain, escribe tu dominio sin www, elige el plan Free y Continue.
4. Cloudflare muestra los registros que encontró. No borres ninguno, sobre todo los MX y TXT, que son del correo.
5. Cloudflare te da dos nameservers, con nombres como ana.ns.cloudflare.com. Entra al sitio donde compraste el dominio, busca Nameservers o DNS, apaga DNSSEC si estaba prendido, quita los que tenía y pon esos dos, copiados exactos.
6. Espera el correo de Cloudflare que dice que el dominio está Active. Puede tardar hasta 24 horas y mientras nada se rompe.

### 4b. El token para que GitHub publique
1. En Cloudflare, arriba a la derecha, abre tu perfil y luego API Tokens, o en el menú Manage Account, Account API Tokens.
2. Toca Create Token, Custom token, Get started. Nombre studiare-github.
3. En Permissions elige Account, Cloudflare Pages, Edit. En Account Resources elige tu cuenta. Nada más.
4. Continue to summary, Create Token. Cópialo, se muestra una sola vez.
5. En GitHub, repositorio, Settings, Secrets and variables, Actions, pestaña Secrets, New repository secret. Crea CLOUDFLARE_API_TOKEN con el token.
6. Tu Account ID está en Cloudflare, en la página de tu dominio, columna derecha, sección API. Créalo en GitHub como secreto CLOUDFLARE_ACCOUNT_ID.
7. En la pestaña Variables crea CLOUDFLARE_PAGES_PROJECT con studiare y SITE_URL con https y tu dominio, sin diagonal al final.
8. No crees todavía CLOUDFLARE_DEPLOY. La sesión te dice cuándo, porque esa es la que prende la publicación.

### 4c. Los buzones
1. Necesitas dos correos de tu dominio, privacidad y soporte. Si tu dominio ya tiene correo (Google Workspace, Zoho o el del registrador), créalos ahí como alias de tu buzón. Si no tiene, lo más fácil es Zoho Mail en su plan gratis o Google Workspace de pago.
2. En GitHub, Variables, crea VITE_PRIVACY_EMAIL y VITE_SUPPORT_EMAIL con esas direcciones, VITE_LEGAL_NAME con la razón social y VITE_LEGAL_ADDRESS con el domicilio fiscal cuando el contador lo confirme.

Cómo sabes que quedó. La sesión publica en pages.dev, luego en tu dominio, y te manda la dirección. Al abrirla en incógnito con http, con https y con www, las tres terminan en https y tu dominio sin www, con candado.

Qué no hacer. No actives en Cloudflare Rocket Loader, Auto Minify, Web Analytics ni reglas de caché. No pongas el token de Cloudflare en ningún otro lado.

## Punto 5. Los 5 aspirantes y el aviso de privacidad con tus datos

Para qué. La beta de 5 de B18 ya tiene su guía en docs/PRIMEROS_ALUMNOS.md. El aviso de privacidad debe decir quién es el responsable aunque siga en borrador del abogado.

Cuándo. Bloque B3, semana 3.

Pasos
1. Elige 5 personas de confianza que vayan a presentar el ENARM y que te vayan a decir la verdad. Que al menos dos usen iPhone y dos Android.
2. Las cuatro variables del punto 4c tienen que estar puestas. La sesión vuelve a publicar y el aviso muestra tus datos.
3. Lee docs/PRIMEROS_ALUMNOS.md, secciones Qué decirles y Qué no decirles. Avísales que es beta, sin cobro, con preguntas de demostración etiquetadas, y que el aviso sigue en revisión del abogado.
4. Cuando la sesión te diga que el servidor y el correo están listos, entra a la app con tu cuenta de dueño, abre Más, Usuarios, y manda la invitación a cada uno con su correo.
5. Durante la semana anota lo que te digan en la pantalla de Encuesta de la app o en un mensaje a la sesión.

Cómo sabes que quedó. Los 5 entraron con el código que les llegó a su correo y ven Inicio con su nombre.

## Punto 6. Médicos revisores, Google Cloud para el Sheet y las autorizaciones

Para qué. Que el banco de preguntas tenga 300 aprobadas por médicos antes de la beta de 20 a 50. El Sheet es donde escriben y la cuenta de servicio de Google deja que el servidor lo lea.

Cuándo. Empieza en la semana 1 porque es lo que más tarda. Bloque B4.

Cuánto. Lo que acuerdes con los médicos por pregunta revisada. Google Cloud, gratis para esto.

### 6a. Los médicos
1. Dos médicos para la compuerta 1, que son quienes aprueban que la IA pueda proponer contenido. Pueden ser los mismos revisores.
2. De 3 a 5 revisores. Acuerda una tarifa por pregunta revisada y por pregunta escrita, por escrito aunque sea un correo.
3. Dales acceso al Sheet como editores y a la app con el rol de médico, que tú asignas desde Usuarios. Cada uno revisa preguntas de otro, nunca las propias.
4. Pídeles que llenen Explicación y Referencias en cada pregunta y que sigan la lista de ramas y subtemas de docs/SHEET_DEL_BANCO.md.

### 6b. Google Cloud y la cuenta de servicio
1. Entra a console.cloud.google.com con el correo de la empresa y crea un proyecto llamado Studiare.
2. En el buscador de arriba escribe Google Sheets API, ábrela y toca Enable.
3. En el menú abre IAM & Admin, Service Accounts, Create service account. Nombre studiare-banco. No le des ningún rol. Toca Done.
4. Abre la cuenta recién creada, pestaña Keys, Add key, Create new key, tipo JSON. Se descarga un archivo. Ábrelo con el bloc de notas y copia todo su contenido.
5. En Supabase, Edge Functions, Secrets, crea GOOGLE_SA_KEY con ese contenido completo. Luego borra el archivo descargado y vacía la papelera.
6. En Google Drive abre tu Sheet del banco. En la barra del navegador, la dirección tiene una parte larga entre /d/ y /edit. Esa es el ID. En Supabase crea el secreto GOOGLE_BANK_SHEET_ID con ese ID.
7. En el Sheet toca Compartir, pega el correo de la cuenta de servicio (termina en iam.gserviceaccount.com), permiso Lector, desmarca Notificar y envía. En la rueda de ajustes de compartir desmarca que los editores puedan cambiar permisos.
8. Avisa a la sesión. Ella conecta la lectura y te dice cuántas filas entraron y cuáles tienen errores.

### 6c. Las autorizaciones
1. A Paco y a Fer pídeles un correo que diga que autorizan usar sus mazos en Studiare, en el plan y con la atribución que acuerden. Guárdalo.
2. Paco comparte Pedia.apkg y Cirugia.apkg con tu Drive. Avisa a la sesión y ella los sube al catálogo. Después revoca el enlace compartido.

Cómo sabes que quedó. En la app, Admin, Banco, aparece el conteo de preguntas por estado y las de tus médicos cambian de borrador a aprobada.

## Punto 7. Stripe a nombre de la empresa, contador y abogado

Para qué. Cobrar de verdad. Hoy Stripe está en modo prueba con precios, cupón y portal listos.

Cuándo. Empieza ya porque la activación tarda días y el abogado semanas. Se usa en el bloque B7, antes de la apertura.

### 7a. Activación de Stripe
1. Entra a dashboard.stripe.com con tu cuenta y toca Activate account o Activar pagos.
2. Te pedirá el RFC y la razón social de la empresa, el domicilio fiscal, los datos del representante legal con identificación, la CLABE de una cuenta bancaria de la empresa y una descripción del negocio. Escribe preparación para el ENARM por suscripción.
3. Envía y espera la revisión. Puede tardar de uno a varios días. Stripe te escribe si falta algo.
4. En Settings, Payment methods, activa OXXO, transferencia bancaria de México, Apple Pay y Google Pay.
5. No cambies precios ni productos en el panel. La sesión los crea en modo real cuando toque, con tu confirmación paso a paso.

### 7b. Contador
Pregúntale cuatro cosas. Que la empresa cobre suscripciones con IVA incluido en el precio, cómo emitir facturas a mano a quien las pida, si conviene Stripe Tax más adelante, y el domicilio fiscal exacto para el aviso de privacidad.

### 7c. Abogado
1. Mándale docs/legal/aviso-de-privacidad.md, docs/legal/terminos-y-condiciones.md y docs/legal/CAMBIOS-B16.md. Si quieres mandarlos con tus datos ya puestos, pide a la sesión que los exporte.
2. Pídele que revise contra la ley de protección de datos y la regulación de consumo para suscripciones con cobro automático, que defina reembolsos después de la garantía de 7 días y tribunales, y que confirme cómo se mencionan los proveedores fuera de México.
3. Cuando te apruebe los textos, dile a la sesión que ya pasaron. Ella quita la marca de borrador.

Cómo sabes que quedó. Stripe muestra la cuenta como activa y un cobro chico de prueba, que hace la sesión contigo, se reembolsa completo.

## Punto 8. El entorno de la sesión nueva

Para qué. Que la sesión pueda leer la documentación oficial de cada servicio y tenga los secretos que le faltan. Esto solo se lee cuando la sesión arranca, así que va antes del primer mensaje.

Cuándo. Antes de abrir la sesión del plan V5.

Pasos
1. En claude.ai abre Code y, en la barra de arriba de una sesión, el menú del entorno en la nube. Toca Edit.
2. En Network access elige Limited y, bajo Allowed domains, agrega uno por uno docs.stripe.com, supabase.com, resend.com, posthog.com, docs.sentry.io, developers.cloudflare.com, developers.google.com y www.mercadopago.com.mx. Deja marcada la casilla de administradores de paquetes.
3. En la misma pantalla, en Network secrets o variables de entorno, revisa que sigan api.supabase.com, api.cloudflare.com y api.stripe.com. El token de Cloudflare que está hoy no sirve, así que si quieres que la sesión cree registros DNS por ti, crea en Cloudflare un segundo token con permiso Zone, DNS, Edit solo para tu dominio y ponlo ahí con el nombre CLOUDFLARE_API_TOKEN. Si no, la sesión te pasa cada registro y tú lo agregas a mano.
4. Para Stripe, la llave que el entorno inyecta hoy es la publicable y no sirve para configurar. En Stripe, Developers, API keys, crea una Restricted key con permisos de escritura en Products, Prices, Coupons, Customers, Subscriptions, Webhook Endpoints y Billing Portal, y lectura en el resto. Ponla en el entorno como el secreto de api.stripe.com.
5. Guarda y abre la sesión nueva con el prompt de prompts/v5-cierre.md.

Cómo sabes que quedó. En su primer mensaje la sesión te dice qué conectores y dominios ve.

## Orden sugerido para una semana

- Día 1. Punto 1 (dueño), punto 8 y abrir la sesión. Punto 4a (nameservers) y 7a (activación de Stripe), que son las esperas largas. Escribir a los médicos, al contador y al abogado.
- Día 2 a 3. Cuando el dominio esté Active, 4b, 4c, 3a y 3b.
- Semana 1 a 2. 6b (Google Cloud) y 2 (Anthropic) cuando haya un rato.
- Semana 3. Plan Pro del punto 1 y los 5 del punto 5.
- Después. 3c, 6c y 7b, 7c conforme respondan.
