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
- **Paso B11.5. Ya no pegas banco-b11.sql.** Con el token de Supabase (paso 4 de arriba) la sesión aplica las seis migraciones, la de Inglés médico de B13 que va en el mismo plan y la pieza de Borrar mis datos con npm run deploy:supabase -- --plan b11 y revisa su comprobación. Solo si el token no llega, pega supabase/manual/banco-b11.sql en SQL Editor después de ejecutar-en-sql-editor.sql
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

## Lo que salió de B12, la IA real

El servidor de IA, las funciones, los lotes, la auditoría de los médicos y las evaluaciones ya están con sus pruebas. Nada se ha desplegado ni llamado a Anthropic, y los alumnos no ven IA nueva hasta que la compuerta abra. Ninguno de estos pasos lleva llaves al chat. El detalle técnico está en docs/IA_ALOJADA.md y docs/SUPABASE.md.

- **Paso B12.1. Espacios de trabajo en Anthropic.** En platform.claude.com crea dos, Studiare producción y Studiare evaluaciones, cada uno con un límite de gasto mensual. Recomendado 160 dólares en producción y 40 en evaluaciones. Carga saldo, con 50 dólares alcanza para empezar. Es la respuesta 33
- **Paso B12.2. Clave de producción.** En Settings, API keys, crea una clave dentro de Studiare producción. No la pegues en ningún chat. En Supabase, Edge Functions, Secrets, agrega ENARM_ANTHROPIC_KEY con esa clave. Después avísale a la sesión que ya está puesta
- **Paso B12.3. Subirlo a Supabase.** Con tu autorización escrita en el chat para escribir en el proyecto, la sesión corre primero npm run deploy:supabase -- --plan b12 --dry-run y después sin él. Aplica ai_proxy_v2, ai_jobs, ai_gate y ai_delete_my_data, la pieza ia-b12.sql, publica ai-proxy y ai-batch y pone APP_ORIGINS y AI_ALLOW_MOCK. Luego revisa que /health conteste en modo simulado y programa el ciclo de lotes y la limpieza diaria con supabase/manual/ia-lotes-cron.sql. Con tu clave puesta pasa a modo real, quita AI_ALLOW_MOCK y hace una llamada de prueba como médico. Ya no pegas la pieza 4 de ejecutar-en-sql-editor.sql. Solo si el token no llega, pega supabase/manual/ia-b12.sql en el SQL Editor
- **Paso B12.4. Evaluaciones.** Cuando quieras gastar, crea otra clave dentro de Studiare evaluaciones y ponla como ENARM_ANTHROPIC_KEY en los secretos del entorno de la sesión y abre una sesión nueva, porque los secretos solo se leen al abrirla. Para comparar con OpenAI crea un proyecto Studiare evaluaciones con límite de 10 dólares, pon su clave solo como ENARM_OPENAI_KEY y agrega api.openai.com a Allowed domains. La sesión corre en orden npm run eval-ai (gratis), la lista de modelos (gratis), una prueba chica de centavos, la matriz de 10 a 20 dólares, el lote de prueba que tarda hasta una hora y la comparación con OpenAI de menos de 5 dólares. Escribe el reporte en docs/eval-ai-report.md y aplica los modelos elegidos. No se corre nada real sin tu aviso
- **Paso B12.5. Los dos médicos y la compuerta.** Dales rol de médico en Admin, Usuarios, con su segundo factor. Cuando la sesión te avise que la muestra de 300 textos está cargada, cada uno entra a Auditoría de la IA y califica a ciegas, de 5 a 6 horas en partes. Acuerda con ellos el pago de esta auditoría, que no es el pago por pregunta revisada. Si alguno marca un error grave decides tú con ellos. Cuando la pantalla diga que un motor pasó, ábrelo desde ahí con tu cuenta de admin. Cada cambio de modelo o de prompt de un motor pide una auditoría corta de 60 textos antes de volver a los alumnos
- **Paso B12.6. Confirmar los mínimos de la compuerta.** Para abrir un motor hacen falta 60 textos calificados en hipótesis y tarjetas, 40 en consejos y 30 en informes y reestructuradas. Cámbialos con minItems antes de empezar la auditoría, nunca después de ver resultados
- **Paso B12.7. Tu prompt maestro de tarjetas.** Si lo tienes, pégalo en prompts/flashcards_maestro.md. Ese motor necesita entonces su auditoría corta

Decisiones de B12 que esperan tu visto bueno, con la opción recomendada ya tomada. Tope de 0.30 dólares por alumno al día (10.6), compuerta atada al modelo y al prompt (10.12), dos espacios de trabajo (10.21), qué hacer si ningún modelo pasa en tarjetas (10.23), pago de la auditoría (10.24) y api.openai.com en la red de la sesión (10.25).

## Lo que salió de B13, inglés médico

El servidor, el convertidor del Sheet y los scripts de contenido ya están con sus pruebas. Todo queda apagado hasta tus pasos, porque el inglés se abre con la misma bandera cloudBank que el resto del banco. El detalle técnico y la guía para los médicos están en docs/INGLES_MEDICO.md y docs/SHEET_DEL_BANCO.md. Ninguno de estos pasos lleva llaves al chat.

