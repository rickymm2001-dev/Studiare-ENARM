# Cambios al aviso de privacidad en B18

Lista de lo que B18 (primeros alumnos y encuesta de los primeros días) cambió en el aviso de privacidad, para que el abogado y Ricardo la revisen junto con CAMBIOS-B17.md, CAMBIOS-B16.md y CAMBIOS-B15.md. El texto sigue en borrador para revisión del abogado, en la app y en docs/legal. La marca se quita solo cuando Ricardo diga que el abogado lo aprobó (0.1 del plan del cambio). Los términos y condiciones no cambian en este bloque.

## Por qué cambia

Studiare va a pedir una encuesta corta a los primeros alumnos a los pocos días de su cuenta, para corregir lo que falle antes de abrir el registro. Es un dato nuevo que el alumno da a propósito, se guarda en la base y lo leen personas del equipo. El aviso tiene que decir qué se guarda, quién lo ve, que no va a la analítica ni a la inteligencia artificial y cómo se borra, antes de que el primer alumno la conteste.

## Qué cambió en el texto

- **Qué datos tratamos**, una viñeta nueva. Encuesta de los primeros días. Es opcional. Si el alumno decide contestarla, se guardan sus respuestas y su comentario con un código, los días que pasaron desde que creó su cuenta y la versión de la encuesta, sin su nombre ni su correo. Solo la ven el dueño y los administradores. No va a herramientas de analítica ni a la inteligencia artificial. Se borra en Configuración, Privacidad, y sola al eliminar la cuenta
- **Para qué los usamos**, una viñeta nueva. Corregir lo que falle antes de abrir Studiare a más gente, con las respuestas de quien decida contestarla
- **Lo que solo hacemos si lo permites**, un párrafo nuevo. La encuesta es opcional, la contesta el alumno a propósito y no depende de ninguno de los permisos de Privacidad. Se aclara aquí para que nadie crea que contestarla es parte de Medición de uso o de Mejora con tus datos sin nombre
- **Tus derechos**. Acceder suma que el archivo de Exportar mis datos trae la respuesta a la encuesta (y, que ya era cierto desde B15, los recordatorios por correo). Cancelar dice que Borrar mis datos no quita la respuesta a la encuesta, que se quita aparte con Borrar mi respuesta, y que eliminar la cuenta sí la borra sola
- **Cuánto tiempo los conservamos**, una frase. La respuesta se queda mientras haya cuenta o hasta que el alumno la borre

## Lo que el texto no dice, a propósito

El texto nunca llama anónima a la encuesta. Se guarda con un código al azar, pero con pocos alumnos quien la lee puede deducir de quién es una respuesta, y el comentario puede delatar a quien lo escribe. Por eso la pantalla de la encuesta dice con un código y sin tu nombre ni tu correo, y le pide al alumno que no escriba datos personales ni de pacientes. Una prueba revisa que ni el aviso ni la pantalla usen la palabra.

## La versión del aviso

PRIVACY_NOTICE_VERSION pasa de 2026-10-22 (B17) a 2026-10-22b, una segunda versión del mismo día, con la fecha a la vista del 22 de octubre de 2026. Quien aceptó la anterior ve el aviso de que cambió y lo acepta de nuevo. Una prueba revisa que la nueva quede después de todas las anteriores al ordenarlas como texto.

- **Opción recomendada, subirla ya.** Razón en una línea. El texto cambió y la versión es lo que el alumno acepta, y todavía no hay alumnos reales, así que pedir una aceptación más cuesta casi nada
- **Otra opción, dejarla en 2026-10-22.** Tiene sentido si el abogado prefiere aprobar un solo texto final antes de invitar. Se logra revirtiendo el cambio de la versión. El texto nuevo ya diría lo de la encuesta aunque la versión no suba, así que no conviene invitar a nadie sin que se acepte la nueva

## Lo que el texto da por hecho de B18

