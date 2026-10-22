# Proxy de IA alojado

B12 del plan del cambio. La IA real corre en dos Edge Functions de Supabase, ai-proxy y ai-batch, con el mismo núcleo que el proxy de desarrollo. Reemplaza al alojamiento con Docker de la Fase G (D-103), que ya no existe. El archivo conserva su nombre para no romper enlaces.

## Cómo funciona

- La app llama a la dirección del proyecto con /functions/v1/ai-proxy y manda el token de la sesión de Supabase. No necesita variables nuevas, porque arma la dirección con la de Supabase. VITE_AI_URL deja de hacer falta en Pages y en Cloudflare
- La función pregunta quién llama con ai_whoami, con la llave pública y el token del alumno. Esa función da el rol con current_app_role, que con el segundo factor prendido (B9) solo da el rol del equipo a una sesión que ya verificó su código, y dice si el plan es de pago. Todo plan distinto de Gratis cuenta como pago, incluidos la prueba, los pases, el mes de referido y el Fundador anual
- Si la cuenta está activa en otro dispositivo, la función lo dice y no atiende. El alumno de cada llamada es la cuenta verificada y no lo que diga el cliente
- Un alumno del plan Gratis recibe el aviso de que la IA es de los planes de pago. Un médico, un admin o el dueño la usan siempre. La reestructuración de preguntas es solo del equipo y solo del banco en español. Las preguntas de Inglés médico no se ofrecen ni se aceptan, aunque estén marcadas (B13)
- Compuerta 1. Cada motor nace cerrado para los alumnos. Se abre por motor cuando dos médicos calificaron una muestra de sus textos, el veredicto pasó y la muestra trae un mínimo de textos de ese motor (60 en hipótesis y tarjetas, 40 en consejos y 30 en informes y reestructuradas, que son el menor entre la muestra completa y la auditoría corta, así una muestra de prueba de 6 textos no abre nada), y solo mientras el modelo, el esfuerzo, el razonamiento y la versión del prompt sean los mismos que se auditaron. Cambiar cualquiera de esos en la pantalla 25 lo deja cerrado para alumnos hasta una auditoría nueva. El equipo no pasa por la compuerta
- Pausa. El admin puede pausar la IA para todos menos admin y dueño. Si Anthropic avisa que se llegó al límite de gasto del espacio de trabajo, esa llamada se le dice al alumno como pausa
- La compuerta, la pausa y la configuración se leen de la base y se recuerdan un minuto, así que un cambio tarda hasta un minuto en llegar a la función. /health también lee la configuración antes de contestar, para que una copia recién arrancada no diga abierto o cerrado según la de fábrica. Si no puede leerla, dice que todos los motores están cerrados
- Límites del día, en hora de México. Presupuesto de 5 dólares, con una parte para cada motor (tarjetas 55 %, reestructuración 15 % y los otros tres 10 % cada uno), 0.30 dólares por alumno, un tope de llamadas por alumno y motor, y 20 generaciones de tarjetas por alumno con hasta 12 secciones y 2 reintentos cada una. Todo vive en la base, así que sobrevive a un reinicio y se comparte entre copias de la función
- Lotes. La hipótesis de por qué olvidas y la reestructuración van por Message Batches de Anthropic, que cuestan la mitad. La app las encola, con hasta 12 pendientes por alumno, y pregunta después por su estado. ai-batch las manda y las recoge cada 10 minutos, solo si hay algo pendiente. Una misma entrada en menos de 7 días reutiliza el resultado. La entrada de cada trabajo se borra al terminar, la salida 14 días después de entregarla, y el lote se borra en Anthropic en cuanto se procesa
- Cada llamada deja una fila en ai_call_log, sin texto ni respuestas. Solo motor, modelo, modo (al momento o lote), resultado, tokens con los de caché, costo, versión del prompt y, si el modelo se negó, la categoría
- Solo el administrador ve el gasto y cambia modelos, precios y límites desde las pantallas 23 y 25. La configuración vive en la tabla ai_config
- A la IA siguen viajando solo IDs seudónimos y texto del banco o del propio alumno. El filtro de datos personales bloquea la petición completa si encuentra un correo, un teléfono o una CURP. Ninguna petición lleva el ID del alumno

## Qué necesitas

1. Las tres migraciones de B12, con la guía de docs/SUPABASE.md
2. Las dos funciones desplegadas. Las despliega la sesión con el conector de Supabase
3. Tu clave de Anthropic como secreto de las funciones, con el guion 9.1 del plan de B12. Nunca en GitHub, en el repositorio ni en el chat

## Secretos y variables de las funciones

Van en Supabase, Edge Functions, Secrets. Ninguno va al repositorio.