- **Paso B13.1. Red de la sesión (unos 5 minutos).** En el menú del entorno, Edit, Network access, agrega a Allowed domains medlineplus.gov, www.ncbi.nlm.nih.gov, pmc.ncbi.nlm.nih.gov y eutils.ncbi.nlm.nih.gov. Sirven para el vocabulario y para preparar textos con licencia. Sin ellos, los scripts quedan listos y la sesión te pide que bajes a mano el archivo XML de temas de salud de MedlinePlus, de https://medlineplus.gov/xml.html. Los dominios nuevos solo se leen al abrir una sesión
- **Paso B13.2. Tu Sheet.**
  1. Agrega tres columnas al final, Fuente del texto, Licencia del texto y Enlace del texto. El orden no importa
  2. Copia la lista Licencia del texto desde la pestaña Listas que deja la sesión (`npm run bank:sheet-lists`), como en B11, y úsala como validación de la columna Licencia del texto
  3. Reemplaza el texto de la pestaña Instrucciones con el de docs/SHEET_DEL_BANCO.md, que ya trae lo del inglés
  4. Los médicos escriben los casos de inglés en la misma pestaña Preguntas, con Rama troncal Inglés médico, Subespecialidad Comprensión de lectura, el Subtema de la rama clínica de la que trata el texto, Idioma Inglés, Caso y Orden. El texto va en Caso clínico del Orden 1
  5. Para textos con licencia, la sesión les deja Studiare-ingles-textos.xlsx con los textos, la fuente y la licencia ya llenos (`npm run english:passages`), y ellos escriben las preguntas. Primero los médicos eligen los textos y los anotan en content-drafts/ingles/textos.json, con la forma que está en docs/INGLES_MEDICO.md
  6. La meta es 30 reactivos aprobados, unos 12 casos, para la parte del examen, y más para que la práctica no repita
- **Paso B13.3. Mazo de vocabulario.** La sesión dejó listo `npm run english:vocabulary`, pero todavía no generó el mazo, porque necesita el XML de temas de salud de MedlinePlus y esta sesión no abre medlineplus.gov. Con el paso B13.1 hecho, la sesión baja el archivo y lo genera. Si prefieres hacerlo tú, bájalo de https://medlineplus.gov/xml.html, déjalo en una carpeta y pásale la ruta a la sesión. Cuando la sesión te avise, súbelo en Studiare, Administración, Catálogo de mazos, Subir mazo, y confirma la autorización con la nota "Dominio público, MedlinePlus.gov"
- **Paso B13.4. Lo que te toca confirmar.**
  - Si en el ENARM la pregunta y las opciones de la parte en inglés van en inglés o en español (8.2). Hoy van en inglés, igual que el texto
  - Si el inglés va mezclado por casos o en bloque al final del examen (8.4). Hoy va mezclado y cambiarlo es una constante
  - Las licencias aceptadas, con tu abogado (8.8). Hoy son Texto propio, Dominio público, CC0, CC BY y CC BY-SA, y nada con NC ni ND
- **Paso B13.5. Prender el inglés.** La bandera medicalEnglish nace apagada en producción y prendida en desarrollo y en la demo, porque sin casos publicados ni mazo de vocabulario las tarjetas de Simular y de Progreso y la casilla del examen solo dirían Sin textos. Apagada, el examen completo es solo en español. Cuando haya casos aprobados en el catálogo y el mazo de vocabulario subido (pasos B13.2 y B13.3), prende la bandera con la consulta de googleSignIn de docs/SUPABASE.md, cambiando el nombre por medicalEnglish, y recarga la app

Lo que hace la sesión después, sin pedirte nada más. Aplica la migración 20261027000001_english_section.sql al fusionar el bloque, con la misma herramienta de despliegue (npm run deploy:supabase -- --plan b13, después de b11), vuelve a publicar bank-sync con la copia nueva del convertidor y revisa por huella las funciones que la migración cambia. El plan b11 lleva esa misma migración y la que corra primero la aplica (docs/DESPLIEGUE.md, B11 y B13). Con el banco cerrado, los alumnos siguen con la demo, que no trae textos en inglés. Los casos de inglés aprobados esperan en el catálogo hasta que abras el banco (paso B11.9).

Decisiones de B13 que esperan tu visto bueno, con la opción recomendada ya tomada. Contenido de demostración en inglés, sin textos ni preguntas hechos por IA (8.1), tiempo de 90 segundos por reactivo de inglés (8.3), vocabulario de MedlinePlus en el catálogo de pago con vista previa en Gratis (8.16), la meta de 30 de inglés aparte de la de 300 (8.17), prioridad a los resúmenes CC BY de PubMed Central (8.19) y el falso cognado como sesgo nuevo, que se propone sin sembrar (8.9). Lo demás de la sección 8 del plan de B13 es editable y se queda como está hasta que digas otra cosa.

Lo que no está todavía. El mazo de vocabulario (src/demo/content/decks/vocabulario-ingles.json) y cualquier texto con licencia, porque los scripts necesitan los archivos reales. Los scripts se probaron con archivos de muestra con la marca [Prueba], así que la primera corrida real se revisa a mano.

## Lo que salió de B14, datos y modelo del alumno

El servidor de la calibración nocturna, sus motores y sus pruebas ya están, junto con el flujo de GitHub que la corre cada noche. Nada se ha aplicado ni lanzado en el proyecto real y la calibración nace apagada y en solo reporte. Ninguno de estos pasos lleva llaves al chat. El detalle técnico está en docs/CALIBRACION.md y docs/SUPABASE.md.

La llave de la calibración te toca a ti, unos 5 minutos.

- **Paso B14.1. Crea la llave secreta.** En Supabase abre el proyecto Studiare, Project Settings, API Keys, pestaña Publishable and secret API keys. Si ves el botón Create new API keys, dale clic. Es seguro y no apaga las llaves de hoy. En la parte de llaves secretas agrega una llave nueva con el nombre calibracion-nocturna y cópiala
- **Paso B14.2. Guárdala en GitHub.** En tu repo Studiare-ENARM abre Settings, Secrets and variables, Actions, pestaña Secrets, New repository secret. Nombre SUPABASE_CALIBRATION_KEY. Pega la llave y guarda. Va como secreto del repositorio y no de un environment, para que siga funcionando cuando el repo pase a privado
- **Paso B14.3. No la pegues en el chat ni en ningún archivo.** Si se filtra, crea otra igual, cámbiala en GitHub y revoca la vieja en Supabase. Recomendado rotarla cada año
- **Paso B14.4. La dirección del proyecto ya existe.** Es la variable VITE_SUPABASE_URL, que usa la publicación de la demo. No tienes que crear nada
- **Paso B14.5. Marca el autotest como requisito de fusión.** En GitHub, Settings, Branches, la regla de main, agrega el trabajo calibration de check.yml a los que ya pides, check, e2e y audit
- **Paso B14.6. Avisa a la sesión.** Antes de este paso resuelve con tu abogado lo del permiso dado con el texto corto, que está más abajo en Con tu abogado. Prender la calibración espera esa decisión. Ella prende la calibración en solo reporte, lanza la primera corrida y te dice los conteos. Antes de lanzar se esperan cero o pocos alumnos con permiso y todo en calibrando, y eso es correcto

