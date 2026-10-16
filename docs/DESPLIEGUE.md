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

En la sesión en la nube va sin STRIPE_SECRET_KEY, porque la llave la pone el proxy del entorno y la sesión no la ve. Como no se ve su prefijo, lo primero que hace es leer el saldo de Stripe, y si no dice livemode false se detiene sin crear nada. Cualquier respuesta en modo real también la detiene

```bash
node --use-env-proxy scripts/stripe/setup-test.ts --app-url=https://rickymm2001-dev.github.io/Studiare-ENARM/ --write-ids=private/stripe-test-ids.json
```

4. Poner esos ocho IDs en los secretos de las Edge Functions

```bash
npm run deploy:supabase -- --plan b10 --secrets-from private/stripe-test-ids.json --dry-run
npm run deploy:supabase -- --plan b10 --secrets-from private/stripe-test-ids.json --yes
```

5. Prender las banderas freeTrial y cashPasses en feature_flags cuando pasen los escenarios de docs/STRIPE.md. Eso no lo hace esta herramienta, porque cambia lo que ven los alumnos y va después de probar

Qué pasa en el paso 2 con el proyecto como está hoy

- Las tres migraciones de B10 se saltan. El conector ya las registró como billing_emails, billing_plans_1 a billing_plans_5 e invoice_requests. Los cinco trozos van declarados en recordedAs de b10.json
- supabase/manual/pagos-b10.sql se aplica. Son las dos piezas con drop y delete de 20261022000002 que el conector no pudo correr. Su comprobación corre justo después y debe salir en verde, o no sigue
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
| --secrets-from archivo | Solo pone los secretos de ese JSON. Necesita --plan, que dice qué nombres espera y la forma completa de cada valor. Un nombre que el plan no espera o que no es válido no se repite en pantalla |
| --project-ref ref | Otro proyecto en lugar de bkjbcdwglyllizupokqm |

Termina con código 0 si todo quedó en verde, con 1 si algo falló o quedó distinto del repo y con 2 si las opciones o el token no sirven.

## El token

- En tu computadora la herramienta lee SUPABASE_ACCESS_TOKEN. Se crea en supabase.com, Account, Access Tokens. Ponlo solo en tu terminal, nunca en el repo ni en el chat
- En la sesión en la nube no hace falta la variable. El proxy del entorno pone el token en cada llamada a api.supabase.com. El 2026-10-15 ese token respondía 401 JWT could not be decoded, y se cambia en los secretos del entorno
- La herramienta nunca imprime el token ni el valor de un secreto, solo sus nombres. Si la API repitiera un valor o el token en un mensaje de error, se muestra como [oculto]
- Un SUPABASE_ACCESS_TOKEN con espacios, saltos de línea u otros caracteres fuera de ASCII visible se rechaza antes de llamar a nada, sin mostrarlo. Con un salto de línea, fetch lanzaría un error con el encabezado completo en su mensaje. Por lo mismo, de un error que no es de la herramienta solo se dice su tipo, y una opción desconocida no se repite
- El comando de npm arranca Node con --use-env-proxy, porque el fetch de Node no usa el proxy del entorno por sí solo. En tu computadora, sin proxy, esa opción no cambia nada

## Cómo decide qué ya está aplicado

Nunca repite un SQL a ciegas. Para cada archivo del plan

- **Registrado.** Si la historia de migraciones del proyecto tiene su versión, su nombre o uno de los nombres que el plan declara en recordedAs, se salta. El nombre es el del archivo sin la versión, y el de un archivo de supabase/manual es manual_ más su nombre, por ejemplo manual_pagos_b10. Los trozos del conector, como billing_plans_1 a billing_plans_5, no se deducen. Se declaran en recordedAs
- **Aplicado sin registro.** Se salta si cada función que crea ya está en la base igual que en el propio archivo y, además, el archivo es todo create function, grant, revoke o comment, o su comprobación sale en verde. Un archivo con una tabla, una llave o un update no se da por aplicado solo porque sus funciones estén. Ahí hace falta su comprobación o su registro
- **Lo demás se aplica** y queda registrado con su nombre, igual que lo hace el conector. Se manda Idempotency-Key, que la especificación acepta en esa ruta, con el nombre y la huella del SQL

Y se detiene sin escribir nada cuando

- Un archivo registrado tiene una función distinta del repo y ningún paso posterior del plan la corrige. Si un paso posterior sí la corrige, lo dice y sigue. Es el caso de delete_my_account con pagos-b10.sql
- Un archivo registrado tiene su comprobación en rojo, porque lo registrado no se vuelve a aplicar. También en --dry-run
- Aplicar un archivo dejaría una función en una versión más vieja que la de una migración posterior del repo
- Un archivo de supabase/manual trae una función distinta de la última migración que la define
- La lectura del estado falla por la red, por un 5xx o por una respuesta inesperada. Solo un 400 de SQL, que es lo que pasa cuando falta el objeto que busca la comprobación, cuenta como comprobación en rojo

