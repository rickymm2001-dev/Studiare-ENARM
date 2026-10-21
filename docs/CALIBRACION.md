# Calibración nocturna

Es el bloque B14, datos y modelo del alumno (docs/PLAN_DEL_CAMBIO.md y el plan de B14). Cada noche, GitHub Actions calcula con los datos de los alumnos que dieron el permiso de mejora la dificultad real de cada pregunta, qué opciones casi nadie elige, si el detector de fatiga se puede mostrar, lo que se mejora para todos y los cortes de la comparación con otros alumnos. La base solo exporta páginas compactas y recibe resultados. Todo el cálculo vive en los motores puros de la app, así hay una sola implementación.

Esta guía es para quien la opera. El paso a paso de la llave, que te toca a ti, está en docs/PENDIENTES_DE_RICARDO.md, sección B14. El detalle de las migraciones y la consulta de comprobación están en docs/SUPABASE.md, sección Datos y modelo del alumno (B14).

## Dónde corre

- .github/workflows/calibration.yml. Corre todos los días a las 10 con 23 minutos UTC, que son las 4 con 23 minutos de la mañana en Mérida, justo después del corte del día de estudio. Mérida no cambia de horario, así que la hora queda fija. También se lanza a mano con Run workflow, con la casilla Solo reporte prendida por omisión
- Dos trabajos en orden. selftest corre el autotest contra una base temporal con alumnos simulados. Si pasa, nightly corre la calibración real. nightly solo corre en la rama main y es el único que recibe la llave
- check.yml suma un trabajo calibration con el mismo autotest en cada push, así un cambio que rompa la noche se ve antes de llegar a main. Conviene marcarlo como requerido junto a check, e2e y audit en las reglas de la rama
- El proceso real es dist-calibration/calibrate.mjs. Lo arma npm run calibration:build con Vite en modo SSR, porque los motores usan el alias @ y rutas sin extensión que Node no resuelve solo. Nada de esto entra al build de la app

## Una noche paso a paso

1. calibration_begin revisa model_settings.calibration.enabled y si hay otra corrida en curso. Crea la corrida con su corte (el seq más alto de la bitácora en ese momento), su día de estudio, una sal nueva y su modo. Una corrida que lleva más de 3 horas en curso pasa a interrupted
2. Lee en páginas de hasta 20,000 filas. Primero el banco y los alumnos con permiso, luego las respuestas, las pantallas de opciones, los motivos de error, la actividad de los últimos 30 días y los pares de etiquetas de los médicos
3. Calcula con src/engines/calibration/run.ts, que es puro y determinista
4. Publica los resultados en las tablas de la corrida (item_calibrations, option_calibrations, population_snapshots, comparison_cells y agreement_snapshots)
5. calibration_finish cierra la corrida y, solo en modo apply, aplica todo en una sola transacción. Borra la sal en los dos modos

Lo que se aplica en modo apply, siempre completo o nada.

- La llave calibration de cada fila de question_catalog, solo para la versión publicada. El seq del catálogo sube solo si algo cambia de verdad, el estado, la dificultad se mueve 0.10 o más, el error estándar 0.05 o más, la marca de extrema, o una variante queda lista. Así las apps no bajan el catálogo entero cada noche
- exam_eligible en true para las variantes que ya tienen 200 exposiciones en cada distractor de su set canónico. Nunca regresa solo a false
- Las cifras de cada opción pasan a upsert_distractor_stats de B11, que aplica los umbrales del admin y marca los distractores que casi nadie elige. Cada médico con marcas nuevas recibe un solo correo distractor_flags al día, con las claves de las preguntas y sin texto ni alumnos. B15 lo envía
- model_publication apunta a la corrida. Lo que leen los alumnos sale siempre de ahí

## Qué sale de la base y qué nunca

