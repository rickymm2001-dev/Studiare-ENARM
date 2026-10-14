# El banco de preguntas en la nube

Cómo vive el banco de Studiare en Supabase desde B11. Este documento cuenta lo que quedó construido en el servidor (paquete A de B11), cómo se usa y qué decisiones lo sostienen. La app del alumno (paquete B) y las pantallas del médico y del admin (paquete C) llegan en sus propios commits del mismo bloque.

Todo nace apagado. La bandera cloudBank está apagada, así que los alumnos siguen con el banco de la demo, y bank_sync.enabled está en false, así que nadie lee el Google Sheet. Ricardo prende cada cosa cuando toca (docs/PENDIENTES_DE_RICARDO.md).

## Qué quedó construido

| Pieza | Qué hace |
|---|---|
| 20261023000001_bank_taxonomy.sql | Ids ULID como uuid (ulid_uuid), ids estables por clave (stable_bank_uuid), la taxonomía y los sesgos sembrados en bank_taxonomy y bank_bias_tags, los ajustes bank_limits, bank_sync, bank_goal y physician_pay, y bank_open_for_students, que lee la bandera cloudBank igual que la app |
| 20261023000002_bank_core.sql | El registro de cada pregunta (bank_questions), el catálogo sin texto (question_catalog con su secuencia), la bitácora de lecturas (bank_reads, solo se agrega) y las funciones del alumno catalog_changes, fetch_questions y bank_quota. Quita a todos el permiso directo sobre las tablas de preguntas |
| 20261023000003_bank_editorial.sql | Asignaciones de autor y revisor, revisión a ciegas (bias_labels), decisiones (review_decisions, solo se agregan), claves de médico, reportes de alumnos con su correo al médico, cola de distractores, el editor, las funciones del admin y el reporte de pagos a médicos |
| 20261023000004_bank_sync.sql | Corridas de sincronización y su reporte de renglones, sin texto de ninguna pregunta, la ficha de Cron, el candado por pregunta, los faltantes y la importación de un archivo del admin |
| 20261023000005_deck_catalog.sql | El catálogo compartido de mazos en Storage, por versión y por submazo |
| 20261023000006_bank_sync_cron.sql | La ficha de Cron en Vault y el trabajo de cada hora, solo donde existen pg_cron, pg_net y Vault |
| supabase/manual/banco-b11.sql | Borrar mis datos con la bitácora de lecturas y de bajadas de mazos. Lleva delete, por eso va aparte (D-113) |
| supabase/functions/bank-sync | La función que lee el Sheet con la cuenta de servicio y aplica cada renglón |
| src/data/content/bankConvert.ts, contentHash.ts y questionRules.ts | El convertidor tolerante del Sheet, la huella del contenido y lo que le falta a una versión para aprobarse. La función usa una copia generada (`npm run bank:shared`) |
| src/data/bank/contracts.ts | Los tipos que comparten la base, la app y las pantallas |

Las migraciones son seguras de repetir y no llevan delete ni drop, así el conector las aplica sin confirmación humana. supabase/tests/run.sh las corre dos veces y corre banco-b11.sql dos veces.

## Cómo lee el alumno

- La app baja el catálogo con catalog_changes, solo lo que cambió desde la última secuencia. El catálogo no trae texto
- Pide los cuerpos con fetch_questions, hasta 100 a la vez, con ids estables o con versiones exactas (duelos e historia). Lo que no se concede sale en denied con su motivo, daily_limit, brake, not_found, retired o closed, y lo demás llega
- Gratis tiene 20 preguntas nuevas por día de estudio, que empieza a las 4 de la mañana hora de Mérida. Volver a leer una pregunta del mismo día no cuenta otra vez. Un caso seriado entra completo o no entra
- Los planes de pago no tienen tope diario. Tienen un freno de 300 lecturas nuevas por minuto y 900 por hora, con avisos al admin a las 600 por día y al leer la mitad del catálogo en 7 días (bank_read_alerts)
- El equipo (médicos, admins y el dueño) lee sin tope
- Todo pide sesión y dispositivo activo. Sin sesión responde 28000 y un dispositivo desplazado 42501
- bank_quota dice el plan, el tope, lo usado y cuándo se renueva, sin gastar nada

## Flujo editorial

- Cada pregunta tiene un autor y un revisor distintos. Si el revisor es quien escribió la versión, se intercambian. Sin otro médico responde BK003
- Antes de decidir, el revisor etiqueta a ciegas el sesgo de cada distractor. Hasta terminar no ve los sesgos del autor (BK004). Con esos pares se mide el acuerdo entre médicos con kappa, igual en la base y en la app
- Aprobar pide que la versión esté completa (BK005) y que el revisor confirme las casillas de subespecialidad deducida y de reactivo de control (BK008)
- Una pregunta aprobada se publica sola. Si es de un caso seriado, espera a que todo el caso esté aprobado
- Las decisiones quedan para siempre. Un médico con decisiones no puede borrar su cuenta solo (23503), porque respaldan pagos. Ricardo exporta su historial y la cierra
- El reporte de un alumno avisa por correo al médico asignado, un correo por pregunta y por día, con la clave y el motivo, sin el alumno ni el texto. El correo queda en la cola de B10 hasta que B15 lo mande
- El reporte de pagos cuenta por médico y por mes, con hora de Mérida, las decisiones del revisor asignado, aprobar, pedir cambios y rechazar por separado, y los distractores atendidos aparte

## Sincronización con el Google Sheet