Si GitHub apaga la calibración.

- Mientras el repo sea público, GitHub apaga lo programado después de 60 días sin actividad en el repo
- Si la pantalla Calibración avisa que no ha corrido, entra a GitHub, Actions, calibration y dale Enable workflow
- Los correos de falla de lo programado le llegan a quien editó la línea del horario por última vez

Con tu abogado.

- El texto nuevo del permiso y si cambia el nombre de Mejora anónima
- Si quien no da el permiso puede ver su percentil, que es la pregunta 5 que dejó B16
- Si quien ya lo dio con el texto corto debe confirmarlo otra vez. La calibración solo cuenta el permiso dado con la versión 2026-10-15b del aviso o posterior
- **Esta decisión frena el paso B14.6.** B14 reescribe la pista del permiso, que ahora cubre la calibración de la dificultad, el aviso a médicos y la comparación por percentiles, pero no sube la versión del aviso. Sigue en 2026-10-15b. Por eso quien dio el permiso con la pista corta (mejorar el banco y revisar fallas) ya cuenta para la calibración y para la comparación en cuanto se prenda. El código ya soporta las dos respuestas. Si tu abogado dice que deben confirmarlo otra vez, la sesión sube PRIVACY_NOTICE_VERSION (src/config/legal.ts) y model_settings.calibration.minNoticeVersion a la misma versión nueva antes de prender, y el permiso viejo deja de contar hasta que cada alumno lo confirme. Si dice que no hace falta, se prende como está. Mientras decides, la calibración se queda apagada y no sale nada de nadie. Recomendado confirmarlo otra vez, porque es lo que pedía el plan 6.3 y cuesta poco antes de tener alumnos reales

Decisiones de B14 que esperan tu visto bueno, con la opción recomendada ya tomada. La llave como secreto del repositorio y solo en main (10.2), el permiso dado con el texto corto (10.5), el percentil para quien no da el permiso (10.7), comparación y modo adaptativo abiertos en Gratis (10.10 y 10.15), examen en curso y textos de la IA entre dispositivos (10.18 y 10.19), reestructuradas automáticas de noche (10.30), un correo al día por médico con las opciones que casi nadie elige (10.31) y la hora de la corrida, 4 con 23 minutos de la mañana en Mérida (10.24).

Lo que hace la sesión con el conector, sin pedirte nada más.

1. Aplica 20261028000001 a 20261028000003 en orden con la herramienta de despliegue (npm run deploy:supabase -- --plan b14, después de b11, b12 y b13). No hay archivo manual ni Edge Functions. El plan b11 lleva las mismas tres y la que corra primero las aplica (docs/DESPLIEGUE.md, B11 y B14)
2. Revisa la estructura y los permisos de las funciones. El plan corre solo la consulta de docs/SUPABASE.md, sección Datos y modelo del alumno (B14), y la sesión lee aparte si la calibración está encendida
3. Con tu aviso de la llave, prende model_settings.calibration.enabled en solo reporte y lanza el flujo calibration con Run workflow
4. Lee solo calibration_runs, sus conteos y códigos, y los anota en PROGRESS.md
5. Pasa a Publicar tras dos noches limpias, y lo anota

## Lo que salió de B15, analítica, errores y recordatorios

El servidor de los correos, de la analítica y de las alertas ya está, con el interruptor de cada uno. Nada se ha aplicado ni lanzado en el proyecto real y todo nace apagado. Las cuentas de PostHog, Sentry y Resend todavía no existen y el producto funciona completo sin ellas. Ningún paso lleva llaves al chat, cada llave va directo al servicio o a los secretos. El detalle técnico está en docs/CORREOS.md, docs/ALERTAS.md y docs/SUPABASE.md.

Una aclaración sobre las variables de GitHub. El flujo de GitHub Pages (.github/workflows/pages.yml) ya las pasa al build, que son VITE_POSTHOG_KEY, VITE_POSTHOG_HOST, VITE_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT y, como secreto, SENTRY_AUTH_TOKEN. Pero esa publicación es la demo, y en la demo la medición de uso y los avisos de errores del navegador nacen apagados por diseño, así que ahí no verás efecto aunque las pongas. Se ven cuando la app de producción se publique con el flujo de B17 en Cloudflare, que pasa las mismas variables desde GitHub. No se repiten en Cloudflare.

Lo que hace la sesión con el conector, sin pedirte nada más.

1. Con el token de Supabase corre npm run deploy:supabase -- --plan b15 --dry-run y después sin él. Aplica 20261029000001 a 20261029000004 en orden. Las tres primeras no llevan delete ni drop y la cuarta es Borrar mis datos v4, que lleva delete y por eso no la aplica el conector
2. El mismo plan despliega send-emails, email-unsubscribe y analytics-flush sin verificación de JWT y monitoring-test con ella, y vuelve a desplegar las nueve funciones de siempre, que ahora van envueltas con el aviso a Sentry
3. Hace la prueba de humo sin llaves de docs/SUPABASE.md. email-unsubscribe responde 200 en blanco a una ficha falsa y send-emails responde 401 sin la ficha
4. Revisa los permisos con la consulta de docs/SUPABASE.md, sección Recordatorios, analítica y alertas (B15)

