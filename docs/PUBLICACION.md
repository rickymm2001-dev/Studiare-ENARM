# Publicación de Studiare

Cómo sale Studiare a internet, cómo se revisa que salió bien, cómo se regresa si algo falla y cómo se muda la demo de GitHub Pages al dominio propio. Está escrito para quien no ha hecho esto nunca. Los nombres de los menús son los de cada servicio y pueden cambiar un poco. Si no encuentras uno, dile a la sesión lo que ves en pantalla.

Regla que no cambia. Nunca pegues una llave, un token ni una contraseña en el chat. Cada uno se pega directo en el servicio que lo pide.

Todo lo de este documento ya está construido y **apagado**. No pasa nada hasta que pongas en GitHub la variable `CLOUDFLARE_DEPLOY` con el valor `true`. Mientras no exista, el flujo de Cloudflare no corre y tampoco se pone en rojo.

El dominio de ejemplo de todo el documento es `tudominio.mx`. El tuyo no está escrito en ningún archivo del repositorio. Se pone en una variable de GitHub (`SITE_URL`).

## En una mirada

| Pieza | Para qué sirve | Dónde vive |
|---|---|---|
| Flujo `cloudflare` | Publica la app en Cloudflare Pages. Producción con cada cambio a `main`, y una vista previa por cada pull request | `.github/workflows/cloudflare.yml` |
| Prueba de humo | Entra al sitio ya publicado y revisa encabezados, rutas, caché, robots y mapa del sitio. No usa llaves | `scripts/smoke/post-deploy.ts` |
| Encabezados | La política de seguridad, el candado de HTTPS por un año, la caché larga de los archivos con huella y el aviso de no indexar `pages.dev` | `_headers`, que escribe el build |
| Archivos para buscadores | `robots.txt`, `sitemap.xml`, `security.txt`, dirección canónica y etiquetas para compartir | Los escribe el build |
| Sitio de mudanza | Cuando la demo de GitHub Pages se muda, un sitio chico dice a dónde y lleva a la persona allá | `.github/workflows/pages.yml` y `scripts/deploy/moved-site.ts` |
| Aviso de catorce días | Un aviso dentro de la demo con la fecha de la mudanza | `src/app/layout/MovedNotice.tsx` |
| Limpieza de vistas previas | Borra las vistas previas viejas. Tú la corres a mano | `scripts/deploy/prune-previews.sh` |

## 1. Cómo se publica y por qué así

Se usa **GitHub Actions con carga directa** en un proyecto nuevo de Cloudflare Pages llamado `studiare`. Las razones, en una línea cada una.

- Reutiliza el mismo build que ya prueba el CI de GitHub, sin construir dos veces de dos maneras distintas.
- Las variables y los secretos viven en un solo lugar, GitHub.
- Permite correr la prueba de humo antes de dar por buena la publicación.
- La integración de Git de Cloudflare no se puede cambiar a carga directa después, y duplicaría las variables.

El proyecto que ya tienes conectado a Cloudflare, `enarm-prototipo`, se queda como está y sigue publicando sus vistas previas hasta el día de la mudanza. Ese día lo borras (sección 9). Su dirección de `pages.dev` no se puede renombrar, por eso el proyecto nuevo.

Se queda en **Cloudflare Pages** y no en Workers, porque así lo aprobaste. Cloudflare ya recomienda Workers para proyectos nuevos, pero Pages sigue documentado y con soporte, y esta publicación usa solo lo que los dos comparten. Cambiar después es un archivo de configuración y un comando, y queda anotado en IDEAS.md.

Dos cosas que la sesión de IA **no** hace nunca desde su terminal.

- No crea el proyecto de Pages. Cuando un agente de IA corre `wrangler` para crear un proyecto estático, `wrangler` crea uno de Workers en su lugar. Por eso el proyecto se crea desde GitHub Actions, con un botón (paso 6).
- No publica con `wrangler` a mano. Publica el flujo.

## 2. Variables y secretos de GitHub