Una función es igual si coinciden tres cosas

- La huella del cuerpo, md5 sin comentarios de línea ni espacios, la misma que calcula la base con md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g'))
- security definer, que la base guarda en prosecdef
- Su set, como set search_path = public, pg_temp, que la base guarda en proconfig. Cuenta también lo que cambia un alter function ... set, reset o security posterior, como el search_path que 20261014000001 le pone a ai_day

Se comprobó el 2026-10-15 contra un Postgres 16 local con todas las migraciones en el orden de supabase/tests/run.sh, y las 129 funciones dieron lo mismo en el repo y en la base en las tres cosas. La versión que se espera de cada función es la de la última migración del repo que la crea o la cambia y, si solo vive en supabase/manual, la del último archivo manual del plan.

Al cargar el plan se revisa que los nombres no se presten a confusión. Cada migración del repo tiene un nombre propio que no es trozo de otra (por ejemplo pagos y pagos_2), y name y recordedAs no se repiten ni toman el nombre de otro archivo.

Mientras aplica

- Después de cada archivo relee la historia. Si no aparece con su nombre, se detiene
- Si el archivo tiene comprobación, la corre en ese momento. Si sale en rojo, se detiene y no aplica lo que sigue

Después de aplicar se revisa, y si algo no cuadra no se publica ninguna función

- Que cada función que tocan los archivos del plan sea igual a la esperada
- Que no haya más de una versión de una función con el mismo nombre, salvo que el plan la anote en overloads con su porqué
- Que anon no pueda ejecutar ninguna de sus versiones, salvo que un archivo del plan se lo conceda con grant execute o que el plan la anote en anonExecutable con su porqué. En b9 está current_app_role, abierta a propósito desde D-113
- Que la comprobación del final de cada archivo manual dé lo que pide el plan, con la fila y cada columna presentes

Y al publicar, cada función debe subir de versión, quedar ACTIVE y con el verify_jwt del plan. La primera que no quede así detiene las que siguen.

La simulación con --dry-run solo usa rutas de lectura. Fuera de ella, si la ruta de solo lectura de SQL falla por algo que no es el token, la lectura se repite en la ruta general con read_only, como lo hace el servidor MCP.

### Límites

- No se comparan los argumentos de cada función (pg_get_function_identity_arguments). Desde el repo no se pueden reproducir con seguridad, porque la base escribe los tipos con sus nombres largos y con o sin esquema según el search_path de quien consulta. Lo cubre en parte la regla de las sobrecargas
- Un set ... from current no se puede reproducir desde el repo, así que en esa función no se compara el set
- Un alter function ... rename no se sigue

## Cómo reemplaza los pegados a mano

| Archivo | Antes | Ahora |
|---|---|---|
| supabase/manual/pagos-b10.sql | Lo pegabas tú en el SQL Editor | Va en el plan b10 y lo aplica la sesión |
| supabase/manual/party-dueno-al-borrar-cuenta.sql | Lo pegabas tú en el SQL Editor | Va en el plan b10 y lo aplica la sesión |
| supabase/manual/limpiar-pagos-de-prueba.sql | Lo pegas tú | Sigue igual. Borra filas de pagos y va solo después de cancelar en Stripe, así que no entra en ningún plan |
| supabase/manual/ejecutar-en-sql-editor.sql | Lo pegabas tú (D-113) | No está en un plan. Trae más que funciones y no tiene consulta de Comprobación, así que la herramienta no puede saber si ya se pegó. Para meterlo en un plan habría que agregarle una |

## B11, B12 y B13, el orden desde un proyecto con solo B10

Se corren en este orden, cada uno primero con --dry-run.

```bash
npm run deploy:supabase -- --plan b11 --dry-run
npm run deploy:supabase -- --plan b11 --yes
npm run deploy:supabase -- --plan b12 --dry-run
npm run deploy:supabase -- --plan b12 --yes
npm run deploy:supabase -- --plan b13 --dry-run
npm run deploy:supabase -- --plan b13 --yes
```

Lo que revisa la prueba de scripts/deploy/plans.test.ts (B11, B12 y B13) contra la API falsa

- b11, b12 y b13 cierran en verde en ese orden, desde una base con solo B10
- b12 y b13 pueden ir en cualquier orden entre sí después de b11
- Cada plan corre también solo sobre un proyecto que ya tiene B11
- Los tres se pueden volver a correr, en cualquier orden, sin repetir SQL

Por qué b11 lleva una migración de B13

