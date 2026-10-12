# Plan del cambio de Studiare

Es la versión 3 de la plataforma. Se escribió el 2026-10-12 con las 102 respuestas del cuestionario de Ricardo, sus 18 comentarios y una revisión del repo, de su Google Sheet del banco y de la estructura del ENARM.

## Cómo se usa

- Abre una sesión nueva de Claude Code con el repo Studiare-ENARM, con la configuración de la sección 10
- Manda este mensaje. "Lee docs/PLAN_DEL_CAMBIO.md y ejecútalo completo. Te doy la autorización de su sección 0.1"
- La sesión lee también CLAUDE.md, PROGRESS.md, DECISIONES.md, docs/PROMPT_PROTOTIPO.md y docs/PENDIENTES_DE_RICARDO.md
- Donde este plan contradiga a PLAN.md o a la especificación, manda este plan. Las reglas que no se rompen de CLAUDE.md siguen mandando, con los ajustes que pide el bloque B0
- El cuestionario completo, con cada opción y la respuesta de Ricardo, está en el anexo A

## Índice

0. Reglas para la sesión que ejecuta
1. Resumen
2. Decisiones del cuestionario
3. Los 18 comentarios de Ricardo
4. Choques y cómo se resuelven
5. Lo que Ricardo pidió que se le explicara
6. Estructura del ENARM
7. El banco en Google Sheets
8. Bloques de trabajo
9. Lista de pendientes de Ricardo
10. Entorno de la sesión que ejecuta
11. Terminado y lanzamiento
- Anexo A. Cuestionario con respuestas

## 0. Reglas para la sesión que ejecuta

### 0.1 Lo que autoriza Ricardo al mandar el mensaje de arranque

Sin preguntarle, la sesión puede
- Hacer commit y push, abrir PRs a main y fusionarlos cuando pasen los trabajos check, e2e y audit del CI
- Aplicar migraciones y desplegar funciones en el proyecto de Supabase de Studiare
- Operar Stripe y Mercado Pago solo en modo prueba. Incluye crear y archivar productos, precios, cupones y configuraciones del portal, cancelar suscripciones, reembolsar pagos de prueba y borrar datos de prueba
- Borrar en la base los datos de pago de prueba de las dos cuentas de prueba de Ricardo (respuestas 1 y 2)
- Ajustar CLAUDE.md como lo pide el bloque B0
- Pasar de un bloque al siguiente sin detenerse a pedir aprobación
- Elegir la opción recomendada de este plan cuando algo sea ambiguo, anotarla en DECISIONES.md y seguir

La sesión pregunta antes de
- Tocar el modo real de Stripe o de Mercado Pago, o hacer cualquier cobro real
- Borrar datos de alumnos reales
- Gastar dinero o contratar un servicio
- Publicar como definitivos los textos legales
- Cambiar el contenido médico del banco o del Google Sheet. La estructura del Sheet sí se puede cambiar, según 7.4
- Romper una regla de CLAUDE.md que este plan no resuelve

### 0.2 Forma de trabajo

- Los bloques van en el orden de la sección 8. Si un bloque espera algo de Ricardo, deja listo lo que no depende de él, con dobles de prueba (fakes) y apagado por configuración, y sigue con el siguiente
- Un PR por bloque, o por par de bloques chicos, fusionado a main con el CI en verde. Es lo que pidió Ricardo en la respuesta 99, lo más rápido posible con la mejor calidad
- Antes de usar la API de una librería o de un servicio, revisa su documentación vigente. Aplica a Stripe, Mercado Pago, Supabase, Google, Resend, PostHog, Sentry y Cloudflare. Varias cosas de este plan se verificaron solo con búsquedas y están marcadas para confirmar
- Usa subagentes de exploración para leer mucho código y guarda en tu contexto solo las conclusiones
- Cada decisión nueva va a DECISIONES.md con el número que siga. Este plan se registra como D-119 en el bloque B0
- Al terminar cada bloque, pon al día PROGRESS.md con lo hecho, la evidencia, el conteo de pruebas y lo que falta de Ricardo, y haz push. Así se puede seguir después de una compactación o de un límite de uso
- Las dudas que no frenan van a una sección Preguntas para Ricardo en PROGRESS.md y se le presentan juntas al final
- Si fallas dos veces en corregir lo mismo, documenta lo intentado en PROGRESS.md, sigue con otro bloque y deja la pregunta para el final
- Las ideas fuera del alcance van a IDEAS.md
- Nunca pidas llaves ni secretos por el chat. Si falta uno, anótalo en docs/PENDIENTES_DE_RICARDO.md con el paso exacto para ponerlo

### 0.3 Cierre de cada bloque

Es la sección 15.1 de la especificación sin el paso 6. No te detengas a pedir aprobación, salvo en lo que pide 0.1.
1. npm run check y las pruebas e2e del bloque. Las e2e nuevas cubren sus flujos en teléfono y en computadora
2. Capturas de las pantallas que cambiaron en 390, 1280 y 1920 px, en claro y en oscuro, en docs/screenshots/v3 con una carpeta por bloque
3. Revisión de un subagente que no escribió el código, contra este plan y las reglas de CLAUDE.md. Corrige lo que encuentre
4. PROGRESS.md y DECISIONES.md al día
5. Commit claro en español, push, PR y fusión con el CI en verde. Si el CI falla, se busca la causa y se corrige. Nunca se salta ni se desactiva una prueba

Hay una prueba que falla a veces cuando la máquina está cargada. Es "un SIGNED_IN rezagado mientras se cierra la sesión no reabre el perfil ni reclama de nuevo", en src/app/cloud.test.tsx, y depende de un retraso de 60 ms. Se vuelve robusta en el bloque B1.

## 1. Resumen

- Rediseño completo para que Studiare se vea como un producto hecho por un equipo experto, sin degradados y con un solo color de acción, #156082
- Navegación más simple. Configuración abajo con un engrane, Perfil dentro de Configuración, Apuntes en el menú, y sin Plan, sin Logros y sin ligas
- Revisión del examen que convierte preguntas en tarjetas y pregunta por qué fallaste
- Pagos completos. Prueba gratis de 7 días, Fundador anual a 749, cambio de plan con prorrateo, OXXO, SPEI, Mercado Pago, códigos de influencer y factura a pedido
- Banco real en la nube sincronizado con el Google Sheet de los médicos, con Salud pública e Inglés médico
- IA real dentro de Supabase con los cinco motores, y OpenAI solo para comparar calidad
- Un modelo del alumno que aprende de repasos, simuladores, apuntes y motivos de error, con comparación contra otros alumnos y por especialidad, sin predecir el puntaje
- Party real entre alumnos, con grupos, tabla, duelos y referidos
- Cuentas con Google, registro por invitación hasta lanzar y segundo factor para médicos y admins
- Analítica, alertas de errores, recordatorios por correo y un recorrido guiado
- Auditoría de todos los procesos al inicio y al final
- Lanzamiento antes de que termine 2026, en Cloudflare Pages con el dominio de Ricardo

## 2. Decisiones del cuestionario

La pregunta completa y sus opciones están en el anexo A. Donde la respuesta dice lista de pendientes, el paso está en la sección 9.

### Pagos y Stripe

| N. | Respuesta | Qué se hace |
|---|---|---|
| 1 | A. Que Claude limpie la prueba | Cancelar de inmediato las suscripciones de prueba y reembolsar el último pago (B0) |
| 2 | A. La otra cuenta es de Ricardo | Se limpia igual |
| 3 | A. Ya cambió la llave de prueba | Nada que hacer |
| 4 | A. Borra stripe-config-check | En su lista |
| 5 | C. Activa Stripe real esta semana | En su lista, a nombre de su empresa |
| 6 | C. Lo ve con su contador | En su lista. La responsable es la empresa (respuesta 42) |
| 7 | D. Todas las formas de pago | Tarjeta, OXXO, SPEI y Mercado Pago (B10 y 4.4) |
| 8 | B. Mercado Pago desde el lanzamiento | Su función de avisos, su renovación y su cuenta (B10) |
| 9 | A, con descuento por la diferencia | Cambio de plan en el portal con prorrateo, antes de lanzar (B10) |
| 10 | A. Garantía de 7 días desde el primer pago | En términos y en la pantalla de pago |
| 11 | A. Reembolsos desde el panel de Stripe | Como hoy |
| 12 | A. Factura a quien la pida, a mano | Formulario Pedir factura y lista para el admin (B10) |
| 13 | A. IVA incluido | Los precios lo dicen |
| 14 | A. Sin Stripe Tax por ahora | En su lista, para confirmarlo con su contador |

### Precios y planes

| N. | Respuesta | Qué se hace |
|---|---|---|
| 15 | A. Se quedan 79, 149 y 1,499 | En su lista, crear los precios reales al lanzar |
| 16 | C. Fundador anual a 749 para 100 | Nuevo precio y promoción del anual (B10 y 4.5) |
| 17 | C. Quien cancela pierde el precio y el lugar no se libera | Es la regla de hoy (ver 4.6 para la prueba gratis) |
| 18 | A, más prueba de 7 días | Gratis con 20 al día. Mensual y anual con 7 días gratis, con tarjeta y cobro automático al terminar salvo que cancele (B10) |
| 19 | A. Gratis ve la explicación | En sus preguntas del día |
| 20 | C, D y E | Gratis sin Apuntes, sin Party y sin Importar mazos. Los referidos siguen abiertos (4.3) |
| 21 | A. Códigos con descuento en el primer pago | Uno por influencer (B10) |
| 22 | A. Cómo nos conociste, opcional | En el registro (B9) |

### Cuentas, correo y seguridad

| N. | Respuesta | Qué se hace |
|---|---|---|
| 23 | B. Agrega el código a las plantillas hoy | En su lista |
| 24 | Dominio propio a nombre de Plexus Medica S. de R.L. de C.V. | En su lista. El proveedor de correo queda en Resend (4.13) |
| 25 | A. Correos desde su dominio | Con Resend (B17) |
| 26 | A. Entrar con Google antes de lanzar | B9 |
| 27 | A. Supabase de pago antes de abrir | En su lista |
| 28 | A. Protección de contraseñas filtradas | En su lista, con el plan de pago |
| 29 | A. Cuatro roles | Como hoy |
| 30 | A. Segundo factor para médicos y admins | B9 |
| 31 | C. Sin prueba de penetración por ahora | En IDEAS.md y en su lista para cuando crezca |
| 32 | A. Aviso por correo cuando algo se rompe | Con Sentry (B15) |

### Inteligencia artificial

| N. | Respuesta | Qué se hace |
|---|---|---|
| 33 | B. Crea su cuenta de Anthropic esta semana | En su lista |
| 34 | A. Proxy dentro de Supabase | B12 |
| 35 | A. Clave como secreto del servicio y ajuste de CLAUDE.md | B0 y B12 |
| 36 | A. 5 dólares al día | Como hoy |
| 37 | A, B, C, D y E | Los cinco motores, incluido el de preguntas reestructuradas (B12) |
| 38 | C. Segundo proveedor para comparar calidad | OpenAI solo en las evaluaciones (B12) |
| 39 | A. Hipótesis por lotes | Mitad de costo, unas horas de espera |
| 40 | A. Ya tiene a los dos médicos | Compuerta 1 con 300 textos (B12) |
| 41 | A. Lista de textos académicos tal cual | Ya está en src/config/academicSources.ts |

### Legal y privacidad

| N. | Respuesta | Qué se hace |
|---|---|---|
| 42 | B. Una empresa | Plexus Medica S. de R.L. de C.V. es la responsable (B16) |
| 43 | Lista de pendientes | En su lista, crear los correos de privacidad y soporte |
| 44 | A. Ya tiene abogado | Revisa aviso, términos y reembolsos (B16) |
| 45 | Da igual | Se queda en 18 años, la recomendada |
| 46 | A. La autorización de Paco cubre el plan de pago | Sus mazos entran al catálogo |
| 47 | A. Abre el acceso a Drive | Se suben Pediatría y Cirugía de Paco (B11) |
| 48 | A. Repo privado al pasar a Cloudflare | En su lista |
| 49 | B. Catálogo compartido con autorizaciones | Mazos de terceros para todos, con permiso escrito (B11 y 4.21) |

### Dominio y publicación

| N. | Respuesta | Qué se hace |
|---|---|---|
| 50 | A. Ya tiene dominio | En su lista, decir cuál es |
| 51 | A. Cloudflare Pages | B17 |
| 52 | C. Solo con invitación hasta lanzar | B9 |
| 53 | C. Textos de venta del influencer o de una agencia | La portada queda lista para recibirlos (B17 y 4.17) |
| 54 | A. Studiare es la marca definitiva | Se quita Prototipo ENARM de todos lados (B0) |

### Contenido y médicos

| N. | Respuesta | Qué se hace |
|---|---|---|
| 55 | A. Sus bancos propios | Más su Google Sheet |
| 56 | A. 300 preguntas, con su Google Sheet sincronizado | Sección 7 y B11 |
| 57 | C. De tres a cinco médicos | Flujo editorial con asignación (B11) |
| 58 | A. Pago por pregunta revisada | Reporte de revisiones por médico (B11) |
| 59 | A. Salud pública como séptima rama | B11 |
| 60 | Que se revise en internet | Sección 6 |
| 61 | B. Inglés médico antes de lanzar | B13 |
| 62 | C. No habrá prueba con 5 aspirantes | Ver 4.8 |
| 63 | A. Ya tiene a los 5 aspirantes | Son los primeros invitados (B18) |
| 64 | C, que no existía | Se toma A, correo al médico con cada reporte (4.9) |

### Banco en la nube

| N. | Respuesta | Qué se hace |
|---|---|---|
| 65 | Que se explique | Explicado en 5.1. Se toma A |
| 66 | Que se explique | Explicado en 5.2. Se toma A |
| 67 | D. Sin tope en los planes de pago | Sin tope diario, con un freno contra robots (4.10) |
| 68 | E. Todo junto cuando esté listo | Se sube completo al llegar a 300 revisadas |

### Qué esconder al lanzar

| N. | Respuesta | Qué se hace |
|---|---|---|
| 69 | B. Los duelos se quedan | Con rivales reales en Party (B7) |
| 70 | C. Quitar las ligas | B3 |
| 71 | B, conectado al aprendizaje automático | Fatiga con su estado calibrando y validada con datos reales (B14) |
| 72 | Que se explique | Explicado en 5.3. Se queda prendida (respuesta 37 E) |
| 73 | Que se explique | Explicado en 5.4. Se esconde en producción |
| 74 | A, mejorado y unido a los mazos | B6 |
| 75 | A. El Pomodoro se queda | Se mide su uso y sus ajustes van a Repasar |
| 76 | A. La captura del puntaje se queda | Pasa a Progreso |
| 77 | A. Party se queda con grupos, tabla y referidos | Sin ligas, y en la nube (B7) |

### Qué agregar

| N. | Respuesta | Qué se hace |
|---|---|---|
| 78 | A. PostHog con permiso | B15 |
| 79 | A. Sentry | B15 |
| 80 | Recorrido guiado con Saltar introducción | B15 |
| 81 | A. Recordatorios por correo | B15 |
| 82 | A. Modo enfoque | B7 |
| 83 | A. Resumen semanal para compartir | B7 |

### Datos y aprendizaje automático