Lo primero que te toca.

- **Paso B15.1. Ya no pegas Borrar mis datos v4.** Con el token de Supabase, la sesión la aplica con el plan b15, como la cuarta migración, y revisa con la consulta de comprobación de docs/SUPABASE.md que borrar_mis_datos_b15 dé true. Solo si el token no llega, abre Supabase, SQL Editor, New query, pega completo supabase/migrations/20261029000004_delete_my_data_v4.sql y dale Run. Es repetible. Sin ella todo funciona, pero Borrar mis datos no quita los recordatorios ni el ID de la analítica del alumno

PostHog, unos 10 minutos. Prende la medición de uso, que cada alumno además tiene que dar por su cuenta.

- **Paso B15.2. Crea la cuenta.** En posthog.com crea tu cuenta y un proyecto llamado Studiare en la nube de EE. UU. (recomendado, más cerca de México)
- **Paso B15.3. Cierra lo que no se usa.** En Project settings activa Discard client IP data (que no guarde la IP) y deja apagadas la grabación de sesiones, las encuestas y la autocaptura. La app no usa ninguna
- **Paso B15.4. Copia la llave y la dirección.** Son la llave del proyecto, la que empieza con phc_, y la dirección de captura, https://us.i.posthog.com. Ponlas en GitHub, Settings, Secrets and variables, Actions, pestaña Variables, como VITE_POSTHOG_KEY y VITE_POSTHOG_HOST. Solo en GitHub, porque la publicación de B17 construye la página allí y no se repiten en Cloudflare. Ponlas también en Supabase, Edge Functions, Secrets, como POSTHOG_PROJECT_KEY y POSTHOG_HOST
- **Paso B15.5. Nunca crees una llave personal.** La que empieza con phx_ no se usa para la app, y las funciones la rechazan
- **Paso B15.6. Avisa a la sesión.** Ella prende analytics en el servidor, revisa que lleguen eventos de su cuenta de prueba con el permiso y te deja el embudo escrito en docs/ANALITICA.md para que lo armes en Insights, Funnel

Sentry, unos 15 minutos. Prende los avisos de errores.

- **Paso B15.7. Crea la cuenta.** En sentry.io con el plan Developer, que es gratis, y dos proyectos. studiare-web (Browser JavaScript) y studiare-funciones
- **Paso B15.8. Protege los datos.** En cada proyecto, Settings, Security & Privacy, prende Prevent Storing of IP Addresses y la limpieza de datos del servidor
- **Paso B15.9. Copia los dos DSN.** El de studiare-web va a GitHub como VITE_SENTRY_DSN, solo allí y no en Cloudflare. El de studiare-funciones va a Supabase, Edge Functions, Secrets, como SENTRY_DSN
- **Paso B15.10. Crea la regla de alerta.** En Alerts crea una regla para cada proyecto. Cuando se cree un problema nuevo o regrese uno resuelto, que mande un correo a tu cuenta
- **Paso B15.11. Para subir los mapas de código.** Crea un token de organización y guárdalo en GitHub, Settings, Secrets and variables, Actions, pestaña Secrets, como SENTRY_AUTH_TOKEN. Pon SENTRY_ORG y SENTRY_PROJECT en la pestaña Variables. Los mapas se suben en cualquier build que tenga las tres, y solo sirven cuando ese build es el de producción
- **Paso B15.12. Avisa a la sesión.** Ella prende errorMonitoring si hiciera falta y tú tocas Mandar error de prueba en Plataforma, Correos y alertas. Deben llegarte dos correos de Sentry, uno del navegador y otro de las funciones

Resend, unos 15 minutos, junto con B17. Prende los correos.

- **Paso B15.13. Crea la cuenta y el dominio.** En resend.com crea tu cuenta, agrega tu dominio y pon en tu DNS los registros que te da (SPF, DKIM y DMARC). Hasta que el dominio esté verificado, Resend solo deja mandar a tu propio correo
- **Paso B15.14. Crea la llave.** Una llave de API con permiso solo de envío y solo para tu dominio. Pégala en Supabase, Edge Functions, Secrets, como RESEND_API_KEY
- **Paso B15.15. Pon el remitente y el soporte.** EMAIL_FROM, por ejemplo Studiare con la dirección de los recordatorios en tu dominio, y SUPPORT_EMAIL con tu correo de soporte, en los mismos secretos
- **Paso B15.16. Decide el plan.** El gratis da 3,000 correos al mes y, según terceros, 100 al día. Alcanza para unos 80 alumnos con recordatorios diarios. Pro cuesta 20 dólares al mes con 50,000. Recomendado empezar en el gratis con los primeros aspirantes y pasar a Pro antes de abrir el registro
- **Paso B15.17. Avisa a la sesión.** Ella manda un correo de cada tipo a tu cuenta de prueba. Con eso conforme, tú prendes Mandar los correos de la cola en Plataforma, Correos y alertas, y la sesión prende la bandera emailReminders para que el alumno vea la sección en Ajustes del repaso

Decisiones de B15 que esperan tu visto bueno, con la opción recomendada ya tomada.

- La región de PostHog, EE. UU.
- Los errores del navegador siguen saliendo solo con el permiso de mejora anónima. Mandarlos sin permiso, con los datos ya limpios, es una línea, pero lo debe ver tu abogado
- El plan de Resend, empezar en el gratis
- El recorrido solo para cuentas nuevas de alumno
- El aviso de privacidad con la finalidad Medición de uso y PostHog, Sentry y Resend como encargados. Va en borrador para tu abogado
- Borrar datos en PostHog al eliminar una cuenta. Recomendado no usar su API de borrado, que pide una llave personal con permisos amplios. Al borrar la cuenta se borra el ID en la base y lo que quedó en PostHog ya no se puede ligar a nadie

## Lo que salió de B16, legal y privacidad

