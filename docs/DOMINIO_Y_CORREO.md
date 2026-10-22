# Dominio y correo propio de Studiare

Para Ricardo. Escrito el 2026-10-22 para el bloque B17. Explica, paso a paso y sin dar nada por sabido, cómo poner Studiare en tu dominio, cómo mandar el correo de acceso desde tu dominio y qué cambiar en Supabase, en Stripe y en Google cuando la dirección cambia. Los nombres de los menús son los de la documentación de cada servicio en octubre de 2026 y pueden cambiar un poco. Si no encuentras uno, dime lo que ves en pantalla y lo buscamos juntos.

En todo el documento tu dominio se escribe tudominio.mx. Cámbialo por el tuyo, siempre sin www.

Regla que no cambia. Nunca pegues una llave, un token ni una contraseña en el chat. Cada una se pega directo en el servicio que la pide. Cuando un paso dice que la sesión hace algo, la sesión solo necesita direcciones públicas, nunca una llave.

## Qué vas a lograr

- Studiare abre en https://tudominio.mx con candado y con la seguridad que pide el diseño
- El código de acceso llega desde Studiare y no desde la dirección genérica de Supabase, y llega a la bandeja de entrada en lugar de a spam
- Los correos de privacidad y de soporte son buzones reales
- Supabase, Stripe y Google conocen la dirección nueva
- GitHub Pages se retira sin dejar a nadie con una liga muerta

Nada de esto cambia lo que ve un alumno hasta el día de la mudanza. Todo el código ya está listo y apagado, y se prende cuando haces tu parte.

## Palabras que vas a ver

- **Dominio.** El nombre de tu sitio, como tudominio.mx. Lo compraste en una empresa que se llama registrador
- **DNS.** La libreta de direcciones de internet. Dice qué servidor atiende cada nombre y a dónde va el correo. Se edita con registros
- **Registro DNS.** Una línea de esa libreta. Tiene un tipo (A, CNAME, TXT, MX), un nombre y un valor. Los vas a copiar tal cual los muestra cada servicio
- **Nameserver.** El servidor que guarda la libreta de tu dominio. Hoy es el de tu registrador. Para usar Cloudflare lo cambias por los dos de Cloudflare
- **Proxy de Cloudflare (nube naranja o gris).** Cada registro tiene una nube. Naranja significa que el tráfico pasa por Cloudflare, que es lo que queremos para el sitio. Gris significa que Cloudflare solo contesta la dirección, que es lo que piden los registros de correo
- **SPF, DKIM y DMARC.** Tres sellos que demuestran que un correo de verdad sale de tu dominio. Sin ellos Gmail lo manda a spam o lo rechaza. SPF dice qué servidores pueden mandar. DKIM firma cada correo. DMARC dice qué hacer si alguno de los dos falla
- **SMTP.** La forma estándar de entregarle un correo a un servicio que lo manda por ti. Supabase la usa para mandar el código de acceso a través de Resend

## Antes de empezar

1. Activa la verificación en dos pasos en GitHub, Supabase, Cloudflare, Stripe, Resend y en la cuenta donde compraste el dominio. Guarda los códigos de respaldo en tu gestor de contraseñas. Con esas cuentas se publica, se cobra y se manda correo en tu nombre. Toma unos 10 minutos
2. Dime en el chat tu dominio, en qué empresa lo compraste y si ya tiene correo (Gmail, Google Workspace, Zoho, el del mismo registrador o ninguno). Eso decide lo del correo de privacidad y soporte. No pegues contraseñas

Decisión recomendada. La app y la portada viven en tudominio.mx, sin www, y www redirige a esa dirección. Razón en una línea. La portada y la app son la misma página y cada dirección guarda sus propios datos en el navegador, así que servir las dos duplicaría la sesión y los mazos de cada persona. Si prefieres app.tudominio.mx, solo cambian SITE_URL, las direcciones de Supabase, los secretos y el registro en Stripe, y lo hacemos igual.

