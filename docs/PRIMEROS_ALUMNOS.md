# Primeros alumnos

Es el guion de B18 del plan del cambio V3 (docs/PLAN_DEL_CAMBIO.md). Sirve para invitar a los 5 primeros alumnos, ver si entendieron Studiare, arreglar lo que falle antes de abrir el registro y decidir cuándo abrirlo. Está escrito para ti. Lo que hace la sesión está al final.

Lo que se construyó para esto

- Una encuesta corta dentro de la app, a los 7 días de la cuenta de cada alumno. Siete preguntas cerradas y un comentario libre que puede dejar en blanco. Es opcional y se contesta una sola vez. Mientras contesta, la app guarda un borrador solo en su dispositivo, y se borra al enviar, al cerrar sesión, al Borrar mis datos y al Eliminar mi cuenta
- En Usuarios, la tarjeta Encuesta de los primeros días. Ahí la prendes, ves cuántos contestaron y bajas un CSV. Solo la ven el dueño y los administradores
- En Usuarios, Invitaciones, un botón Copiar mensaje de invitación en cada correo pendiente, para pegarlo en tu chat con cada persona
- Esta guía, con qué decirles, cómo anotar lo que encuentres y cuándo abrir el registro

La encuesta no es parte de la analítica y no depende de ningún permiso de Privacidad. Lo que respondan se guarda con un código al azar, sin su nombre ni su correo. No es anónima, y nunca se les debe decir que lo es. Como son solo 5, tú puedes deducir quién escribió qué, sobre todo en el comentario.

La tarjeta tampoco muestra los días que llevaba la cuenta de cada respuesta. Con 5 personas, ese número junto con la fecha de alta que ya ves en Usuarios te diría qué cuenta es cada código. La base guarda los días para el análisis interno y solo se los devuelve a quien contestó.

## Antes de invitar

Todo esto tiene que estar listo. Si algo falta, no invites a nadie.

1. **B17 publicado con Resend como correo de acceso.** Prueba pidiendo un código de acceso con un Gmail que no sea del equipo. Debe llegar en un minuto. Sin esto, con el correo de fábrica de Supabase, los códigos solo llegan a los del proyecto y los 5 no podrían entrar. Si ya funciona Entrar con Google, también sirve (paso B17.15 de docs/PENDIENTES_DE_RICARDO.md)
2. **El gancho Before User Created activo.** Es lo que hace que el registro sea solo con invitación (paso del gancho en docs/SUPABASE.md, sección Cuentas y acceso). Se prueba en el paso 2 de abajo
3. **Supabase de pago con copias diarias.** El plan gratis no baja copias y pausa el proyecto si pasa tiempo sin uso. Con cuentas de personas reales conviene el de pago antes de invitar (paso B17.12). Es un gasto y lo decides tú
4. **El aviso de privacidad al día.** Con la versión 2026-10-22b, que habla de la encuesta. Sigue marcado como borrador para tu abogado, y es una decisión tuya cuándo se lo mandas (docs/legal/CAMBIOS-B18.md)
5. **Las migraciones de B18 aplicadas y la encuesta preparada.** La sesión aplica el plan b18 con npm run deploy:supabase y prueba la encuesta con 0 días de espera en una cuenta tuya. Queda apagada hasta el paso 6
6. **Tu segundo factor activo.** Eres el dueño y esta tarjeta tiene respuestas de personas reales. Sin el código de tu app de autenticación no ves nada

## El día 0, unos 30 minutos

1. **Confirma que B17 quedó.** Abre tu dominio y pide un código de acceso con un Gmail que no es del equipo. Debe llegar
2. **Prueba el gancho.** En una ventana de incógnito intenta crear una cuenta con un correo que no invitaste. Debe decir que Studiare está abierto solo con invitación. Si te deja entrar, el gancho no está activo y no invites a nadie
3. **Pasa Supabase al plan de pago** si no lo has hecho
4. **Pregunta a cada aspirante con qué correo va a entrar y si usará el código del correo o Google.** Si va a usar Google, invita el correo de su cuenta de Google. Un correo distinto al invitado no entra
5. **Invita a cada uno.** En Usuarios, Invitaciones, escribe su correo y toca Invitar. Luego toca Copiar mensaje de invitación y pégalo en su chat. El mensaje trae la dirección de la app, su correo exacto, los dos caminos para entrar y que la cuenta funciona en un dispositivo a la vez. Aunque la invitación está hecha, la app no manda nada por su cuenta. Lo manda tu mensaje
6. **Pide a la sesión que prenda la encuesta.** Primero la prueba con 0 días en una cuenta tuya y después la deja prendida con 7. También puedes prenderla tú en Usuarios, Encuesta de los primeros días, con el interruptor y los días de espera en 7