| N. | Respuesta | Qué se hace |
|---|---|---|
| 84 | Que el sistema aprenda de todo y comparación por especialidad | B14 y 4.2 |
| 85 | A. Calibración nocturna en GitHub Actions | B14 |
| 86 | A. Llave del servidor como secreto de GitHub | En su lista |
| 87 | A. Solo respuestas con permiso | B14 |
| 88 | Que se recomiende la mejor opción | 5.5 |
| 89 | A. Modo adaptativo | B14 |
| 90 | B. FSRS de fábrica para todos | 4.2 |
| 91 | A. Los mismos revisores etiquetan sesgos | B11 |
| 92 | A. El médico asignado corrige distractores | B11 |
| 93 | B. Sincronizar ajustes, sesiones y hallazgos antes de lanzar | B14 |
| 94 | A. Explorar un piloto con una universidad | En IDEAS.md y en su lista |

### Orden y forma de trabajo

| N. | Respuesta | Qué se hace |
|---|---|---|
| 95 | A. Orden aprobado | Con los comentarios nuevos queda como la sección 8 |
| 96 | A. Lanzar antes de que termine 2026 | B19 |
| 97 | A. ENARM 2027 provisional el 13 de septiembre | Se queda. Ver la sección 6 |
| 98 | A. Fases cerradas | Se anota en PROGRESS.md (B0) |
| 99 | Lo más rápido con la mejor calidad | Un PR por bloque con CI en verde, sin detenerse entre bloques |
| 100 | A. Unir la rama | B0. La decisión quedó como D-118 porque main ya usaba D-117 |
| 101 | A. Guardar en docs | El cuestionario es el anexo A |
| 102 | E. Nadie más contesta | |

## 3. Los 18 comentarios de Ricardo

Ricardo pidió que todos se consideren tal y como los escribió. El texto literal está al final del anexo A. Aquí va qué se hace con cada uno y en qué bloque.

| N. | Comentario | Bloque |
|---|---|---|
| 1 | Convertir una pregunta de la revisión del examen en tarjeta, en el mazo que elija el alumno, incluidos los precargados | B5 |
| 2 | Preguntar en la revisión por qué falló, con Conocimiento, Tiempo, Malinterpretación, Lectura superficial, Ansiedad, Exceso de confianza y Fatiga | B5 |
| 3 | Solo Configuración baja a la esquina inferior izquierda del menú, con ícono de engrane | B3 |
| 4 | Los ajustes del repaso y del Pomodoro se mudan a Repasar | B3 |
| 5 | Configuración con solo Perfil (con el plan en primer plano), Apariencia y Privacidad, en una página con subtítulos y líneas, sin subpestañas | B3 |
| 6 | Quitar Perfil del menú y unir Cuenta y Perfil en un solo Perfil dentro de Configuración | B3 |
| 7 | La letra de la barra blanca de arriba del tamaño de Tus repasos y siempre en negritas | B2 |
| 8 | Cada mazo en Repasar muestra todos sus temas en orden alfabético | B4 |
| 9 | Quitar todo lo que diga "Demostración, no validado por médicos" | B2 y 4.1 |
| 10 | Sin degradados en ningún recuadro. Solo los botones con acción llevan color, exactamente #156082 | B2 y 4.7 |
| 11 | Explorar es impráctico, hay que mejorarlo | B4 |
| 12 | Apuntes en el menú lateral | B3 |
| 13 | Quitar Plan y llevar a Progreso lo que valga la pena | B3 |
| 14 | Quitar Logros por completo | B3 y 4.12 |
| 15 | Fotos de perfil mejores | B2 |
| 16 | Perfil de solo lectura con un botón Editar perfil | B3 |
| 17 | Auditar a fondo todos los procesos y subprocesos y dejarlos impecables | B1 y B19 |
| 18 | Que toda la apariencia parezca hecha por un humano experto | B2 |

## 4. Choques y cómo se resuelven

Si Ricardo no dice otra cosa antes del mensaje de arranque, rige lo que dice cada punto. La sesión anota cada uno en DECISIONES.md.

**4.1 Comentario 9 y la regla de etiqueta visible.** CLAUDE.md pide una etiqueta visible en todo contenido de demostración y dato simulado, y Ricardo pidió quitar la frase "Demostración, no validado por médicos". Se quita de cada pantalla. Queda un solo aviso discreto y global, Versión de demostración, mientras la app use el banco de demostración, y desaparece con el banco real. La etiqueta Datos simulados (compañeros y rivales simulados de la demo) y la de borrador de la IA se quedan, porque responden a otras reglas.

**4.2 Respuesta 84, la regla de no predecir y la respuesta 90.** Ricardo quiere que el sistema aprenda de todo y que el alumno se compare con otros. CLAUDE.md prohíbe predecir el puntaje del ENARM y la respuesta 90 deja FSRS de fábrica. La comparación es de lo que ya pasó, en percentiles, nunca un puntaje estimado ni una probabilidad de plaza. FSRS se queda de fábrica y todo lo demás del modelo sí aprende (B14). Si Ricardo cambia de opinión sobre FSRS, el ajuste por alumno desde 1,000 repasos es un bloque chico.

**4.3 Respuesta 20 y los referidos.** Party se cierra en Gratis, pero los referidos viven en Party y son la forma de traer alumnos. En Gratis se cierran grupos, tabla, retos y duelos. La tarjeta Invita y gana un mes sigue abierta, en Party y en Configuración.

**4.4 Respuesta 7 y la renovación automática.** Según la documentación de Stripe, OXXO y SPEI no funcionan en el pago de suscripciones, que son las que se renuevan solas y llevan la prueba gratis. Queda así. Tarjeta con renovación y prueba gratis. OXXO y SPEI como pases de un solo pago, de 1 mes o de 1 año, sin renovación. Mercado Pago con su suscripción y su pago único. El precio Fundador solo con renovación automática, para que el lugar quede ligado a una suscripción. Se confirma en la documentación vigente antes de construir.

**4.5 Respuesta 16 y el cupo de 100.** No dice si el Fundador anual tiene sus propios 100 lugares. Se toman los mismos 100 lugares para el Fundador mensual y el anual, porque un Fundador es una persona y no un precio. Cambiar entre Fundador mensual y anual en el portal conserva el lugar.

**4.6 Respuestas 17 y 18, prueba gratis y cupo Fundador.** Si la prueba ocupara un lugar para siempre, 100 pruebas canceladas acabarían la promoción sin un solo pago. El lugar se aparta al empezar la prueba y se libera si se cancela antes del primer cobro, porque esa persona nunca fue Fundador. Quien ya pagó y cancela pierde precio y lugar, y el lugar no se libera, como pidió Ricardo.

**4.7 Comentario 10 y lo que necesita color.** Hay información que se entiende por su color. Quedan estas excepciones, siempre con ícono y texto además del color. Correcto e incorrecto al contestar, avisos y errores de formularios, el anillo de foco, y las gráficas y el heatmap en tonos de #156082 y grises. Lo dorado del nivel y del XP pasa a neutro. Si Ricardo quiere todo sin color, solo cambian los tokens.

**4.8 Respuestas 62 y 63.** No habrá prueba con 5 aspirantes, pero Ricardo ya los tiene. No hay prueba formal. Los 5 entran primero, con invitación, y se aprende de su uso y de una encuesta corta (B18).

**4.9 Respuesta 64.** La opción C no existía. Se toma A, la recomendada, que es avisar por correo al médico cuando llega un reporte de error.

**4.10 Respuesta 67 y la protección del banco.** Sin tope diario en los planes de pago, alguien podría bajar el banco entero con un programa. No hay tope diario. Hay un freno por minuto que ninguna persona alcanza al estudiar, ajustable en platform_settings, y un aviso al admin con volúmenes raros, sin bloquear. Un examen completo de 280 preguntas cabe sin problema.

**4.11 Respuesta 8 y D-114.** D-114 dejó una sola pasarela visible. Manda la respuesta 8 y el alumno elige entre Stripe y Mercado Pago en Suscripción.

**4.12 Comentario 14, XP y misiones.** Quitar Logros por completo podría entenderse como quitar también XP, nivel, racha y Misiones de hoy. Se quitan la pantalla, las insignias, su aviso al ganarlas y las ligas. XP, nivel y racha son otro sistema y se quedan en la barra de arriba, como en D-116 y D-117. Misiones de hoy se queda en Inicio porque es parte del diseño fijo de Ricardo (D-116). El modo enfoque oculta todo eso. Quitar también las misiones es un cambio chico si Ricardo lo pide.

**4.13 Respuesta 24 y el proveedor de correo.** La respuesta habla del dominio y no del proveedor. Se toma Resend, la recomendada, revisando su precio vigente.

**4.14 Respuesta 69 y el rival simulado.** Los duelos se quedan, pero hoy el rival es simulado y Party corre completo en el navegador. Party pasa a la nube y los duelos son entre alumnos reales (B7). El rival de práctica puede quedarse con su etiqueta.

**4.15 Respuesta 9 y D-118.** No chocan. D-118 impide abrir un segundo pago mientras hay un plan vigente. Los cambios de plan van por el portal con prorrateo y el webhook los registra.

**4.16 Comentario 1 y los mazos precargados.** Una tarjeta nueva en un mazo precargado no cambia ese mazo para los demás. Queda en la capa del alumno, como sus otras ediciones.

**4.17 Respuesta 53 y lo que hoy ven Google y WhatsApp.** Mientras llegan los textos de la agencia o del influencer se pone un texto neutro con la marca Studiare, porque el de hoy dice Prototipo de una plataforma.

**4.18 Respuestas 18 y 10, prueba gratis y garantía.** Se suman. Primero 7 días de prueba sin cobro y después 7 días de garantía desde el primer cobro. Los términos y la pantalla de pago lo dicen antes de pedir la tarjeta, junto con el cobro automático al terminar la prueba.

**4.19 Respuesta 61 y la regla del texto médico de IA.** El módulo de inglés va antes del lanzamiento, pero la IA no puede inventar textos médicos. Los textos y sus preguntas los escribe el equipo o vienen de textos con licencia. La IA solo propone preguntas ancladas a un texto que aporte el equipo, como borrador para revisión.

**4.20 Respuesta 56 y el examen completo.** Con 300 preguntas un alumno hace un examen completo de 280 sin repetir, pero el segundo ya repite. El banco sigue creciendo desde el Sheet.

**4.21 Respuesta 49 y el mazo de Fer.** Pesa 328 MB. Entra al catálogo solo con la autorización escrita de Fer y se baja por submazo, para no pagar transferencia de más. Se revisa el costo de almacenamiento antes de subirlo.

**4.22 Respuesta 52 y la demo pública.** Con el registro por invitación nadie crea una cuenta real sin estar invitado, tampoco desde la demo de GitHub Pages. Al pasar a Cloudflare y hacer privado el repo, esa demo se retira.

**4.23 Comentario 2 y las causas que ya existen.** Hoy hay una lista de ocho causas en la retroalimentación de la práctica y al fallar una tarjeta. Se usa la lista de siete de Ricardo en toda la app, con una tabla de equivalencias para leer los eventos viejos, que no se editan.

**4.24 Respuesta 37 E y la pregunta 72.** Ricardo prendió el motor de preguntas reestructuradas y pidió que se le explicara. Con la explicación de 5.3 se queda prendido.

**4.25 Mazos del catálogo en Gratis.** No se preguntó. Como Gratis cierra Importar mazos y tiene límites estrictos, el catálogo compartido es de los planes de pago, con una vista previa en Gratis. Dar un mazo de muestra en Gratis es un cambio chico si Ricardo lo prefiere.

**4.26 Respuestas 6 y 42.** Ricardo lo verá con su contador, pero ya dijo que la responsable es su empresa. Se usa Plexus Medica S. de R.L. de C.V. en los textos y en la cuenta de Stripe, y el contador lo confirma.

**4.27 Consentimientos del registro.** Hoy el registro da todos los permisos solos. Eso choca con la analítica con permiso (respuesta 78) y con calibrar solo con quien dio permiso (respuesta 87). Cada uso opcional se pide por separado y empieza apagado.

**4.28 Navegación en el teléfono.** Hoy lo que no cabe en la barra de abajo se alcanza desde la tarjeta Accesos de Perfil, que desaparece con el comentario 6. La barra del teléfono queda con Inicio, Repasar, Simular, Progreso y Más. Más abre Apuntes, Tutor, Party y Configuración.

## 5. Lo que Ricardo pidió que se le explicara

### 5.1 Pregunta 65. Separar el catálogo del texto de las preguntas

- Hoy cada pregunta guarda todo junto. Separarla es tener dos partes
- El catálogo es la ficha de cada pregunta sin su texto. Rama, tema, dificultad, tipo de reactivo, estado y versión. Lo leen todos, porque con eso la app arma un examen, muestra tu avance y elige qué preguntarte sin ver el texto
- El cuerpo es el caso, la pregunta, las opciones y la explicación. Queda con candado y solo sale cuando el alumno va a contestar esa pregunta
- Para qué sirve. Para que nadie pueda bajar el banco entero, que es lo que más vale de Studiare, y para que el límite de Gratis se cumpla en el servidor y no solo en el navegador
- Se toma A, la recomendada

### 5.2 Pregunta 66. Leer las preguntas solo con una función

- En lugar de que la app lea la tabla de preguntas directo, le pide a una función del servidor las preguntas de tu sesión
- La función revisa tu plan, cuenta cuántas llevas hoy y entrega solo las que te tocan. En Gratis son 20 al día. En los planes de pago no hay tope (respuesta 67), solo el freno contra robots de 4.10
- Sin esto, alguien con conocimientos podría saltarse el límite del navegador y descargar todo
- Se toma A, la recomendada

### 5.3 Pregunta 72. La IA que reestructura preguntas

- Toma una pregunta del banco con problemas, por ejemplo una opción que nadie elige o un reporte de error, y propone una versión mejor escrita, anclada al texto original
- Esa propuesta nunca llega al alumno. Va a la cola del médico, que la aprueba, la edita o la descarta
- Sirve si hay médicos revisando esa cola. Con 3 a 5 médicos (respuesta 57) sí los habrá, y Ricardo la prendió en la respuesta 37
- Se queda prendida solo para preguntas marcadas, con su parte del presupuesto diario de IA

### 5.4 Pregunta 73. La pantalla Datos de demostración

- Es una herramienta del prototipo que siembra alumnos y respuestas simuladas para que las gráficas tengan algo que mostrar
- En producción esos datos se mezclarían con los de alumnos reales y ensuciarían la calibración, las comparaciones y las estadísticas
- Hoy además cualquier alumno puede pasarse a la base de demostración desde Configuración, en la pestaña Cuenta
- Se toma A, la recomendada. En producción se esconden la pantalla, el panel y el selector de base. Siguen en la demo para enseñar la app

### 5.5 Pregunta 88. Los umbrales de calibración

- Hoy una pregunta es provisional desde 30 respuestas y calibrada desde 100
- La mejor opción es conservar esos números y sumar dos condiciones
  - Que cuenten alumnos distintos y solo su primer intento, porque una pregunta repetida parece más fácil de lo que es
  - Que el error de la estimación sea chico. Provisional con un error estándar de 0.5 logits o menos y calibrada con 0.3 o menos. Con 100 respuestas casi siempre se cumple, pero las preguntas que casi todos aciertan o casi todos fallan necesitan más
- Así no se publica como dificultad real algo que todavía es ruido
- Se anota en DECISIONES.md y el admin puede ajustar los números

## 6. Estructura del ENARM

Ricardo pidió revisarla en internet (respuesta 60). Esto es lo que se encontró el 2026-10-12, con búsquedas web. Los PDF oficiales no se pudieron abrir desde la red de la sesión, así que la sesión que ejecuta confirma las cifras en la convocatoria vigente antes de usarlas.