| Lectura | Lo que trae | Lo que nunca trae |
|---|---|---|
| calibration_bank | Versión, pregunta, rama, tema, idioma, dificultad del médico, variante de, set canónico, opciones con id estable, cuál es la correcta, su etiqueta de sesgo y el número de palabras | Viñeta, pregunta, opciones, explicación, justificaciones y referencias |
| calibration_people | Seudónimo y especialidad objetivo | Id de cuenta, alias, correo, año de nacimiento, sexo, estado, plan |
| calibration_answers | Seudónimo, sesión seudónima, versión, opción elegida, acierto, tipo de sesión, días antes del corte, minuto de la sesión, milisegundos, confianza, cambios y seq | Hora exacta, zona horaria y texto |
| calibration_exposures | Seudónimo, versión, opciones mostradas y seq | Lo mismo |
| calibration_activity | Seudónimo, días antes del corte, repasos y respuestas de ese día | Mazos, tarjetas y su contenido |
| calibration_motives | Seudónimo, días antes del corte, rama, motivo y si cayó al final de una sesión larga | Texto, que no existe en los motivos |
| calibration_label_pairs | Id estable de la opción y etiquetas del autor y del revisor | Quiénes son los médicos |

## Privacidad y defensas

- Cuenta solo quien dio el permiso de mejora anónima con un aviso igual o posterior a model_settings.calibration.minNoticeVersion, y solo hasta el corte de esa noche. Quien lo retiró deja de contar desde la noche siguiente. Los médicos, admins y el dueño no cuentan aunque prendan el permiso
- El seudónimo es la primera parte de un hash sha256 del id de la cuenta con una sal de 32 bytes que solo existe mientras corre la noche. Es otro cada noche y nadie puede volver a ligarlo después
- Ningún dato sale con menos de 30 alumnos. El piso vive en el esquema de zod, en los motores, en la función de la base y en la restricción de comparison_cells, así que el admin no puede bajarlo
- Una respuesta cuenta solo si el alumno pidió esa versión al servidor, es decir, si hay una lectura suya en bank_reads de ese día de estudio o antes. El acierto sale de la opción que eligió, no de lo que sube el cliente. Cuenta el primer intento de cada alumno en cada pregunta, con un tope de 400 por día, y se quitan las respuestas más rápidas que la lectura plausible (más de 6 palabras por segundo) y las que no traen tiempo de respuesta
- calibration_runs.counts y la población solo aceptan números, booleanos y códigos en minúsculas. Un texto con espacios o con mayúsculas se rechaza

## Estados de la dificultad

- calibrated con 100 o más alumnos distintos y error estándar de 0.3 o menos
- provisional con 30 o más y error estándar de 0.5 o menos
- physician_estimate en cualquier otro caso. Una pregunta que todos aciertan o todos fallan no tiene estimación finita, queda aquí y se marca extreme
- La escala se enlaza entre noches con las preguntas que ya eran al menos provisionales en la corrida publicada (mínimo 20). Sin ellas se centra en la dificultad del médico en logits
- Si los alumnos y las preguntas forman grupos sin nada en común, Rasch no puede decir dónde queda un grupo respecto de otro. Cada grupo conectado se enlaza por su cuenta con sus propias 20 anclas. Sin ellas solo se enlaza con la dificultad del médico el único grupo que hay o el único de 20 preguntas o más. Los demás se quedan en physician_estimate hasta que algún alumno los conecte. Los conteos raschComponents y raschUnlinked dicen cuántos grupos hubo y cuántas versiones quedaron sin enlace
- Si Rasch no converge en una noche no se publica ninguna dificultad de Rasch (raschConverged en 0)
- La app usa la dificultad de Rasch solo si calibration.versionId es la versión publicada

## Ajustes

Viven en platform_settings, clave model_settings. Los escribe el admin con settings_write y se leen con model_settings_json, que pone respaldos y el piso de 30. Un valor que no se entiende queda de fábrica.

| Ajuste | De fábrica |
|---|---|
| calibration.enabled | false. Apagada, calibration_begin deja una corrida skipped con disabled y no lee nada |
| calibration.mode | dry_run. Calcula y guarda la corrida sin aplicar nada. apply la aplica |
| calibration.minNoticeVersion | 2026-10-15b |
| features.comparison y features.adaptive | true |
| thresholds.minGroupSize y thresholds.populationMinStudents | 30, y nunca menos |
| thresholds.comparisonWindowDays | 30 |
| thresholds.minBranchAnswers | 20 |
| thresholds.maxDailyFirstAttempts | 400 |
| thresholds.provisionalMaxSe y thresholds.calibratedMaxSe | 0.5 y 0.3 |
| thresholds.fatigue | 30 alumnos, kappa de 0.4 entre mitades y 40 motivos reportados |