| Nombre | Quién lo pone | Qué lleva |
|---|---|---|
| ENARM_ANTHROPIC_KEY | Ricardo | La clave de Anthropic del espacio de trabajo de producción. La sesión nunca la ve |
| APP_ORIGINS | La sesión | Las direcciones de la app, separadas por comas, como https://rickymm2001-dev.github.io. Sin ruta y sin comodines, y nunca una dirección de pages.dev. Con la mudanza de dominio (B17) lleva la nueva y la vieja por 30 días. Ahora la leen todas las funciones que atienden al navegador, pero ai-proxy solo lee esta |
| AI_ALLOW_MOCK | La sesión | 1 solo mientras no existe la clave. La función contesta con respuestas fijas y la app dice IA simulada. Se quita al poner la clave |
| AI_TICK_DEADLINE_MS | Nadie, es opcional | Plazo interno de cada ciclo de ai-batch, de 10,000 a 380,000 milisegundos. Por omisión 100,000 |
| SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY | Supabase, solas | Las llamadas a la base. Con las llaves nuevas de Supabase (B17), la función prefiere SUPABASE_PUBLISHABLE_KEYS y SUPABASE_SECRET_KEYS, que también pone Supabase, y usa estas tres si no existen (docs/SUPABASE.md, Dominio propio, llaves nuevas y plan de pago) |

En Vault, y no en los secretos de las funciones, van project_url, que ya guardó B11, y ai_tick_secret, que crea la pieza del ciclo de lotes sin que nadie vea su valor.

Sin clave y sin AI_ALLOW_MOCK, /health dice unavailable, los motores contestan que la IA no está configurada y la app usa sus plantillas sin decir IA. Si una variable está mal, la función contesta 503 y su registro dice qué nombre falla, sin imprimir ningún valor.

## Pasos

1. Aplica las cuatro migraciones de B12 y confirma con la consulta de docs/SUPABASE.md. Con el token de Supabase es npm run deploy:supabase -- --plan b12, que también aplica supabase/manual/ia-b12.sql y publica las dos funciones
2. La sesión despliega ai-proxy y ai-batch sin verificación de JWT, con index.ts, deno.json y los archivos de supabase/functions/_shared/ai que importan, cada uno con su ruta. La prueba tests/architecture/edge-functions.test.ts revisa que esa lista se quede dentro de supabase/functions y sin pruebas
3. La sesión pone APP_ORIGINS y AI_ALLOW_MOCK=1. /health debe decir mock. Una llamada como médico de prueba recibe una respuesta simulada y una como alumno de pago recibe que el motor está cerrado
4. La sesión corre supabase/manual/ia-lotes-cron.sql con el conector. Crea ai_tick_secret y programa el ciclo ia-lotes cada 10 minutos, que solo llama a ai-batch si hay algo pendiente, y ia-lotes-limpieza, una vez al día a las 09:17 UTC, que corre ai_jobs_scrub directo en la base. Así las salidas de más de 14 días y las entradas de lo terminado se limpian también en una semana sin hipótesis nuevas
5. Solo si no hay token de Supabase, tú pegas en el SQL Editor supabase/manual/ia-b12.sql. Es la versión de Borrar mis datos que también quita los trabajos de IA. Con el plan b12 ya quedó aplicada
6. Tú pones ENARM_ANTHROPIC_KEY y avisas a la sesión. La sesión quita AI_ALLOW_MOCK, revisa que /health diga real y hace una llamada de prueba como médico
7. La compuerta. El admin importa una muestra, la asigna a dos médicos, cierra la muestra y abre motor por motor los que pasaron y traen el mínimo de textos. Para cambiar el mínimo de un motor, antes de la auditoría y nunca después de ver resultados, la clave ai_gate de platform_settings lleva minItems por motor, por ejemplo {"minItems": {"flashcards": 120}}, y la sesión la cambia con la marca de transacción app.ai_gate_writer

## Qué pasa en cada falla