## Qué decirles

- Que son los primeros en usar Studiare, que su cuenta es de verdad y funciona en un dispositivo a la vez (pueden cambiar de dispositivo, y el anterior sale de la sesión), y que lo que falle se arregla antes de abrirlo a más gente
- Que esta semana usen Repasar todos los días un rato y hagan al menos una práctica de Simular con tiempos reales
- Que a los 7 días Studiare les pedirá unas preguntas de 2 minutos, que es opcional y que se guardan con un código y sin su correo
- Que la analítica de uso es opcional, empieza apagada y la pueden prender en Configuración, Privacidad. Explícales en una frase qué mide (qué partes de la app usan, en rangos y sin su nombre ni lo que escriben) y qué no, y que da igual si no la prenden
- Que a ti te escriban cuando algo falle, con una captura y la hora
- Que en el comentario de la encuesta no escriban su correo, su teléfono ni datos de pacientes. La encuesta rechaza las formas comunes, como una arroba aunque venga con espacios, escrita (at) o como la palabra arroba, y un número largo. Es una ayuda y no una garantía, porque no detecta un nombre ni un correo dictado, y tú lees lo que escriban

## Qué no decirles

- Que la encuesta es anónima. Es con un código, y como son pocos, tú puedes deducir quién escribió qué
- Que prendan la analítica o contesten la encuesta a cambio de algo. No prometas nada
- Que el banco ya está completo o que las preguntas son las del ENARM, si siguen en demostración
- Nada de puntaje esperado, plaza ni probabilidad. Studiare no predice el puntaje del ENARM
- Que compartan su cuenta, ni cifras de precio o descuentos. No es parte de esta prueba
- No leas la respuesta de uno delante de los otros

## Durante la semana

- **Día 1.** Escríbeles para confirmar que entraron. En Usuarios, Invitaciones, cada correo dice Pendiente o Con cuenta
- **Día 3.** Una pregunta abierta por chat, por ejemplo "¿qué fue lo primero que no entendiste?". Anótala en tu libreta y no en el repositorio
- **Día 7.** Un recordatorio general al grupo, una sola vez, de que Studiare les va a pedir la encuesta

## Cómo anotar lo que encuentres

Lleva una libreta fuera del repositorio. Cada hallazgo lleva estos campos.

| Campo | Qué se escribe |
|---|---|
| Pantalla | El nombre que ve el alumno, como Repasar, Simular o Configuración |
| Qué pasó | Una o dos frases, sin nombres de personas |
| Cuántos de los 5 | Un número |
| Tipo | Falla, Confusión, Contenido o Idea |
| Decisión | Antes de abrir, Después o Descartar, con una línea de por qué |

Ejemplo.

| Pantalla | Qué pasó | Cuántos de los 5 | Tipo | Decisión |
|---|---|---|---|---|
| Inicio | No sabían por dónde empezar | 3 | Confusión | Antes de abrir, porque es la primera impresión |
| Simular | El examen de 20 tardó en cargar | 1 | Falla | Después, no vuelve a pasar |

A la sesión le pasas solo esa lista y los números de la tarjeta. No sus comentarios, no sus nombres y no sus correos. Ella convierte cada hallazgo en una tarea con el nombre de la pantalla, la pone en PROGRESS.md sin datos personales y la arregla.

## Cómo se mide

Hay tres fuentes. Se usan juntas porque ninguna sola alcanza con 5 personas.