El aviso de privacidad y los términos quedaron al día (el aviso en la versión 2026-10-15b y los términos en la 2026-10-15), todavía como borrador para revisión del abogado. La lista de cambios, las preguntas para el abogado y las tuyas están en docs/legal/CAMBIOS-B16.md.

- **Los datos del responsable** (pregunta 43). Mientras falten, el alumno lee un texto neutro y el abogado ve la marca de lo que falta. Ponlos en GitHub, Settings, Secrets and variables, Actions, pestaña Variables. Solo en GitHub, porque la publicación de B17 construye la página allí y no se repiten en Cloudflare. Son públicos por diseño
  - VITE_LEGAL_NAME con Plexus Medica S. de R.L. de C.V.
  - VITE_LEGAL_ADDRESS con el domicilio de la empresa, cuando lo confirme tu contador
  - VITE_PRIVACY_EMAIL con el correo de privacidad, por ejemplo privacidad arroba tu dominio
  - VITE_SUPPORT_EMAIL con el correo de soporte. Si quieres un solo buzón, pon solo este y el aviso lo usa también para privacidad
  - Después corre la publicación en Actions, con el flujo pages y Run workflow
- **Manda los textos a tu abogado** (respuesta 44). Son docs/legal/aviso-de-privacidad.md, docs/legal/terminos-y-condiciones.md y docs/legal/CAMBIOS-B16.md. La marca de borrador se quita solo cuando me digas que los aprobó
- **Contesta las cinco preguntas de CAMBIOS-B16.md**, sección Preguntas para Ricardo. Entre ellas con qué sistema emitirás las facturas y cómo le pedirás al alumno su cuenta para devolverle una garantía pagada en OXXO

## Lo que salió de B17, publicación en tu dominio

El código y los documentos de B17 ya están y se probaron con servicios simulados. Todo queda apagado hasta tus pasos. Cloudflare no publica nada hasta que pongas la variable CLOUDFLARE_DEPLOY en true, y las funciones de Supabase salen con las llaves de siempre, así que nada cambia para nadie hasta que hagas tu parte. Está escrito para alguien que nunca ha hecho esto. Los nombres de los menús son los de la documentación de cada servicio y pueden cambiar un poco. Si no encuentras uno, dime lo que ves en pantalla. Ningún paso lleva llaves al chat, cada llave se pega directo en el servicio. Los avisos de la sesión que dicen ya quedó son de lo que ella puede comprobar sin llaves. El detalle de cada servicio está en docs/DOMINIO_Y_CORREO.md, docs/PUBLICACION.md, docs/SUPABASE.md, docs/DESPLIEGUE.md y docs/STRIPE.md. En todos los pasos tu dominio se escribe tudominio.mx, y se pone siempre sin www.

Antes de empezar.

- **Paso B17.1. Seguridad de tus cuentas, unos 10 minutos.** Activa la verificación en dos pasos en GitHub, Supabase, Cloudflare, Stripe, Resend y en la cuenta donde compraste el dominio. Guarda los códigos de respaldo en tu gestor de contraseñas. Con esas cuentas se publica, se cobra y se manda correo en tu nombre
- **Paso B17.2. Dime tu dominio en el chat.** Por ejemplo tudominio.mx, en qué empresa lo compraste y si ya tiene correo (Gmail, Google Workspace, Zoho, el del mismo registrador o ninguno). Eso decide los pasos B17.3 y B17.16. No pegues contraseñas

Cloudflare, unos 45 minutos más la espera. Cloudflare es quien entrega la página en tu dominio y administra su DNS, que es la libreta que dice a dónde va cada nombre.

