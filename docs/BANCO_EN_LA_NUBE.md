# El banco de preguntas en la nube

Diseño de cómo el banco pasa de vivir dentro de la app a vivir en Supabase, con el límite del plan Gratis aplicado en el servidor. Es un diseño y no código. Lo único construido es la conversión de ids (src/data/cloud/cloudIds.ts). Nada de esto cambia lo que ve el alumno hasta que Ricardo apruebe las decisiones de abajo y haya un banco real aprobado por médicos.

## Dónde estamos hoy

- El banco de demostración viaja dentro de la app y se guarda en el navegador de cada alumno. Todos los motores (muestreo, examen, dificultad, sesgos) leen de ahí
- Supabase ya tiene las tablas questions, question_options, clinical_cases, review_assignments, review_decisions y content_reports, con permisos por fila y roles. Están vacías, salvo lo que se pruebe a mano
- El plan Gratis ya se aplica en la base. grant_question_access cuenta las preguntas distintas que abre un alumno por día de estudio, y la política de questions solo deja leer las que ya abrió. Falta conectarlo con la app, porque hoy la app no lee el banco de la nube
- La carga de preguntas desde Excel, CSV o JSON (pantalla 22) escribe en el navegador del médico y no en Supabase
- No hay contenido real aprobado por médicos. La compuerta 1 del plan maestro sigue abierta

## Brechas entre la app y las tablas de la nube

- question_options no guarda el id estable de la opción a través de versiones (optionId), ni las etiquetas secundarias de sesgo, ni el orden de las opciones
- No hay tabla para las etiquetas que cada médico pone a un distractor (BiasLabel), que son la base del acuerdo entre médicos
- questions guarda el enunciado, la explicación, las referencias y la estructura en un solo campo body, sin columnas para filtrar. Para muestrear sin leer texto hace falta un catálogo aparte
- content_reports no guarda cuándo se resolvió
- Los ids de la app son ULID y los de las tablas son uuid. Ya se resolvió, ver la decisión 1

## Decisiones propuestas

Cada una trae mi recomendación. Si Ricardo no responde distinto, esto es lo que construiré.

1. Ids. Un ULID es un número de 128 bits y un uuid también, así que se convierten uno en otro sin perder nada y sin tabla de equivalencias. Ya está hecho y probado con propiedades en src/data/cloud/cloudIds.ts. El orden por tiempo del ULID se conserva
2. Catálogo y cuerpos por separado. Una tabla question_catalog con lo que los motores necesitan para elegir sin leer texto, que es rama, tema, subtema, estructura, dificultad del médico, tipos de reactivo raros, estado, versión, si es variante y de qué, caso y orden dentro del caso. Todos los alumnos con sesión la leen entera. El cuerpo (enunciado, opciones, explicación) queda aparte y con puerta
3. Leer por función y no por tabla. Una función fetch_questions recibe una lista de ids, valida el plan, descuenta del tope y devuelve el cuerpo con sus opciones y su caso. A los alumnos se les quita el select directo sobre questions y question_options. Así nadie baja el banco entero con una sola consulta, y el tope del plan Gratis y el tope anti copia viven en un solo lugar
4. Tope anti copia en los planes de pago. Recomiendo 600 preguntas distintas por día de estudio, ajustable en platform_settings. Un examen completo de 280 cabe holgado. No es un candado contra alguien decidido, es un freno a la descarga masiva. Un tope más alto copia más fácil y uno más bajo estorba a quien estudia mucho
5. Las etiquetas de sesgo viajan con las opciones. La IA nunca clasifica datos en bruto, solo trabaja sobre lo que el médico ya etiquetó, como pide D-080
6. Variantes reestructuradas. Entran al catálogo con su propio estado y apuntan a la pregunta original con variant_of. No entran al puntaje del examen hasta su umbral, igual que hoy
7. Versiones inmutables. Editar una pregunta crea una versión nueva, como hoy. La restricción unique (question_id, version) ya existe. Las respuestas del alumno guardan la versión que vio
8. Flujo editorial. Borrador, en revisión, aprobada, rechazada o retirada. Los alumnos solo ven aprobadas y de demostración. Un médico ve además lo que se le asignó, y el admin ve todo. Subir un lote es una función solo para admin que valida con los mismos esquemas que la app y es segura de repetir, porque se identifica por pregunta y versión
9. Sin conexión. Los cuerpos ya leídos se guardan en el navegador, en la tabla local de preguntas. El catálogo marca una pregunta como retirada y la app deja de usarla. El texto que ya estaba guardado no se borra solo, y eso es una limitación que se acepta, porque lo contrario rompe el estudio sin conexión
10. Texto a la IA. Al modelo solo viaja texto de preguntas que el alumno ya leyó, con ids seudónimos, como hoy. El proxy no lee el banco por su cuenta
11. Reportes de contenido. Se conservan, con la conversión de ids, y se agrega la fecha de resolución y un tope de reportes por alumno por día
12. De dónde sale el contenido. Solo material propio, licenciado o autorizado por escrito. Los mazos de Fer y de Paco no entran sin autorización escrita (D-008 y D-053)

