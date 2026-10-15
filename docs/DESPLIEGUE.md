# Despliegue a Supabase desde el repo

Para Ricardo y para la sesión. Escrito el 2026-10-15. Con un token válido de Supabase, la sesión aplica el SQL y publica las Edge Functions directo desde los archivos del repo, con un solo comando. Ya no hace falta copiar el SQL al conector ni pegar archivos en el SQL Editor.

## Qué resuelve

- El conector de Supabase pide una confirmación humana para toda sentencia con drop o delete, y una sesión en la nube no tiene dónde darla (D-113). Por eso existen los archivos de supabase/manual que hoy pegas tú
- La API de administración de Supabase no tiene ese límite. La herramienta la usa con tu token y manda los archivos tal cual están en el repo, sin transcribirlos
- Antes de escribir revisa qué ya está aplicado. Lo que ya está no se repite, y si algo no cuadra se detiene sin escribir nada
- Después de escribir comprueba el resultado contra el repo y termina con error si algo quedó distinto

## B10 cuando llegue el token

En este orden. Cada paso se puede correr primero con --dry-run, que solo lee y dice qué haría.

1. Ver qué falta, sin escribir

```bash
npm run deploy:supabase -- --plan b10 --dry-run
```

2. Aplicar lo que falta de B10 y publicar cancel-subscription

```bash
npm run deploy:supabase -- --plan b10 --yes
```

3. Crear en Stripe, en modo prueba, los precios, el cupón y las configuraciones del portal, y guardar los ocho IDs en un archivo local que no va al repo

```bash
STRIPE_SECRET_KEY=rk_test_... node --use-env-proxy scripts/stripe/setup-test.ts --app-url=https://rickymm2001-dev.github.io/Studiare-ENARM/ --write-ids=private/stripe-test-ids.json
```

4. Poner esos ocho IDs en los secretos de las Edge Functions

```bash
npm run deploy:supabase -- --plan b10 --secrets-from private/stripe-test-ids.json --dry-run
npm run deploy:supabase -- --plan b10 --secrets-from private/stripe-test-ids.json --yes
```

5. Prender las banderas freeTrial y cashPasses en feature_flags cuando pasen los escenarios de docs/STRIPE.md. Eso no lo hace esta herramienta, porque cambia lo que ven los alumnos y va después de probar

Qué pasa en el paso 2 con el proyecto como está hoy

- Las tres migraciones de B10 se saltan. El conector ya las registró como billing_emails, billing_plans_1 a billing_plans_5 e invoice_requests
- supabase/manual/pagos-b10.sql se aplica. Son las dos piezas con drop y delete de 20261022000002 que el conector no pudo correr. Su comprobación debe salir en verde
- supabase/manual/party-dueno-al-borrar-cuenta.sql se aplica. Es la pieza de Party de B7 que también estaba pendiente
- cancel-subscription se publica con verify_jwt en true
- Al final se revisan por huella las 46 funciones que tocan esos archivos y que ninguna quede abierta a anon sin que un archivo lo diga

## Opciones

| Opción | Qué hace |
|---|---|
| --plan b10 | Usa deploy/b10.json. También acepta la ruta a otro plan |
| --dry-run | Solo lee. Dice qué está aplicado, qué se aplicaría, los archivos de cada función con su tamaño y su verify_jwt |
| --only migrations | Solo el SQL del plan |
| --only functions | Solo las Edge Functions del plan |
| --yes | No pregunta antes de escribir. Sin esta opción pregunta en la terminal, y si no hay terminal no escribe |
| --secrets-from archivo | Solo pone los secretos de ese JSON. Con --plan revisa que estén los nombres del plan, sin otros, y que cada valor empiece como debe |
| --project-ref ref | Otro proyecto en lugar de bkjbcdwglyllizupokqm |

Termina con código 0 si todo quedó en verde y con 1 si algo falló o quedó distinto del repo.

## El token

- En tu computadora la herramienta lee SUPABASE_ACCESS_TOKEN. Se crea en supabase.com, Account, Access Tokens. Ponlo solo en tu terminal, nunca en el repo ni en el chat
- En la sesión en la nube no hace falta la variable. El proxy del entorno pone el token en cada llamada a api.supabase.com. El 2026-10-15 ese token respondía 401 JWT could not be decoded, y se cambia en los secretos del entorno
- La herramienta nunca imprime el token ni el valor de un secreto, solo sus nombres. Si la API repitiera un valor en un mensaje de error, se muestra como [oculto]
- El comando de npm arranca Node con --use-env-proxy, porque el fetch de Node no usa el proxy del entorno por sí solo. En tu computadora, sin proxy, esa opción no cambia nada