**Lo que dicen fuentes oficiales o coinciden todas**
- Son 280 reactivos en formato de casos clínicos, 250 en español y 30 de comprensión de textos en inglés. Lo dijo la Secretaría de Salud en su comunicado del ENARM 2023 y lo repiten las guías de 2025 y 2026. Cada caso trae dos o tres preguntas con una sola respuesta correcta
- La convocatoria del XLIX ENARM 2025 de la CIFRHS dice que el examen explora competencias en casos clínicos de Medicina interna, Pediatría, Ginecología y obstetricia y Cirugía general, más Salud pública, Urgencias y Medicina familiar. Son las seis ramas de la app más Salud pública (respuesta 59)
- El ENARM 2025 se aplicó del 23 al 25 de septiembre y el 50 ENARM 2026 del 28 al 30 de septiembre, con prerregistro desde el 3 de abril. La fecha de 2027 sigue provisional en el 13 de septiembre (respuesta 97). Conviene moverla cuando salga la convocatoria, porque las dos últimas fueron en la última semana de septiembre

**Lo que no es oficial**
- La CIFRHS no publica cuánto pesa cada rama. Las cifras que circulan vienen de ediciones viejas o de sitios de preparación y no coinciden entre sí
- De 2009 a 2011, con 450 reactivos, se reportan 150 de Medicina interna, 100 de Pediatría, 90 de Ginecología y obstetricia y 60 de Cirugía
- Para 2016 y 2017 se reporta cerca de 37.5% de Medicina interna, 25% de Ginecología y obstetricia, 22% de Pediatría y 15% de Cirugía
- Guías recientes dan repartos distintos entre sí

**Pesos provisionales.** Sobre los 250 reactivos en español. Las cuatro troncales guardan el orden y una proporción cercana a la histórica, y las tres áreas que la convocatoria agrega se reparten el resto. La app los muestra como provisionales y el admin los puede cambiar.

| Área | Reactivos | Peso |
|---|---|---|
| Medicina interna | 75 | 30% |
| Pediatría | 50 | 20% |
| Ginecología y obstetricia | 50 | 20% |
| Cirugía general | 33 | 13.2% |
| Urgencias | 17 | 6.8% |
| Salud pública | 13 | 5.2% |
| Medicina familiar | 12 | 4.8% |
| Inglés médico | 30 | Aparte, 30 de los 280 |