Los umbrales de 30 y 100 respuestas y los de distractores, 5 por ciento y 100 exposiciones, siguen en admin_overrides.thresholds, donde el admin ya los edita.

## Modos, interruptores y candados

- Forzar dry_run al lanzar a mano gana al modo apply del ajuste. Nunca se puede forzar apply
- Una sola corrida a la vez, por el índice único de corridas en curso y por la concurrencia de GitHub
- La corrida real termina en 0 con ok, partial, skipped y not_configured, y en 1 con failed, para que GitHub avise por correo a quien editó el horario por última vez
- Si la paridad del kappa con bias_agreement_summary falla, la corrida queda partial con kappa_mismatch y la pantalla del admin lo avisa
- Sin la llave o sin SUPABASE_URL el proceso escribe not_configured con un aviso amarillo y termina en 0. Lo mismo si la dirección no es de un proyecto de Supabase (algo.supabase.co), para que una variable mal puesta no mande la llave a otro servidor. Con un dominio propio de Supabase hay que agregarlo a isAllowedUrl en scripts/calibration/calibrate.ts
- Un 401 de la base no se trata como not_configured. Sale como error con http_401 y el proceso termina en 1. Es una decisión, aunque el plan 8.2 pedía lo contrario. Una llave mal pegada, revocada o que no es secreta es algo que Ricardo tiene que arreglar, y que la noche salga en rojo es lo que hace que GitHub le avise
- Los trabajos de los workflows hacen checkout con persist-credentials en false, así el token del repo no queda en el disco del trabajo que recibe la llave. Las acciones siguen fijadas por etiqueta (v7) y no por hash, como el resto de los workflows del repo

## Límites conocidos

- El corte de una noche es el mayor seq de la bitácora al empezar. Un seq se asigna antes de que la transacción confirme, así que una transacción con el seq 100 que confirma después de que otra con el 101 ya estaba confirmada, y después de que una página pasó por ahí, queda fuera de esa noche. Es el mismo borde que ya tiene la bajada de la bitácora de la sincronización. Afecta una fila a la vez y se corrige sola, porque cada noche vuelve a calcular los primeros intentos desde toda la bitácora y la fila entra en la noche siguiente. Se aceptó en lugar de tomar el corte con el candado de sync_push_events, que frenaría las subidas de todos los alumnos mientras empieza la noche

## Qué imprime el proceso

Solo líneas JSON con un código de la lista cerrada de scripts/calibration/log.ts y valores que son números, booleanos o palabras de otra lista cerrada. Lo demás se descarta y la línea trae dropped_field con cuántos fueron. Los errores salen con su clase y su código, el SQLSTATE de Postgres o el estado HTTP, nunca con su mensaje. No se suben artefactos, no se usa el modo de depuración de los pasos y la llave nunca se imprime.

| Código | Cuándo sale |
|---|---|
| start y done | Al empezar y al terminar el proceso real |
| not_configured | Falta la llave o la dirección |
| skipped | La base saltó la corrida, con reason disabled, running o not_configured |
| run_begin, bank_read, people_read, page_read, computed, published y finish | Avance de una noche, con conteos |
| error | Falló un paso, con errorClass, errorCode y reason (store_error, invalid_page, timeout o compute_error) |

## Autotest

npm run calibration:selftest levanta el mismo Postgres temporal de npm run test:sql, sin Docker, lo migra como el proyecto real, empaqueta la calibración, corre dist-calibration/selftest.mjs y apaga la base. Usa el puerto 54502 y tarda unos 4 minutos.