- La app no muestra botones de IA a un alumno de pago. El motor sigue cerrado en la compuerta 1. Es lo esperado hasta la auditoría
- La insignia dice IA simulada. AI_ALLOW_MOCK sigue en 1 o falta la clave
- El alumno ve que la IA es de los planes de pago. Su plan es Gratis, o el pago aún no se confirma
- El alumno ve que la IA está en pausa. El admin la pausó, se acabó el presupuesto del día o Anthropic avisó del límite del espacio de trabajo. La del presupuesto se quita sola al día siguiente
- El alumno ve que llegó a su límite de hoy. Usó su parte del día, sus generaciones de tarjetas o tiene 12 trabajos pendientes
- El alumno ve que su sesión venció. Tiene que entrar otra vez con su correo
- El alumno ve que su cuenta está activa en otro dispositivo. Tiene que entrar ahí otra vez para tomarla
- Un lote falla o desaparece. El ciclo de ai-batch registra el código de la falla en el log y sigue con los demás lotes, con el envío y con la limpieza, así un lote malo ya no congela todo. Si Anthropic ya no encuentra un lote (404), se da por procesado y sus trabajos vuelven a la cola con su tope de intentos
- Un envío se corta. Si algo falla entre reclamar los trabajos y crear el lote, vuelven a la cola enseguida. Si crear el lote se queda sin respuesta, el lote pudo haberse creado y los trabajos esperan en el estado de envío hasta que el reconciliador los reconoce por custom_id o, a los 15 minutos sin ningún lote reciente que pudiera ser suyo, los regresa a la cola
- Una hipótesis se queda pendiente más de media hora. Revisa en Integrations, Cron, que el trabajo ia-lotes corra (y que ia-lotes-limpieza exista), y en Edge Functions, ai-batch, Logs, el motivo
- La función contesta 503 en todo. Mira su registro. Dice cuáles variables faltan

## Seguridad

- Las dos funciones van sin verificación de JWT. /health es público y solo dice el modo y qué motores ven los alumnos. Las rutas de IA revisan la sesión con ai_whoami. ai-batch rechaza toda petición con Origin y toda la que no traiga en x-ai-tick el secreto de Vault, que la base compara por dentro
- La llave de servicio solo vive en las funciones. Nunca llega al navegador ni a GitHub. El escáner del build busca llaves con rol de servicio, el nombre de la clave de Anthropic y el de la clave de OpenAI de las evaluaciones, y falla si encuentra alguno
- La clave de IA solo vive como secreto de las funciones. El cliente de Anthropic se arma con la clave explícita y sin leer nada más del entorno
- La función solo contesta a los orígenes de APP_ORIGINS, acepta solo JSON y hasta 64 KB por petición. Las rutas de configuración y de gasto piden ser admin o dueño
- Los topes en dólares son blandos por una sola llamada, no por todas las que lleguen a la vez. Al admitir una llamada al momento el servidor reserva su peor costo (todos sus intentos, con la entrada completa y la salida llena hasta max_tokens, en ai_usage_day.reserved_usd) y compara lo asentado más lo reservado por lo que está en vuelo con el tope del alumno, la cuota del motor y el presupuesto del día. Al asentarse o liberarse la llamada se devuelve su reserva. Quien llama de una en una gasta lo mismo que antes, y 60 llamadas a la vez ya no pasan todas el tope
- Si una llamada muere en el camino, por ejemplo porque la plataforma corta la función, su reserva vence sola a los 5 minutos (reserved_since). Una petición tiene un plazo total de 120 segundos desde que entra a la función, así que una llamada viva no la pierde. Al vencer se cancela la llamada al modelo, con sus reintentos del SDK y el de validación, y la función asienta o libera antes de que la plataforma la corte, a los 150 segundos en el plan Free. Un corte se saltaría el asiento y dejaría el cupo gastado y el costo sin registrar. De fábrica el SDK reintenta una vez (30 segundos por intento), y crear un lote nunca se reintenta dentro del SDK Un lote no reserva al encolarse: sus trabajos descuentan su costo máximo antes de mandarse y ajustan al real al recogerlos
- La función no limita las peticiones con token falso antes de preguntarle a Supabase. Una sesión válida se recuerda 30 segundos, y una falla nunca se recuerda
- Los errores no muestran detalles al usuario. Los registros son líneas con códigos, sin texto de alumnos ni de la IA

## Costos

- El presupuesto diario por omisión es de 5 dólares y cuenta el gasto real. Se cambia en la pantalla 25. Al llegar al tope, la IA se pausa hasta el día siguiente, en hora de México
- Los lotes cuestan la mitad que una llamada al momento
- Los límites por alumno y por motor también se cambian en la pantalla 25
- El gasto del día, la bitácora y el costo mensual por alumno (promedio, mediana y percentil 90) los ve el administrador en la pantalla 23
- Falta medir el costo real por alumno con npm run eval-ai y la clave de evaluaciones. Hasta entonces los números son estimaciones

## En tu computadora

- npm run dev levanta el proxy de desarrollo de server/ con el mismo núcleo. Guarda la configuración y el gasto en archivos y corre el ciclo de lotes en memoria, cada minuto con la clave y cada 2 segundos en modo simulado
- La clave sigue en server/.env.local con el nombre ENARM_ANTHROPIC_KEY. El proxy local atiende como el dueño, así que no pasa por la compuerta
