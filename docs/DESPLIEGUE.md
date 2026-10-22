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

## B11 a B15 y B17, el orden desde un proyecto con solo B10

Se corren en este orden, cada uno primero con --dry-run.

```bash
npm run deploy:supabase -- --plan b11 --dry-run
npm run deploy:supabase -- --plan b11 --yes
npm run deploy:supabase -- --plan b12 --dry-run
npm run deploy:supabase -- --plan b12 --yes
npm run deploy:supabase -- --plan b13 --dry-run
npm run deploy:supabase -- --plan b13 --yes
npm run deploy:supabase -- --plan b14 --dry-run
npm run deploy:supabase -- --plan b14 --yes
npm run deploy:supabase -- --plan b15 --dry-run
npm run deploy:supabase -- --plan b15 --yes
npm run deploy:supabase -- --plan b17 --dry-run
npm run deploy:supabase -- --plan b17 --yes
```

Lo que revisa la prueba de scripts/deploy/plans.test.ts (B11, B12, B13, B14, B15 y B17) contra la API falsa

- b11, b12, b13, b14, b15 y b17 cierran en verde en ese orden, desde una base con solo B10
- b12 y b13 pueden ir en cualquier orden entre sí después de b11, y b14, b15 y b17 van al final, en ese orden
- Cada plan corre también solo sobre un proyecto que ya tiene B11
- Los seis se pueden volver a correr, en cualquier orden, sin repetir SQL
- b15 con --dry-run solo lee. Dice qué migraciones aplicaría y qué funciones publicaría, y no escribe nada
- Una comprobación de b15 en rojo detiene el plan sin aplicar nada, aunque las migraciones ya estén registradas

Por qué b11 lleva una migración de B13

- La migración 20261027000001_english_section.sql de B13 vuelve a definir bank_version_issues y bank_incomplete_of, que crea la migración bank_core de B11. La herramienta espera de cada función la versión de la última migración del repo, así que el plan b11 sin esa migración se detenía antes de escribir nada con el mensaje `Aplicarla dejaría bank_version_issues más vieja que supabase/migrations/20261027000001_english_section.sql. Agrega ese archivo al plan después de este paso`
- Se hizo lo que pide ese mensaje. deploy/b11.json lleva la migración de inglés como su paso 7, después de bank_sync_cron y antes de banco-b11.sql, con una nota que lo explica. deploy/b13.json la lleva también. El plan que corra primero la aplica y el otro la salta como ya aplicada
- No se cambió la herramienta ni se quitó ninguna de sus protecciones. Las dos funciones se comparan con la última migración del repo, como todas
- Una prueba revisa que b11 sin la migración de inglés se detiene sin escribir nada

Por qué b11 lleva las tres migraciones de B14

- La migración 20261028000003_model_reads.sql de B14 vuelve a definir bank_catalog_json, que crea la migración bank_core de B11, con una llave más, calibration. La herramienta espera la versión de la última migración del repo, así que el plan b11 sin ella se detenía antes de escribir nada con el mensaje `Aplicarla dejaría bank_catalog_json más vieja que supabase/migrations/20261028000003_model_reads.sql. Agrega ese archivo al plan después de este paso`
- Se hizo lo mismo que con B13. deploy/b11.json lleva las tres migraciones de B14 después de la de inglés y antes de banco-b11.sql, con una nota en cada una. Van las tres y no solo la tercera, porque la tercera lee tablas que crea la primera y porque así quedan en el orden del repo. deploy/b14.json las lleva también. El plan que corra primero las aplica y el otro las salta como ya aplicadas
- Ninguna de las tres cambia una función de B12 ni de B13, así que b12 y b13 no llevan nada de B14
- El plan b14 no publica Edge Functions, porque la calibración corre en GitHub Actions (docs/CALIBRACION.md), ni espera secretos. La llave de la calibración la pone Ricardo directo en GitHub
- b14 trae una comprobación en la última migración, que va al final del archivo. Revisa hechos de la estructura (las siete tablas, los cuatro índices de la bitácora, quién puede ejecutar qué, la siembra de model_settings y el tipo de correo distractor_flags) y no revisa si la calibración está encendida ni en qué modo, porque eso cambia con el tiempo y con ello el plan no se podría volver a correr. Esa lectura va aparte, en docs/SUPABASE.md. Una prueba revisa que la consulta del plan y la primera de la sección B14 de docs/SUPABASE.md sean la misma
- Una prueba revisa que b11 sin las tres se detiene sin escribir nada, y otra que una comprobación de b14 en rojo detiene el plan aunque las migraciones ya estén registradas