Se crean en GitHub, en el repositorio, **Settings, Secrets and variables, Actions**. Las variables que empiezan con `VITE_` son públicas por diseño, llegan al navegador y no llevan nada secreto.

| Nombre | Tipo | Para qué |
|---|---|---|
| `CLOUDFLARE_DEPLOY` | Variable | `true` prende el despliegue. Sin ella no corre nada |
| `CLOUDFLARE_PAGES_PROJECT` | Variable | Nombre del proyecto. Si no existe, el flujo usa `studiare` |
| `SITE_URL` | Variable | La dirección pública, `https://tudominio.mx`, sin diagonal al final y sin ruta. Solo la usa el build de producción |
| `CLOUDFLARE_API_TOKEN` | Secreto | Token con un solo permiso, Account, Cloudflare Pages, Edit (paso 4) |
| `CLOUDFLARE_ACCOUNT_ID` | Secreto | El ID de tu cuenta de Cloudflare, 32 letras y números |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Variable | Llave publicable de Stripe, `pk_test_` y después `pk_live_`. Vacía, la sección de Apple Pay y Google Pay no aparece y la política de seguridad no abre Stripe |
| `PAGES_MOVED_TO` | Variable | Solo para la mudanza. `https://tudominio.mx`. Con ella, `pages.yml` publica el sitio de mudanza (sección 9) |
| `VITE_MOVED_TO` y `VITE_MOVED_ON` | Variables | Solo para el aviso de catorce días. La dirección nueva y la fecha como `2026-12-15` (sección 9) |

Estas ya existen o vienen de otros bloques, y el flujo también las pasa al build de producción. Cada una está explicada en su documento.

| Nombre | Tipo | Documento |
|---|---|---|
| `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` | Variables | docs/SUPABASE.md |
| `VITE_LEGAL_NAME`, `VITE_LEGAL_ADDRESS`, `VITE_PRIVACY_EMAIL` y `VITE_SUPPORT_EMAIL` | Variables | docs/legal/README.md |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` y `VITE_SENTRY_DSN` | Variables | docs/PENDIENTES_DE_RICARDO.md |
| `SENTRY_AUTH_TOKEN` | Secreto | docs/PENDIENTES_DE_RICARDO.md |
| `SENTRY_ORG` y `SENTRY_PROJECT` | Variables | docs/PENDIENTES_DE_RICARDO.md |

La **vista previa** de un pull request se construye solo con `VITE_APP_ENV=demo`. No recibe ninguna de las variables de la tabla de arriba, así que no puede tocar la base real de Supabase, ni cobrar, ni medir. Funciona como la demo local.

## 3. Lo que necesitas antes

1. Verificación en dos pasos en GitHub, Cloudflare, Supabase, Stripe y en la cuenta donde compraste el dominio. Guarda los códigos de respaldo en tu gestor de contraseñas.
2. El dominio comprado. Dile a la sesión cuál es, en qué empresa lo compraste y si ya tiene correo. Eso decide cómo se agrega a Cloudflare. No pegues contraseñas.

## 4. Paso a paso para prender Cloudflare

Unos 45 minutos, más la espera del dominio. Cada paso dice cómo comprobar que salió bien.

### Paso 1. Agrega tu dominio a Cloudflare

1. Entra a dash.cloudflare.com, **Domains, Onboard a domain**. Escribe tu dominio sin `www` y elige el plan **Free**.
2. Cloudflare te muestra los registros DNS que encontró. Compáralos con la lista del lugar donde compraste el dominio. Presta atención a los registros `MX` y `TXT`, que son los del correo, y no borres ninguno.
3. Cloudflare te da dos *nameservers*. Son las direcciones que dicen quién manda en tu dominio. En el lugar donde compraste el dominio, apaga DNSSEC si estaba prendido, quita los nameservers que tiene y pon esos dos, copiados exactamente.
4. Cloudflare te manda un correo cuando el dominio queda **Active**. Puede tardar hasta 24 horas. Mientras tanto no se rompe nada.

Cómo saber que salió bien. En Cloudflare tu dominio dice **Active**. Si tu dominio ya estaba en Cloudflare, sáltalo.

### Paso 2. Crea el token que usará GitHub

1. En Cloudflare, **Manage Account, Account API Tokens, Create Token, Custom token, Get started**.
2. Nombre `studiare-github`.
3. En **Permissions** elige `Account`, `Cloudflare Pages`, `Edit`. En **Account Resources** elige tu cuenta. Nada de permisos de DNS ni de zona.
4. **Continue to summary, Create Token**. El valor se muestra una sola vez. Cópialo y llévalo al paso siguiente de inmediato. No lo guardes en ningún otro lado.
5. Tu **Account ID** está en la página de resumen de tu dominio, columna derecha, sección API.

Si el token se filtrara, lo único que alguien podría hacer es publicar en Pages, y se revoca en un minuto desde el mismo panel.

### Paso 3. Pon los secretos y las variables en GitHub

En **Settings, Secrets and variables, Actions** del repositorio.

1. Pestaña **Secrets, New repository secret**. Crea `CLOUDFLARE_API_TOKEN` con el token y `CLOUDFLARE_ACCOUNT_ID` con el ID.
2. Pestaña **Variables, New repository variable**. Crea `CLOUDFLARE_PAGES_PROJECT` con `studiare` y `SITE_URL` con `https://tudominio.mx`, sin diagonal al final.
3. Al último crea `CLOUDFLARE_DEPLOY` con `true`. Esa es la que prende el despliegue.