**Fuentes**
- [Convocatoria del XLIX ENARM 2025, CIFRHS](https://cifrhs.salud.gob.mx/site1/enarm/2025/docs/2025-ENARM_Convocatoria.pdf)
- [Comunicado del ENARM 2023, Secretaría de Salud](https://www.gob.mx/salud/prensa/inicia-examen-nacional-de-aspirantes-a-residencias-medicas-2023)
- [ENARM 2026 abre registro, Excélsior](https://www.excelsior.com.mx/salud/enarm-2026-abre-registro-fechas-requisitos-y-sedes-examen-para-residencias-medicas)
- [ENARM 2026, fechas y requisitos, AMIA ENARM](https://www.amiaenarm.com/blog/enarm-2026-fechas-requisitos)
- [Preguntas frecuentes, EnarmSimulador](https://enarmsimulador.com/preguntas-frecuentes-enarm/)
- [Examen Nacional de Aspirantes a Residencias Médicas, Wikipedia](https://es.wikipedia.org/wiki/Examen_Nacional_de_Aspirantes_a_Residencias_M%C3%A9dicas)

## 7. El banco en Google Sheets

Ricardo pidió conectar su Google Sheet Banco de preguntas para que todo se actualice solo, analizándolo primero (respuesta 56). El ID del Sheet no va en el repo. La sesión lo encuentra con el conector de Google Drive y en producción vive en el secreto GOOGLE_BANK_SHEET_ID.

### 7.1 Qué hay hoy

- Cuatro pestañas. Instrucciones, que es la de la plantilla del repo con dos pasos viejos. Preguntas. Temas, igual a src/demo/content/topic-taxonomy.json. Y Listas, con las opciones de las celdas
- Preguntas tiene las 33 columnas de la plantilla del repo con cambios. ID, Rama troncal, Subespecialidad, Subtema, Dificultad, Tipo de reactivo, Tarea, Polaridad, Caso clínico, Pregunta, Correcta, Opción, Justificación y Sesgo de la A a la F, Set canónico, Explicación, Referencias y Estado
- 108 preguntas, todas de Ginecología y obstetricia, en 53 casos. Todas con cuatro opciones. Cada opción incorrecta ya trae su sesgo, con 16 de los 21 de la lista
- Lo comparten solo Ricardo como dueño y Paco como editor, sin enlace público. Así debe seguir

### 7.2 Por qué hoy no entra ninguna pregunta

- Los encabezados tienen una segunda línea con instrucciones y el importador no los reconoce
- El ID es una fórmula que sigue hasta el renglón 40,000. Al insertar, borrar u ordenar renglones cambian los ID de abajo, y la app mezclaría la historia de una pregunta con la de otra
- Las 108 tienen vacíos Explicación, Referencias y Estado
- La Subespecialidad dice Obstetricia o Ginecología, que no están en la lista. 37 preguntas tienen un Subtema fuera de la lista, Control prenatal y Enfermedades hipertensivas del embarazo
- La opción correcta trae Sesgo Ninguno y el importador espera la celda vacía
- Estado acepta Aprobado, pero la aprobación vive en la app
- Las referencias están dentro de la justificación de la opción correcta, con la clave de la GPC y el año
- 62 preguntas dicen De control en Tipo de reactivo. Parece un valor por omisión y hay que confirmarlo con los médicos
- No hay columna de caso. 13 preguntas dependen de una respuesta anterior del mismo caso y un caso quedó partido entre los renglones 77 y 79

### 7.3 Cómo se va a sincronizar

- Una función de Supabase, bank-sync, que corre cada hora con Supabase Cron y también con un botón Sincronizar ahora en la pantalla del banco. Lee el Sheet con una cuenta de servicio de Google que solo tiene permiso de lectura sobre ese archivo
- Usa el mismo convertidor y los mismos esquemas que la importación de la pantalla 22 (src/data/content/bankConvert.ts, src/data/content/bankColumns.ts y src/data/schemas/bank.ts). Como las funciones no importan de src, se copian con una prueba que los mantiene iguales
- Solo procesa los renglones que cambiaron, por su huella. Una pregunta nueva entra como borrador. Una editada crea versión nueva. Una que desaparece del Sheet se marca para retirar y no se borra. Nada se publica solo. La aprobación es en la app, con autor y revisor distintos
- Los renglones con problemas no frenan a los demás. Quedan en un reporte para el admin con el número de renglón y el motivo, sin copiar el texto en los registros
- El importador se vuelve tolerante con lo que no es contenido. Lee solo la primera línea de cada encabezado, salta renglones que solo tienen ID, toma Ninguno en la correcta como vacío e ignora Aprobado. Las preguntas sin Explicación o sin Referencias entran como borrador incompleto y no se pueden aprobar hasta completarlas
- Se descartó GitHub Actions porque el repo es público y sus registros también, y Apps Script porque cualquier editor del Sheet puede leer su secreto
- Necesita antes el camino de escritura del banco en la nube (B11) y activar pg_cron y pg_net en Supabase. Revisa la documentación vigente de Supabase Cron y de las cuentas de servicio de Google

### 7.4 Cambios de estructura en el Sheet

Ricardo pidió aplicar la mejor configuración para que se sincronice. Son cambios de estructura y no de contenido. La sesión los aplica si tiene acceso de escritura sin tocar el texto de las preguntas. Si no, quedan en la lista de Ricardo con sus pasos.
- ID fijo con prefijo que nunca se reusa, por ejemplo GO-0001, en lugar de la fórmula, y sin fórmula debajo de los datos
- Una columna Caso con su orden, para unir las preguntas del mismo caso clínico
- Listas que dependan de la rama elegida y rechacen valores fuera de la lista
- Encabezados de una sola línea, con la ayuda como nota de la celda
- Instrucciones al día. Hoy dicen que se entrega un Excel y mencionan una hoja Sesgos que ya no existe
- Columnas de autor y de revisor, para el pago por pregunta revisada (respuesta 58)
- Estado sin la opción Aprobado

Solo los médicos pueden llenar Explicación y Referencias, elegir el Subtema correcto en las 37 que no coinciden y confirmar el Tipo de reactivo de las 62 que dicen De control.

## 8. Bloques de trabajo

Van en este orden. Los primeros no dependen de nadie. Cada bloque dice qué necesita de Ricardo, y si no lo tiene se deja listo y apagado como pide 0.2.

### B0. Arranque

- Une la rama claude/lucid-noether-odfkau con main (respuesta 100). Trae el bloqueo de un segundo plan pagado (D-118), que ya está desplegado en Supabase como create-checkout versión 15, y ya tiene main unido hasta el PR 33. Si main avanzó, únelo otra vez, corre check y e2e, abre el PR y fusiónalo
- Ajusta CLAUDE.md (respuestas 34, 35 y 38)
  - La clave ENARM_ANTHROPIC_KEY vive en server/.env.local en desarrollo y como secreto de las Edge Functions de Supabase en producción, puesta por Ricardo
  - El proxy de IA de producción corre como Edge Function de Supabase
  - OpenAI entra como segundo proveedor solo para comparar calidad en las evaluaciones. Sigue pendiente qué cuenta como referido concretado, y mientras tanto se concreta con el primer pago verificado del referido
  - Este plan manda sobre PLAN.md donde no coincidan
- Registra D-119, Plan del cambio V3, con un resumen de este documento
- PROGRESS.md. Ricardo dio por cerradas todas las fases que esperaban su aprobación (respuesta 98). Quita lo que ya no es cierto, como las 8 pantallas en esqueleto
- Pasa la sección 9 a docs/PENDIENTES_DE_RICARDO.md, que es donde Ricardo consulta su lista
- Limpia la prueba de pagos (respuestas 1 y 2) si el entorno tiene la llave de prueba de Stripe. Cancela de inmediato las suscripciones de prueba de las dos cuentas de Ricardo (empiezan con af63865e y 7ab06582), con reembolso del último pago. Revisa que los avisos de Stripe dejen la base en Gratis. Después borra sus filas de prueba en subscriptions, payments y billing_customers, porque el cupo Fundador cuenta toda fila founder y un cliente de prueba de Stripe rompe el pago en modo real
- Marca Studiare (respuesta 54). Cambia Prototipo ENARM y Prototipo de una plataforma en src/config/brand.ts, index.html, README.md y los textos que dicen prototipo en src/i18n/features.ts y src/i18n/es-MX.ts. Corrige BRAND.themeColor, que hoy no coincide con el color primario. El identificador del formato de exportación (enarm-prototipo-export-v2) se queda, o la importación acepta los dos, para no romper respaldos viejos
- Texto neutro para Google y WhatsApp mientras llegan los de la agencia (4.17)
- IDEAS.md con el piloto de una universidad (respuesta 94), WhatsApp (respuesta 81, no elegida), la prueba de penetración al crecer (respuesta 31) y FSRS por alumno (respuesta 90)
- Interruptores de lanzamiento. Hoy no hay forma de esconder una función sin borrar código. Crea un mecanismo chico de banderas (feature flags) en src/config, con respaldo en platform_settings, para esconder en producción lo que pide este plan y para prender por partes lo nuevo

Se acepta cuando main tiene D-118 y D-119, CLAUDE.md está ajustado, PROGRESS.md al día, la marca dice Studiare en el manifiesto, en la pestaña y en la portada, y la base no tiene datos de pago de prueba.

Necesita de Ricardo la llave de prueba de Stripe en el entorno (sección 10). Sin ella, la limpieza queda en su lista.

### B1. Auditoría inicial de procesos (comentario 17)

- Inventario en docs/auditoria-v3/procesos.md. Por cada proceso y subproceso, sus pasos, pantallas, datos que toca (navegador y nube), eventos, errores posibles, estado vacío, carga, sin conexión, teléfono y computadora, y la prueba que lo cubre. La lista mínima es esta
  - Registro, entrada con enlace o código, entrada con Google cuando exista, dispositivo único y salida
  - Bienvenida y primer uso
  - Inicio
  - Repaso con FSRS, carga diaria, días fáciles, temporizador, sanguijuelas y errores al repaso
  - Mazos, importar y exportar .apkg y CSV, y catálogo
  - Apuntes y sus tarjetas
  - Simulador en práctica, por dificultad y examen completo, revisión, practicar lo fallado y duelos
  - Tutor y los cinco motores de IA
  - Progreso, Conócete y captura del puntaje oficial
  - Party, grupos, tabla, retos y referidos
  - Pomodoro
  - Suscripción, pago, portal, avisos de pago y reembolsos
  - Privacidad, consentimientos, exportar y borrar datos, y borrar cuenta
  - Médico, banco, importación, revisión, etiquetado de sesgos, kappa, borradores de IA y reportes
  - Admin, usuarios y roles, costos de IA, plataforma, errores del navegador y datos de demostración
  - Sincronización entre dispositivos
  - PWA, instalación, actualización y sin conexión
- Corre cada proceso de verdad con Playwright en teléfono y en computadora, con cuentas Gratis, de pago, médico y admin. Anota cada defecto con su gravedad en docs/auditoria-v3/hallazgos.md
- Corrige aquí lo crítico y lo alto. Lo demás se asigna al bloque que toca esa pantalla
- Hallazgos que ya se conocen
  - El registro otorga solos todos los consentimientos (createProfile en src/data/usecases/profile.ts). Ver 4.27
  - Los permisos importDecks y party de src/config/billing.ts nunca se revisan en la interfaz
  - Suscripción marca Examen completo como Próximamente aunque ya existe (COMING_SOON en src/features/billing/SubscriptionScreen.tsx)
  - src/i18n/es-MX.ts promete un botón para generar tarjetas en la retroalimentación que no existe. Lo resuelve el comentario 1
  - Las fotos de perfil no se sincronizan y la nube recibe iniciales (src/data/cloud/account.ts)
  - Los nombres de los submazos de Paco salen pegados, como AnticonceptivosyMPF y Hemorragias1T (src/demo/content/deckEntities.ts)
  - Party corre completo en el navegador, con seis compañeros simulados. No hay grupos reales entre alumnos (B7)
  - Cualquier alumno puede pasarse a la base de demostración desde Configuración (5.4)
  - La prueba de tiempos de src/app/cloud.test.tsx (0.3)

Se acepta cuando el inventario está completo, cada proceso tiene al menos una e2e de su camino feliz y una de falla, y no quedan hallazgos críticos ni altos abiertos.

### B2. Sistema de diseño y rediseño visual (comentarios 7, 9, 10, 15 y 18)

El objetivo es que Studiare se vea como un producto hecho por un equipo experto, sobrio, consistente y rápido, con un solo color de acción.

- Capturas de hoy de todas las pantallas en docs/screenshots/v3/antes
- Tokens nuevos en src/ui/tokens.css
  - Color. Neutros para superficies, bordes y texto. Un solo color de acción, #156082, en claro y en oscuro, con texto blanco (contraste de 6.9 a 1) y sus estados de pasar el cursor y de presionado. Colores de estado solo para lo que dice 4.7
  - Tipografía. Una escala corta y fija, una familia legible para textos largos en español y números tabulares en las cifras
  - Espacio. Escala de 4 px, con la separación de 1.25rem de D-117
  - Forma. Uno o dos radios chicos y bordes finos en lugar de sombras y brillos
- Sin degradados (comentario 10). Se quitan los tokens --enarm-hero, --enarm-gold, --enarm-flame y --enarm-primary-grad (en claro y en los dos modos oscuros), las utilidades .bg-hero, .bg-gold, .bg-flame, .bg-brand y .text-gradient-gold de src/index.css, los fondos glow, mesh, custom y dots (el fondo por omisión hoy es glow, en src/ui/appearance.ts) y los dos degradados de la imagen para compartir (src/features/party/drawAchievement.ts)
- StatPanel (src/ui/components/stat-panel.tsx), el recuadro oscuro con degradado de 18 pantallas, pasa a una superficie lisa
- Botones (src/ui/components/button.tsx). El primario es #156082 liso. Las demás variantes quedan neutras. Se quita la variante dorada. La forma es consistente, sin píldoras en todos lados
- Lo dorado del nivel y del XP pasa a neutro (4.7)
- Barra blanca de arriba (comentario 7). El saludo y los títulos de cada pantalla bajan al tamaño del título Tus repasos, que es 20 px en el teléfono y 24 px desde 640 px, siempre en negritas. Hoy el saludo usa `text-xl font-extrabold sm:text-3xl` en src/app/layout/ScreenHeader.tsx. Un solo token de tamaño para los dos
- Etiqueta de demostración (comentario 9). Se quita DemoContentLabel (src/ui/components/labels.tsx) de sus 21 usos en 17 archivos, y la frase de las descripciones de los tres mazos de demostración. Queda el aviso global de 4.1. Las pruebas que buscan la etiqueta se ajustan
- Fotos de perfil (comentario 15). Se quitan los 12 avatares generados (src/ui/avatarArt.ts y src/ui/components/generated-avatar.tsx). Quedan la foto propia, con recorte circular y vista previa antes de guardar, y las iniciales con un estilo cuidado como opción por omisión. La foto se sincroniza a Supabase Storage con permisos por fila, la ven solo el alumno y su grupo de Party, y entra al aviso de privacidad
- Lo que el rediseño evita, porque delata una página hecha en serie (comentario 18). Degradados, brillos, sombras de colores, emojis como íconos, píldoras y etiquetas de colores por todos lados, tarjetas dentro de tarjetas, todo centrado, ilustraciones genéricas, signos de exclamación, mayúsculas sostenidas y estilos distintos entre pantallas
- Lo que busca. Un solo título fuerte por pantalla, densidad útil para estudiar como en Anki, RemNote o AMBOSS, tablas y listas alineadas, estados vacíos con una frase y una acción, esqueletos de carga en lugar de ruedas que giran, errores junto al campo, movimiento breve que respeta la preferencia de reducir movimiento, atajos de teclado en el repaso y el simulador, y un solo juego de íconos (lucide-react) con el mismo grosor
- Usa la skill frontend-design si la sesión la tiene

Se acepta cuando
- Una prueba falla si aparece un degradado en src (CSS, TSX o canvas) y otra revisa que el color de acción sea exactamente #156082
- axe sin violaciones serias ni críticas en claro y en oscuro
- Hay capturas de antes y después de todas las pantallas y una revisión de diseño de un subagente con las dos listas de arriba
- El JavaScript inicial sigue por debajo de 300 KB comprimido

### B3. Navegación, Configuración y Perfil (comentarios 3, 4, 5, 6, 12, 13, 14 y 16)

- Menú lateral de computadora (src/app/navigation.ts y src/app/layout/BottomNav.tsx). Arriba quedan Inicio, Repasar, Apuntes, Simular, Progreso, Tutor y Party. Abajo a la izquierda, fija y separada, Configuración con ícono de engrane (Settings de lucide-react). Se quitan Plan, Logros y Perfil. Solo Configuración baja
- Barra del teléfono. Inicio, Repasar, Simular, Progreso y Más, que abre Apuntes, Tutor, Party y Configuración (4.28)
- Apuntes (comentario 12) deja de ser pestaña de Repasar y tiene su lugar en el menú. Su ruta /apuntes no cambia
- Ajustes del repaso (comentario 4). Las pestañas Estudio y Pomodoro de Configuración se mudan a Repasar, a un panel Ajustes del repaso con todo junto. Tarjetas nuevas y repasos por día, meta diaria, paso de confianza, resaltado de negaciones, errores al repaso, momento de la retroalimentación, opciones visibles, temporizador, días fáciles, opciones avanzadas de FSRS, Pomodoro y los recordatorios por correo de la respuesta 81. Hoy viven en StudyForm (src/features/profile/AccountSettings.tsx) y en PomodoroSection, y ReviewSetup.tsx ya edita una parte. Que quede un solo lugar para cada ajuste, sin perder los valores guardados
- Configuración (comentario 5). Una sola página sin pestañas (hoy son pestañas con ?seccion= en src/features/settings/SettingsScreen.tsx), con tres secciones con subtítulo y una línea horizontal entre ellas
  - Perfil. Primero el plan actual, con su nombre, precio, renovación o fin de la prueba y el botón Cambiar tu plan, que abre Suscripción. Después los datos de Perfil y de Cuenta juntos (comentario 6). Alias, foto, correo, sexo, situación, intento, especialidad que buscas, fecha de tu ENARM, cómo nos conociste, sesión, estado de sincronización, Pedir factura y cerrar sesión
  - Apariencia. Tema, tipografía, tamaño del texto, movimiento, sonidos y el modo enfoque de la respuesta 82, sin fondos con degradado
  - Privacidad. Cada consentimiento por separado, exportar datos, borrar datos, borrar cuenta y el aviso de privacidad. La captura del puntaje oficial se mueve a Progreso y su permiso se queda aquí
  - Lo que hoy vive en la pestaña Cuenta y no es del alumno (selector de base de demostración, panel de datos de demostración y tarjeta del modo de IA) pasa al admin o se esconde en producción (5.4)
- Editar perfil (comentario 16). La sección Perfil se ve de solo lectura. El botón Editar perfil abre todos los campos, con Guardar y Cancelar, y avisa si sales con cambios sin guardar
- Plan (comentario 13). Es el planificador, src/features/planner. Se quita y a Progreso pasa lo que ayuda a decidir qué estudiar, que es la semana de 7 días con lo planeado contra lo hecho y el aviso de sobrecarga con sus opciones. Lo que ya está en Inicio, como las acciones de hoy, no se pasa
- Logros (comentario 14). Se quitan la pantalla (src/features/rewards), las insignias, el aviso al ganarlas (BadgeToast de D-110), las ligas (respuesta 70) y sus textos y pruebas. Los eventos no se tocan. src/engines/rewards.ts se reduce a las misiones (4.12). Hay que tocar también src/app/screens.ts, src/app/router.tsx, src/i18n/es-MX.ts, src/i18n/features.ts, src/ui/celebrate.ts, src/app/App.test.tsx, src/engines/rewards.test.ts, src/app/layout/BadgeToast.test.tsx, tests/e2e/rewards.spec.ts y tests/e2e/offline.spec.ts. WidgetTypeSchema de src/data/schemas/activity.ts conserva sus valores para leer acomodos viejos
- Las rutas viejas /perfil, /planificador y /logros redirigen a Configuración y a Progreso. Los enlaces a Suscripción siguen funcionando desde Inicio, los candados, Simular, el examen, los duelos y el Tutor

Se acepta cuando
- Hay pruebas del menú en computadora y en teléfono para cada rol
- Una e2e cambia un ajuste del repaso en Repasar, recarga y lo conserva
- Una e2e revisa que Configuración tenga exactamente tres secciones y ninguna pestaña, y otra recorre Editar perfil
- Las rutas viejas redirigen y pasan las pruebas que recorren SCREEN_KEYS

### B4. Repasar y Buscar tarjetas (comentarios 8 y 11)

- Temas de cada mazo (comentario 8). Hoy los mazos son casillas dentro del pliegue Mazos y temas de ReviewSetup.tsx, con nombres como Medicina interna (Paco), y los temas se eligen aparte. Cada mazo en Repasar y en Mazos muestra su rama y debajo todos sus temas, en orden alfabético del español (Intl.Collator con es-MX, sin distinguir acentos), sin repetidos y sin recortes. Si un mazo tiene varias ramas, se agrupa por rama
- Los temas salen de las tarjetas. En los mazos de Paco, de las claves branch y topic de cada nota. En los importados, del submazo o de la etiqueta. Los nombres pegados pasan a nombres legibles con una tabla que se puede revisar
- Así se ve
  - Reumatología
    - Artritis reumatoide
    - Lupus eritematoso sistémico
- Buscar tarjetas (comentario 11). Hoy Explorar (src/features/explore) tiene un panel largo de filtros con búsqueda con sintaxis, chips de estado, mazo, tipo, origen, orden y árbol de etiquetas, acciones en lote y resultados de 50 por página que se abren uno por uno. Se rehace como un buscador rápido
  - Una barra de búsqueda con resultados al teclear
  - Filtros como chips con su conteo (mazo, tema, estado, vencidas, sanguijuelas y marcadas) y un botón Más filtros para lo raro
  - En computadora, una tabla que se ordena por columna (frente, mazo, tema, estado, próxima fecha, intervalo y fallos) y un panel lateral para ver y editar la tarjeta sin perder la lista
  - Casillas y acciones en lote (suspender, reanudar, mover, etiquetar y reiniciar)
  - Atajos de teclado y desplazamiento continuo en lugar de páginas
  - En el teléfono, una lista con una hoja de filtros
  - Se llama Buscar tarjetas, vive en Repasar y conserva los enlaces que hoy llegan con ?estado=sanguijuelas

Se acepta cuando
- Hay prueba unitaria del orden con acentos y de la agrupación por rama
- Una e2e con los mazos de Paco muestra sus temas completos
- Una e2e busca, filtra, edita una tarjeta en el panel y suspende varias en lote
- Con 10,000 tarjetas, filtrar tarda menos de 100 ms en la prueba de rendimiento

### B5. Revisión del examen y motivos de error (comentarios 1 y 2)

- Hoy la revisión (src/features/exam/ExamReview.tsx) muestra cada pregunta sin acciones, y las falladas se van solas al mazo Mis errores cuando errorsToReview está prendido (src/features/review/sendErrors.ts y src/data/usecases/errorCards.ts). Eso se queda
- Crear tarjeta (comentario 1). Un botón en cada pregunta de la revisión del examen y de la retroalimentación de la práctica
  - El alumno elige el mazo en una lista con sus mazos, los precargados y Nuevo mazo
  - La tarjeta se arma con texto del banco, sin IA. Al frente el caso en corto y la pregunta, y atrás la respuesta correcta, la explicación y la referencia. Se puede editar antes de guardar
  - En un mazo precargado la tarjeta queda en la capa del alumno (4.16)
  - En los planes de pago también hay Sugerir con IA, con el motor D anclado a la pregunta y la etiqueta de borrador
  - Queda un evento que solo se agrega, con la pregunta y su versión. Pulsar dos veces no duplica la tarjeta
- Por qué fallaste (comentario 2). En cada pregunta fallada de la revisión, siete botones de un toque. Conocimiento, Tiempo, Malinterpretación, Lectura superficial, Ansiedad, Exceso de confianza y Fatiga. Es opcional y se puede cambiar. Cada cambio es un evento nuevo y vale el último
- La lista de ocho causas de hoy (ErrorCauseSchema en src/data/schemas/common.ts, evento cause_reported) se reemplaza por la de Ricardo en toda la app (4.23). La tabla de equivalencias va a DECISIONES.md y se ajustan los que la usan (src/engines/forgetting.ts, src/features/progress/insightFacts.ts, src/features/tutor/errorContexts.ts y el hallazgo de causas)
- Los motivos alimentan el modelo del alumno (B14), Progreso con el reparto de motivos por rama, las hipótesis del Tutor y los consejos por sesgo

Se acepta cuando
- Una e2e hace un examen corto, crea una tarjeta en un mazo propio y otra en uno precargado, las dos aparecen en Repasar y el mazo compartido no cambió
- Una e2e marca un motivo, lo cambia y Progreso muestra el último
- Hay pruebas unitarias de la tabla de equivalencias y de los motores ajustados

### B6. Apuntes y mazos (respuesta 74)

- Hoy Apuntes (src/features/outlines) ya crea tarjetas con marcas en la línea (`>>`, `<<`, `<>`, `::`, `;;`, `>>>` y `{{cloze}}`) en un mazo automático bajo el mazo Apuntes, y conserva el historial al editar
- Mejoras
  - Crear una tarjeta sin memorizar marcas, con un botón en la línea y en la barra del editor y la ayuda de las marcas a la vista
  - Elegir el mazo destino y el tema de cada apunte
  - Generar tarjetas de un apunte con IA en los planes de pago, ancladas al texto del alumno, como borrador que el alumno acepta una por una
  - Modo clase para tomar apuntes rápido, con plantillas y materias libres fuera de la taxonomía del ENARM, para el uso de pregrado que pidió Ricardo
  - Búsqueda en todos los apuntes y vista de esquema
  - Edición cómoda en el teléfono
- En Gratis aparece con candado y una vista previa (respuesta 20)
- Se mide su uso con la analítica

Se acepta cuando
- Una e2e crea un apunte, convierte una línea en tarjeta con el botón, elige mazo y tema, y la tarjeta aparece en Repasar
- Una e2e usa el modo clase con una materia libre
- Hay pruebas del generador con IA en modo simulado

### B7. Party real y lo que se queda o se va (respuestas 69 a 77, 82 y 83)

- Party en la nube (respuesta 77). Hoy corre completo en el navegador, con seis compañeros simulados que se agregan al crear un grupo (src/data/usecases/party.ts), y el rival del duelo es simulado (src/features/party/duels.ts)
  - Grupos reales con invitación por enlace o código, miembros reales, tabla de la semana con alias y XP, y retos
  - Duelos reales (respuesta 69). Dos alumnos contestan las mismas 20 preguntas cuando cada uno pueda y se comparan aciertos y tiempo. El rival de práctica simulado puede quedarse con su etiqueta
  - Referidos. Cada alumno tiene su enlace. El mes gratis lo da el servidor cuando el referido se concreta, que hoy es con su primer pago verificado. Con la prueba gratis, el primer pago es el primer cobro después de la prueba
  - Los compañeros simulados solo existen en la base de demostración
- Ligas (respuesta 70). Se quitan del todo, en B3 con Logros
- Detector de fatiga (respuesta 71). Se queda con su estado calibrando y se conecta al modelo en B14
- IA que reestructura preguntas (pregunta 72). Se queda prendida para la cola del médico (5.3)
- Datos de demostración (pregunta 73). En producción se esconden la pantalla 24, el panel y el selector de base (5.4)
- Pomodoro (respuesta 75). Se queda, sus ajustes van a Repasar (B3) y se mide su uso
- Captura del puntaje oficial (respuesta 76). Se queda, en Progreso
- Modo enfoque (respuesta 82). Un interruptor en Apariencia que oculta tablas, XP, nivel, racha y retos en toda la app, y no solo durante la sesión
- Resumen semanal para compartir (respuesta 83). La imagen Comparte tu logro de Party (src/features/party/AchievementShare.tsx y drawAchievement.ts) pasa a ser el resumen de la semana, con días de estudio, repasos, preguntas y racha, sin datos sensibles ni puntaje estimado, con el diseño nuevo. Se comparte con el menú de compartir del teléfono

Se acepta cuando
- Hay pruebas SQL de los permisos de Party. Solo los miembros ven su grupo y nadie ve correos
- Una e2e con dos cuentas forma un grupo, se retan a un duelo y ven la tabla
- Una e2e de un referido que da el mes gratis al concretarse, con Stripe simulado
- En producción no hay forma de llegar a los datos de demostración

### B8. Plan Gratis (respuestas 18, 19 y 20)

- 20 preguntas al día (respuesta 18), con la explicación después de contestar (respuesta 19)
- Cerrados en Gratis (respuesta 20). Apuntes, Party e Importar mazos, con candado, una vista previa y el botón para probar 7 días gratis. Los referidos siguen abiertos (4.3) y el catálogo de mazos sigue 4.25
- Se conectan los permisos importDecks y party de src/config/billing.ts, que hoy no se revisan, y outlines queda cerrado en Gratis
- En el servidor, Party y los apuntes que viajan a la nube se cierran con permisos por fila según el plan. El tope de 20 preguntas pasa al servidor con el banco en la nube (B11)

Se acepta cuando hay pruebas de cada candado con una cuenta Gratis y una de pago, y pruebas SQL de los permisos.

### B9. Cuentas y acceso (respuestas 22, 26, 29, 30, 45 y 52)

- Entrar con Google (respuesta 26). El proveedor de Google en Supabase y el botón Continuar con Google en el registro y en Ya tengo cuenta. Funciona con el dispositivo único y con la invitación
- Solo con invitación hasta lanzar (respuesta 52). Invitaciones por correo en una tabla que manejan el dueño y el admin, revisadas en el servidor con el gancho de Supabase que corre antes de crear un usuario (Before User Created hook), para que aplique igual con correo y con Google. Un interruptor en platform_settings abre el registro el día del lanzamiento. Las cuentas que ya existen no cambian. Revisa la documentación vigente de ese gancho
- Cómo nos conociste (respuesta 22). Opcional en el registro, con opciones cerradas (Instagram, TikTok, Facebook, YouTube, un influencer, un amigo, Google, mi universidad y otro) y el código del influencer si lo trae. El admin ve el conteo por canal
- Segundo factor para médicos, admins y dueño (respuesta 30). TOTP de Supabase con alta obligatoria al tener esos roles. Las operaciones de esos roles piden sesión con segundo factor (aal2) en los permisos por fila. El dueño puede restablecer el factor de un médico
- Cuatro roles como hoy (respuesta 29). Edad mínima de 18 años con su casilla en el registro (pregunta 45)
- Especialidad que buscas. Ya existe (targetSpecialty, 28 especialidades más Aún no lo sé, en src/config/specialties.ts) y hoy nada la usa. Se vuelve más visible en el registro y en Perfil, porque la usa la comparación por especialidad (B14). Revisa la lista contra las especialidades de entrada de la convocatoria vigente

Se acepta cuando
- Hay e2e con Google simulado, con invitación válida e inválida y con segundo factor simulado
- Hay pruebas SQL de los permisos con y sin segundo factor

Necesita de Ricardo el cliente OAuth de Google (sección 9).

### B10. Pagos completos (respuestas 1, 2 y 7 a 21)

El objetivo es que se pueda pagar como el alumno quiera, con prueba gratis, cambio de plan justo y todo registrado en la base, primero en modo prueba. D-118 se queda, un solo plan pagado a la vez, y los cambios de plan van por el portal.

- Precios (respuestas 15 y 16). Fundador 79 al mes, Mensual 149, Anual 1,499 y el nuevo Fundador anual a 749 al año, todos con IVA incluido (respuesta 13). El Fundador anual es la promoción del anual, como el Fundador mensual lo es del mensual (D-114). Los dos comparten los mismos 100 lugares (4.5). Nuevo secreto STRIPE_PRICE_FOUNDER_ANNUAL. Un Fundador que paga y cancela pierde precio y lugar, y el lugar no se libera (respuesta 17)
- Prueba gratis de 7 días (respuesta 18) en el mensual y en el anual, también a precio Fundador mientras dure la promoción. Pide tarjeta y cobra solo al terminar, salvo que el alumno cancele
  - Una sola prueba por persona, revisada en el servidor
  - El estado trialing cuenta como plan vigente en user_plan, my_plan y planInForce
  - Aviso 3 días antes de terminar, con el evento customer.subscription.trial_will_end y el correo de B15
  - El lugar Fundador sigue 4.6
  - La garantía de 7 días cuenta desde el primer cobro (4.18)
- Cambio de plan con prorrateo (respuesta 9). En el portal de Stripe, con dos configuraciones, una para Fundadores (79 y 749) y otra para precios regulares (149 y 1,499). create-portal-session elige la que le toca al alumno. Subir de plan cobra al momento la diferencia (proration_behavior always_invoice) y bajar se programa al final del periodo (schedule_at_period_end). El webhook lee customer.subscription.updated y cambia el plan según el Price ID
- Formas de pago (respuesta 7 y 4.4)
  - Tarjeta, con renovación automática y prueba gratis
  - OXXO y transferencia SPEI como pago único de 1 mes (149) o de 1 año (1,499), sin renovación ni prueba, con un correo 3 días antes de que venza. Se confirman después de pagar, así que el webhook atiende checkout.session.async_payment_succeeded y checkout.session.async_payment_failed. Pagar otro periodo antes de que venza suma desde la fecha de fin
  - Mercado Pago (respuesta 8) con su suscripción con tarjeta y su pago único. Faltan su función de avisos con validación de firma, su renovación y su cuenta. El alumno elige Stripe o Mercado Pago en Suscripción (4.11)
- Códigos de influencer (respuesta 21). Cupones de Stripe con descuento solo en el primer pago y un código promocional por influencer, con allow_promotion_codes en el pago. Se guarda el código en payments y el admin ve cuántos pagos trae cada uno. En Mercado Pago no hay códigos al inicio
- Factura a pedido (respuesta 12). Un formulario Pedir factura en Perfil con RFC, razón social, régimen fiscal, código postal, uso del CFDI y correo. Se guarda en una tabla con permisos por fila, el admin la ve en una lista y le llega un correo. La factura la emite Ricardo a mano
- Reembolsos. Garantía de 7 días desde el primer cobro (respuesta 10), dicha en los términos y en la pantalla de pago. Se devuelven desde el panel de Stripe (respuesta 11), y el webhook ya quita el plan con un reembolso completo. Igual con Mercado Pago desde su panel

Se acepta cuando
- Hay pruebas unitarias y SQL de cada estado (trialing, active, past_due, canceled y pase de un solo pago) y de los lugares Fundador
- Hay e2e con pasarela simulada de cada camino. Prueba gratis, cancelar en la prueba, subir de mensual a anual, bajar al final del periodo, OXXO pagado y vencido, SPEI, Mercado Pago, código de descuento y pedir factura
- Hay una corrida real en modo prueba de Stripe con la llave del entorno, incluidos OXXO y SPEI con sus herramientas de prueba
- docs/STRIPE.md está al día

Necesita de Ricardo la llave de prueba de Stripe en el entorno, OXXO y SPEI activados en Stripe y la cuenta de Mercado Pago (sección 9).

### B11. Banco en la nube y Google Sheets (respuestas 46, 47, 49, 55 a 60, 64 a 68, 91 y 92)

- Decisiones del banco. Catálogo aparte del texto (respuesta 65), lectura por función (respuesta 66), sin tope diario en los planes de pago con el freno de 4.10 (respuesta 67) y el banco completo de una vez cuando esté listo (respuesta 68)
- Construye los pasos 1 a 6 de docs/BANCO_EN_LA_NUBE.md con esas decisiones. Con eso el tope de 20 preguntas de Gratis vive en el servidor
- Taxonomía. Salud pública como séptima rama con sus temas, revisados por un médico (respuesta 59), y el área de Inglés médico (B13). Los pesos provisionales de la sección 6, editables por el admin y marcados como provisionales
- Sincronización con el Google Sheet (sección 7)
- Flujo editorial con 3 a 5 médicos (respuesta 57). Asignación por pregunta, autor y revisor distintos, y estados de borrador a aprobada
- Pago a médicos por pregunta revisada (respuesta 58). Un reporte para el admin con revisiones por médico y por mes, que se exporta a CSV
- Reportes de error (respuesta 64). Correo al médico asignado cuando llega uno
- Sesgos (respuesta 91). Los revisores etiquetan a ciegas los distractores en la app. La etiqueta de sesgo que ya trae el Sheet cuenta como la del autor. Con un kappa de 0.4 o más en 30 pares se habla de sesgos y no de trampas
- Distractores que casi nadie elige (respuesta 92). Van a la cola del médico asignado
- Catálogo compartido de mazos (respuestas 46, 47 y 49). La autorización de Paco cubre el plan de pago. Faltan Pediatría y Cirugía, que se bajan de Drive con el conector o con la red abierta (sección 10). Los mazos de terceros solo entran con autorización escrita. Se guardan en Supabase Storage, o donde salga más barata la transferencia, y se bajan por submazo (4.21)
- Meta de 300 preguntas revisadas para abrir (respuesta 56). Hoy el Sheet tiene 108 borradores, todos de Ginecología y obstetricia

Se acepta cuando
- Hay pruebas SQL con alumno Gratis, de pago, médico, admin y sin sesión, como pide docs/BANCO_EN_LA_NUBE.md
- La sincronización corre contra un Sheet de prueba y contra el real en solo lectura, con su reporte de renglones
- El reporte de pagos a médicos cuadra con las revisiones

Necesita de Ricardo la cuenta de servicio de Google y los cambios del Sheet que la sesión no pueda hacer (sección 9).

### B12. IA real (respuestas 33 a 41)

- El proxy pasa a una Edge Function de Supabase (respuesta 34) con la misma lógica de server/. Sesión, plan, dispositivo único, límites, presupuesto de 5 dólares al día (respuesta 36) y bitácora sin texto. server/ se queda para el desarrollo local
- La clave ENARM_ANTHROPIC_KEY la pone Ricardo como secreto de Supabase (respuesta 35)
- Los cinco motores prendidos (respuesta 37). Hipótesis de por qué olvidas, por lotes a mitad de costo con unas horas de espera (respuesta 39). Informe semanal. Consejos por sesgo. Tarjetas desde la pregunta fallada, desde un PDF o desde un apunte propio. Preguntas reestructuradas solo para la cola del médico
- Elige el modelo de cada motor con npm run eval-ai, empezando por el más barato que pase la rúbrica, y revisa la lista vigente de modelos de Anthropic
- OpenAI solo en las evaluaciones, para comparar calidad (respuesta 38). Su clave ENARM_OPENAI_KEY vive en server/.env.local o en el entorno de la sesión, nunca en producción ni en el repo. Al modelo solo viajan IDs seudónimos y texto del banco
- Compuerta 1 (respuesta 40). Una pantalla o un archivo para que los dos médicos auditen 300 textos de la IA con su rúbrica. Los alumnos ven la IA solo cuando pasa
- La lista cerrada de textos académicos se queda tal cual (respuesta 41)

Se acepta cuando
- Hay pruebas de la función con Supabase simulado (sesión, plan, dispositivo y presupuesto)
- npm run eval-ai corrió con la clave real y el costo por alumno está medido en PROGRESS.md
- La comparación con OpenAI está documentada

Necesita de Ricardo la clave de Anthropic y, para comparar, la de OpenAI.

### B13. Inglés médico (respuesta 61)

- El ENARM trae 30 reactivos de comprensión de textos en inglés (sección 6) y hoy la app no tiene nada para eso
- Área Inglés médico con casos de lectura. Un texto en inglés con dos o tres preguntas, con la misma estructura de caso clínico del banco. El idioma de las preguntas sigue el formato de la convocatoria vigente
- Práctica por separado con su tiempo por reactivo, y su lugar en el examen completo, 250 en español y 30 en inglés
- Un mazo de vocabulario médico en inglés
- El contenido lo escriben los médicos o el equipo en el Sheet, con una pestaña o una columna de idioma, o sale de textos con licencia (4.19)
- Muestra calibrando mientras no haya suficientes reactivos

Se acepta cuando hay e2e de una práctica de inglés y de un examen completo con su parte en inglés.

### B14. Datos y modelo del alumno (respuestas 71 y 84 a 94)

- Sincronizar ajustes, sesiones y hallazgos entre dispositivos antes de lanzar (respuesta 93)
- Calibración nocturna con GitHub Actions (respuesta 85). Junta las respuestas de quien dio el permiso de mejora anónima (respuesta 87) y calcula con los motores que ya existen la dificultad de cada pregunta (Rasch), su ajuste continuo (Elo), el análisis de distractores y la validación del detector de fatiga. Publica los resultados en la base. Usa una llave del servidor dedicada a este proceso, que Ricardo guarda como secreto de GitHub (respuesta 86). No imprime texto de preguntas ni datos personales en los registros, porque el repo es público hasta pasar a Cloudflare
- Umbrales de calibración (5.5)
- Modo adaptativo en práctica (respuesta 89). Elige preguntas cerca del nivel del alumno cuando haya preguntas calibradas. Mientras tanto dice calibrando
- FSRS con parámetros de fábrica para todos (respuesta 90)
- Modelo del alumno (respuesta 84). Que el sistema entienda mejor a cada alumno con todo lo que registra en mazos, apuntes, repasos, simuladores y motivos de error
  - Dominio por rama y tema, con encogimiento hacia la media cuando hay pocos datos
  - Sesgos a los que es propenso, que ya calcula el motor de sesgos
  - Perfil de motivos de error del comentario 2
  - Fatiga y ritmo, con su estado calibrando (respuesta 71)
  - Constancia y carga de repaso
  - Todo eso alimenta Temas para reforzar en Inicio, el muestreo dirigido del simulador, el Tutor y los consejos por sesgo
  - Con los datos de quienes dieron permiso se mejora el sistema para todos. Dificultad real de cada pregunta, distractores que no funcionan, temas que más cuestan y motivos de error que más pesan
- Comparación con otros alumnos (respuesta 84). Una sección Cómo vas frente a otros en Progreso
  - Percentiles de lo que ya pasó. Aciertos en simuladores de los últimos 30 días, por rama, repasos hechos y constancia
  - Contra todos los alumnos y contra los que buscan la misma especialidad, por ejemplo Cirugía general
  - Sin puntaje estimado del ENARM ni probabilidad de plaza (4.2)
  - Solo con grupos de al menos 30 alumnos con datos. Si no, dice calibrando
  - Se calcula de noche con los datos de quien dio permiso. Nadie ve datos de otro alumno, solo percentiles
- Etiquetado de sesgos con kappa (respuesta 91) y distractores al médico asignado (respuesta 92), conectados a la calibración nocturna
- El piloto con una universidad (respuesta 94) se explora fuera del código

Se acepta cuando
- La calibración corre en GitHub Actions contra una base de prueba con alumnos simulados y recupera los parámetros como pide 14.2 de la especificación
- Hay pruebas de la comparación con grupos chicos (calibrando) y grandes
- Los registros del proceso no tienen texto de preguntas ni datos personales

Necesita de Ricardo el secreto de GitHub para la calibración.

### B15. Analítica, errores, recordatorios y recorrido (respuestas 32 y 78 a 81)

- Analítica con PostHog (respuesta 78). Solo con permiso del alumno, que empieza apagado. Sin correos ni nombres, con el ID seudónimo. Eventos clave como registro, primer repaso, examen terminado, inicio y fin de la prueba gratis, pago, cancelación y uso de Apuntes, Pomodoro, duelos y captura del puntaje. Embudo del registro al pago
- Alertas de errores con Sentry (respuesta 79) en el navegador y en las funciones, sin datos personales, con aviso por correo a Ricardo (respuesta 32)
- Recordatorios por correo (respuesta 81). Aviso diario de repaso con cuántas tarjetas vencen, con hora y frecuencia en Ajustes del repaso, enlace para darse de baja y envío con Resend desde una función programada. También el aviso de fin de la prueba gratis y el de vencimiento de un pase de OXXO o SPEI
- Recorrido guiado (respuesta 80). Al entrar por primera vez, un recorrido corto por Inicio, Repasar, Apuntes, Simular, Progreso, Party y Configuración, con Saltar introducción visible en cada paso. Se puede volver a ver desde Configuración. Funciona en teléfono y computadora, con foco y teclado accesibles, y se mide cuántos lo terminan. Usa una librería chica o un componente propio para seguir bajo 300 KB
- La política de seguridad de contenido (CSP) se ajusta para PostHog, Sentry y lo que se agregue

Se acepta cuando
- Una prueba demuestra que sin permiso no sale ningún evento
- Hay e2e del recorrido completo y de Saltar introducción
- Un error de prueba llega a Sentry y dispara el correo, cuando exista la cuenta

Necesita de Ricardo las cuentas de PostHog, Sentry y Resend.

### B16. Legal y privacidad (respuestas 42 a 49)

- Responsable de los datos. Plexus Medica S. de R.L. de C.V. (respuestas 42 y 24), con su domicilio y los correos de privacidad y soporte que dé Ricardo (pregunta 43)
- Aviso de privacidad al día. Encargados nuevos (Supabase, Stripe, Mercado Pago, Resend, PostHog, Sentry, Google para entrar y para el Sheet, y Anthropic), comparación con otros alumnos y modelo con datos de quien dio permiso, foto de perfil, datos de factura, y que OpenAI solo recibe texto del banco en evaluaciones
- Términos al día. Prueba gratis con el cobro automático dicho antes de pedir la tarjeta, garantía de 7 días, cambio de plan con prorrateo, pases sin renovación, registro con invitación y edad mínima de 18 años
- Los revisa el abogado de Ricardo (respuesta 44). El aviso de borrador se quita solo cuando Ricardo diga que el abogado los aprobó
- Consentimientos separados y apagados por omisión para los usos opcionales (4.27)
- El repo pasa a privado al llegar a Cloudflare (respuesta 48), y eso lo hace Ricardo

Se acepta cuando los textos de docs/legal están listos para el abogado, con la lista de cambios.

### B17. Publicación (respuestas 24, 25, 27, 28, 50, 51, 53 y 54)

- Cloudflare Pages (respuesta 51) con el dominio de Ricardo (respuestas 24 y 50). Encabezados de seguridad, HSTS y la CSP, y las variables VITE_. En Supabase la dirección nueva en Site URL y Redirect URLs. APP_URL y los orígenes del proxy de IA con el dominio nuevo. GitHub Pages se retira cuando el dominio funcione
- Correo propio con Resend (respuestas 24 y 25), con SPF, DKIM y DMARC en el dominio, conectado al SMTP de Supabase y a las funciones
- Supabase de pago antes de abrir a alumnos de pago (respuesta 27), con la protección de contraseñas filtradas (respuesta 28)
- La portada queda lista para los textos de la agencia o del influencer (respuesta 53), con lugares marcados, Open Graph, imagen para compartir, sitemap y robots

Se acepta cuando la app abre en el dominio con HTTPS, entra con correo y con Google, paga en modo prueba y manda correos desde el dominio.

Necesita de Ricardo el dominio, Cloudflare, Resend y el plan de pago de Supabase.

### B18. Primeros alumnos (respuestas 62 y 63)

- No hay prueba formal (respuesta 62). Los 5 aspirantes de Ricardo (respuesta 63) son los primeros invitados, con cuentas reales
- Se miden con la analítica y responden una encuesta corta dentro de la app a los 7 días
- Lo que salga se corrige antes de abrir el registro

Se acepta cuando los 5 entraron, usaron Repasar y Simular, y sus hallazgos están en PROGRESS.md.

Necesita de Ricardo que los invite desde la pantalla de invitaciones de B9.

### B19. Auditoría final y lanzamiento (comentario 17 y respuesta 96)

- Repite el inventario de B1 con todo lo nuevo, cada proceso con su e2e
- Pon al día la lista de flujos e2e de 14.1 de la especificación. Quita el del tablero de widgets y agrega los nuevos. Revisión del examen, Configuración, prueba gratis, cambio de plan, OXXO, invitación, Google, segundo factor, inglés, sincronización del Sheet y comparación
- axe en claro y oscuro. Rendimiento, con menos de 300 KB iniciales y una sesión de 200 tarjetas fluida en un teléfono de gama media. Sin conexión. Seguridad, con permisos por fila (`npm run test:sql`), sin secretos en el build, CSP, npm audit y ASVS al día
- Revisión independiente de subagentes que no escribieron el código, una por área (pagos, datos y privacidad, interfaz)
- Capturas de todas las pantallas en docs/screenshots/v3/final
- La lista de lanzamiento de la sección 11
- Lanzamiento antes de que termine 2026 (respuesta 96)

## 9. Lista de pendientes de Ricardo

Ricardo pidió su lista en varias respuestas. Va en el orden en que conviene hacerla. La sesión la copia a docs/PENDIENTES_DE_RICARDO.md y la mantiene al día. Nunca pegues una llave secreta en el chat. Cada una se pega directo en el servicio o en los secretos del entorno.

### Esta semana

1. **Borra la función vacía stripe-config-check** (respuesta 4). En Supabase, Edge Functions, stripe-config-check, Delete function
2. **Agrega el código a los correos de acceso** (respuesta 23). En Supabase, Authentication, Emails, abre la plantilla Magic Link y después Confirm signup. Debajo del enlace agrega esta línea y guarda

   `<p>Si abriste este correo en otro dispositivo, escribe en la app este código <strong>{{ .Token }}</strong></p>`
3. **Empieza la activación de Stripe** a nombre de Plexus Medica S. de R.L. de C.V. (respuestas 5, 6 y 42). Te pedirá el RFC de la empresa, el domicilio fiscal, los datos del representante legal y la CLABE de una cuenta de la empresa. Puede tardar días
4. **Platica con tu contador** (respuestas 6, 12, 13 y 14). Que la empresa cobre y facture, facturas a mano a quien las pida, precios con IVA incluido y si conviene Stripe Tax más adelante
5. **Crea tu cuenta de Anthropic y carga saldo** (respuesta 33). En console.anthropic.com crea una clave y pégala tú en Supabase, Edge Functions, Secrets, con el nombre ENARM_ANTHROPIC_KEY. Pon la misma en el entorno de la sesión (sección 10)
6. **Dile a la sesión cuál es tu dominio** (respuesta 50) y empieza a pasarlo a nombre de tu empresa (respuesta 24)
7. **Crea los correos de privacidad y de soporte** en tu dominio (pregunta 43), por ejemplo privacidad y soporte arroba tu dominio

### Antes del mensaje de arranque (unos 20 minutos, una sola vez)

8. **Red, secretos, conectores y modo Auto** del entorno, como dice la sección 10

### Cuentas que solo tú puedes crear

Cada una desbloquea un bloque. Mientras no existan, la sesión deja el código listo y apagado.

9. **Google Cloud** (B9 y B11). Un proyecto Studiare
   - Pantalla de consentimiento de OAuth con la marca Studiare y tu dominio
   - Cliente OAuth de tipo web. Copia su Client ID y su secreto en Supabase, Authentication, Providers, Google
   - Activa la API de Google Sheets, crea una cuenta de servicio sin roles y crea una llave JSON. Bájala una sola vez
   - Pega tú la llave en Supabase, Edge Functions, Secrets, como GOOGLE_SA_KEY, y el ID de tu Sheet como GOOGLE_BANK_SHEET_ID. Después borra el archivo bajado
   - Comparte tu Sheet Banco de preguntas con el correo de la cuenta de servicio como Lector, sin notificar. Deja apagado que los editores puedan compartir y el acceso general en Restringido
10. **Resend** (B15 y B17). Crea la cuenta, agrega tu dominio y pon en tu DNS los registros SPF, DKIM y DMARC que te da. En Supabase, Authentication, SMTP Settings, pon sus datos. Crea una clave de API y pégala en Supabase, Edge Functions, Secrets, como RESEND_API_KEY
11. **Mercado Pago** (B10). Cuenta de negocio de tu empresa. Sus credenciales de prueba van al entorno de la sesión (MP_ACCESS_TOKEN) y a los secretos de Supabase (MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET)
12. **Stripe en modo prueba** (B10). En Settings, Payment methods, activa OXXO y transferencias bancarias de México. La sesión crea en modo prueba los precios, los cupones y las configuraciones del portal con su llave
13. **PostHog** (B15). Crea la cuenta y un proyecto. Su clave pública va como variable VITE_POSTHOG_KEY, junto con su dirección, en GitHub y después en Cloudflare
14. **Sentry** (B15). Crea la cuenta y un proyecto. Su DSN va como variable VITE_SENTRY_DSN. Pon tu correo en sus alertas. Crea un token para subir los mapas de código y guárdalo como secreto de GitHub SENTRY_AUTH_TOKEN
15. **Secreto de GitHub para la calibración** (B14). En Supabase crea una llave secreta dedicada a ese proceso y guárdala en GitHub, Settings, Secrets and variables, Actions, como SUPABASE_CALIBRATION_KEY
16. **Cloudflare** (B17). Crea la cuenta, conecta tu dominio y crea un token con permiso solo para Pages y DNS. Va al entorno de la sesión como CLOUDFLARE_API_TOKEN, junto con CLOUDFLARE_ACCOUNT_ID
17. **Supabase de pago** antes de abrir a alumnos de pago (respuesta 27). Después activa la protección de contraseñas filtradas en Authentication (respuesta 28)
18. **Repo privado** al pasar a Cloudflare (respuesta 48). En GitHub, Settings, Danger zone, Change visibility

### Personas

19. **Médicos.** Los dos de la compuerta 1 (respuesta 40). De 3 a 5 revisores con pago por pregunta revisada (respuestas 57 y 58). Acuerda la tarifa
20. **Tu Sheet** (sección 7). Que los médicos llenen Explicación y Referencias, corrijan Subespecialidad y Subtema según la lista, confirmen el Tipo de reactivo De control y sigan escribiendo hasta 300 preguntas en las siete ramas y en inglés
21. **Influencers.** Sus nombres y el descuento de cada código (respuesta 21), y quién escribe los textos de venta (respuesta 53)
22. **Fer.** Su autorización escrita para el catálogo compartido (respuesta 49)
23. **Paco.** Que comparta Pedia.apkg y Cirugia.apkg con tu cuenta de Drive o con cualquiera con el enlace mientras se suben (respuesta 47). Al terminar se revoca el enlace
24. **Abogado.** Revisa el aviso, los términos y los reembolsos cuando B16 los deje listos (respuesta 44)
25. **Tus 5 aspirantes.** Invítalos desde la pantalla de invitaciones cuando exista (B9 y B18)

### Al lanzar y después

26. **Stripe y Mercado Pago en modo real**, con la lista de la sección 11
27. **Más adelante.** La prueba de penetración al crecer (respuesta 31) y el piloto con una universidad (respuesta 94)

## 10. Entorno de la sesión que ejecuta

- **Modelo.** El más capaz que tengas, hoy Claude Fable 5.1, con el esfuerzo en máximo. Si no aparece o al elegirlo desaparece el modo Auto, Opus 5.5 en máximo. El modo rápido no ayuda aquí
- **Modo de permisos.** Auto, en el selector junto al cuadro de texto
- **Red.** En el menú del entorno, Edit, Network access, Limited, con la casilla Allow package managers y estos Allowed domains
  - api.stripe.com, para operar Stripe en modo prueba
  - api.mercadopago.com, para Mercado Pago en modo prueba
  - drive.google.com y drive.usercontent.google.com, para los mazos de Paco
  - api.supabase.com, solo si pones SUPABASE_ACCESS_TOKEN
  - api.cloudflare.com, cuando tengas Cloudflare
  - La documentación que la sesión debe leer antes de usar cada servicio. docs.stripe.com, www.mercadopago.com.mx, supabase.com, developers.google.com, resend.com, posthog.com, docs.sentry.io y developers.cloudflare.com
- **Secretos del entorno.** En Network secrets o como variables de entorno, con estos nombres exactos. Nunca en el chat
  - STRIPE_SECRET_KEY, con una llave restringida de modo prueba (empieza con rk_test_) con permiso de escritura en productos, precios, cupones, códigos promocionales, clientes, suscripciones, sesiones de pago, configuraciones del portal y reembolsos, y de lectura en eventos
  - MP_ACCESS_TOKEN, con la credencial de prueba de Mercado Pago
  - ENARM_ANTHROPIC_KEY, con tu clave de Anthropic. Nunca con el nombre ANTHROPIC_API_KEY
  - ENARM_OPENAI_KEY, para comparar calidad en las evaluaciones
  - SUPABASE_ACCESS_TOKEN, opcional. Deja configurar correos, plantillas y secretos sin que confirmes nada. Es una llave poderosa sobre toda tu cuenta de Supabase
  - CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID, cuando tengas Cloudflare
- **Conectores.** En claude.ai/customize/connectors revisa que estén GitHub, Supabase y Google Drive
- Los secretos y conectores nuevos solo se leen al abrir una sesión. Ponlos antes del mensaje de arranque
- Si escribes ultracode en el mensaje de arranque, la sesión reparte el trabajo entre varios agentes. Sube la calidad pero gasta varias veces más de tu límite. La recomendación es no usarlo y quedarse con la revisión independiente de cada bloque

## 11. Terminado y lanzamiento

**El plan está terminado cuando**
- Todo lo de las secciones 2 y 3 está hecho, o tiene en PROGRESS.md su motivo y lo que falta
- main tiene el CI en verde, hay e2e de todos los procesos y no quedan hallazgos críticos ni altos
- Hay capturas finales y revisión independiente
- docs/PENDIENTES_DE_RICARDO.md tiene solo lo que falta de él

**Lista de lanzamiento**
- Textos legales aprobados por el abogado, con la empresa como responsable
- Se borran todos los datos de pago de prueba antes de cambiar a llaves reales, porque los clientes de prueba no existen en modo real y el cupo Fundador cuenta filas
- Stripe en modo real. Cuenta activada, precios reales (79, 149, 1,499 y 749), configuraciones del portal, webhook con sus eventos (los seis de hoy más customer.subscription.trial_will_end, checkout.session.async_payment_succeeded y checkout.session.async_payment_failed), secretos reales en Supabase y una compra real chica con su reembolso
- Mercado Pago en modo real con la misma prueba
- Dominio con HTTPS, correo propio, entrada con Google y segundo factor funcionando
- Supabase de pago con respaldos
- Analítica y alertas prendidas
- 300 preguntas aprobadas en la nube
- Compuerta 1 aprobada
- Registro abierto o por invitación, según decida Ricardo ese día (respuesta 52)

## Anexo A. Cuestionario con respuestas

Son las 102 preguntas que Claude armó a partir del análisis de la plataforma del 2026-10-12, con las opciones tal como se enviaron y la respuesta de Ricardo debajo de cada una. Las marcadas como recomendada eran la sugerencia de Claude. Al final van los comentarios adicionales de Ricardo, copiados tal cual.

### Pagos y Stripe (1 a 14)

**1. ¿Cómo limpiamos la prueba de pagos? Tu cuenta de prueba pagó el Anual y el Fundador, y en Stripe siguen vivas las dos suscripciones.**

- A) Las cancelo yo, de inmediato y con reembolso del último pago (recomendada)
- B) Ya lo hice
- C) Guíame paso a paso
- D) Déjalas así por ahora

Respuesta de Ricardo. Opción A (encárgate tu Claude)

**2. La otra cuenta que pagó el Fundador el 11 de octubre en la noche, ¿de quién es? Ocupa uno de los 100 lugares Fundador.**

- A) Es mía, otra cuenta de prueba
- B) Es de alguien de mi equipo
- C) No sé, investígalo