## Cómo decide qué ya está aplicado

Nunca repite un SQL a ciegas. Para cada archivo del plan

- **Registrado.** Si la historia de migraciones del proyecto tiene su versión, su nombre o un trozo de su nombre como los que deja el conector (billing_plans_1, privacy_a_freno_bitacora), se salta. El nombre es el del archivo sin la versión, y el de un archivo de supabase/manual es manual_ más su nombre, por ejemplo manual_pagos_b10
- **Aplicado sin registro.** Si cada función que crea ya está en la base con la huella del repo y, en un archivo manual, su comprobación sale en verde, se salta. Pasa con la primera migración, que se pegó en el SQL Editor
- **Lo demás se aplica** y queda registrado con su nombre, igual que lo hace el conector. Así la siguiente corrida lo reconoce

Y se detiene sin escribir nada cuando

- Un archivo registrado tiene una función distinta del repo y ningún paso posterior del plan la corrige. Si un paso posterior sí la corrige, lo dice y sigue. Es el caso de delete_my_account con pagos-b10.sql
- Aplicar un archivo dejaría una función en una versión más vieja que la de una migración posterior del repo
- Un archivo de supabase/manual trae una función distinta de la última migración que la define

La huella de una función es md5 de su cuerpo sin comentarios de línea ni espacios, la misma que calcula la base con md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')). Se comprobó el 2026-10-15 contra un Postgres 16 local con todas las migraciones en el orden de supabase/tests/run.sh, y las 129 funciones dieron la misma huella en el repo y en la base. La versión que se espera de cada función es la de la última migración del repo que la define y, si solo vive en supabase/manual, la del último archivo manual del plan.

Después de aplicar se revisa

- Que cada función que tocan los archivos del plan tenga la huella esperada
- Que anon no pueda ejecutar ninguna, salvo que un archivo del plan se lo conceda con grant execute o que el plan la anote en anonExecutable con su porqué. En b9 está current_app_role, abierta a propósito desde D-113
- Que la comprobación del final de cada archivo manual dé lo que pide el plan
- Que la versión de cada función publicada suba, que quede ACTIVE y con el verify_jwt del plan

## Cómo reemplaza los pegados a mano

| Archivo | Antes | Ahora |
|---|---|---|
| supabase/manual/pagos-b10.sql | Lo pegabas tú en el SQL Editor | Va en el plan b10 y lo aplica la sesión |
| supabase/manual/party-dueno-al-borrar-cuenta.sql | Lo pegabas tú en el SQL Editor | Va en el plan b10 y lo aplica la sesión |
| supabase/manual/limpiar-pagos-de-prueba.sql | Lo pegas tú | Sigue igual. Borra filas de pagos y va solo después de cancelar en Stripe, así que no entra en ningún plan |
| supabase/manual/ejecutar-en-sql-editor.sql | Lo pegabas tú (D-113) | No está en un plan. Si hace falta saber si se pegó, un plan con ese archivo y --dry-run lo dice por huella |

## Los planes

Viven en deploy/. Cada bloque nuevo, como B11 o B12, agrega el suyo con la misma forma.

```json
{
  "description": "Qué hace el plan, en una o dos frases",
  "migrations": [
    { "file": "supabase/migrations/20261022000001_billing_emails.sql" },
    {
      "file": "supabase/manual/pagos-b10.sql",
      "check": { "plan_fundador_anual": true, "estado_prueba": true, "borrar_cuenta_b10": true },
      "note": "Por qué va este paso"
    }
  ],
  "functions": [{ "slug": "cancel-subscription", "verifyJwt": true }],
  "secrets": { "STRIPE_PRICE_FOUNDER": { "prefix": "price_" } },
  "anonExecutable": { "current_app_role": "Por qué queda abierta a anon" }
}
```