Si pones `CLOUDFLARE_DEPLOY` y falta un secreto, el flujo no se pone en rojo. Termina en verde y un aviso amarillo dice cuál falta, por su nombre.

### Paso 4. Crea el proyecto

1. En GitHub, pestaña **Actions**, flujo **cloudflare**, **Run workflow**.
2. Marca **Crear el proyecto de Pages (una sola vez) y no publicar** y toca **Run workflow**.
3. Espera la palomita verde. Si sale en rojo, copia el mensaje y dáselo a la sesión.

Esa corrida solo crea el proyecto. No construye ni publica nada.

### Paso 5. Primera publicación

1. **Run workflow** otra vez, sin marcar nada, o cualquier cambio a `main`.
2. Al terminar, la página de la corrida trae un resumen con una dirección que termina en `pages.dev`. Ábrela y debe abrir Studiare.
3. El mismo flujo corre la prueba de humo contra esa dirección. Si todo está bien, el paso **Prueba de humo** queda en verde.

Cómo saber que salió bien. Palomita verde, la dirección abre la app y la ruta `/repasar` también (no dice 404).

### Paso 6. Pon tu dominio en el proyecto

1. En Cloudflare, **Workers & Pages**, el proyecto `studiare`, **Custom domains, Set up a domain**. Escribe tu dominio y toca **Continue**.
2. Confirma el registro que propone y espera a que diga **Active**.

### Paso 7. Que `www` lleve al dominio sin `www`

Cada dirección guarda sus propios datos en el navegador, así que no se sirve la app en las dos. Se redirige.

1. En el DNS de tu dominio agrega un registro tipo `A`, nombre `www`, dirección `192.0.2.1` y **Proxy status** en **Proxied**.
2. **Rules, Create rule, Redirect Rule**. Usa la plantilla **Redirect from WWW to root**, o escribe a mano el patrón `https://www.*`, destino `https://${1}`, código `301` y conservar la consulta. **Deploy**.

### Paso 8. Que http lleve a https

**SSL/TLS, Edge Certificates, Always Use HTTPS** en **On**.

### Paso 9. Apaga lo que no queremos

En el panel de la zona.

- **Rocket Loader** y **Auto Minify** en **Off**, si los ves.
- **Web Analytics** apagado.
- No actives HSTS ahí, porque el sitio ya lo manda en `_headers`.
- No agregues reglas de caché.