- **Paso B17.3. Agrega tu dominio.** Entra a dash.cloudflare.com, Domains, Onboard a domain, escribe tu dominio sin www y elige el plan Free. Revisa la lista de registros DNS que Cloudflare encontró y compárala con la del lugar donde compraste el dominio. Presta atención a los registros MX y TXT, que son los del correo, y no borres ninguno. Cloudflare te da dos nameservers. En el lugar donde compraste el dominio, apaga DNSSEC si estaba prendido, quita los nameservers que tiene y pon esos dos, copiados exactamente. Llega un correo de Cloudflare cuando el dominio queda Active, hasta 24 horas después. Mientras tanto nada se rompe. Si tu dominio ya estaba en Cloudflare, salta este paso
- **Paso B17.4. Crea el token que usará GitHub, unos 5 minutos.** Un token es una llave con permisos limitados. En Cloudflare abre API Tokens (en Manage Account, Account API Tokens), Create Token, Custom token, Get started. Nombre studiare-github. En Permissions elige Account, Cloudflare Pages, Edit. En Account Resources elige tu cuenta. Continue to summary, Create Token. El valor se muestra una sola vez. Cópialo y pásalo al paso B17.5 enseguida, no lo guardes en ningún otro lado. Si se filtra, lo único que alguien puede hacer es publicar en Pages, y se revoca en el panel en un minuto. Tu Account ID está en Overview de tu dominio, columna derecha, sección API
- **Paso B17.5. Pon los secretos y variables en GitHub.** En el repositorio, Settings, Secrets and variables, Actions. En la pestaña Secrets, New repository secret, crea CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID. En la pestaña Variables, New repository variable, crea CLOUDFLARE_PAGES_PROJECT con el valor studiare y SITE_URL con https://tudominio.mx sin diagonal al final. Al último crea CLOUDFLARE_DEPLOY con true, que es lo que prende el despliegue. Las variables VITE_ que ya tienes (Supabase, PostHog, Sentry y los datos legales) se quedan como están y solo viven en GitHub
- **Paso B17.6. Crea el proyecto.** En GitHub abre Actions, el flujo cloudflare, Run workflow, marca Crear el proyecto y toca Run workflow. Espera la palomita verde. Si sale en rojo, copia el mensaje y dímelo. Se crea desde GitHub y no desde una sesión, porque Cloudflare convierte en proyecto de Workers lo que crea un agente de IA, y tú elegiste Pages
- **Paso B17.7. Primera publicación.** Run workflow otra vez sin marcar nada, o cualquier push a main. En el resumen del flujo está una dirección que termina en pages.dev. Ábrela, debe abrir Studiare. La sesión corre la prueba de humo y te dice si está en verde
- **Paso B17.8. Pon tu dominio en el proyecto.** En Cloudflare abre Workers & Pages, el proyecto studiare, Custom domains, Set up a domain, escribe tu dominio y toca Continue. Confirma el registro que propone. Espera a que diga Active
- **Paso B17.9. Que www lleve al dominio sin www.** En el DNS de tu dominio agrega un registro tipo A, nombre www, dirección 192.0.2.1 y Proxy status en Proxied. Luego, Rules, Create rule, Redirect Rule, la plantilla Redirect from WWW to root (o patrón https://www.*, destino https://${1}, código 301, conservar la consulta) y Deploy. Se redirige y no se sirve en los dos, porque cada dirección tiene sus propios datos guardados en el navegador
- **Paso B17.10. Que http lleve a https.** En SSL/TLS, Edge Certificates, Always Use HTTPS en On
- **Paso B17.11. Apaga lo que no queremos.** En el panel de la zona, Rocket Loader y Auto Minify en Off si los ves, Web Analytics apagado, y no actives HSTS ahí, porque el sitio ya lo manda. No agregues reglas de caché. Estas cosas cambian el HTML o meten scripts, y chocan con la política de seguridad y con el aviso de privacidad

Supabase.

- **Paso B17.12. Plan de pago, antes de invitar a los 5 (B18).** En supabase.com, tu organización, Billing, Upgrade a Pro. Deja el tope de gasto prendido. Da copias diarias, no pausa el proyecto y abre la protección de contraseñas filtradas. Es un gasto y lo decides tú. Después, en Authentication, Sign In / Providers, Email, prende Prevent use of leaked passwords y pon el largo mínimo en 8. En Database, Settings, SSL Configuration, prende Enforce SSL. En Organization, Team, agrega a una segunda persona de confianza como dueña, para no quedarte fuera si se pierde una cuenta
- **Paso B17.13. Direcciones de regreso, el día de la mudanza.** Authentication, URL Configuration. En Site URL pon https://tudominio.mx/. En Redirect URLs deja http://localhost:5173/**, agrega https://tudominio.mx/ y, por 30 días, https://rickymm2001-dev.github.io/Studiare-ENARM/. Nunca pongas un comodín sobre pages.dev. Si me avisas, la sesión puede ponerlas por ti con el token de Supabase

Correo propio con Resend, unos 30 minutos más la espera del DNS. Resend es quien manda el código de acceso desde tu dominio.

- **Paso B17.14. Dominio en Resend.** Crea la cuenta en resend.com, Domains, Add Domain, y escribe mail.tudominio.mx, que es un subdominio y no el dominio solo. Resend te muestra una tabla de registros. En Cloudflare, DNS, Add record, copia cada uno exactamente como aparece, con el proxy apagado (nube gris). Si Resend dice que omitas el dominio al pegar el nombre, escribe solo send o resend._domainkey, como lo muestra. Luego, en Resend, Verify DNS Records. Tarda desde minutos hasta unas horas. Después, agrega un registro TXT con nombre _dmarc y valor v=DMARC1; p=none; rua=mailto:tu correo. Si ya existe un _dmarc, edítalo y no crees otro
- **Paso B17.15. Llaves y SMTP.** En Resend, API Keys, crea dos llaves con permiso de envío (Sending access) y solo para ese dominio. Llámalas supabase-smtp y funciones. La segunda la pegas tú en Supabase, Edge Functions, Secrets, como RESEND_API_KEY (B15). La primera va en Supabase, Authentication, SMTP Settings. Enable Custom SMTP, Sender email no-responder@mail.tudominio.mx, Sender name Studiare, Host smtp.resend.com, Port 465, Username resend y Password la llave supabase-smtp. Save. Mándate un código de acceso a tu Gmail, abre el correo, Mostrar original, y confirma que dice SPF PASS, DKIM PASS y DMARC PASS. Si Supabase te dice que llegaste al tope de correos por hora, es el límite de 30 que pone al guardar, y se sube en Authentication, Rate Limits. Los mismos pasos, con más explicación, están en docs/DOMINIO_Y_CORREO.md
- **Paso B17.16. Buzones de privacidad y soporte.** Crea privacidad@tudominio.mx y soporte@tudominio.mx. Si tu dominio no tiene correo, lo más simple es Cloudflare Email Routing (Email, Email Routing, Get started), que reenvía esas dos direcciones a tu Gmail gratis y agrega los registros MX por ti. Si ya tiene correo, no lo actives y crea las dos direcciones en tu proveedor, porque los dos usan los mismos registros MX. Después ponlas en GitHub, Variables, como VITE_PRIVACY_EMAIL y VITE_SUPPORT_EMAIL, junto con VITE_LEGAL_NAME y VITE_LEGAL_ADDRESS (B16) y vuelve a publicar con Run workflow. Pon también el de soporte en Supabase, Edge Functions, Secrets, como SUPPORT_EMAIL, y en EMAIL_FROM el remitente de tu subdominio, por ejemplo Studiare, no-responder@mail.tudominio.mx

Llaves nuevas de Supabase.

- **Paso B17.17. Antes de que termine 2026.** Supabase retira las llaves anon y service_role a fin de año y las reemplazan las llaves sb_publishable_ y sb_secret_. Las funciones ya aceptan las dos formas. En Supabase, Project Settings, API Keys, pestaña Publishable and secret API keys, Create new API keys. Es seguro y no apaga las llaves de hoy. Copia la llave sb_publishable_ y pégala como el valor de la variable VITE_SUPABASE_ANON_KEY de GitHub (el mismo nombre) y vuelve a publicar. Avísame para que la sesión revise el sitio y publique las funciones con el plan b17. Cuando todo funcione y la sesión te lo diga, en esa misma página desactiva las llaves anon y service_role. Se pueden volver a activar si algo falla. No pegues ninguna llave en el chat. Si se deja para B19, el riesgo es una caída a fin de año el mismo mes del lanzamiento

Stripe y Google.

- **Paso B17.18. Dominio de pagos, en modo prueba.** Cuando el dominio esté activo, la sesión lo registra en Stripe con la llave restringida de prueba y te dice el estado de Apple Pay y Google Pay. Si Apple Pay queda inactivo, en Stripe abre Settings, Payment method domains, tu dominio, Apple Pay, y baja el archivo. Pásaselo a la sesión (no es secreto). Ella lo publica y lo valida. En modo real se repite con la llave real (B19). La sesión también corre scripts/stripe/setup-test.ts con --app-url=https://tudominio.mx/ para que el portal de Stripe regrese a la dirección nueva. En Stripe, Settings, Public details, pon el sitio web de la empresa
- **Paso B17.19. Google Cloud.** En tu proyecto Studiare, pantalla de consentimiento de OAuth, agrega tudominio.mx como dominio autorizado. La dirección de regreso de Supabase no cambia

Pruebas en tus teléfonos y mudanza.

- **Paso B17.20. Billeteras.** Cuando la sesión te avise que está lista, prueba en modo prueba. En tu iPhone con Safari y una tarjeta guardada en Wallet, y en un Android con Chrome y una tarjeta real guardada en Google Wallet, entra a Suscripción, elige Tarjeta y sigue la tabla W1 a W8 de docs/STRIPE.md. Antes, en GitHub, Settings, Secrets and variables, Actions, Variables, crea VITE_STRIPE_PUBLISHABLE_KEY con la llave publicable de prueba de Stripe (empieza con pk_test_, es pública y no es secreta, está en Stripe, Developers, API keys) y vuelve a publicar. Sin esa variable la sección de billeteras no aparece aunque la bandera esté prendida. En modo prueba no se cobra la tarjeta real. Si todo sale bien, la sesión prende la bandera expressWallets. Si algo falla, se queda apagada y no pasa nada
- **Paso B17.21. Mudanza de GitHub Pages.** Catorce días antes, pon en GitHub las variables VITE_MOVED_TO (https://tudominio.mx) y VITE_MOVED_ON (la fecha de la mudanza, como 2026-12-15) y corre el flujo pages. El día de la mudanza, pon la variable PAGES_MOVED_TO con https://tudominio.mx y corre pages otra vez. Ese día la sesión también cambia APP_URL y APP_ORIGINS con npm run deploy:supabase -- --plan b17 --secrets-from private/b17-secrets.json (docs/DESPLIEGUE.md). Treinta días después, quita el origen viejo de Supabase (paso B17.13) y avísame para quitarlo de APP_ORIGINS
- **Paso B17.22. Cierre, 30 días después.** En Cloudflare, borra el proyecto enarm-prototipo (Workers & Pages, el proyecto, Settings, Delete project) o desconéctalo del repositorio. En GitHub, Settings, Pages, deja de publicar el sitio y después haz privado el repositorio (Settings, Danger zone, Change visibility), como pediste en la respuesta 48. Avísame para quitar del aviso de privacidad que GitHub aloja la página y subir su versión

Decisiones de B17 que esperan tu visto bueno, con la opción recomendada ya tomada.

- Publicar con GitHub Actions y carga directa, en un proyecto nuevo llamado studiare, y seguir con Pages y no con Workers (11.1 a 11.3 del plan de B17)
- El dominio sin www para la app y la portada, con www redirigiendo (11.4)
- Las billeteras de Apple Pay y Google Pay construidas y apagadas, sin campo de código de descuento en esa pantalla (11.6)
- Los buzones de privacidad y soporte, empezando con el reenvío gratis de Cloudflare a tu Gmail si tu dominio no tiene correo, y pasando a un buzón real antes de abrir el registro (11.8)
- El aviso de privacidad con Cloudflare, GitHub y el componente de Stripe, en borrador para tu abogado (docs/legal/CAMBIOS-B17.md). **Sube a la versión 2026-10-22.** Recomendado subirla, porque el texto cambió y todavía no hay alumnos reales. Si prefieres esperar al día de la mudanza, dímelo y se revierte ese commit
- Un aviso de 14 días en la demo y un sitio de mudanza por 30 días, sin importar datos entre dominios (11.10)
- Las llaves nuevas de Supabase dentro de B17, con el código aceptando las dos formas y las viejas desactivadas solo después de probar (11.11)
- Supabase de pago antes de invitar a los 5 aspirantes (11.16). Es un gasto y lo decides tú
- Una dirección de pages.dev nunca se acepta en APP_ORIGINS ni en las direcciones de regreso de Supabase. Cualquiera puede publicar una página en un subdominio de pages.dev
- scripts/stripe/setup-test.ts ya no trae una dirección por omisión, y hay que pasarle --app-url o la variable APP_URL

Lo que hace la sesión, sin pedirte nada más.

1. Con el token de Supabase corre npm run deploy:supabase -- --plan b17 --dry-run y después sin él. Vuelve a publicar las trece funciones con el código de las llaves nuevas, que sale con las llaves de siempre, y no aplica SQL
2. Pone APP_URL y APP_ORIGINS con --secrets-from cuando le digas la fecha de la mudanza, sin mostrar los valores
3. Corre la prueba de humo contra el dominio con npm run smoke -- https://tudominio.mx --strict, registra el dominio en Stripe y corre setup-test.ts con la dirección nueva
4. Puede poner Site URL y Redirect URLs de Supabase con tu token, porque son direcciones públicas. El bloque de SMTP lo pones tú, porque lleva la llave de Resend

## Esta semana

5. **Borra la función vacía stripe-config-check** (respuesta 4). En Supabase, Edge Functions, stripe-config-check, Delete function. Desde la sesión no se puede borrar
6. **Agrega el código a los correos de acceso** (respuesta 23). En Supabase, Authentication, Emails, abre la plantilla Magic Link y después Confirm signup. Debajo del enlace agrega esta línea y guarda

   `<p>Si abriste este correo en otro dispositivo, escribe en la app este código <strong>{{ .Token }}</strong></p>`
7. **Empieza la activación de Stripe** a nombre de Plexus Medica S. de R.L. de C.V. (respuestas 5, 6 y 42). Te pedirá el RFC de la empresa, el domicilio fiscal, los datos del representante legal y la CLABE de una cuenta de la empresa. Puede tardar días
8. **Platica con tu contador** (respuestas 6, 12, 13 y 14). Que la empresa cobre y facture, facturas a mano a quien las pida, precios con IVA incluido y si conviene Stripe Tax más adelante
9. **Crea tu cuenta de Anthropic y carga saldo** (respuesta 33). En console.anthropic.com crea una clave y pégala tú en Supabase, Edge Functions, Secrets, con el nombre ENARM_ANTHROPIC_KEY. En el entorno de la sesión ya hay una con ese nombre
10. **Dile a la sesión cuál es tu dominio** (respuesta 50) y empieza a pasarlo a nombre de tu empresa (respuesta 24)
11. **Crea los correos de privacidad y de soporte** en tu dominio (pregunta 43), por ejemplo privacidad y soporte arroba tu dominio. Después van como variables VITE_PRIVACY_EMAIL, VITE_SUPPORT_EMAIL, VITE_LEGAL_NAME y VITE_LEGAL_ADDRESS en GitHub, como dice Lo que salió de B16. No se repiten en Cloudflare

## Entorno de la sesión (sección 10 del plan)

12. **Red, secretos, conectores y modo Auto.** Ya están GitHub, Supabase y Google Drive como conectores, y en la red api.stripe.com, api.supabase.com y api.cloudflare.com. Faltan o hay que corregir
    - MP_ACCESS_TOKEN con la credencial de prueba de Mercado Pago, cuando exista la cuenta (paso 15)
    - ENARM_OPENAI_KEY para comparar calidad en las evaluaciones (B12)
    - Opcional, CLOUDFLARE_API_TOKEN con permiso de DNS para tu zona, junto al CLOUDFLARE_ACCOUNT_ID que ya está (paso 20). No hace falta para publicar, que usa el token de GitHub
    - En Allowed domains, para B13, medlineplus.gov, www.ncbi.nlm.nih.gov, pmc.ncbi.nlm.nih.gov y eutils.ncbi.nlm.nih.gov (paso B13.1)
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
14. **Resend** (B15 y B17). Crea la cuenta, agrega el subdominio mail de tu dominio y pon en tu DNS los registros SPF, DKIM y DMARC que te da. En Supabase, Authentication, SMTP Settings, pon sus datos. Crea dos llaves de API, una para Supabase y otra para las funciones, y pega la segunda en Supabase, Edge Functions, Secrets, como RESEND_API_KEY. Los pasos están en B17.14 y B17.15
15. **Mercado Pago** (B10). Cuenta de negocio de tu empresa. Con ella, sus credenciales de prueba, un usuario de prueba vendedor y uno comprador de México, y en Webhooks la dirección https://bkjbcdwglyllizupokqm.supabase.co/functions/v1/payment-webhook-mercadopago con los temas payment, subscription_preapproval y subscription_authorized_payment, y su clave secreta. En Supabase, Edge Functions, Secrets, van MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET. En el entorno de la sesión va MP_ACCESS_TOKEN. La guía completa está en docs/MERCADOPAGO.md
16. **Stripe en modo prueba** (B10). En Settings, Payment methods, activa OXXO, transferencias bancarias de México, Apple Pay y Google Pay (comentario 19). La sesión crea en modo prueba los precios, los cupones y las configuraciones del portal con la llave restringida del paso 3. El resto de los pasos de Stripe están en la sección de B10 de arriba
17. **PostHog** (B15). Crea la cuenta y un proyecto. Su clave pública va como variable VITE_POSTHOG_KEY, junto con su dirección, en GitHub. No se repite en Cloudflare
18. **Sentry** (B15). Crea la cuenta y un proyecto. Su DSN va como variable VITE_SENTRY_DSN. Pon tu correo en sus alertas. Crea un token para subir los mapas de código y guárdalo como secreto de GitHub SENTRY_AUTH_TOKEN
19. **Secreto de GitHub para la calibración** (B14). En Supabase crea una llave secreta dedicada a ese proceso y guárdala en GitHub, Settings, Secrets and variables, Actions, como SUPABASE_CALIBRATION_KEY
20. **Cloudflare** (B17). Crea la cuenta, conecta tu dominio y crea un token con un solo permiso, Pages Edit. Va a GitHub como secreto CLOUDFLARE_API_TOKEN, junto con CLOUDFLARE_ACCOUNT_ID. Los pasos están en B17.3 a B17.5. Un segundo token con permiso de DNS para tu zona, en el entorno de la sesión, es opcional y solo sirve para que la sesión cree registros por ti
21. **Supabase de pago** antes de abrir a alumnos de pago (respuesta 27). Después activa la protección de contraseñas filtradas en Authentication (respuesta 28). Es el paso B17.12
22. **Repo privado** al pasar a Cloudflare (respuesta 48), pero no antes de 30 días después de la mudanza, porque sin GitHub Pages desaparece el sitio que redirige a tu dominio nuevo. En GitHub, Settings, Danger zone, Change visibility. Es el paso B17.22

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