## 1. Agregar tu dominio a Cloudflare

Unos 30 minutos más la espera. Si tu dominio ya está en Cloudflare, salta este apartado.

1. Entra a dash.cloudflare.com y crea tu cuenta si no la tienes
2. Abre Domains, Onboard a domain, escribe tu dominio sin www y elige el plan Free
3. Cloudflare busca los registros que tu dominio ya tiene y te muestra la lista. Compárala con la lista del lugar donde compraste el dominio. Fíjate sobre todo en los registros MX y TXT, que son los del correo, y no borres ninguno
4. Cloudflare te da dos nameservers, con nombres como ana.ns.cloudflare.com. En el sitio donde compraste el dominio entra a sus ajustes de DNS o de nameservers, apaga DNSSEC si estaba prendido, quita los nameservers que tenía y pon esos dos, copiados exactamente
5. Espera. Llega un correo de Cloudflare cuando el dominio queda Active, hasta 24 horas después. Mientras tanto nada se rompe, porque tu sitio y tu correo siguen donde estaban

Si pasa un día y sigue pendiente, revisa que copiaste los dos nameservers sin espacios y escríbele al soporte de tu registrador.

## 2. Publicar en Cloudflare Pages y poner el dominio

Primero se hace la publicación en el proyecto de Cloudflare Pages (pasos B17.4 a B17.7 de docs/PENDIENTES_DE_RICARDO.md y docs/PUBLICACION.md). Cuando abre bien en la dirección que termina en pages.dev, sigue esto.