Todo eso cambia el HTML o mete scripts, y choca con la política de seguridad y con el aviso de privacidad.

### Paso 10. Publica con el dominio y comprueba

1. Corre el flujo **cloudflare** otra vez (Run workflow). Ahora el build de producción lleva `SITE_URL`, y por eso trae la dirección canónica, el mapa del sitio y permite que los buscadores indexen.
2. Pídele a la sesión que corra la prueba de humo estricta, o córrela tú (sección 8).

```bash
npm run smoke -- https://tudominio.mx --strict
```

Cómo saber que salió bien. Todo en verde, incluidas las tres revisiones de `--strict`.

## 5. Qué hace el flujo cuando corre

| Evento | Qué publica | Construido como |
|---|---|---|
| Cambio a `main`, o Run workflow sobre `main` | **Producción** | `VITE_APP_ENV=production`, `SITE_URL` y todas las variables `VITE_` |
| Pull request del mismo repositorio, o Run workflow en otra rama | **Vista previa** con su alias `rama.studiare.pages.dev` | `VITE_APP_ENV=demo` y nada más |
| Pull request de otro repositorio | Nada, porque GitHub no le da secretos | No corre |

Cosas que el flujo hace a propósito.

- Un cambio a `main` no espera al flujo `check`. El build ya corre el revisor de tipos y el revisor de secretos, y un build roto no se publica. Lo que protege la producción es la regla de fusionar a `main` solo con `check`, `e2e` y `audit` en verde.
- Nunca copia `index.html` a `404.html`. GitHub Pages lo necesita, Cloudflare no, y copiarlo haría que rutas como `/repasar` respondan 404. Sin `404.html`, Pages sirve la aplicación para cualquier ruta.
- El token de Cloudflare solo lo ven los tres pasos que hablan con Cloudflare. No lo ven `npm ci` ni el build, así que ningún script de una dependencia lo puede leer.
- `wrangler` se baja con `npx` y versión exacta (`4.146.0`), solo dentro del flujo. No se instala nada global ni entra a `package.json`. Cuando quieras subir la versión, se cambia en un solo archivo y la prueba del flujo avisa si queda alguna con otra.
- La rama, el nombre del proyecto y las direcciones nunca se escriben dentro de un comando. Pasan por variables de entorno, se citan y se validan antes.
- Si el flujo ve un secreto o una variable mal puesta, lo dice por nombre y nunca imprime su valor.

## 6. Vistas previas

Cada pull request del mismo repositorio publica una vista previa. Son públicas, sin datos y con `noindex`. No se agregan a las direcciones permitidas de Supabase.

No se limpian solas y son ilimitadas. Cuando quieras limpiar las viejas, desde tu computadora con las dos variables de entorno `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` puestas.

```bash
# Muestra qué borraría y no borra nada
bash scripts/deploy/prune-previews.sh --keep 10
# Borra de verdad
bash scripts/deploy/prune-previews.sh --keep 10 --apply
```

Conserva las 10 más nuevas, solo toca el ambiente `preview` y nunca borra una publicación de producción.

## 7. Volver a una versión anterior

En Cloudflare, **Workers & Pages**, el proyecto `studiare`, **Deployments**. En el menú de tres puntos de un despliegue de producción anterior que haya salido bien, **Rollback to this deployment**. Es instantáneo.

- Las vistas previas no sirven como destino de reversión.
- Si el problema está en el código, se revierte el commit en GitHub y el flujo vuelve a publicar.
- Si algo se queda viejo después de publicar, en la zona de Cloudflare usa **Caching, Configuration, Purge Everything**.

## 8. La prueba de humo

Entra al sitio publicado y revisa, sin llaves y solo con peticiones normales, que todo esté donde debe.

```bash
npm run smoke -- DIRECCIÓN [--mode production|preview] [--strict] [--apple] [--supabase DIRECCIÓN]
```

Sale con 0 si todo pasa, con 1 si algo falla y con 2 si los argumentos no sirven. Cada falla dice qué se revisó, qué se esperaba y qué se encontró, nunca el contenido completo de la respuesta.