Respuesta de Ricardo. Opción A

**3. ¿Ya cambiaste la llave secreta de prueba que se pegó en el chat? Se cambia en Stripe, en Developers, API keys, Roll key, y la nueva se pega en los secretos de Supabase.**

- A) Sí
- B) No, lo hago hoy (recomendada)
- C) Guíame paso a paso

Respuesta de Ricardo. Opción A

**4. ¿Borras la función vacía stripe-config-check? No hace nada y desde aquí no la puedo borrar. Está en Supabase, en Edge Functions.**

- A) La borro hoy (recomendada)
- B) Ya la borré
- C) Guíame

Respuesta de Ricardo. Opción A (hazme mi lista de pendientes)

**5. ¿En qué va la activación de tu cuenta real de Stripe? Stripe pide verificar el negocio y una cuenta bancaria en México, y puede tardar días.**

- A) Ya está verificada
- B) Ya la empecé
- C) Aún no, la empiezo esta semana (recomendada)
- D) Aún no, prefiero esperar

Respuesta de Ricardo. Opción C (hazme mi lista de pendientes)

**6. ¿A nombre de quién cobrará Studiare? Define el RFC, las facturas y quién es el responsable en el aviso de privacidad.**

- A) Persona física con actividad empresarial
- B) Persona moral, una empresa
- C) Aún no lo sé, lo veo con mi contador (recomendada)