Siembra, como superusuario, 300 alumnos simulados con 90 días de práctica, el banco de la demo con textos marcados, alias y correos marcados, permisos de todos los tipos (85 por ciento lo dio, 10 por ciento no decidió, 5 por ciento lo dio y lo retiró, tres con un aviso anterior), dos médicos y un admin con permiso, cinco alumnos que inventan respuestas sin haber pedido las preguntas, 40 alumnos de cirugía general, 12 de pediatría y 60 pares de etiquetas. Corre la misma pipeline de producción con el transporte de Postgres y revisa 25 metas con cuentas independientes.

- Rasch contra la dificultad verdadera con correlación de 0.90 o más y Elo con 0.80 o más
- Rasch con datos ralos, donde cada alumno contesta de 5 a 20 preguntas, con la pendiente de lo estimado contra lo verdadero entre 0.9 y 1.05. La correlación no ve una escala inflada y la pendiente sí
- Quién entra, exactamente los de permiso vigente, y ninguna fila de quien retiró el permiso, del equipo o de quien inventa
- Exposiciones y elecciones por opción, las marcas de distractores y las variantes listas contra un recuento directo en SQL
- Las celdas de la comparación contra el motor sobre los datos simulados, la de cirugía general con 40 lista y la de pediatría con 12 calibrando
- Fatiga apreciable detectada en 80 por ciento o más, falsos positivos en 10 por ciento o menos y el detector en validated
- Paridad del kappa, dry_run sin cambios, repetir la noche sin subir el seq, retirar el permiso a todos menos 60 y que ningún registro lleve marcas, alias, correos, ids, llaves ni arrobas

Si una meta no se cumple, el trabajo falla, la corrida real no se hace y la tabla del resumen del paso dice qué número salió. Para depurar en local se pueden bajar SELFTEST_SIZE y SELFTEST_DAYS, SELFTEST_ONLY=seed deja la base sembrada y SELFTEST_VERBOSE=1 imprime el error completo. El CI no define ninguna.

## Si algo falla

| Se ve | Qué hacer |
|---|---|
| not_configured en cada noche | Falta crear el secreto SUPABASE_CALIBRATION_KEY o la variable VITE_SUPABASE_URL. Los pasos están en docs/PENDIENTES_DE_RICARDO.md |
| skipped con disabled | model_settings.calibration.enabled está en false. Es lo normal hasta que Ricardo avise que la llave está puesta |
| skipped con running | Hay otra corrida en curso. Si lleva más de 3 horas, la siguiente la pasa a interrupted |
| error con http_401 o 42501 | La llave está mal pegada, revocada o no es una llave secreta. Crea otra y cámbiala en GitHub |
| error con 57014 | Una consulta pasó del tiempo. Las páginas ya son de 20,000 filas con 50 s de límite. Si pasa seguido, conviene la preparación incremental de IDEAS.md |
| partial con kappa_mismatch | El kappa de la noche no coincide con bias_agreement_summary. Revisa el etiquetado antes de publicar |
| La pantalla dice que no ha corrido en 48 horas | Mientras el repo sea público, GitHub apaga lo programado a los 60 días sin actividad. Entra a Actions, calibration y dale Enable workflow |

## La llave

Es una llave secreta nueva de Supabase con el nombre calibracion-nocturna, guardada como secreto del repositorio SUPABASE_CALIBRATION_KEY y no de un environment, para que siga funcionando cuando el repo pase a privado. Pasa por encima de los permisos por fila, como service_role, pero el código solo llama a las funciones calibration_* y esas funciones no devuelven texto ni cuentas. Solo el trabajo nightly la recibe y solo en main. Quien tenga permiso de escritura en el repo puede leer los secretos, así que el repo no suma colaboradores con escritura sin pensarlo. Se rota una vez al año o cuando haya una duda.

## Escala

Al lanzar hay decenas o cientos de alumnos con permiso y la noche tarda pocos minutos. Con 2,000 alumnos con permiso y 30 días son unos 3 millones de respuestas por exportar, que sigue dentro del límite de 6 horas del trabajo pero hace crecer la transferencia. Arriba de eso conviene una tabla de preparación incremental en la base, que va a IDEAS.md. En un repo público los minutos de GitHub son gratis. En uno privado con plan Free son 2,000 al mes, y la noche con su autotest usa unos 450.