| Revisión | Qué espera |
|---|---|
| `GET /` | 200, página HTML, título Studiare e imagen para compartir. En producción, la imagen y la dirección canónica con tu dominio |
| `GET /repasar` | 200 y la misma página de `/`, porque es una aplicación de una sola página |
| Encabezados de `/` | Política de seguridad con `default-src 'self'` y `frame-ancestors 'none'`, HSTS de un año sin `includeSubDomains` ni `preload`, `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy` y `Permissions-Policy` |
| Un archivo de `/assets/` | Caché de un año e inmutable |
| `/sw.js` y `/manifest.webmanifest` | 200, sin caché inmutable, y el manifest con `scope` y `start_url` iguales a `/` |
| `/robots.txt` y `/sitemap.xml` | En producción, permite indexar, nombra el mapa del sitio y trae solo la portada, porque el aviso de privacidad y los términos comparten el index.html y su canonical es la portada. Siguen abiertos y enlazados. En vista previa, `Disallow: /` y sin mapa |
| `/og-image.png` | 200, imagen PNG de menos de 300 KB |
| `--apple` | El archivo con el que Apple verifica el dominio, y que no sea la portada |
| `--supabase DIRECCIÓN` | `ai-proxy` contesta 204 al origen del sitio y 403 a uno ajeno |
| `--strict` | `http` redirige a `https`, `www` redirige al dominio sin `www` y `pages.dev` responde `noindex`. Reintenta 5 veces cada 20 segundos, porque el DNS y el certificado tardan |

Dos variables de entorno opcionales, ninguna es una llave.

- `SITE_URL` sirve para probar una dirección de `pages.dev` contra el dominio futuro. El build de producción dice que su dirección es `https://tudominio.mx`, y la prueba lo compara con eso aunque la estés mirando en `pages.dev`. El flujo la pasa solo.
- `CLOUDFLARE_PAGES_PROJECT` es el nombre del proyecto, para la revisión de `pages.dev` de `--strict`. Por omisión `studiare`.

En una sesión de IA en la nube se corre con `node --use-env-proxy scripts/smoke/post-deploy.ts ...`.

**Probarla en tu computadora sin publicar.** `vite preview` sirve los archivos pero no lee `_headers`, que es lo que da la política de seguridad y la caché. Para eso hay un servidor que se porta como Pages.

```bash
SITE_URL=http://127.0.0.1:4180 VITE_APP_ENV=production npm run build
node scripts/smoke/local-pages.ts dist --port 4180
# En otra terminal
npm run smoke -- http://127.0.0.1:4180
```

Sin `VITE_APP_ENV=production` ni `SITE_URL` el build sale como vista previa, y entonces se prueba con `--mode preview`.

## 9. Mudanza de GitHub Pages al dominio

La demo vive hoy en GitHub Pages. Al cambiar de dominio hay que cuidar tres cosas.

**Qué cambia de verdad para una persona.** El navegador guarda sus datos por dirección. La demo y el dominio nuevo son dos direcciones distintas, aunque la app sea la misma.

| Qué | Qué pasa al cambiar |
|---|---|
| Quien tiene cuenta | Entra en el dominio nuevo con su correo y lo que sincronizó vuelve a bajar. Lo que no alcanzó a sincronizar se queda en el navegador viejo |
| Quien usa la demo sin cuenta | Sus datos se quedan en el navegador viejo. Puede descargarlos en Configuración, Privacidad antes de la fecha |
| La sesión de Supabase | Hay que entrar de nuevo con el correo o con Google |
| La app instalada | La del dominio nuevo es otra app. Hay que instalarla otra vez |
| Ligas de referido y de grupo ya enviadas | Siguen funcionando mientras el sitio de mudanza esté publicado, porque lo reenvía con su código |

Según el avance del proyecto todavía no hay alumnos reales, así que el riesgo es de ti, de Paco, de los médicos y de quien probó la demo. No se construye importar un archivo exportado en el dominio nuevo.