- La función bank-sync corre cada hora con Cron y cuando el admin da Sincronizar ahora. Contesta 202 enseguida y sigue en segundo plano
- Lee tres cosas del Sheet, las pestañas, los valores de Preguntas y Temas, y las fórmulas de la columna ID. Nunca escribe en el Sheet ni guarda texto de una pregunta en sus registros
- Convierte cada renglón con el mismo convertidor de la app y decide si se crea, se versiona, coincide con lo que se corrigió en la app, es un conflicto o solo cambian Autor, Revisor o Estado. Nunca pisa lo que se editó en la app
- Solo reporte o aplicar, según bank_sync.mode. Con fórmulas en la columna ID baja a solo reporte. El Sheet de prueba siempre va en solo reporte
- Una corrida a la vez. Si otra está en curso o la anterior empezó hace menos de un minuto, la nueva termina como skipped con running o too_soon, y la importación de un archivo responde BK009
- Las reglas de cada columna, lo que se rechaza, lo que entra incompleto y lo que solo se avisa están en docs/SHEET_DEL_BANCO.md, que también es el texto de la pestaña Instrucciones
- Sin red y sin base, `npm run bank:fixture` corre la misma función contra dos Sheets simulados (tests/fixtures/bank-sheet) y es la prueba de oro
- `npm run bank:sheet-test` arma el Sheet de prueba en .xlsx y `npm run bank:sheet-lists` la pestaña Listas con las listas que dependen de la rama

## Catálogo de mazos

- Un bucket privado, deck-catalog, con una carpeta por versión de cada mazo. Cada submazo sube como .json y sus imágenes en paquetes .zip de hasta 5 MB
- El admin registra el mazo, sube sus archivos y publica. Publicar revisa que estén todos con el tamaño del manifiesto (BK011) y, si el mazo es de terceros, que el dueño haya confirmado la autorización escrita (BK010)
- Los planes de pago y el equipo bajan los archivos de la versión publicada desde su dispositivo activo. Gratis ve la lista, los submazos y hasta 5 notas de muestra sin imágenes
- Nadie cambia ni borra un archivo subido. Una versión nueva va a otra carpeta

## Decisiones

La numeración de antes se conserva, porque el plan de B11 cita la decisión 9.

1. Ids. Un ULID y un uuid son el mismo número de 128 bits. ulid_uuid y src/data/cloud/cloudIds.ts los convierten sin tabla de equivalencias
2. Catálogo y cuerpos por separado. question_catalog trae lo que los motores necesitan para elegir, sin texto. El cuerpo sale solo por fetch_questions
3. Leer por función y no por tabla. Nadie lee las tablas de preguntas directo
4. Freno de los planes de pago. 300 lecturas nuevas por minuto y 900 por hora, con avisos, en lugar del tope de 600 por día que se propuso antes (8.10 del plan de B11)
5. Los sesgos viajan con las opciones. La IA nunca clasifica datos en bruto (D-080)
6. Variantes reestructuradas. Entran al catálogo con variant_of y no cuentan para el examen hasta su umbral
7. Versiones inmutables. Editar crea otra versión. Lo que el alumno contestó guarda la versión que vio
8. Flujo editorial. Borrador, en revisión, aprobada o rechazada, y el registro de la pregunta activo o retirado. Los alumnos solo ven lo publicado
9. Sin conexión. Los cuerpos ya leídos se quedan en el navegador. Si una pregunta se retira, la app deja de elegirla y conserva el texto que ya bajó
10. Texto a la IA. Solo ids seudónimos y texto que el alumno ya leyó
11. Reportes. Motivos cerrados, un tope por alumno y por día, y un correo al médico sin datos del alumno
12. Contenido. Solo material propio, licenciado o autorizado por escrito. Un mazo de terceros no se publica sin la confirmación del dueño

## Documentación que se siguió

- Tareas en segundo plano de Supabase Edge Functions (EdgeRuntime.waitUntil y el evento beforeunload), de supabase/supabase, apps/docs/content/guides/functions/background-tasks.mdx
- Programar funciones con Cron, de la misma carpeta, functions/schedule-functions.mdx, cron/install.mdx y cron/quickstart.mdx, más database/extensions/pg_net.mdx y database/vault.mdx, leídos el 2026-10-14
- API de Google Sheets v4. El documento de descubrimiento público de la API, revisión 20261007, se bajó una vez sin credenciales para confirmar los parámetros fields, ranges, valueRenderOption y majorDimension. No se tocó ningún Sheet ni se usó ninguna cuenta
- Flujo de cuenta de servicio de Google (JWT RS256 con el alcance de solo lectura de Sheets) y control de acceso de Supabase Storage, de la sección 10 del resumen de documentación del plan

## Riesgos abiertos

- Copia del banco. Ningún sistema que muestra preguntas impide copiarlas a mano. El tope, el freno, los avisos y los términos son disuasivos
- Segundo factor. B9 hace que current_app_role pida segundo factor al equipo. Mientras B9 no esté en la misma base, las pruebas que lo revisan avisan y quedan para la integración
- Listas que dependen de la rama con INDIRECTO en el desplegable de Google Sheets. Solo aparece en guías de terceros. Se prueba primero en el Sheet de prueba (8.34)
- Costo de transferencia de Storage si los mazos se bajan mucho. Se mide al abrir (8.19)
- Los borradores del banco de 1500 en content-drafts todavía usan subespecialidades de Medicina familiar que pasaron a Salud pública. Se revisan antes de importarlos