1. En Cloudflare abre Workers & Pages, el proyecto studiare, Custom domains, Set up a domain, escribe tudominio.mx y toca Continue. Confirma el registro que propone. Espera a que diga Active
2. **Que www lleve al dominio sin www.** En el DNS de tu dominio agrega un registro tipo A, nombre www, dirección 192.0.2.1 y Proxy status en Proxied (nube naranja). Esa dirección no es de nadie, solo sirve para que Cloudflare reciba la visita y la redirija. Luego abre Rules, Create rule, Redirect Rule, elige la plantilla Redirect from WWW to root (o escribe el patrón https://www.*, destino https://${1}, código 301, conservar la consulta) y toca Deploy
3. **Que http lleve a https.** En SSL/TLS, Edge Certificates, pon Always Use HTTPS en On
4. **Apaga lo que no queremos.** En el panel del dominio deja en Off Rocket Loader y Auto Minify si los ves, deja apagado Web Analytics y no actives HSTS ahí, porque el sitio ya manda su propio encabezado. No agregues reglas de caché. Esas cosas cambian el HTML o meten scripts, y chocan con la política de seguridad y con el aviso de privacidad

Cómo comprobar. Abre https://tudominio.mx, http://tudominio.mx y https://www.tudominio.mx en una ventana de incógnito. Las tres deben terminar en https://tudominio.mx con candado. La sesión corre la prueba de humo con npm run smoke -- https://tudominio.mx --strict y te dice si todo está en verde. La prueba reintenta cinco veces, porque el certificado tarda unos minutos.

## 3. Correo propio con Resend

Resend es el servicio que manda los correos de Studiare. Lo usan dos cosas distintas. Supabase, para el código de acceso, y las funciones del servidor, para los recordatorios y los avisos de pago de B15. Cada una con su propia llave, para que si rotas una no se caiga la otra. Unos 45 minutos más la espera del DNS.

### 3.1 El dominio de envío

1. Crea tu cuenta en resend.com
2. Abre Domains, Add Domain y escribe mail.tudominio.mx. Es un subdominio, no el dominio solo. Razón en una línea. Si una campaña mala daña la reputación del correo de acceso, no arrastra el correo normal de tu dominio, y Supabase recomienda separarlos
3. Resend te muestra una tabla de registros en la pestaña Records. Son el SPF y el registro de retorno (TXT y MX, o CNAME en dominios nuevos) y el DKIM, que vive en resend._domainkey. Cópialos uno por uno a Cloudflare, en DNS, Add record, **con el proxy apagado (nube gris)**. Si Cloudflare te pide el nombre sin el dominio, escribe solo la parte que Resend muestra, por ejemplo send o resend._domainkey.mail
4. En Resend toca Verify DNS Records. Tarda desde minutos hasta unas horas
5. **DMARC, aparte.** Cuando el dominio ya esté verificado, agrega en Cloudflare un registro TXT con nombre _dmarc y valor v=DMARC1; p=none; rua=mailto:tu-correo@ejemplo.com, con tu correo de verdad. Solo puede haber un registro DMARC por dominio, así que si ya existe un _dmarc, edítalo y no crees otro. p=none solo observa y te manda reportes. Después de unas 4 semanas de reportes limpios se cambia a p=quarantine. Un rechazo desde el primer día puede tirar correos legítimos mientras se afina

### 3.2 Las dos llaves

1. En Resend abre API Keys y crea dos llaves, las dos con permiso de envío (Sending access) y solo para el dominio mail.tudominio.mx. Llámalas supabase-smtp y funciones
2. La llamada funciones la pegas tú en Supabase, Edge Functions, Secrets, con el nombre RESEND_API_KEY. Es la de B15
3. La llamada supabase-smtp la pegas en Supabase, Authentication, SMTP Settings (apartado 4)
4. En los mismos secretos de funciones pon EMAIL_FROM con Studiare y una dirección de envío de tu subdominio, por ejemplo Studiare, no-responder@mail.tudominio.mx, y SUPPORT_EMAIL con el correo de soporte de tu dominio (apartado 6)

Cada llave se muestra una sola vez. Cópiala directo al servicio y no la guardes en ningún otro lado. Si se te pierde, se crea otra y se borra la vieja.

### 3.3 Cómo comprobar que quedó bien

1. En Resend, el dominio debe decir Verified
2. Mándate un código de acceso a tu Gmail desde la app o desde Supabase (apartado 4)
3. En Gmail abre el correo, los tres puntos, Mostrar original. Arriba debe decir SPF PASS, DKIM PASS y DMARC PASS. La sesión no necesita ver ninguna llave para esto, solo tu confirmación

Plan de Resend. El gratis da 3,000 correos al mes y alcanza para los primeros aspirantes. Pro cuesta 20 dólares al mes. Recomendado empezar en el gratis y pasar a Pro antes de abrir el registro. Es un gasto y lo decides tú.

## 4. Supabase manda el correo con tu dominio

Esto hace que el código de acceso salga de Resend y no del correo genérico de Supabase, que solo sirve para el equipo del proyecto y con muy pocos envíos por hora.

1. En Supabase abre Authentication, SMTP Settings y activa Enable Custom SMTP
2. Sender email, no-responder@mail.tudominio.mx. Sender name, Studiare. Host, smtp.resend.com. Port, 465. Username, resend. Password, la llave supabase-smtp. Guarda
3. Mándate un código de acceso y revisa SPF, DKIM y DMARC como en el apartado 3.3
4. Tope de envíos. Al guardar, Supabase baja el límite a 30 correos nuevos por hora. Para cinco aspirantes sobra. Si algún día lo llegas a tocar, se sube en Authentication, Rate Limits
5. En Authentication, Emails revisa que las plantillas Magic Link y Confirm signup conserven la línea del código con {{ .Token }} (la del paso 6b de docs/SUPABASE.md). Deja la expiración del código en 3600 segundos o menos y la confirmación de correo prendida

## 5. Direcciones de regreso en Supabase

Es lo que decide a dónde vuelve la persona después de tocar el enlace del correo o de entrar con Google. Se hace el día de la mudanza, no antes.

1. En Supabase abre Authentication, URL Configuration
2. Site URL, https://tudominio.mx/
3. Redirect URLs, deja http://localhost:5173/**, agrega https://tudominio.mx/ y, solo por 30 días, https://rickymm2001-dev.github.io/Studiare-ENARM/. A los 30 días quita la vieja
4. **Nunca pongas un comodín sobre pages.dev.** Cualquiera puede publicar una página en un subdominio de pages.dev y, si está permitido, se llevaría el token de acceso de quien entre ahí. La app manda como dirección de regreso su propio origen más la ruta base, así que no hay otra dirección que permitir

Si me avisas, la sesión puede poner estas dos cosas por ti con el token de Supabase, porque son direcciones públicas. Lo único que no pone la sesión es el bloque de SMTP, porque lleva la llave de Resend.

Cómo comprobar. Pide un código de acceso desde tudominio.mx, ábrelo en el teléfono y escribe el código en la computadora. Debe abrir sesión. Con Google, entra y confirma que regresas a tudominio.mx y no a la dirección vieja.

## 6. Correos de privacidad y de soporte

La ley de protección de datos pide que atiendas las solicitudes de acceso, rectificación, cancelación y oposición, y los términos prometen una dirección para la garantía y las aclaraciones. Por eso hacen falta dos buzones reales, privacidad@tudominio.mx y soporte@tudominio.mx.

- **Si tu dominio todavía no tiene correo.** Lo más simple es el reenvío gratis de Cloudflare (Email Routing). En el panel del dominio abre Email, Email Routing, Get started, crea las dos direcciones y elígeles como destino tu Gmail. Cloudflare agrega solos los registros MX que hacen falta. El aviso de privacidad ya dice que Cloudflare también lee esos correos al reenviarlos. Los menús exactos de Email Routing no se pudieron revisar al escribir esto, así que si no los encuentras dime lo que ves
- **Si tu dominio ya tiene correo** (Google Workspace, Zoho o el de tu registrador). No actives el reenvío de Cloudflare, porque los dos usan los registros MX de la raíz del dominio y se estorban. Crea las dos direcciones en tu proveedor
- **Para responder desde el dominio** hace falta un buzón de verdad. Con el reenvío recibes, pero al responder desde Gmail el remitente sería tu Gmail. Recomendado empezar con el reenvío y pasar a un buzón real (Google Workspace o Zoho) antes de abrir el registro

Después pon las direcciones en GitHub, Settings, Secrets and variables, Actions, pestaña Variables, como VITE_PRIVACY_EMAIL y VITE_SUPPORT_EMAIL, junto con VITE_LEGAL_NAME y VITE_LEGAL_ADDRESS (docs/legal/README.md), y vuelve a publicar la página.

## 7. Otros lugares donde aparece la dirección

| Dónde | Qué cambiar | Quién |
|---|---|---|
| Supabase, secretos de las funciones | APP_URL con https://tudominio.mx/ y APP_ORIGINS con el dominio nuevo y, por 30 días, el viejo. ai-proxy solo lee APP_ORIGINS, así que el dominio nuevo tiene que estar ahí. Detalle en docs/SUPABASE.md y docs/DESPLIEGUE.md | Sesión, con npm run deploy:supabase -- --plan b17 --secrets-from, o tú en Edge Functions, Secrets |
| Google Cloud, pantalla de consentimiento de OAuth | Agrega tudominio.mx como dominio autorizado. La dirección de regreso de Supabase (auth/v1/callback) no cambia | Tú |
| Stripe, portal del cliente | La sesión corre scripts/stripe/setup-test.ts con --app-url=https://tudominio.mx/ y las dos configuraciones del portal regresan a la dirección nueva. Es repetible | Sesión |
| Stripe, Settings, Public details | El sitio web de la empresa | Tú |
| Stripe, dominios de medios de pago | Se registra tudominio.mx para Apple Pay y Google Pay (docs/STRIPE.md) | Sesión y tú |
| Mercado Pago | Las direcciones de regreso salen de APP_URL. Si su panel pide el sitio, ponlo ahí | Tú |
| README.md, docs/STRIPE.md, docs/SUPABASE.md y docs/DESPLIEGUE.md | Los ejemplos con rickymm2001-dev.github.io pasan a tudominio.mx cuando el dominio exista | Sesión |

## 8. El día de la mudanza, en orden

La secuencia completa y los avisos a los alumnos están en docs/PUBLICACION.md. Lo que toca a este documento es lo siguiente.

| Cuándo | Qué | Quién |
|---|---|---|
| Antes | Dominio activo en Cloudflare, proyecto de Pages creado y publicado en pages.dev con la prueba de humo en verde, Resend verificado con SPF, DKIM y DMARC en PASS, Supabase de pago | Tú y la sesión |
| 14 días antes | Aviso en la demo de GitHub Pages (docs/PUBLICACION.md) | Tú |
| Día 0 | Dominio en el proyecto, www y Always Use HTTPS. SITE_URL en GitHub y publicación de producción. Prueba de humo con --strict en verde. Site URL y Redirect URLs de Supabase con el sitio nuevo y, por 30 días, el viejo. APP_URL y APP_ORIGINS. Dominio registrado en Stripe. setup-test.ts con la dirección nueva. Dominio autorizado en Google | Tú y la sesión |
| 30 días después | Se quita el origen viejo de Redirect URLs y de APP_ORIGINS. Se despublica GitHub Pages. Se borra el proyecto enarm-prototipo de Cloudflare. El repositorio pasa a privado. El aviso de privacidad deja de nombrar a GitHub como quien aloja la página | Tú y la sesión |

El repositorio no pasa a privado antes de los 30 días. Por lo que dice la documentación de GitHub, el plan gratis solo publica Pages desde repositorios públicos, y sin Pages desaparece el sitio que redirige a la gente a tu dominio nuevo.

## Si algo sale mal

- **Cloudflare sigue en Pending.** Revisa que los dos nameservers estén copiados sin espacios, que DNSSEC esté apagado en el registrador y espera hasta 24 horas
- **Resend no verifica.** Casi siempre es un registro con la nube naranja o con el nombre repetido (mail.tudominio.mx.tudominio.mx). Apaga el proxy, corrige el nombre y vuelve a tocar Verify DNS Records. Es normal que tarde unas horas
- **El correo llega a spam.** Revisa SPF, DKIM y DMARC con Mostrar original. Si alguno dice FAIL, el registro está mal copiado
- **Supabase dice que llegaste al tope de correos por hora.** Es el límite de 30 que pone al guardar el SMTP propio. Se sube en Authentication, Rate Limits
- **Google rechaza la dirección de regreso.** Falta el dominio autorizado en la pantalla de consentimiento (apartado 7)
- **Algo se ve viejo después de publicar.** En Cloudflare, Caching, Configuration, Purge Everything en el panel del dominio
- **Algo se rompió después de la mudanza.** En Cloudflare, Workers & Pages, el proyecto, Deployments, el menú de tres puntos de un despliegue anterior, Rollback to this deployment. Es instantáneo

## Fuentes

Leídas el 2026-10-16 desde los repositorios de documentación en GitHub y el registro de npm, porque la red de la sesión no abre los sitios de Cloudflare, Supabase y Resend. No se repitió el 2026-10-22. Por volver a revisar al construir con la red abierta, los menús de Email Routing de Cloudflare y los precios vigentes de Supabase Pro y Resend.

- Cloudflare Pages y DNS, developers.cloudflare.com (custom domains, redirecciones de www, Always Use HTTPS)
- Supabase Auth, supabase.com/docs/guides/auth (URL de regreso, SMTP propio, límites, contraseñas filtradas)
- Resend, resend.com/docs (dominio de envío, registros, SMTP con Supabase)
- Google y Yahoo, requisitos de autenticación de correo (SPF, DKIM y DMARC)