- migrations va en orden y acepta migraciones completas de supabase/migrations, con sus secciones con drop y delete, y archivos de supabase/manual
- check compara, columna por columna, el select que va después de la última línea de comentario que dice Comprobación en el archivo
- name cambia el nombre con el que queda registrado y recordedAs agrega otros nombres con los que ya pudo quedar
- verifyJwt va en true para las funciones que llama la app con la sesión del alumno y en false para los avisos de Stripe y de Mercado Pago, que se identifican con su firma. Una prueba revisa que coincida con lo que dice el index.ts de cada función
- secrets son los nombres que espera --secrets-from, con el inicio que debe tener cada valor
- Hoy hay dos. b10, lo que falta de B10. b9, que solo publica admin-reset-mfa, porque su migración 20261020000001 ya está registrada como accounts_access y se salta

Cada función se sube con todos los archivos que importa, también los de solo tipos, con su ruta desde la raíz del repo. Así ../\_shared/x.ts se resuelve igual en el servidor. Los archivos de prueba no viajan porque nadie los importa.

## Fuentes

Revisadas el 2026-10-15. Los sitios de documentación de Supabase no abren desde el entorno de la sesión, así que se usaron la especificación oficial y el código de las herramientas oficiales.

- Especificación OpenAPI de la API de administración, https://api.supabase.com/api/v1-json (Supabase API v1, versión 1.0.0, bajada el 2026-10-15)
  - POST /v1/projects/{ref}/database/query, cuerpo JSON con query, parameters y read_only, responde 201. Beta
  - POST /v1/projects/{ref}/database/query/read-only, cuerpo JSON con query y parameters. Corre como supabase_read_only_user y pide nombres con esquema. Beta
  - GET /v1/projects/{ref}/database/migrations, lista de version y name
  - POST /v1/projects/{ref}/database/migrations, aplica y registra. Cuerpo JSON con query, name y rollback opcional, encabezado Idempotency-Key opcional, responde 200. No recibe la versión, la pone el servidor
  - GET /v1/projects/{ref}/functions y GET /v1/projects/{ref}/functions/{function_slug}, con id, slug, name, status, version, verify_jwt, entrypoint_path y ezbr_sha256
  - POST /v1/projects/{ref}/functions/deploy?slug=..., multipart con file (varios) y metadata (entrypoint_path obligatorio, name, verify_jwt, import_map_path, static_patterns). Crea la función si no existe y responde 201 con su versión
  - POST /v1/projects/{ref}/secrets, lista de name y value, hasta 100, el nombre no puede empezar con SUPABASE_ y el valor llega a 24,576 caracteres. GET devuelve name, value y updated_at
- CLI de Supabase, https://github.com/supabase/cli, commit c4ccf77 del 2026-10-15
  - apps/cli-go/pkg/function/deploy.go. metadata va como campo de texto y cada archivo como parte file con su ruta desde la carpeta del proyecto
  - apps/cli-go/pkg/function/deno.go. WalkImportPaths sigue también los import type
  - apps/cli/src/shared/functions/deploy.ts, la versión nueva del CLI. Los nombres de los archivos y las rutas de metadata van anclados a la carpeta del proyecto
  - apps/cli-go/pkg/migration/history.go. supabase_migrations.schema_migrations tiene version, statements y name
- Servidor MCP de Supabase, https://github.com/supabase-community/supabase-mcp, packages/mcp-server-supabase/src/platform/api-platform.ts en main, leído el 2026-10-15. execute_sql usa database/query con read_only, apply_migration usa POST database/migrations con name y query, y deploy_edge_function usa functions/deploy con multipart
- El proyecto real, leído con el conector el 2026-10-15 sin escribir nada. La historia guarda la hora de aplicación como versión y el nombre sin la versión del archivo. admin-reset-mfa guarda sus archivos como source/index.ts y \_shared/x.ts
- La respuesta de error, con un GET el 2026-10-15. 401 con el mensaje JWT could not be decoded en JSON y el encabezado X-Proxy-Error del proxy del entorno

## Lo que falta confirmar con la primera corrida real

- Que POST database/migrations corra bien los archivos con begin y commit propios, como party-dueno-al-borrar-cuenta.sql. Postgres solo avisa si llega un begin dentro de otra transacción, así que se espera que pase
- Que database/query/read-only pueda leer pg_proc y auth.users. Si falla por permisos, la herramienta repite la lectura en database/query con read_only, como el servidor MCP
- Que la respuesta de una consulta sea la lista de filas, como la trata el servidor MCP
- Que una función publicada con rutas desde la raíz del repo arranque igual que las que subió el conector. Es la forma del CLI, así que se espera que sí
- Que GET de una función que no existe responda 404