Respuesta de Ricardo. Opción C (hazme mi lista de pendientes)

**7. ¿Qué formas de pago ofrecemos al lanzar? Stripe dice ofrecer OXXO y SPEI para pagos únicos, que no se renuevan solos.**

- A) Solo tarjeta, y medimos cuántos piden otra forma (recomendada)
- B) Tarjeta, y OXXO o SPEI en el anual
- C) Tarjeta y Mercado Pago
- D) Todas

Respuesta de Ricardo. Opción D

**8. ¿Qué hacemos con Mercado Pago? Está oculto. Le faltan su función de avisos, la renovación automática y una cuenta.**

- A) Fuera hasta que haya demanda (recomendada)
- B) Lo quiero desde el lanzamiento
- C) Quitar su código por completo

Respuesta de Ricardo. Opción B

**9. ¿El alumno podrá cambiar de mensual a anual desde el portal? Hoy la plataforma no registra ese cambio.**

- A) Sí, antes del lanzamiento (recomendada)
- B) Sí, después del lanzamiento
- C) No, que cancele y compre el otro plan al terminar su periodo

Respuesta de Ricardo. Opción A (y que se aplique un descuento correspondiente a la diferencia del plan que tiene actualmente como justo como lo haces tu con tus planes de pago si me cambio)