- La migración 20261027000001_english_section.sql de B13 vuelve a definir bank_version_issues y bank_incomplete_of, que crea la migración bank_core de B11. La herramienta espera de cada función la versión de la última migración del repo, así que el plan b11 sin esa migración se detenía antes de escribir nada con el mensaje `Aplicarla dejaría bank_version_issues más vieja que supabase/migrations/20261027000001_english_section.sql. Agrega ese archivo al plan después de este paso`
- Se hizo lo que pide ese mensaje. deploy/b11.json lleva la migración de inglés como su paso 7, después de bank_sync_cron y antes de banco-b11.sql, con una nota que lo explica. deploy/b13.json la lleva también. El plan que corra primero la aplica y el otro la salta como ya aplicada
- No se cambió la herramienta ni se quitó ninguna de sus protecciones. Las dos funciones se comparan con la última migración del repo, como todas
- Una prueba revisa que b11 sin la migración de inglés se detiene sin escribir nada

Por qué b11 no se detiene con Borrar mis datos de B12

- B12 vuelve a definir delete_my_data con 20261026000004_ai_delete_my_data.sql, que es la versión v3. banco-b11.sql, el archivo manual del plan b11, trae esa misma v3, porque la herramienta exige que un archivo manual sea igual a la última migración que define cada función que trae. Así b11 deja la versión final desde el paso 8 y no queda Borrar mis datos más vieja que el repo
- Sus delete de las tablas de la IA van con execute y solo si la tabla existe, así que b11 solo no deja Borrar mis datos roto
- Al correr b11 y luego b12, el paso ai_delete_my_data de b12 sale como ya estaba aplicada sin registro. Es lo esperado. banco-b11.sql ya dejó la función igual a la de esa migración, la herramienta la da por aplicada por la huella de su función y la migración no queda en la historia con su nombre. El paso supabase/manual/ia-b12.sql sí corre y su comprobación sale en verde

Qué pasa en cada caso

- Proyecto con solo B10. b11 aplica sus ocho archivos de SQL y publica bank-sync. b12 aplica ai_proxy_v2, ai_jobs, ai_gate y ia-b12.sql y publica ai-proxy y ai-batch. b13 ya no tiene SQL por aplicar y vuelve a publicar bank-sync con la copia nueva del convertidor, la que deja npm run bank:shared en supabase/functions/_shared/bank/generated
- Proyecto con B11 aplicado antes de que existiera la migración de inglés. b13 aplica solo esa migración y vuelve a publicar bank-sync. b11 hace lo mismo, y avisa que bank_version_issues y bank_incomplete_of están distintas del repo en la base y que las corrige el paso 7. b12 aplica los suyos
- b13 sin b11 no sirve. La migración de inglés agrega una fila a bank_taxonomy y vuelve a definir funciones de B11, y la base responde con un error de SQL que la herramienta muestra antes de seguir
- b12 va después de b11. La herramienta no lo exige, porque no revisa tablas, pero Borrar mis datos v3 borra de bank_reads y de deck_catalog_downloads, que crea B11
- bank-sync necesita el secreto GOOGLE_BANK_SHEET_ID del plan b11. El plan b13 no espera ninguno. Los secretos de b12 son APP_ORIGINS y AI_ALLOW_MOCK

Para los bloques que siguen

- Cuando un bloque nuevo vuelve a definir una función de un plan anterior hay dos casos. Si la función vive en un archivo manual del plan anterior, como delete_my_data en banco-b11.sql, el archivo manual sigue a la última migración. Si vive en una migración, como bank_version_issues en bank_core, el plan anterior suma la migración nueva al final de sus archivos de SQL, con una nota que lo diga, y el plan nuevo la lleva también. Sin eso el plan anterior se detiene, y con eso se puede volver a correr cuando el bloque nuevo ya está en el repo
- El plan de un bloque nuevo va al final de la lista FROM_B10 de la prueba, con su SQL y sus funciones. El resto de la prueba corre con él sin cambios

## Los planes

Viven en deploy/. Cada bloque nuevo, como B11 o B12, agrega el suyo con la misma forma.

```json
{
  "description": "Qué hace el plan, en una o dos frases",
  "migrations": [
    { "file": "supabase/migrations/20261022000001_billing_emails.sql" },
    {
      "file": "supabase/manual/pagos-b10.sql",
      "check": {
        "plan_fundador_anual": true,
        "estado_prueba": true,
        "borrar_cuenta_b10": true,
        "borra_la_invitacion": true
      },
      "note": "Por qué va este paso"
    },
    {
      "file": "supabase/migrations/20261022000002_billing_plans.sql",
      "recordedAs": ["billing_plans_1", "billing_plans_2"]
    }
  ],
  "functions": [{ "slug": "cancel-subscription", "verifyJwt": true }],
  "secrets": { "STRIPE_PRICE_FOUNDER": { "pattern": "^price_[A-Za-z0-9]+$" } },
  "anonExecutable": { "current_app_role": "Por qué queda abierta a anon" },
  "overloads": { "una_funcion": "Por qué tiene dos versiones en la base" }
}
```