1. **La encuesta.** Las preguntas Cuántos días usaste y Qué usaste dicen quién usó Repasar y Simular. La tarjeta de Usuarios lo cuenta por opción
2. **La analítica.** Solo cuenta a quien dio el permiso Medición de uso, que empieza apagado. Un embudo en PostHog con los eventos de docs/ANALITICA.md
3. **Tu plática.** Lo que te dijeron en el chat

### El embudo en PostHog

En PostHog, Product analytics, crea un embudo (Funnel) con ventana de conversión de 14 días y orden secuencial. Filtra por la propiedad role igual a student, y por la fecha antes del día que abras el registro. Mientras el registro está cerrado, todas las cuentas de alumno de ese tiempo son del grupo, así que no hace falta una marca.

| Paso | Evento | Qué responde |
|---|---|---|
| 1 | signup_completed | Cuántos entraron |
| 2 | review_session_completed | Cuántos usaron Repasar y en cuánto tiempo desde el registro |
| 3 | practice_session_completed o exam_completed, cualquiera de los dos | Cuántos usaron Simular |
| 4 | Cualquiera de los anteriores entre el día 6 y el 8 | Cuántos volvieron |
| 5 | survey_completed | Cuántos contestaron la encuesta |

Mira también paywall_viewed y tour_skipped, que son señales de dónde se atoraron. Si en un paso solo hay 2 personas, es una anécdota y no una cifra, y el resumen lo dice así.

### Sin permiso no hay evento

Cada aspirante decide si da Medición de uso. Quien no lo da no deja ningún evento, y la encuesta no lo sustituye ni se le pide a nadie. Por eso el resumen siempre dice cuántos de los 5 dieron el permiso. Lo que la analítica no ve lo cubren las preguntas de la encuesta y tu plática. Si solo 2 de los 5 lo dan, no insistas, decide con la encuesta y la plática, y a quien no contesta no se le persigue.

## El resumen para PROGRESS.md

Es de grupo, sin nombres, correos, comentarios ni códigos. Tú pasas las cifras y la sesión lo escribe.

```
B18 primeros alumnos, fecha. Invitados 5, con cuenta N, dieron Medición de uso N, contestaron N.
Repasar. N de N con permiso hicieron su primera sesión en menos de 48 horas.
Simular. N de N con permiso hicieron una práctica o un examen.
En la encuesta, N marcaron Repasar y N marcaron Simular. Medianas de claridad, facilidad y utilidad (con 3 o más respuestas).
Lo que frenó, por conteo. Recomendarían, sí N, tal vez N, no N.
Hallazgos, lista numerada que escribió Ricardo, cada uno con su decisión (antes de abrir, después o descartar).
```

## Qué recibe la sesión y qué no

- **Sí recibe.** El resumen por conteos de la tarjeta (cuántas cuentas cumplen, cuántas contestaron y los conteos por opción, que es lo que devuelve admin_survey_summary) y tu lista de hallazgos escrita por ti
- **No recibe.** Los comentarios, los códigos ni las respuestas una por una, que es la lista de la tarjeta (admin_survey_responses)

La razón es una regla del proyecto, que al modelo de IA solo viajan identificadores seudónimos y texto del banco. Un comentario de un alumno no es ninguno de los dos. Pasar los comentarios acelera el análisis, pero rompe esa regla. Solo con tu permiso por escrito, y en ese caso hay que revisar también el aviso de privacidad.

Que la sesión no lea los comentarios es una regla de conducta (D-139) y no un control técnico. La función admin_survey_responses devuelve los comentarios a quien abre la tarjeta como dueño o admin, y una sesión con acceso a la base de datos como postgres, como la que tiene el conector de Supabase, podría leer la tabla. Lo que lo evita de verdad es que la sesión no tiene tu llave de admin ni la usa para esta tabla, y que a la sesión solo le pasas el resumen por conteos (admin_survey_summary) y nunca la lista. Si algo de la tarjeta sale de tus manos, que sea ese resumen.

## Cuándo abrir el registro

Se abre cuando se cumplen las tres cosas.

1. Los 5 entraron. En Invitaciones, los 5 dicen Con cuenta
2. Al menos 4 hicieron Repasar y Simular, según la encuesta o la analítica
3. Ninguna falla marcada Antes de abrir sigue sin arreglar