**10. ¿Qué política de reembolsos tendrás? El abogado debe revisarla.**

- A) Garantía de 7 días desde el primer pago (recomendada)
- B) Sin reembolsos, salvo error de cobro
- C) Garantía de 14 días
- D) Que lo decida el abogado

Respuesta de Ricardo. Opción A

**11. ¿Quieres devolver dinero desde la app?**

- A) No, desde el panel de Stripe como hoy (recomendada)
- B) Sí, con un botón para el admin

Respuesta de Ricardo. Opción A

**12. ¿Emitirás factura (CFDI)? Stripe no emite facturas fiscales mexicanas.**

- A) Solo a quien la pida, a mano al inicio (recomendada)
- B) Sí, automática desde el lanzamiento
- C) No por ahora
- D) Lo veo con mi contador

Respuesta de Ricardo. Opción A

**13. ¿Los precios llevan el IVA incluido?**

- A) Sí, incluido (recomendada)
- B) IVA aparte
- C) Lo decide mi contador

Respuesta de Ricardo. Opción A

**14. ¿Activamos Stripe Tax? Pide configurar tu domicilio fiscal. Si se queda apagado, no frena nada.**

- A) No por ahora (recomendada)
- B) Sí
- C) Lo veo con mi contador

Respuesta de Ricardo. Opción A (hazme mi lista de pendientes)

### Precios y planes (15 a 22)

**15. ¿Mantenemos Fundador 79, Mensual 149 y Anual 1,499?**

- A) Sí (recomendada)
- B) Quiero ajustarlos (dime cuánto)

Respuesta de Ricardo. Opción A (hazme mi lista de pendientes)

**16. ¿Cómo convive el anual con el Fundador? Doce meses de Fundador suman 948 y el anual cuesta 1,499.**

- A) Así está bien, el Fundador es una promoción limitada (recomendada)
- B) Bajar el anual
- C) Crear un anual Fundador

Respuesta de Ricardo. Opción C (limitado a 100 usuarios, ponlo a 749)

**17. Si un Fundador cancela, ¿conserva su precio y su lugar? Hoy su lugar no se libera.**

- A) Pierde precio y lugar, y el lugar se libera para otro (recomendada)
- B) Conserva su precio si regresa
- C) Pierde el precio, pero el lugar no se libera

Respuesta de Ricardo. Opción C

**18. ¿El plan Gratis sigue con 20 preguntas al día?**

- A) Sí, 20 (recomendada)
- B) 10
- C) 30
- D) Otro número

Respuesta de Ricardo. Opción A (quiero incluir también una prueba gratuita de 7 días para el plan mensual y anual, pero que requiera ingresar la tarjeta y que se cobre automáticamente al terminar el plazo a menos que el usuario lo cancele)

**19. ¿El alumno Gratis ve la explicación después de contestar? Es lo que muestra el valor de Studiare.**

- A) Sí, en sus preguntas del día (recomendada)
- B) No, solo en los planes de pago

Respuesta de Ricardo. Opción A

**20. Además de la IA y el examen completo, ¿qué más cerramos en Gratis? Puedes elegir varias**

- A) Nada más, así está bien (recomendada)
- B) Explorar tarjetas
- C) Apuntes
- D) Party
- E) Importar mazos
- F) Días fáciles y herramientas para atrasados

Respuesta de Ricardo. Opción C, D, E

**21. ¿Quieres códigos promocionales para el influencer? Con un código para cada influencer sabes cuántos alumnos trae.**

- A) Sí, con descuento en el primer pago (recomendada)
- B) Sí, sin descuento, solo para medir
- C) No

Respuesta de Ricardo. Opción A

**22. ¿Agregamos al registro la pregunta de cómo nos conociste? Sin eso no sabes qué publicidad funciona.**

- A) Sí, opcional (recomendada)
- B) No

Respuesta de Ricardo. Opción A

### Cuentas, correo y seguridad (23 a 32)

**23. ¿Ya agregaste el código {{ .Token }} a las plantillas de correo? Sin eso no se puede entrar con código desde otro dispositivo.**

- A) Sí
- B) No, lo hago hoy (recomendada)
- C) Guíame paso a paso

Respuesta de Ricardo. Opción B (hazme mi lista de pendientes)

**24. ¿Qué proveedor de correo conectamos? El correo de fábrica de Supabase solo envía a tu equipo, y pocas veces por hora.**

- A) Resend, que es simple y tiene plan gratis para empezar (recomendada, verifica su precio)
- B) Brevo
- C) Amazon SES
- D) Decide tú

Respuesta de Ricardo. Tengo mi propio dominio, tengo que configurarlo y ponerlo a nombre de mi empresa (Plexus Medica S. de R.L de C.V)

**25. ¿Desde qué dirección salen los correos?**

- A) Una de mi propio dominio (recomendada)
- B) Un Gmail mientras tanto
- C) Aún no tengo dominio

Respuesta de Ricardo. Opción A

**26. ¿Agregamos entrar con Google? El alumno no espera el correo, pero tú tienes que crear la configuración en Google.**

- A) Sí, antes del lanzamiento (recomendada)
- B) Más adelante
- C) No, solo correo

Respuesta de Ricardo. Opción A

**27. ¿Pasamos Supabase al plan de pago antes de abrir? Da respaldos y no pausa el proyecto. Cuesta unos 25 dólares al mes, verifícalo.**

- A) Sí, antes de abrir a alumnos de pago (recomendada)
- B) Después, cuando haya alumnos
- C) No

Respuesta de Ricardo. Opción A

**28. ¿Activamos la protección de contraseñas filtradas? Supabase la marca apagada, pero como la app entra sin contraseña pesa poco.**

- A) Sí, si mi plan la incluye (recomendada)
- B) No hace falta

Respuesta de Ricardo. Opción A

**29. ¿Tres o cuatro roles? Hoy hay alumno, médico, admin y dueño.**

- A) Cuatro, como hoy (recomendada)
- B) Tres, sin separar dueño y admin

Respuesta de Ricardo. Opción A

**30. ¿Segundo factor para médicos y administradores?**

- A) Sí, antes de abrir (recomendada)
- B) Después
- C) No

Respuesta de Ricardo. Opción A

**31. ¿Hacemos una prueba de penetración externa?**

- A) Ligera antes de abrir y completa al crecer (recomendada)
- B) Completa antes de abrir
- C) No por ahora

Respuesta de Ricardo. Opción C (hazme mi lista de pendientes)

**32. ¿Cómo quieres enterarte cuando algo se rompe?**

- A) Aviso por correo (recomendada)
- B) Aviso al celular
- C) Me basta revisar la pantalla 25

Respuesta de Ricardo. Opción A

### Inteligencia artificial (33 a 41)

**33. ¿Ya tienes cuenta y saldo en la consola de Anthropic?**

- A) Sí
- B) No, la creo esta semana (recomendada)
- C) Guíame paso a paso

Respuesta de Ricardo. Opción B (hazme mi lista de pendientes)

**34. ¿Dónde corre el intermediario que llama a la IA? Revisé los límites vigentes de Supabase y alcanzan.**

- A) Dentro de Supabase, que es un servicio y una factura menos (recomendada)
- B) Fly, Render o Railway
- C) Google Cloud Run
- D) Decide tú

Respuesta de Ricardo. Opción A

**35. ¿Apruebas que la clave de la IA viva como secreto del servicio, y que ajuste CLAUDE.md?**

- A) Sí (recomendada)
- B) No, platiquémoslo

Respuesta de Ricardo. Opción A

**36. ¿Qué tope diario de gasto en IA? Hoy es de 5 dólares al día.**

- A) 5 dólares para empezar (recomendada)
- B) Menos (dime cuánto)
- C) Más (dime cuánto)

Respuesta de Ricardo. Opción A

**37. ¿Qué motores de IA prendemos al lanzar? Puedes elegir varios**

- A) Hipótesis de por qué olvidas (recomendada)
- B) Informe semanal (recomendada)
- C) Consejos por sesgo (recomendada)
- D) Tarjetas desde la pregunta fallada o desde un PDF propio (recomendada)
- E) Preguntas reestructuradas para la cola del médico

Respuesta de Ricardo. Opción A, B, C, D, E

**38. ¿Sumamos un segundo proveedor de IA, como OpenAI?**

- A) No por ahora, solo Claude (recomendada)
- B) Sí, como respaldo
- C) Sí, para comparar calidad

Respuesta de Ricardo. Opción C

**39. ¿Las hipótesis pueden tardar unas horas a cambio de costar la mitad?**

- A) Sí, por lotes (recomendada)
- B) No, al momento

Respuesta de Ricardo. Opción A

**40. ¿Ya tienes a los dos médicos que auditarán 300 textos de la IA?**

- A) Ya los tengo
- B) Tengo uno
- C) Aún no

Respuesta de Ricardo. Opción A

**41. ¿Confirmas la lista de textos académicos para las controversias? Harrison, Cecil, Nelson, Williams, Berek y Novak, Schwartz, Sabiston, Tintinalli, GPC del CENETEC, NOM, Guyton y Hall, Robbins y Cotran, y Katzung.**

- A) Sí, tal cual
- B) Sí, con cambios (dime cuáles)
- C) Que la revise otro médico

Respuesta de Ricardo. Opción A

### Legal y privacidad (42 a 49)

**42. ¿Quién será el responsable de los datos personales?**

- A) Yo, como persona física
- B) Una empresa
- C) Aún no lo sé

Respuesta de Ricardo. Opción B

**43. ¿Qué correo usamos para privacidad y soporte? Escríbelo, o déjala para después.**

Respuesta de Ricardo. (hazme mi lista de pendientes)

**44. ¿Ya tienes abogado para revisar el aviso y los términos?**

- A) Sí
- B) No, dime qué buscar
- C) Lo busco esta semana

Respuesta de Ricardo. Opción A

**45. ¿La edad mínima es de 18 años?**

- A) Sí (recomendada)
- B) Otra

Respuesta de Ricardo. Da igual

**46. ¿La autorización de Paco cubre el plan de pago?**

- A) Sí, ya lo cubre
- B) Solo cubre la demo
- C) Le pregunto

Respuesta de Ricardo. Opción A

**47. ¿Subimos los mazos de Pediatría y Cirugía de Paco? Hay que permitir Drive en la red de mi entorno y compartir los archivos por enlace.**

- A) Sí, abro el acceso
- B) Después
- C) No

Respuesta de Ricardo. Opción A

**48. ¿El repositorio sigue siendo público? Hoy cualquiera ve tu código y los mazos de Paco.**

- A) Hacerlo privado al pasar a Cloudflare (recomendada)
- B) Que siga público

Respuesta de Ricardo. Opción A

**49. ¿Cada alumno importa sus propios mazos, como el de Fer?**

- A) Sí (recomendada)
- B) Quiero un catálogo compartido y consigo las autorizaciones

Respuesta de Ricardo. Opción B

### Dominio y publicación (50 a 54)

**50. ¿Ya tienes dominio?**

- A) Sí (escríbelo)
- B) No, recomiéndame uno
- C) Lo compro esta semana

Respuesta de Ricardo. Opción A

**51. ¿Apruebas publicar en Cloudflare Pages?**

- A) Sí (recomendada)
- B) Seguir en GitHub Pages
- C) Otro lugar

Respuesta de Ricardo. Opción A

**52. ¿Abrimos el registro o lo cerramos hasta el lanzamiento? Hoy cualquiera puede crear una cuenta real, pero el contenido es de demostración.**

- A) Lista de espera con correo hasta lanzar (recomendada)
- B) Registro abierto como hoy
- C) Solo con invitación

Respuesta de Ricardo. Opción C

**53. ¿Quién escribe los textos de venta de la portada? Lo que ven Google y WhatsApp todavía dice “Prototipo de una plataforma”.**

- A) Tú los propones y yo los apruebo (recomendada)
- B) Los escribo yo
- C) El influencer o una agencia

Respuesta de Ricardo. Opción C

**54. ¿Studiare es la marca definitiva? Al instalar la app en el teléfono, todavía se llama Prototipo ENARM.**

- A) Sí
- B) Todavía no

Respuesta de Ricardo. Opción A

### Contenido y médicos (55 a 64)

**55. ¿De dónde saldrá el banco real? Puedes elegir varias**

- A) Mis bancos propios (recomendada)
- B) Médicos que escriban preguntas nuevas
- C) IA anclada a las GPC y revisada por médicos (recomendada)

Respuesta de Ricardo. Opción A

**56. ¿Cuántas preguntas revisadas necesitas para abrir? Un examen completo pide 280 sin repetir.**