**Calendario.**

| Cuándo | Qué | Quién |
|---|---|---|
| Antes | Dominio en Cloudflare, proyecto creado, primera publicación en `pages.dev` con la prueba de humo en verde | Tú y la sesión |
| Catorce días antes | Pones en GitHub las variables `VITE_MOVED_TO` (`https://tudominio.mx`) y `VITE_MOVED_ON` (la fecha, como `2026-12-15`) y corres el flujo **pages** con Run workflow. La demo muestra el aviso | Tú |
| Día de la mudanza | Pones la variable `PAGES_MOVED_TO` con `https://tudominio.mx` y corres **pages** otra vez. Ahora GitHub Pages publica el sitio de mudanza. Antes, el dominio personalizado, `www`, HTTPS, `SITE_URL` y la publicación de producción, y las direcciones de Supabase, de los pagos y de Google que enumera docs/PENDIENTES_DE_RICARDO.md | Tú y la sesión |
| Treinta días después | Quitas el origen viejo de las direcciones de Supabase y de `APP_ORIGINS`. Despublicas GitHub Pages (Settings, Pages) y se borra `pages.yml`. Borras el proyecto `enarm-prototipo` en Cloudflare. El repositorio pasa a privado | Tú y la sesión |

El repositorio **no** pasa a privado antes de los 30 días. El plan gratis de GitHub solo publica Pages desde repositorios públicos (por confirmar con uno privado de prueba), y sin Pages el sitio de mudanza desaparece.

**El aviso de catorce días.** Con `VITE_MOVED_TO` y `VITE_MOVED_ON` en el build, la demo muestra una franja que dice a qué dirección y en qué fecha se muda, qué hacer con cuenta (tocar Sincronizar ahora y entrar allá con el correo) y sin cuenta (descargar los datos en Configuración, Privacidad). Se puede cerrar por el día. Desde la fecha dice que ya se mudó. Sin esas variables, el aviso y su código ni siquiera existen en el build.

**El sitio de mudanza.** Con `PAGES_MOVED_TO`, `pages.yml` deja de construir la app y publica un sitio chico.

- Dice "Studiare cambió de dirección. Ahora vive en tudominio.mx. Te llevamos allá en unos segundos", con el enlace visible y el foco puesto en él.
- A los 5 segundos lleva a la persona al dominio nuevo, **conservando la ruta, la consulta y el fragmento**. Una liga de referido como `/Studiare-ENARM/party?ref=ABC` llega a `tudominio.mx/party?ref=ABC`. Una dirección que no es del sitio cae a la raíz del dominio nuevo.
- Sin JavaScript, una actualización automática lleva a la raíz a los 10 segundos.
- La app usa el flujo implícito de Supabase, así que un enlace de acceso reciente trae la sesión en el fragmento y esta viaja con la redirección. Un enlace vencido o ya usado pide uno nuevo, y la página no promete que uno viejo funcione.
- Trae un *service worker* de despedida en la misma ruta que el de la app vieja. Quien ya visitó o instaló la demo tiene un service worker que sirve la app vieja desde su caché aunque el sitio cambie, y no vería el aviso de mudanza. El de despedida se instala solo, borra los cachés, se desregistra y recarga cada ventana abierta. Un aparato que visitó la demo hace menos de un día puede tardar hasta un día en verlo, porque el navegador no revisa ese archivo más seguido.
- No lleva analítica ni scripts de terceros, y su política de seguridad no deja cargar nada de afuera.

Para generarlo a mano y verlo, sin publicar nada.

```bash
node scripts/deploy/moved-site.ts --to https://tudominio.mx --base /Studiare-ENARM --out dist-moved
node scripts/smoke/local-pages.ts dist-moved --port 4181
```

## 10. Si algo sale mal