Y lo decides tú. Si algo del primer punto falla porque alguien no pudo entrar, eso es en sí un hallazgo, y casi siempre es el correo distinto al invitado.

### El día que abras

1. En Usuarios, Invitaciones, toca Abrir el registro y confirma
2. En Usuarios, Encuesta de los primeros días, escribe en Solo cuentas creadas antes de la fecha de ese día. Así las cuentas nuevas ya no reciben la encuesta de los primeros días, que era para los primeros 5
3. Pide a la sesión que ponga las cifras finales en PROGRESS.md

## Si algo sale mal

| Qué pasa | Qué hacer |
|---|---|
| Alguien no recibe el código | Revisa su carpeta de spam, que el correo sea el invitado y que B17 esté publicado. Pide otro código. Si sigue sin llegar, dímelo con la hora y su proveedor de correo |
| Alguien dice que Studiare está abierto solo con invitación | Entró con un correo distinto al invitado. Invita ese correo, o pídele que use el invitado |
| La franja de la encuesta no sale a los 7 días | Revisa en Usuarios que la encuesta esté prendida y los días de espera en 7, y que la cuenta tenga 7 días completos. La franja nunca sale dentro de un repaso, un examen o una pregunta, y si la escondieron en ese dispositivo se encuentra en Configuración, Privacidad |
| Alguien quiere borrar su respuesta | Configuración, Privacidad, Borrar mi respuesta. Se borra al momento |
| La tarjeta dice que solo el dueño y los administradores pueden verla | Entra con tu cuenta de dueño y tu código del segundo factor |

## Lo que hace la sesión por ti

1. Aplica el plan b18 con npm run deploy:supabase -- --plan b18, primero con --dry-run, y comprueba que las seis funciones de la encuesta existen y que el ajuste está apagado
2. Hace una prueba de humo sin llaves. Una llamada anónima a my_survey_status debe rechazarse
3. Prueba la encuesta con 0 días en una cuenta tuya y la deja prendida con 7 cuando tú lo digas
4. Convierte tu lista de hallazgos en tareas, las anota en PROGRESS.md sin datos personales y las arregla
5. Escribe el resumen con las cifras que le pases

Por regla de conducta, la sesión no lee los comentarios y no corre ninguna consulta sobre la tabla de la encuesta, solo la comprobación de estructura del plan b18 y el resumen por conteos que le pases. No es un control técnico (ver Qué recibe la sesión y qué no).

## Decisiones que esperan tu visto bueno

Cada una trae la opción recomendada, que ya está aplicada.

- **Guardar el usuario junto al código.** La tabla liga cada respuesta a la cuenta, para poder borrarla y para que sea una sola por alumno, pero al equipo solo le llega el código. Recomendado, porque sin la cuenta ligada no se podría borrar la respuesta de una persona
- **Una franja y no una ventana.** La encuesta se ofrece en una franja arriba, con Contestar, Ahora no (2 días, hasta tres veces) y No quiero contestarla, y nunca durante el estudio. Una ventana sobre Inicio rompería el diseño que fijaste
- **Siete preguntas cerradas y un comentario.** Unos 2 minutos. Más preguntas bajarían las respuestas de un grupo de 5. Sin precio ni NPS
- **Borrar la respuesta con su propia función.** Borrar mis datos no la borra, y el aviso lo dice. Eliminar la cuenta sí. Es para no mantener otra copia de Borrar mis datos
- **Solo tú lees los comentarios.** La sesión no los recibe, por regla de conducta y porque tú no se los pasas
- **Quiénes reciben la encuesta.** Se controla con la fecha límite del ajuste y no con una marca en las invitaciones
- **La encuesta no depende de ningún permiso.** Los tres eventos de la encuesta sí piden Medición de uso
- **Solo el dueño y los administradores ven las respuestas.** Que un médico las viera sería una decisión nueva
- **El aviso de privacidad sube a 2026-10-22b.** En borrador para tu abogado
- **Supabase de pago antes de invitar.** Es un gasto y lo decides tú