- migrations va en orden y acepta migraciones completas de supabase/migrations, con sus secciones con drop y delete, y archivos de supabase/manual
- check compara, columna por columna, el select que va después de la última línea de comentario que dice Comprobación en el archivo. Solo se acepta un select, y el plan debe nombrar justo las columnas que da, cuántas sean. Si el archivo gana una columna, por ejemplo borra_la_invitacion en la versión de pagos-b10.sql de B16, el plan no carga hasta que diga qué debe dar
- name cambia el nombre con el que queda registrado y recordedAs declara otros nombres con los que ya quedó, como los trozos del conector
- verifyJwt va en true para las funciones que llama la app con la sesión del alumno y en false para los avisos de Stripe y de Mercado Pago, que se identifican con su firma. Una prueba revisa que coincida con lo que dice el index.ts de cada función
- secrets son los nombres que espera --secrets-from, cada uno con pattern, la forma completa de su valor con ^ y $
- anonExecutable y overloads anotan, con su porqué, lo que la comprobación de la base aceptaría como excepción
- Hoy hay cinco
  - b9 solo publica admin-reset-mfa, porque su migración 20261020000001 ya está registrada como accounts_access y se salta
  - b10 es lo que falta de B10
  - b11 es el banco en la nube y bank-sync
  - b12 es la IA real. Cuatro migraciones, supabase/manual/ia-b12.sql con su comprobación y las funciones ai-proxy y ai-batch, que llevan verifyJwt en false. Sus secretos son APP_ORIGINS y AI_ALLOW_MOCK. La clave ENARM_ANTHROPIC_KEY la pone Ricardo directo en Supabase. La pieza del ciclo de lotes (supabase/manual/ia-lotes-cron.sql) no entra, porque se corre después de comprobar /health en modo simulado
  - b13 es Inglés médico. La migración 20261027000001 y bank-sync otra vez con la copia nueva del convertidor, sin verificar JWT. La migración también está en b11, y la que corra primero la aplica
- Cuando un bloque nuevo cambia una función de un plan anterior, el archivo manual de ese plan sigue a la última migración. Con B12, banco-b11.sql trae la versión v3 de delete_my_data, la misma de ia-b12.sql. Sus delete de las tablas de B12 van con execute y solo si la tabla existe, así que desplegar el plan b11 solo no deja Borrar mis datos roto y desplegar b12 enseguida ya no es obligatorio

Cada función se sube con todos los archivos que importa, también los de solo tipos, con su ruta desde la raíz del repo. Así ../\_shared/x.ts se resuelve igual en el servidor. Los archivos de prueba no viajan porque nadie los importa. Si la función tiene un deno.json en su carpeta, como ai-proxy y ai-batch, que importan zod, hono y el SDK de Anthropic por su nombre, también se sube y su ruta va en import_map_path del metadata. Sin ese mapa el servidor no resuelve esos nombres.

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

La primera corrida real fue el 2026-10-15 con el plan b10, todo en verde. Confirmó que database/query/read-only lee pg_proc, que POST database/migrations corre un archivo con begin y commit propios (party-dueno-al-borrar-cuenta.sql) y lo registra, que la respuesta es la lista de filas, que una función que no existe se detecta y se crea, y que cancel-subscription quedó ACTIVE con verify_jwt en true. Sigue sin probarse lo de abajo que no pasó en esa corrida, como un 400 de SQL y la Idempotency-Key repetida

- Que un error de SQL en database/query y en database/query/read-only responda 400. La herramienta solo cuenta un 400 como comprobación en rojo antes de aplicar, y cualquier otro estado la detiene sin escribir
- Que POST database/migrations con la misma Idempotency-Key no registre dos veces, como dice la especificación, y que GET database/migrations muestre el registro justo después de aplicar

- Que la API acepte import_map_path con la ruta desde la raíz del repo del deno.json de la función, como entrypoint_path, y que con él publique ai-proxy y ai-batch. Se escribió con la especificación y el esquema del conector, pero no se ha corrido contra el proyecto real. Si la API lo rechaza, se publican con el conector (docs/IA_ALOJADA.md)
- Que POST database/migrations corra bien los archivos con begin y commit propios, como party-dueno-al-borrar-cuenta.sql. Postgres solo avisa si llega un begin dentro de otra transacción, así que se espera que pase
- Que database/query/read-only pueda leer pg_proc y auth.users. Si falla por permisos, la herramienta repite la lectura en database/query con read_only, como el servidor MCP
- Que la respuesta de una consulta sea la lista de filas, como la trata el servidor MCP
- Que una función publicada con rutas desde la raíz del repo arranque igual que las que subió el conector. Es la forma del CLI, así que se espera que sí
- Que GET de una función que no existe responda 404