Por qué b11 no se detiene con Borrar mis datos de B12 ni de B15

- B15 vuelve a definir delete_my_data con 20261029000004_delete_my_data_v4.sql, que es la versión v4. Es la v3 de B12 más los recordatorios por correo, la foto de tarjetas vencidas, el ID de analítica y los recordatorios pendientes. Lleva delete, así que el conector no la aplica sin una confirmación y la aplica esta herramienta, como pasó con la de B12. banco-b11.sql, ia-b12.sql y la pieza 4 de ejecutar-en-sql-editor.sql traen esa misma v4 y siguen a la última migración, como pide la herramienta. Sus delete de lo de B15 van con execute y solo si la tabla existe, así que b11 o b12 solos no dejan Borrar mis datos roto
- El plan b15 lleva esa migración como su paso 4, con la comprobación de la estructura de B15. Los planes b11 y b12 no la llevan, porque su archivo manual ya deja la función igual a ella
- Un proyecto que ya tenía b11 o b12 aplicados antes de B15 tiene Borrar mis datos en la v3. Volver a correr b11 o b12 ahí se detiene sin escribir nada y dice que delete_my_data está distinta del repo en la base y que ningún paso del plan la deja como la migración de B15, porque sus archivos manuales ya están registrados y no se repiten. Corre b15 primero, que la deja en la v4, y después b11 y b12 ya se pueden repetir. Una prueba lo revisa
- Con B12 pasó lo mismo un paso antes. B12 vuelve a definir delete_my_data con 20261026000004_ai_delete_my_data.sql, que es la versión v3. banco-b11.sql, el archivo manual del plan b11, trae esa misma v3, porque la herramienta exige que un archivo manual sea igual a la última migración que define cada función que trae. Así b11 deja la versión final desde el paso 8 y no queda Borrar mis datos más vieja que el repo
- Sus delete de las tablas de la IA van con execute y solo si la tabla existe, así que b11 solo no deja Borrar mis datos roto
- Al correr b11 y luego b12, el paso ai_delete_my_data de b12 se aplica y se registra, porque banco-b11.sql dejó Borrar mis datos en la v4 y esa migración es la v3. La herramienta lo permite porque el paso siguiente, supabase/manual/ia-b12.sql, la vuelve a dejar en la v4 en el mismo plan, y su comprobación sale en verde. Antes de B15 la v3 de banco-b11.sql era igual a la de esa migración y el paso se daba por aplicado por la huella de su función

Qué pasa en cada caso