## Plan de construcción

Cada paso queda terminado con sus pruebas antes de empezar el siguiente.

1. Migración décima, porque la novena ya es la de usuarios del admin. question_catalog, la columna y tabla que faltan para opciones y etiquetas de médicos, fetch_questions con sus topes, una bitácora de lecturas sin identidad del alumno para medir uso y el retiro del select directo. Pruebas SQL con un alumno Gratis, uno de pago, un médico, un admin y alguien sin sesión. Se prueba que el Gratis no pase de su tope, que el de pago no pase del suyo, que nadie lea borradores y que un lote repetido no duplique
2. Fuente de preguntas en la app. Una interfaz QuestionSource con dos implementaciones, la local que existe y la de la nube, y los motores sin cambios, porque ya reciben datos y no saben de dónde vienen. Pruebas con una nube falsa, igual que las del dispositivo único
3. Descarga incremental del catálogo. Solo lo que cambió desde la última vez, con versión del catálogo
4. Publicación desde la pantalla 22. El importador gana un destino nube para el admin
5. Subida inicial del banco aprobado. Un script de una sola vez que corre Ricardo con su cuenta de admin. No se corre sin banco aprobado
6. Medición de costos. Con el banco real se mide cuánto pesa el catálogo y cuánta transferencia gasta un alumno típico, porque Supabase cobra por transferencia

## Tamaños, solo como estimación

- Un catálogo de 1,500 preguntas con unos 300 bytes por fila pesa unos 450 KB sin comprimir. Eso se baja una vez y luego solo los cambios
- El cuerpo de una pregunta con sus opciones pesa unos pocos KB. Un examen completo de 280 preguntas serían unos pocos MB
- Son números de cálculo y no de medición. Se miden en el paso 6

## Riesgos

- Copia del banco. Ningún sistema que muestre preguntas en pantalla puede impedir que alguien las copie a mano. El tope, la bitácora y los términos de uso son disuasivos, no una garantía
- Costo de transferencia en Supabase si el banco crece o si hay muchos alumnos
- Un alumno con la app abierta en dos dispositivos. Ya lo resuelve el dispositivo único
- Cambiar el banco mientras alguien estudia. Por las versiones inmutables, lo que el alumno ya respondió no cambia

## Lo que necesito de Ricardo para empezar

- Que apruebe, corrija o rechace las decisiones 2, 3 y 4
- El tope diario de preguntas para los planes de pago, si no le convence 600
- Si el alumno Gratis puede ver la explicación después de contestar, o solo las preguntas del tope, como hoy
- Un banco real revisado por médicos, o cuáles lotes entran primero, para que el paso 5 tenga qué subir
- La autorización por escrito de cualquier contenido que no sea propio