| Qué ves | Qué pasó | Qué hacer |
|---|---|---|
| El flujo `cloudflare` no aparece corriendo | Falta la variable `CLOUDFLARE_DEPLOY` con el valor `true`, o es un pull request de otro repositorio | Revisa la variable. Es lo esperado mientras esté apagado |
| El flujo termina en verde con un aviso amarillo | Falta un secreto o una variable. El aviso dice cuál, por su nombre | Créala en GitHub y corre el flujo otra vez |
| El proyecto no se crea | El nombre ya está tomado en Cloudflare, o el token no tiene el permiso | Cambia `CLOUDFLARE_PAGES_PROJECT` a otro nombre, o crea el token otra vez con el permiso Account, Cloudflare Pages, Edit |
| La prueba de humo falla en `GET /repasar` | El sitio publicó un `404.html` | Revisa que el flujo no copie `index.html` a `404.html` |
| La prueba de humo falla en `Encabezados de /` | `_headers` no llegó al sitio | Busca `_headers` en la carpeta que publica el flujo (`dist`) |
| La prueba de humo falla en `robots.txt` o `sitemap.xml` en producción | Falta `SITE_URL`, o el build no es de producción | Pon `SITE_URL` y vuelve a publicar |
| Google no indexa el sitio | `pages.dev` lleva `noindex` a propósito, y solo se indexa el dominio | Espera, y revisa `https://tudominio.mx/robots.txt` |
| WhatsApp o Facebook muestran una imagen vieja al compartir | Guardan en caché lo que leyeron | Se cambia el nombre del archivo (`og-image-2.png`) y se actualiza la etiqueta |
| Un cambio no se ve después de publicar | La caché de la zona | **Caching, Configuration, Purge Everything** en Cloudflare |

## 11. Para quien programa

| Archivo | Qué hace |
|---|---|
| `vite.config.ts` | Escribe `_headers`, `robots.txt`, `sitemap.xml` y `security.txt`, llena las etiquetas de `index.html` y quita el aviso de mudanza de los builds que no lo anuncian |
| `scripts/site-files.ts` | Las funciones puras de arriba, con su prueba |
| `src/config/csp.ts` | La política de seguridad y las reglas de `_headers` |
| `.github/workflows/cloudflare.yml` | El flujo de Cloudflare |
| `scripts/deploy/cloudflare-preflight.ts` | Revisa credenciales y valida lo que llega al flujo |
| `scripts/smoke/post-deploy.ts` | La prueba de humo |
| `scripts/smoke/deploy-url.ts` | Saca la dirección del despliegue del archivo de `wrangler` |
| `scripts/smoke/local-pages.ts` | Sirve una carpeta como Pages, con `_headers` |
| `scripts/deploy/moved-site.ts` | Genera el sitio de mudanza |
| `scripts/deploy/prune-previews.sh` | Limpia vistas previas viejas |
| `scripts/secrets.ts` | El revisor de secretos del build. Marca también los tokens de Cloudflare (`cfat_`, `cfut_` y `cfk_`) |
| `tests/security/build-policy.test.ts` | Revisa un build real. Encabezados, sin `404.html`, política con Stripe, archivos para buscadores y aviso de mudanza |
| `tests/e2e/moved-site.spec.ts` | La mudanza en un navegador de verdad |

Pruebas del flujo. No hay `actionlint` en la máquina de la sesión y no se puede llamar a Cloudflare ni a GitHub desde ahí, así que `scripts/cloudflare-workflow.test.ts` revisa las reglas de seguridad leyendo el archivo y corre los pasos reales en `bash` con un `npx` falso. La corrida de verdad la hace GitHub, y es la que manda.

Lo que sigue por confirmar con la cuenta real de Cloudflare.

- Que `wrangler` suba bien una carpeta que empieza con punto, como `.well-known`. Vite sí la copia al build.
- Que la dirección del despliegue salga del archivo de `wrangler` con las entradas `pages-deploy` y `pages-deploy-detailed`. Está verificado en el código de `wrangler`, pero no con una publicación real.
- Los nombres exactos de los menús de Cloudflare.