- A) 300
- B) 500 (recomendada)
- C) 1,000
- D) 1,500 o más

Respuesta de Ricardo. Opción A (tengo un documento de google Sheets en el que estamos escribiendo las preguntas: (enlace a su Google Sheet Banco de preguntas, que no se copia aquí porque el repo es público) quiero que lo conectes y se actualice automáticamente todo lo que haga referencia a este documento, analízalo primero y aplica la mejor configuración para que se sincronice).

**57. ¿Cuántos médicos revisores tendrás al inicio?**

- A) Uno
- B) Dos
- C) De tres a cinco
- D) Más de cinco

Respuesta de Ricardo. Opción C

**58. ¿Cómo les pagas a los médicos revisores?**

- A) Por pregunta revisada
- B) Un pago fijo al mes
- C) Participación en el negocio
- D) Aún no lo sé

Respuesta de Ricardo. Opción A

**59. ¿Agregamos Salud pública como séptima rama? Hoy hay seis.**

- A) Sí (recomendada)
- B) No

Respuesta de Ricardo. Opción A

**60. ¿Tienes los pesos oficiales por rama? Hoy todas valen lo mismo.**

- A) Sí, te los paso
- B) Usa una estimación y la marcamos provisional (recomendada)
- C) Que valgan igual

Respuesta de Ricardo. Revísalo en internet, esta es información disponible en la estructura del ENARM

**61. ¿Construimos el módulo de inglés médico? Según el análisis docente, el ENARM trae unos 30 reactivos en inglés, cerca del 10%. Hay que confirmarlo con la convocatoria.**

- A) Sí, después de confirmar el formato (recomendada)
- B) Sí, antes del lanzamiento
- C) Después del lanzamiento
- D) No

Respuesta de Ricardo. Opción B

**62. ¿Cuándo hacemos la prueba con 5 aspirantes?**

- A) Ya, con un lote de demostración revisado por ti y dos médicos (recomendada)
- B) Cuando haya banco real
- C) No la haremos

Respuesta de Ricardo. Opción C

**63. ¿Ya tienes a los 5 aspirantes?**

- A) Sí
- B) Algunos
- C) No, que el influencer ayude a reclutarlos

Respuesta de Ricardo. Opción A

**64. ¿Avisamos por correo al médico cuando llega un reporte de error?**

- A) Sí (recomendada)
- B) No, que revise la bandeja

Respuesta de Ricardo. Opción C

### Banco en la nube (65 a 68)

**65. ¿Separamos el catálogo del texto de las preguntas? (decisión 2) El catálogo lo leen todos. El enunciado, las opciones y la explicación quedan con candado.**

- A) Sí (recomendada)
- B) No
- C) Explícamelo más

Respuesta de Ricardo. Opción C

**66. ¿El alumno lee las preguntas solo con una función que cuenta su tope? (decisión 3) Así nadie puede bajar el banco entero.**

- A) Sí (recomendada)
- B) No
- C) Explícamelo más

Respuesta de Ricardo. Opción C

**67. ¿Qué tope diario tienen los planes de pago? (decisión 4)**

- A) 600 (recomendada)
- B) 400
- C) 1,000
- D) Sin tope

Respuesta de Ricardo. Opción D

**68. ¿Qué lote subimos primero a la nube?**

- A) Medicina interna
- B) Pediatría
- C) Ginecología y obstetricia
- D) Cirugía
- E) Todo junto cuando esté listo

Respuesta de Ricardo. Opción E

### Qué esconder al lanzar (69 a 77)

**69. ¿Escondemos los duelos? Hoy el rival es simulado.**

- A) Sí (recomendada)
- B) Se quedan
- C) Quitarlos del todo

Respuesta de Ricardo. Opción B

**70. ¿Escondemos las ligas? Hoy son una escalera contra tus propios XP.**

- A) Sí (recomendada)
- B) Se quedan
- C) Quitarlas del todo

Respuesta de Ricardo. Opción C

**71. ¿Escondemos el detector de fatiga? No llega a su meta de precisión.**

- A) Sí, hasta validarlo con datos reales (recomendada)
- B) Se queda con su estado calibrando

Respuesta de Ricardo. Opción B (conectar al modelo de machine Learning)

**72. ¿Apagamos la IA que reestructura preguntas? Solo sirve si hay médicos revisando su cola.**

- A) Sí (recomendada)
- B) Se queda

Respuesta de Ricardo. Explícame más

**73. ¿Escondemos la pantalla Datos de demostración en producción?**

- A) Sí (recomendada)
- B) No

Respuesta de Ricardo. Explícame más

**74. ¿Qué hacemos con los apuntes tipo RemNote?**

- A) Se quedan y medimos cuánto se usan (recomendada)
- B) Esconderlos al lanzar
- C) Quitarlos

Respuesta de Ricardo. Opción A (mejora aún más todo esto y conéctalo con la generación de mazos, es una gran herramienta que incluso puede servir para alumnos de pregrado que quieran utilizar la repetición espaciada mientras toman apuntes en su clase)

**75. ¿Qué hacemos con el Pomodoro?**

- A) Se queda y medimos cuánto se usa (recomendada)
- B) Esconderlo al lanzar
- C) Quitarlo

Respuesta de Ricardo. Opción A

**76. ¿Qué hacemos con la captura del puntaje oficial?**

- A) Se queda (recomendada)
- B) Esconderla

Respuesta de Ricardo. Opción A

**77. ¿Party se queda al lanzar?**

- A) Sí, con grupos, tabla y referidos (recomendada)
- B) Esconder Party completo

Respuesta de Ricardo. Opción A

### Qué agregar (78 a 83)

**78. ¿Agregamos analítica del producto? Hoy no se mide nada.**

- A) Sí, PostHog con permiso del alumno (recomendada)
- B) Otra herramienta
- C) No por ahora

Respuesta de Ricardo. Opción A

**79. ¿Agregamos alertas de errores, como Sentry?**

- A) Sí (recomendada)
- B) No por ahora

Respuesta de Ricardo. Opción A

**80. ¿Qué hace el alumno en su primer minuto?**

- A) Tres preguntas con su explicación y su trampa (recomendada)
- B) Cinco tarjetas
- C) Un diagnóstico de 10 preguntas
- D) Nada, que explore

Respuesta de Ricardo. Quiero que se le dé un recorrido por la página para que la conozca y aprenda a utilizarla, es muy común que los médicos sean muy torpes para utilizar la tecnología (agrega la posibilidad de Skip introducción)

**81. ¿Por dónde mandamos recordatorios? Puedes elegir varios**

- A) Correo (recomendada)
- B) Avisos en el celular para quien instale la página (recomendada)
- C) WhatsApp, que cuesta por mensaje
- D) Ninguno por ahora

Respuesta de Ricardo. Opción A

**82. ¿Agregamos un modo enfoque general que oculte ligas, tablas y XP?**

- A) Sí (recomendada)
- B) No

Respuesta de Ricardo. Opción A

**83. ¿Agregamos un resumen semanal para compartir en redes?**

- A) Sí (recomendada)
- B) Después
- C) No

Respuesta de Ricardo. Opción A

### Datos y aprendizaje automático (84 a 94)

**84. Cuando dijiste modelo de machine learning, ¿pensabas en algo más? Lo que existe es FSRS, Rasch y Elo, el detector de sesgos y la IA de Claude. Predecir el puntaje del ENARM queda fuera por las reglas del proyecto.**

- A) No, era esto
- B) Sí (descríbelo)

Respuesta de Ricardo. Cuando hablo de machine Learning es que el modelo aprenda a entender mejor a los alumnos conforme van registrando tanto sus mazos, sus apuntes, sus repasos y sus simuladores, que utilice toda la información de los usuarios para retroalimentar y mejorar el sistema. También quiero que agregues una sección en donde se compare al usuario con el resto de usuarios, y que incluso lo puedas dividir por especialidad, es decir, si el usuario aspira a cirugía pueda ver como está respecto a todos los usuarios y respecto a los demás usuarios que marcaron que quieren cirugía.

**85. ¿Corremos la calibración cada noche con GitHub Actions? Calcula la dificultad real de cada pregunta con el motor de Rasch que ya existe.**

- A) Sí (recomendada)
- B) Prefiero que corra dentro de Supabase
- C) Explícamelo más

Respuesta de Ricardo. Opción A

**86. ¿Guardamos una llave del servidor como secreto de GitHub para ese proceso? Nunca quedaría en el repositorio.**

- A) Sí (recomendada)
- B) No, busquemos otra forma

Respuesta de Ricardo. Opción A

**87. ¿Con qué respuestas calibramos?**

- A) Solo las de quien dio el permiso de mejora anónima (recomendada)
- B) Las de todos, anonimizadas, y ajustamos el aviso con el abogado

Respuesta de Ricardo. Opción A

**88. ¿Mantenemos los umbrales de calibración? Una pregunta es provisional desde 30 respuestas y calibrada desde 100.**

- A) Sí (recomendada)
- B) Cambiarlos

Respuesta de Ricardo. ¿Cual sería la mejor opción?

**89. ¿Ofrecemos modo adaptativo en práctica cuando haya calibración?**

- A) Sí (recomendada)
- B) No

Respuesta de Ricardo. Opción A

**90. ¿Ajustamos FSRS a cada alumno desde 1,000 repasos?**

- A) Sí (recomendada)
- B) No, parámetros de fábrica para todos

Respuesta de Ricardo. Opción B

**91. ¿Quiénes etiquetan el sesgo de cada distractor? Hacen falta dos médicos que etiqueten a ciegas, con un acuerdo de 0.4 o más en 30 pares.**

- A) Los mismos revisores del banco (recomendada)
- B) Otros médicos
- C) Aún no lo sé

Respuesta de Ricardo. Opción A

**92. ¿Quién corrige los distractores que casi nadie elige?**

- A) El médico asignado a esa pregunta (recomendada)
- B) Un editor central

Respuesta de Ricardo. Opción A

**93. ¿Sincronizamos también ajustes, sesiones y hallazgos entre dispositivos?**

- A) Después del lanzamiento (recomendada)
- B) Antes del lanzamiento

Respuesta de Ricardo. Opción B

**94. ¿Te interesa el piloto con una universidad que use sus datos para entrenar modelos?**

- A) Sí, exploremos
- B) Después del lanzamiento (recomendada)
- C) No

Respuesta de Ricardo. Opción A

### Orden y forma de trabajo (95 a 102)

**95. ¿Apruebas el orden propuesto? Primero lo rápido, luego el banco en la nube, la IA real, la prueba con 5 aspirantes, la calibración y el lanzamiento.**

- A) Sí (recomendada)
- B) Sí, con cambios
- C) Prefiero otro orden

Respuesta de Ricardo. Opción A

**96. ¿Para cuándo quieres lanzar?**

- A) Antes de que termine 2026
- B) Enero o febrero de 2027
- C) Entre marzo y mayo de 2027
- D) Sin fecha aún

Respuesta de Ricardo. Opción A

**97. ¿La fecha del ENARM 2027 sigue provisional, el 13 de septiembre?**

- A) Sí, hasta que salga la convocatoria (recomendada)
- B) Cámbiala

Respuesta de Ricardo. Opción A

**98. ¿Doy por cerradas las fases que esperan tu aprobación?**

- A) Sí (recomendada)
- B) Quiero revisarlas una por una

Respuesta de Ricardo. Opción A

**99. ¿Cómo trabajamos para cuidar tu límite semanal?**

- A) Bloques cortos, con un PR por bloque (recomendada)
- B) Bloques largos
- C) Todo junto al final

Respuesta de Ricardo. Quiero que todo corra lo más rápido posible pero con la mejor calidad

**100. ¿Uno ya mi rama con main? La mía pasa de D-116 a D-117**

- A) Sí (recomendada)
- B) Espera

Respuesta de Ricardo. Opción A

**101. ¿Guardo el análisis y tus respuestas en el repo?**

- A) Sí, en docs (recomendada)
- B) No

Respuesta de Ricardo. Opción A

**102. ¿Quién más debe contestar parte de esto? Puedes elegir varios**

- A) Mi contador
- B) Mi abogado
- C) Los médicos revisores
- D) El influencer
- E) Nadie más

Respuesta de Ricardo. Opción E


### Comentarios adicionales de Ricardo (texto literal)

Ricardo escribió "Mis comentarios adicionales = TODOS DEBEN SER CONSIDERADOS TAL Y COMO LO PIDO".

1. Agregar a la revisión post examen la posibilidad de convertir una pregunta en tarjeta que se añada al mazo que el usuario seleccione, incluyendo los precargados.
2. Agrega a la revisión post examen que el usuario pueda responder porque falló la pregunta: Conocimiento, Tiempo, Malinterpretación, Lectura superficial, Ansiedad, Exceso de confianza, Fatiga
3. En la barra lateral mover SOLO la configuración hasta abajo (a la esquina inferior izquierda) y cambiar el icono por una rueda de engrane.
4. Mover la configuración del repaso y del pomodoro al repaso, no tienen nada que hacer alejados de esa zona porque al final de eso se trata, de configurar el repaso y tiene sentido que estén todos juntos.
5. En configuración solo va a quedar: Perfil (con plan en el primer plano para que sea fácil identificar en donde puedes cambiar tu plan), Apariencia, Privacidad, todo en una misma pestaña con subtítulos y una línea horizontal que los separe, no quiero las subpestañas como están ahora.
6. Eliminar la opción aislada de “Perfil” en el menú lateral y unificar lo que hoy es “Cuenta” con lo que hoy es “Perfil” en un solo menú que se llame perfil y se aloje dentro de configuración.
7. Hacer más pequeña la letra de la barra blanca que da la bienvenida y contiene todos los demás mensajes, dejar del mismo tamaño que “Tus repasos”, pero siempre en negritas.
8. Los mazos en la sección de repasar deben decir TODOS LOS TEMAS QUE CONTENGAN, o sea, en lugar de decir reumatología debe decir algo así como en orden alfabético:
   - Reumatología
     - Artritis Reumatoide
     - Lupus Eritematoso Sistémico
9. Quita todo lo que diga “Demostración, no validado por médicos”.
10. Quita el fondo degradado en TODOS LOS RECUADROS. Solo los botones con acción deben tener color y debe ser exactamente el Hex: # 156082.
11. La parte de explorar se me hace muy impráctica, analizar como mejorar.
12. Los apuntes pueden ir en una opción del menú lateral.
13. No entiendo el objetivo de la opción “Plan”, mejor eliminarla y unir lo que sea prudente conservar a la pestaña “Progreso”.
14. Elimina por completo lo de “Logros”.
15. Mejora las fotos de perfil, esas están horribles.
16. En la pestaña de perfil no dejes siempre abierta la posibilidad de modificar los datos. Agrega una opción que desbloquee todas estas posibilidades que diga “Editar perfil”.
17. ES SUMAMENTE IMPORTANTE QUE REVISES DE FORMA MUY MINUCIOSA LOS PROCESOS Y SUBPROCESOS QUE SIGUE ACTUALMENTE MI PÁGINA Y LOS AUDITES, CORRIJAS EN CASO DE SER NECESARIO, OPTIMICES, MEJORES, Y EN GENERAL LOS DEJES IMPECABLES. QUIERO UNA PÁGINA COMPLETAMENTE FUNCIONAL.
18. También quiero que agregues que quiero que cambie toda la apariencia de mi página para que parezca que realmente la hizo un humano experto en programación

El comentario 18 llegó en un mensaje aparte el mismo 2026-10-12, mientras se escribía este plan.