- Proyecto con solo B10. b11 aplica sus once archivos de SQL y publica bank-sync. b12 aplica ai_proxy_v2, ai_jobs, ai_gate, ai_delete_my_data y ia-b12.sql y publica ai-proxy y ai-batch. b13 ya no tiene SQL por aplicar y vuelve a publicar bank-sync con la copia nueva del convertidor, la que deja npm run bank:shared en supabase/functions/_shared/bank/generated. b14 tampoco tiene SQL por aplicar, no publica nada y solo corre su comprobación
- Proyecto con B11, B12 y B13 aplicados antes de que existiera B14. b14 aplica model_core, calibration_job y model_reads y corre su comprobación. b11 hace lo mismo, y avisa que bank_catalog_json está distinta del repo en la base y que la corrige el paso 10
- b14 sin b11 no sirve. La tercera migración redefine bank_catalog_json sobre la tabla question_catalog de B11, y la segunda agrega un tipo a email_kinds, que crea B10. La herramienta no lo exige, porque no revisa tablas
- Proyecto con B11 aplicado antes de que existiera la migración de inglés. b13 aplica solo esa migración y vuelve a publicar bank-sync. b11 hace lo mismo, y avisa que bank_version_issues y bank_incomplete_of están distintas del repo en la base y que las corrige el paso 7. b12 aplica los suyos
- b13 sin b11 no sirve. La migración de inglés agrega una fila a bank_taxonomy y vuelve a definir funciones de B11, y la base responde con un error de SQL que la herramienta muestra antes de seguir
- b12 va después de b11. La herramienta no lo exige, porque no revisa tablas, pero Borrar mis datos v3 borra de bank_reads y de deck_catalog_downloads, que crea B11
- bank-sync necesita el secreto GOOGLE_BANK_SHEET_ID del plan b11. El plan b13 no espera ninguno. Los secretos de b12 son APP_ORIGINS y AI_ALLOW_MOCK
- Proyecto con B11 a B14 aplicados y sin B15. b15 aplica las cuatro migraciones (la última con su comprobación) y publica las trece funciones. send-emails, email-unsubscribe, analytics-flush y monitoring-test nacen en la versión 1, y las nueve que ya existían suben una versión, porque ahora van envueltas con withMonitoring. Todo nace apagado, con email_delivery y analytics en false
- b15 no espera secretos. Las llaves de Resend, PostHog y Sentry las pone Ricardo directo en Supabase, Edge Functions, Secrets (docs/PENDIENTES_DE_RICARDO.md, B15). La tercera migración necesita project_url en Vault, que guardó B11, y no hace nada donde falten pg_cron, pg_net o Vault
- Proyecto con b15 publicado. b17 no aplica SQL y vuelve a publicar las mismas trece funciones, cada una con una versión más y el verify_jwt que tenía. Un proyecto sin las funciones de b15 las crea en la versión 1
- Las funciones del plan b15 que ya existían tienen el verify_jwt de siempre. create-checkout, create-portal-session, cancel-subscription y admin-reset-mfa verifican la sesión. payment-webhook-stripe, payment-webhook-mercadopago, bank-sync, ai-proxy y ai-batch no, porque se identifican con su firma o con la ficha de Cron. Una prueba revisa que cada una coincida con su index.ts

### B17, orígenes por secreto y llaves nuevas de Supabase

El plan b17 no lleva SQL. Vuelve a publicar las trece funciones que ya existen y pone dos secretos, APP_URL y APP_ORIGINS.

```bash
npm run deploy:supabase -- --plan b17 --dry-run
npm run deploy:supabase -- --plan b17 --yes
```

- Por qué las trece. Todas empaquetan _shared/keys.ts, que elige entre la llave nueva de Supabase (sb_secret_) y la de siempre y arma los encabezados, y _shared/origins.ts, que lee la lista APP_ORIGINS. Las que atienden al navegador o llaman a la base también empaquetan _shared/http.ts, _shared/supabase.ts y _shared/runtime.ts. Son create-checkout, create-portal-session, cancel-subscription, admin-reset-mfa, payment-webhook-stripe, payment-webhook-mercadopago, bank-sync, ai-proxy, ai-batch, send-emails, email-unsubscribe, analytics-flush y monitoring-test, cada una con el verify_jwt de siempre. Una prueba revisa que coincida con lo que dice su index.ts
- Sale con las llaves de siempre. Mientras no existan las nuevas en Supabase, el código usa SUPABASE_SERVICE_ROLE_KEY y SUPABASE_ANON_KEY y nada cambia para nadie. Cuando Ricardo cree las nuevas, las funciones las toman solas en su siguiente arranque (docs/SUPABASE.md, Dominio propio, llaves nuevas y plan de pago)
- Si el plan b15 todavía no se había publicado en el proyecto real, b15 y b17 se corren seguidos. Las funciones suben dos veces y no pasa nada. Si ya se publicó b15, b17 es una versión más
- Los secretos se ponen con el archivo local private/b17-secrets.json, que no va al repo y solo lleva dos direcciones públicas. El archivo debe traer los dos nombres. La herramienta revisa la forma de cada valor, rechaza un APP_ORIGINS con una dirección de pages.dev, con ruta o con comodín, y no repite en pantalla ningún valor

```json
{
  "APP_URL": "https://tudominio.mx/",
  "APP_ORIGINS": "https://tudominio.mx,https://rickymm2001-dev.github.io"
}
```

```bash
npm run deploy:supabase -- --plan b17 --secrets-from private/b17-secrets.json --dry-run
npm run deploy:supabase -- --plan b17 --secrets-from private/b17-secrets.json --yes
```