Antes de quitar la marca de borrador tiene que ser cierto.

- Las funciones de la base devuelven los comentarios solo al dueño y a los administradores que abren la tarjeta Encuesta de los primeros días, de Usuarios, con su sesión (supabase/tests/first_week_survey_test.sql lo revisa). Que la sesión que mantiene el proyecto no los lea es una regla de conducta (D-139) y no un control técnico, porque una conexión con acceso a la base como postgres podría leer la tabla. Lo que lo evita es que a la sesión no se le da la llave de admin de Ricardo para esa tabla y solo se le pasa el resumen por conteos
- La encuesta no sale a PostHog, a Sentry ni a la inteligencia artificial. Solo salen survey_shown, survey_dismissed y survey_completed, con permiso de Medición de uso, y nunca una respuesta ni el comentario (docs/ANALITICA.md)
- Borrar mi respuesta funciona. Quita la fila de la tabla survey_responses con su propia función y no deja copia

## Preguntas para el abogado

Se suman a las de CAMBIOS-B17.md, CAMBIOS-B16.md y CAMBIOS-B15.md.

1. **Finalidad y consentimiento.** La encuesta es opcional y se contesta a propósito, no por una casilla de permiso. ¿Basta con decirlo en Qué datos tratamos y en Lo que solo hacemos si lo permites, o conviene una casilla o un aviso aparte antes de la primera pregunta? La pantalla ya trae la frase de privacidad antes de las preguntas
2. **El comentario libre.** Puede traer datos personales aunque la pantalla pida que no se escriban. La base rechaza las formas comunes de dejar un correo o un teléfono (también con espacios, con la arroba de ancho completo, escrito (at) o como la palabra arroba), pero es un apoyo y no una garantía, y no puede rechazar un nombre. ¿Hace falta algo más que el aviso en pantalla y la posibilidad de borrarlo?
3. **Quién lee las respuestas.** Las leen el dueño y los administradores, con segundo factor cuando se pide. Además, quien tenga acceso de administración a la base de Supabase podría leer la tabla, por ejemplo la sesión que mantiene el proyecto, que por regla no lo hace. ¿Hay que nombrar el cargo, o decir lo del acceso a la base, o basta con el dueño y los administradores de Studiare?
4. **Borrar mis datos no borra la encuesta.** Es una decisión de diseño para no mantener otra copia de esa función (8.4 del diseño de B18). El aviso lo dice. ¿Es aceptable, o Borrar mis datos debe borrarla también?

## Preguntas para Ricardo

1. **La versión.** ¿Subimos el aviso a 2026-10-22b ahora, como está, o la dejamos en 2026-10-22? Recomendado subirla ahora
2. **Manda estos archivos a tu abogado** junto con CAMBIOS-B17.md, CAMBIOS-B16.md y CAMBIOS-B15.md. Son docs/legal/aviso-de-privacidad.md, docs/legal/terminos-y-condiciones.md y este
3. **Quién lee los comentarios.** Recomendado que solo los leas tú, en la tarjeta. La sesión no los recibe, porque CLAUDE.md dice que al LLM solo viajan identificadores seudónimos y texto del banco. Es una regla de conducta y no un control técnico, así que lo que la sostiene es que no le pases la lista, solo el resumen por conteos. Si algún día quieres que los lea, es una decisión tuya por escrito y habría que revisar este aviso

## Cambios en la app y en el código

- src/i18n/legalDocs.ts tiene el texto nuevo. docs/legal/aviso-de-privacidad.md se generó con npm run legal:export, y una prueba falla si se queda atrás
- src/config/legal.ts sube PRIVACY_NOTICE_VERSION a 2026-10-22b y explica la historia de versiones
- src/features/legal/fillLegal.test.ts tiene una prueba nueva (la encuesta está en el aviso con lo que se guarda, quién la ve, que no va a la analítica y cómo se borra, y nunca se llama anónima), la versión nueva y el orden de las versiones con la de B18