- Poner secretos no vuelve a publicar nada. Las funciones los leen al momento
- Valores del día de la mudanza. APP_URL con la dirección nueva y APP_ORIGINS con la nueva y la vieja. A los 30 días, APP_ORIGINS solo con la nueva. ai-proxy solo lee APP_ORIGINS, así que la dirección nueva tiene que estar ahí
- Antes de la mudanza no hace falta poner nada. Si no existe APP_ORIGINS, las funciones dejan pasar solo el origen de APP_URL, como hasta hoy
- Lo que revisa scripts/deploy/b17.test.ts contra la API falsa. El plan no lleva migraciones, publica las trece con su verify_jwt, cada una con keys.ts y origins.ts, con --dry-run solo lee, volver a correrlo no aplica SQL, y los secretos se rechazan sin escribir ni mostrar valores cuando falta uno, sobra uno o la forma no es la del plan
- Regla de siempre. Un plan no deja una función de SQL más vieja que una migración posterior del repo. b17 no aplica SQL, así que no la rompe, pero si una migración nueva redefine una función que las de b17 llaman (por ejemplo checkout_context), esa migración va en el plan que publique la función que la usa

Para los bloques que siguen (ya pasó con B13 y con B14)

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
- check compara, columna por columna, el select que va después de la última línea de comentario que dice Comprobación en el archivo. Lo normal es un archivo de supabase/manual, pero también sirve en una migración, como la tercera de b14. Solo se acepta un select, y el plan debe nombrar justo las columnas que da, cuántas sean. Si el archivo gana una columna, por ejemplo borra_la_invitacion en la versión de pagos-b10.sql de B16, el plan no carga hasta que diga qué debe dar
- name cambia el nombre con el que queda registrado y recordedAs declara otros nombres con los que ya quedó, como los trozos del conector
- verifyJwt va en true para las funciones que llama la app con la sesión del alumno y en false para los avisos de Stripe y de Mercado Pago, que se identifican con su firma. Una prueba revisa que coincida con lo que dice el index.ts de cada función
- secrets son los nombres que espera --secrets-from, cada uno con pattern, la forma completa de su valor con ^ y $
- anonExecutable y overloads anotan, con su porqué, lo que la comprobación de la base aceptaría como excepción
- Hoy hay ocho
  - b9 solo publica admin-reset-mfa, porque su migración 20261020000001 ya está registrada como accounts_access y se salta
  - b10 es lo que falta de B10
  - b11 es el banco en la nube y bank-sync
  - b12 es la IA real. Cuatro migraciones, supabase/manual/ia-b12.sql con su comprobación y las funciones ai-proxy y ai-batch, que llevan verifyJwt en false. Sus secretos son APP_ORIGINS y AI_ALLOW_MOCK. La clave ENARM_ANTHROPIC_KEY la pone Ricardo directo en Supabase. La pieza del ciclo de lotes (supabase/manual/ia-lotes-cron.sql) no entra, porque se corre después de comprobar /health en modo simulado
  - b13 es Inglés médico. La migración 20261027000001 y bank-sync otra vez con la copia nueva del convertidor, sin verificar JWT. La migración también está en b11, y la que corra primero la aplica
  - b14 es datos y modelo del alumno. Las migraciones 20261028000001 a 20261028000003, sin archivo manual ni Edge Functions, con la comprobación de la estructura en la última. Las tres también están en b11, y las que corra primero las aplica
  - b15 es analítica, errores, recordatorios y recorrido. Las migraciones 20261029000001 a 20261029000004, sin archivo manual, con la comprobación de la estructura en la última, que es Borrar mis datos v4, y trece funciones. Las nuevas son send-emails, email-unsubscribe y analytics-flush (sin verificar JWT) y monitoring-test (verificando la sesión), y las nueve que ya existían se vuelven a publicar con withMonitoring. No espera secretos
  - b17 son los orígenes por secreto y las llaves nuevas de Supabase. Sin migraciones y con las mismas trece funciones de b15, cada una con su verify_jwt de siempre, que se vuelven a publicar con el código nuevo. Espera dos secretos, APP_URL y APP_ORIGINS, dos direcciones públicas
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
