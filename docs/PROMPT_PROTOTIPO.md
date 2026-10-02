# Prototipo funcional de la plataforma ENARM

Especificación para Claude Code. Versión 1 del 1 de octubre de 2026, escrita para Ricardo.

## 0. Cómo usar este documento

- Léelo completo en la primera sesión. En las sesiones siguientes lee CLAUDE.md, PLAN.md, PROGRESS.md, la sección de la fase en curso y las secciones que esa fase cita
- Trabaja por fases, de la 0 a la F, en orden. No empieces una fase sin la aprobación explícita de Ricardo
- Si una respuesta de Ricardo en la Fase 0 contradice este documento, gana Ricardo. Registra el cambio en DECISIONES.md con fecha y motivo
- Las cifras llevan una marca. (V) es un dato verificado en una fuente. (S) viene de una fuente secundaria. (J) es un juicio de diseño, razonable pero ajustable. Cambia un (J) si la evidencia lo pide y regístralo
- Si algo no está aquí y cambia lo que construyes, pregunta. Si no cambia nada importante, decide, anótalo en DECISIONES.md y sigue

## 1. Contexto del producto

- Ricardo es urólogo y emprendedor en Mérida, Yucatán. Construye una plataforma integral en español para preparar el ENARM, el examen nacional de aspirantes a residencias médicas en México
- Tiene bancos de preguntas propios, un amigo influencer para la promoción y un prompt maestro para generar flashcards
- La plataforma combina cuatro cosas
  1. Repetición espaciada tipo Anki con FSRS, sobre mazos precargados y mazos que el alumno suba
  2. Simuladores de examen por rama, dificultad, tipo de sesgo y estructura de pregunta, más el examen completo
  3. Un tutor de IA que detecta qué temas reforzar, encuentra patrones en los errores (mala lectura, sesgos, trampas, fatiga) y da consejos para responder mejor
  4. Un motor de retos que usa esos errores para reestructurar preguntas del banco y entrenar justo la habilidad que falla
- El contenido clínico se apega a las Guías de Práctica Clínica (GPC) de México
- Ricardo decidió una app integral con todas las funciones, sin recortar por costo de programación

## 2. Para qué sirve este prototipo

1. Probarlo con 5 aspirantes. Cada uno debe completar sin ayuda una sesión de repaso y un simulador. Cinco usuarios encuentran cerca del 85% de los problemas de usabilidad (V, Nielsen)
2. Mostrarlo al influencer, a médicos colaboradores y a posibles socios, con cada motor funcionando de forma visible
3. Ser la base de la versión de producción, que usará Supabase (Postgres, Auth y Row Level Security) y Cloudflare. El código debe poder crecer, no tirarse. Los motores y las pantallas deben pasar a producción casi sin cambios, y la capa de datos debe poder cambiar de IndexedDB a Supabase sin tocar los motores

## 3. Alcance

### 3.1 Entra todo esto

| Función de la lista de Ricardo | Cómo queda en el prototipo |
|---|---|
| Seguir mazos precargados | Mazos de demostración que el alumno sigue o deja |
| Subir sus propios mazos | Importador de .apkg de Anki, privado por defecto |
| Simulador por rama | Completo |
| Simulador por dificultad | Completo, con el estado de calibración visible |
| Simulador por tipo de sesgo | Completo, con las preguntas que tengan opciones etiquetadas |
| Heatmap como widget programable | Widget configurable |
| Pomodoro como widget programable | Widget configurable que alimenta al planificador |
| Causa autorreportada del error | Un toque después de cada error |
| Confianza autorreportada | Tres niveles antes de ver el resultado |
| Señales de conducta | Tiempo, adivinanza rápida, cambios de respuesta, fatiga y distracción |
| Análisis de olvidos con IA | Reglas en cada error y LLM por patrón, presentado como hipótesis con evidencia |
| Puntaje con Party | Grupos, tabla semanal y retos, con amigos simulados |
| Streaks | Racha con días de gracia |
| Niveles y XP | Con aciertos en opción múltiple y constancia en tarjetas |
| Flashcards con el prompt maestro | Generador anclado al banco, en borrador hasta que el alumno apruebe |
| Banco de hasta 10 opciones por sesgo | Hasta 10 opciones etiquetadas por pregunta y 4 mostradas |
| Sesgo que más hace fallar, con consejos | Patrón probable desde 40 errores etiquetados, con consejos |
| Análisis de temas | Errores agrupados por el tema de la respuesta correcta, con temas sugeridos |
| Errores por estructura de pregunta | Negación, excepción y tipo de tarea, con resaltado de negaciones |
| Examen completo y errores al repaso | Completo |
| Reestructurar preguntas para retar | Retos dirigidos sin IA y propuestas de IA que revisa un médico |

### 3.2 Queda fuera

- Chat libre con IA
- Predicción del puntaje ENARM, en cualquier forma
- Texto médico generado por IA que llegue al alumno sin anclaje ni revisión
- Mazos de terceros dentro del repositorio, incluidos los mazos de Paco
- Login real, servidor de base de datos, sincronización entre dispositivos y pagos reales. Llegan en producción
- Apps nativas, apps de App Store o Google Play y widgets en la pantalla del teléfono. Por decisión de Ricardo toda la plataforma vive como página web, también en producción

## 4. Reglas de producto que no se negocian

1. **Anclaje clínico.** Todo texto médico que genere la IA sale solo de la pregunta, la clave, la explicación y las referencias del banco. Cita la frase exacta que lo respalda y un validador rechaza lo que no esté respaldado
2. **Borrador primero.** Lo que genera la IA queda en borrador. El alumno aprueba lo que es solo para él y un médico aprueba lo que verán otros alumnos
3. **Calibrando.** Toda función que dependa de datos muestra un estado calibrando, con cuánto falta, hasta llegar a su umbral de la sección 12
4. **Honestidad.** La app habla de patrones probables e hipótesis, nunca de diagnósticos. Si el acuerdo entre médicos al etiquetar sesgos sale con kappa menor a 0.4, la interfaz los llama trampas y no sesgos (J)
5. **Privacidad.** Al LLM viajan solo IDs seudónimos y texto del banco. Nunca nombres, correos ni datos de contacto. Hay consentimiento separado para cada finalidad (Party, análisis con IA y uso anonimizado para mejorar el banco). El alumno puede exportar y borrar sus datos
6. **Etiquetas visibles.** El contenido de demostración dice Demostración, no validado por médicos. Los datos simulados dicen Datos simulados
7. **Eventos inmutables.** Los eventos de repaso y de respuesta solo se agregan y el estado se deriva de ellos
8. **Móvil primero y accesible.** Se usa con una mano en un teléfono durante sesiones largas. Modo claro y oscuro, texto escalable, navegación con teclado y soporte de lector de pantalla
9. **Español de México.** Trato de tú, salvo que Ricardo pida otra cosa. Código, archivos y variables en inglés
10. **Sin secretos.** La clave de la API vive solo en server/.env.local con el nombre ENARM_ANTHROPIC_KEY. Nunca uses ANTHROPIC_API_KEY, porque Claude Code la tomaría y cobraría a la API en lugar del plan de Ricardo (V)
11. **Todo es página web.** Todo funciona completo en el navegador, sin instalar nada, en teléfono y computadora. Agregarla a la pantalla de inicio es opcional y solo suma ícono, pantalla completa, repaso sin conexión y avisos en iPhone. No hay apps nativas ni de tienda

## 5. Stack

| Pieza | Elección | Para qué |
|---|---|---|
| Página web | Vite, React y TypeScript estricto | Página rápida y tipada |
| PWA | vite-plugin-pwa | Instalación opcional desde el navegador y modo sin conexión |
| Estilos | Tailwind con tokens propios | Móvil primero, modo claro y oscuro |
| Componentes | shadcn/ui sobre Radix | Accesibles desde el inicio |
| Rutas | React Router | Navegación |
| Estado de interfaz | Zustand | Estado efímero de pantallas |
| Datos locales | Dexie sobre IndexedDB, con dexie-react-hooks | Persistencia local reactiva |
| Esquemas | zod | Una sola fuente de verdad para tipos y validación |
| Repetición espaciada | ts-fsrs | FSRS |
| Gráficas | Recharts, más SVG propio para el heatmap | Curvas, barras y calendario de estudio |
| Arrastrar widgets | dnd-kit | Tablero configurable |
| Fechas | date-fns con soporte de zona horaria | Día de estudio en hora de Mérida |
| Cálculo pesado | Web Workers con Comlink | Rasch, simulación e importación |
| Importador | fflate o JSZip, sql.js, fzstd y protobufjs | .apkg viejo y nuevo |
| Saneado de HTML | DOMPurify | Tarjetas importadas |
| Proxy de IA | Node con Hono y el SDK oficial de Anthropic | La clave nunca toca el cliente |
| Pruebas | Vitest, Testing Library, fast-check, Playwright y axe-core | Unitarias, propiedades, punta a punta y accesibilidad |
| Calidad | ESLint y Prettier | Estilo consistente |

Políticas
- Usa las versiones estables actuales. Verifica cada una con npm view antes de instalar y registra las principales en DECISIONES.md
- TypeScript estricto, sin any salvo con un comentario que lo justifique
- Los motores viven en src/engines como funciones puras, sin React, sin Dexie y sin leer el reloj del sistema. Reciben el reloj y los datos como parámetros, para poder probarlos
- La interfaz habla con los datos solo por repositorios en src/data. Cada repositorio tiene una interfaz y una implementación con Dexie. En producción se agregará otra con Supabase
- Los cálculos pesados corren en Web Workers

### 5.1 Carpetas

```
src/
  app/          rutas, layout y proveedores
  features/     una carpeta por función (review, simulator, progress, tutor, widgets, party, decks, planner, profile, physician, admin, billing)
  engines/      motores puros (fsrs, session, topics, bias, structure, behavior, difficulty, sampler, forgetting, xp, streak, planner, party, agreement)
  ai/           cliente del proxy, esquemas de entrada y salida, respuestas fijas del modo simulado
  data/         esquemas zod, Dexie, repositorios, eventos y derivación de estado
  demo/         contenido de demostración y generador de alumnos simulados
  workers/      rasch, simulación e importador
  ui/           componentes compartidos y tokens de diseño
  i18n/         textos en español
server/         proxy de IA, prompts versionados, evaluaciones y configuración de modelos y precios
prompts/        prompt maestro de flashcards de Ricardo
tests/          pruebas de punta a punta y fixtures
docs/           especificación, capturas e informes
```

### 5.2 Scripts de npm

- dev levanta la app y el proxy juntos
- build y preview
- check corre typecheck, lint y pruebas unitarias
- test, e2e y e2e-ui
- eval-ai corre las evaluaciones de los motores de IA, en modo real o con la bandera mock
- demo-seed y demo-reset generan o borran contenido y alumnos simulados

### 5.3 Probar en el teléfono

- Por defecto todo corre en localhost
- El service worker y la instalación como PWA piden un contexto seguro. Localhost lo es, pero una IP de la red local sin HTTPS no lo es
- Para el teléfono ofrece dos caminos y deja que Ricardo elija en la Fase 0
  1. Modo LAN con HTTPS local, certificado de desarrollo y un token simple para que nadie más en la red use el proxy de IA
  2. Demo publicada en Cloudflare Pages con la IA en modo simulado, sin clave en ningún lado
- Nunca expongas el proxy de IA fuera de localhost sin token y sin límite de uso

## 6. Modelo de datos

### 6.1 Principios

- Los esquemas viven en un solo lugar, con zod en src/data/schemas. De ahí salen los tipos, las tablas de Dexie y, en producción, la migración SQL
- IDs con ULID
- Cada evento guarda tipo, usuario seudónimo, momento en UTC, zona horaria, versión de esquema y un payload validado
- El estado de cada tarjeta, la dificultad de cada pregunta, la racha y el XP se derivan de los eventos y se guardan como caché que se puede reconstruir
- Preguntas y opciones tienen versiones inmutables. Editar crea una versión nueva y las estadísticas se guardan por versión

### 6.2 Entidades

| Entidad | Qué guarda |
|---|---|
| User | ID seudónimo, alias, rol (alumno, médico o admin), fecha del ENARM, minutos diarios, zona horaria y ajustes |
| Consent | Finalidad, versión del aviso, estado y fecha |
| Deck | Nombre, origen (precargado, importado, generado o manual), visibilidad y dueño |
| Note y Card | Contenido saneado, tipo (básica o cloze), etiquetas, origen, estado editorial, fuente citada y estado FSRS derivado |
| Case | Viñeta clínica compartida por varias preguntas, para casos seriados |
| Question | Versión, caso opcional, enunciado, rama, tema, subtema, estructura, explicación, referencias GPC, dificultad estimada, set canónico, estado de calibración y estado editorial |
| Option | Versión, texto, si es correcta, etiqueta de sesgo o trampa, justificación, exposiciones y atracción |
| Event | Bitácora inmutable de todo lo que pasa |
| Session | Tipo (repaso, práctica, examen o reto), configuración, inicio y fin |
| Finding y Pattern | Hallazgos de las reglas de olvido y los patrones que los agrupan |
| AiArtifact | Hipótesis, informes, flashcards, consejos y preguntas reestructuradas, con estado, modelo, versión del prompt y resultado del validador |
| AiCallLog | Modelo, tokens, costo estimado, latencia y resultado de cada llamada |
| Group, Membership y Challenge | Party |
| WidgetLayout | Widgets, orden y ajustes de cada uno |
| BiasLabel | Etiquetas de cada médico, para medir acuerdo |
| ContentReport | Reportes de error de contenido |
| Subscription | Plan simulado y su estado |
| OfficialScore | Puntaje oficial capturado con consentimiento |
| SimTruth | Parámetros verdaderos de los alumnos simulados, solo para pruebas |

### 6.3 Eventos

| Evento | Cuándo | Datos clave |
|---|---|---|
| card_reviewed | Al calificar una tarjeta | Calificación, confianza previa, tiempo hasta revelar, tiempo hasta calificar, estado FSRS antes y después |
| question_shown | Al mostrar una pregunta | Versión, opciones mostradas con su versión, orden, semilla y modo de muestreo |
| answer_changed | En cada cambio de opción | Opción anterior, opción nueva y momento |
| question_answered | Al confirmar | Opción final, acierto, confianza, tiempo, número de cambios y si el resaltado estaba activo |
| cause_reported | Después de un error | Causa elegida |
| session_started y session_ended | Inicio y fin de sesión | Tipo, configuración y resumen |
| visibility_changed | Al salir o volver a la pestaña | Duración fuera |
| pomodoro_started, pomodoro_completed y pomodoro_interrupted | Pomodoro | Duración planeada y real |
| xp_awarded | Al ganar XP | Cantidad y motivo |
| streak_day_closed y streak_freeze_used | Al cerrar el día | Si cumplió la meta y congeladores usados |
| finding_created y pattern_confirmed | Reglas de olvido | Regla y evidencia |
| ai_artifact_created, ai_artifact_approved, ai_artifact_edited y ai_artifact_rejected | Motores de IA | Tipo, modelo y versión del prompt |
| hypothesis_feedback y action_applied | Tutor | Respuesta del alumno |
| deck_imported | Importador | Formato, conteos y advertencias |
| report_submitted | Reporte de error | Pregunta o tarjeta y motivo |
| party_joined, party_left y challenge_completed | Party | Grupo y reto |
| consent_changed, settings_changed y official_score_submitted | Perfil | Valor nuevo |

## 7. Motores núcleo sin IA

Cada motor documenta en su archivo qué hace, sus entradas, sus salidas y sus umbrales, y tiene pruebas unitarias.

### 7.1 Repetición espaciada con FSRS

- Usa ts-fsrs con parámetros por defecto. Retención deseada de 0.90, configurable entre 0.80 y 0.97
- Las tarjetas se califican con los cuatro botones de FSRS en español (Otra vez, Difícil, Bien y Fácil). Antes de revelar, el alumno marca su confianza en tres niveles. En tarjetas son No lo sé, Dudo y Seguro, y en opción múltiple son Adiviné, Dudé y Seguro. En tarjetas ese paso se puede apagar en ajustes para un modo rápido
- Las preguntas de opción múltiple que entran a la cola de repaso se califican solas con esta tabla, que corrige por adivinanza. Con 4 opciones se acierta al azar 25% de las veces, así que un acierto adivinado no prueba memoria (J). Gana la primera fila que aplique

| Resultado | Confianza | Señal de conducta | Calificación FSRS |
|---|---|---|---|
| Error | Cualquiera | Cualquiera | Otra vez |
| Acierto | Adiviné | Cualquiera | Otra vez |
| Acierto | Cualquiera | Adivinanza rápida | Otra vez |
| Acierto | Dudé | Sin adivinanza rápida | Difícil |
| Acierto | Seguro | Más rápido que su percentil 25 y sin cambios de respuesta | Fácil |
| Acierto | Seguro | Sin adivinanza rápida | Bien |

- Modo examen. Ningún vencimiento cae después de la fecha del ENARM. En los últimos 30 días la retención deseada sube a 0.93 y se avisa al alumno (J)
- Carga futura. Proyecta los repasos de los próximos 30 y 60 días con la configuración actual
- Errores al repaso. Cada pregunta fallada en práctica o examen entra a la cola como tarjeta de pregunta, salvo que el alumno lo apague
- Hermanas. Las tarjetas de la misma nota no salen el mismo día
- Sanguijuelas. Con 8 lapsos la tarjeta se marca como sanguijuela, como el valor por defecto de Anki. Desde 3 lapsos ya activa las reglas de olvido
- Límites diarios configurables de nuevas (20 por defecto) y de repasos (200 por defecto)
- Optimización de parámetros por alumno. Fuera del prototipo. Deja el punto de extensión y documenta un umbral de 1,000 repasos (J)
- Pruebas mínimas con fast-check. Otra vez nunca da un intervalo mayor que Bien para la misma tarjeta y momento. En modo examen ningún vencimiento pasa la fecha del ENARM. La tabla de opción múltiple es determinista y cubre todos los casos

### 7.2 Sesiones e intercalado

- Una sesión de repaso mezcla repasos vencidos, tarjetas nuevas, errores recientes del simulador y retos, en proporciones configurables
- Si hay más vencidas que tiempo, ordena por retrievability de menor a mayor y respeta el tope diario
- Intercala por tema. No más de 2 elementos seguidos del mismo subtema y nunca dos confusables seguidos, que son los pares marcados por interferencia en 7.9
- El tamaño de la sesión sale del tiempo disponible del día, según el planificador o el Pomodoro activo
- Pruebas. Las restricciones se cumplen siempre que sea posible y la sesión es reproducible con la misma semilla

### 7.3 Análisis por tema

- Usa la taxonomía rama, tema y subtema de 13.4
- Agrupa los errores según el tema de la respuesta correcta, como pidió Ricardo
- Estima el dominio por tema con un modelo beta-binomial que encoge hacia la media de su rama (empirical Bayes). La fuerza del prior equivale a unas 10 respuestas (J, configurable)
- Muestra la estimación solo si el intervalo creíble de 95% mide menos de 0.25. Si no, muestra calibrando y cuántas respuestas faltan aproximadamente (J)
- Prioridad de refuerzo igual a (1 menos dominio) por el peso del tema en el ENARM por un factor de olvido que sale de la retrievability promedio de sus tarjetas
- Salida con los 5 temas a reforzar, cada uno con su porqué en una línea y una acción (repasar sus tarjetas, simulador del tema o reto)
- Pruebas. Con datos simulados, el error absoluto medio del encogimiento debe ser menor que el de la proporción cruda

### 7.4 Análisis por sesgo

- Cada distractor tiene una etiqueta primaria de la taxonomía provisional de 13.1
- Exposición. En cada pregunta mostrada se registra qué etiquetas había entre los distractores visibles
- Atracción del alumno hacia la etiqueta S igual a las veces que eligió un distractor S entre las veces que tuvo al menos uno a la vista
- Línea base igual a la atracción de la población hacia esos mismos distractores. Sin población real usa la de los alumnos simulados y márcalo
- Intervalo de Wilson de 95% para la atracción del alumno
- Muestra un patrón solo desde 40 errores con etiqueta (J) y solo si el límite inferior del intervalo supera la línea base
- Lenguaje de patrón probable, por ejemplo Tiendes a elegir opciones de cierre prematuro más que el promedio. Nunca Tienes el sesgo X
- Pruebas. Wilson contra valores de referencia calculados a mano, más la recuperación de 14.2

### 7.5 Estructura de pregunta y resaltado de negaciones

- Un etiquetador por reglas asigna polaridad (afirmativa o negativa) y tipo de tarea según 13.2. El diccionario vive en un archivo de datos que los médicos pueden editar
- Las etiquetas que ponga el médico ganan sobre las automáticas
- El etiquetador separa la viñeta de la frase de la pregunta y solo busca negaciones en la pregunta. No refiere fiebre dentro del caso no vuelve negativa la pregunta
- Resaltado de negaciones. Durante la pregunta resalta EXCEPTO, NO, INCORRECTA, FALSA, MENOS, SALVO, CONTRAINDICADO y sus variantes sin cambiar el texto. Encendido por defecto en práctica y apagado por defecto en examen completo para parecerse al real. El alumno lo cambia en ajustes (J)
- Probable mala lectura. En una pregunta negativa, si el alumno elige una opción que es una afirmación verdadera y además respondió rápido o reportó haber leído mal, se crea un hallazgo de mala lectura
- Análisis por estructura igual que por tema, con beta-binomial e intervalo, por alumno y agregado. Por alumno, calibrando hasta 20 respuestas por categoría y hasta cumplir la regla del intervalo (J)
- Pruebas. Mayúsculas, minúsculas, acentos, dobles negaciones y falsos positivos comunes dentro de la viñeta

### 7.6 Señales de conducta y calibración metacognitiva

- Tiempo de respuesta normalizado por palabras del enunciado y por el ritmo personal del alumno (puntaje z)
- Adivinanza rápida si el tiempo es menor al mínimo plausible de lectura, palabras entre 6 palabras por segundo (J), o menor al percentil 10 personal
- Cambios de respuesta con dirección (de correcta a incorrecta, de incorrecta a correcta y entre incorrectas)
- Fatiga si en una sesión de más de 30 minutos la exactitud ajustada por dificultad cae y el tiempo sube en el último tercio frente al primero
- Distracción por tiempo fuera de la pestaña y pausas largas
- Desempeño por franja horaria y por duración de sesión
- Calibración metacognitiva. Porcentaje de aciertos por nivel de confianza, errores con confianza Seguro y la curva de calibración, con una etiqueta de sobreconfianza o subconfianza
- Todo se guarda como eventos y lo consumen los análisis, las reglas de olvido y el tutor

### 7.7 Dificultad con Elo y Rasch

- Cada pregunta arranca con la dificultad que estimó el médico, de 1 a 5, convertida a escala logit
- Elo en línea. Actualiza la habilidad del alumno y la dificultad de la pregunta en cada respuesta, con un factor K que baja conforme crecen las respuestas
- Rasch en un Web Worker. Reestima las dificultades por lotes con máxima verosimilitud. Documenta qué método usaste (conjunta o marginal) y por qué
- Estados por pregunta. Estimada por médico, provisional desde 30 respuestas y calibrada desde 100 (V, Linacre)
- El simulador por dificultad usa bandas (fácil, media, difícil y muy difícil) y muestra el estado de calibración
- Modo adaptativo opcional en práctica, que elige preguntas cerca de la habilidad estimada del alumno
- Pruebas con la recuperación de parámetros de 14.2

### 7.8 Banco de hasta 10 opciones y muestreo

- Cada pregunta tiene 1 opción correcta y de 3 a 9 distractores. Cada distractor lleva una etiqueta de sesgo o trampa y una justificación breve de por qué atrae
- Set canónico. El médico marca 4 opciones (la correcta y 3 distractores) como la versión estándar
- Se muestran 4 opciones. El número es configurable por si el formato oficial cambia
- Modos de muestreo
  - Canónico para el examen completo
  - Diverso para práctica. Maximiza etiquetas distintas y evita repetirle al alumno el mismo set
  - Dirigido para retos. Incluye al menos un distractor de la etiqueta que más atrae al alumno
  - Estratificado para calibrar. Reparte la exposición entre todos los distractores
- El orden se baraja con una semilla que se guarda en el evento y la posición de la correcta queda balanceada
- Variantes. Cualquier set distinto al canónico es una variante. En el examen completo solo cuentan variantes cuyos distractores ya tengan 200 exposiciones cada uno (J). Antes de eso las variantes se usan en práctica y retos, pero no entran al puntaje del examen
- Análisis de distractores. Atracción de cada opción con su exposición. Un distractor elegido por menos de 5% tras 100 exposiciones se marca como no funcional para que el médico lo revise (J, criterio común en análisis de ítems). En preguntas de 4 opciones solo 13.8% tenía sus 3 distractores funcionando (V, Tarrant y colegas), así que espera muchos no funcionales
- Pruebas. Ninguna muestra repite opción, siempre incluye la correcta, respeta el modo y se reproduce con la semilla

### 7.9 Reglas de olvido en cada error

Cada error pasa por estas reglas, que no cuestan nada. Cada regla que se cumple crea un hallazgo con su evidencia, que son IDs de eventos y de ítems.

| Regla | Se cumple cuando | Acción sugerida |
|---|---|---|
| Olvido persistente | La tarjeta lleva 3 o más lapsos | Revisar la explicación, reformular o dividir |
| Tarjeta de lista | La respuesta enumera 4 o más elementos | Dividir en varias tarjetas o usar cloze |
| Interferencia | Eligió la respuesta de una pregunta o tarjeta parecida del mismo subtema, o confunde dos tarjetas de forma repetida | Tarjeta de contraste entre ambas |
| Error de alta confianza | Falló con confianza Seguro | Leer la explicación con calma y repetir pronto |
| Mala lectura | Hallazgo de 7.5 | Activar el resaltado y practicar preguntas negativas |
| Fatiga | Error en el último tercio de una sesión larga con caída de exactitud | Pausa o Pomodoro más corto |
| Prisa | Adivinanza rápida | Bajar el ritmo en preguntas largas |
| Brecha de base | Errores en un subtema cuyo tema base también tiene bajo dominio, si la taxonomía trae esa relación | Repasar primero el tema base |
| Olvido esperado | El lapso ocurrió con retrievability predicha baja después de un intervalo largo | Ninguna, es normal y no se alarma al alumno |

- Los hallazgos del mismo tipo y la misma área se agrupan en patrones. Un patrón se confirma con 5 hallazgos en 14 días (J, configurable) y entonces puede llamar al LLM de 8.2
- La causa que reporta el alumno se guarda como evidencia y se compara con las señales. Si no coinciden, el hallazgo lo dice

### 7.10 Planificador y carga

- Entradas. Fecha del ENARM, minutos disponibles por día (declarados y reales según el Pomodoro), carga de FSRS, temas a reforzar y pesos del ENARM
- Salida. Plan del día (repasos, nuevas, bloque de simulador y reto) y vista de la semana
- Si la carga proyectada supera el tiempo disponible, avisa y propone bajar nuevas por día o subir minutos, con el efecto estimado de cada opción

### 7.11 Acuerdo del etiquetado

- Un 20% de las preguntas, elegido al azar, recibe la etiqueta de un segundo médico que no ve la del primero (J)
- Calcula kappa de Cohen global y por etiqueta, con intervalo de confianza
- Si el kappa global es menor a 0.4, la interfaz del alumno usa la palabra trampas en lugar de sesgos (J)
- Pruebas. Kappa contra tablas de referencia calculadas a mano

## 8. Motores de IA

### 8.1 Arquitectura común

- Un proxy local en server, con Node y Hono. La app nunca llama a Anthropic directamente
- Usa el SDK oficial de Anthropic para TypeScript. Revisa en la documentación vigente cómo pedir salida estructurada con JSON Schema. Si un modelo no la soporta, usa tool use con esquema y fuerza la herramienta
- Modo real si existe ENARM_ANTHROPIC_KEY en server/.env.local. Modo simulado si no existe, con respuestas fijas por motor en src/ai/fixtures. La interfaz muestra en qué modo está
- Modelos por motor en un archivo de configuración del servidor, con estos valores por defecto (J)

| Motor | Modelo por defecto | Por qué |
|---|---|---|
| Olvidos por patrón | claude-haiku-4-5-20251001 | Barato y suficiente para JSON estructurado |
| Informe semanal | claude-haiku-4-5-20251001 | Resume datos ya calculados |
| Flashcards | claude-sonnet-5-5 | Mejor redacción clínica |
| Consejos por sesgo | claude-haiku-4-5-20251001 | Personaliza un texto base |
| Reestructurar preguntas | claude-sonnet-5-5 | Tarea más difícil que además revisa un médico |

- Cada salida se valida con zod. Si falla, hay un reintento con el error de validación. Si vuelve a fallar, cae a reglas o a la plantilla sin IA y lo registra
- Prompt caching del bloque fijo de cada motor, que son instrucciones, taxonomía y ejemplos
- Los prompts viven versionados en server/prompts y cada artefacto guarda la versión que lo generó
- Al LLM viajan IDs seudónimos y texto del banco. Un filtro bloquea correos, teléfonos y nombres propios del perfil
- Límites de tamaño de entrada, de llamadas por alumno por día y de presupuesto diario total, más timeout y reintentos con espera exponencial
- Bitácora de costo. Cada llamada guarda modelo, tokens de entrada, de salida y de caché, costo estimado, latencia y resultado del validador. Los precios viven en configuración, con estos valores en dólares por millón de tokens a octubre de 2026 (V)

| Modelo | Entrada | Salida | Escritura de caché de 5 minutos | Lectura de caché |
|---|---|---|---|---|
| Haiku 4.5 | 1 | 5 | 1.25 | 0.10 |
| Sonnet 5.5 | 2 | 10 | 2.50 | 0.20 |
| Opus 5.5 | 4 | 20 | 5 | 0.20 |

- La pantalla de admin muestra el costo acumulado, el costo por motor y una proyección por alumno al mes, para comparar con la estimación del plan maestro

### 8.2 Motor de olvidos, LLM por patrón

- Se activa cuando un patrón se confirma en 7.9, como máximo una vez por patrón cada 7 días. En producción irá por lotes con la Batch API, que cuesta la mitad (V)
- Entrada. El patrón con su evidencia estructurada, el texto del banco de los ítems implicados, las señales y las causas reportadas
- Salida validada con estos campos
  - hypothesis, una frase
  - evidence, lista de referencias a eventos o ítems reales que el validador comprueba que existen
  - confidence, baja o media, nunca alta
  - actions, solo de una lista cerrada que la app sabe ejecutar (crear tarjeta de contraste, dividir tarjeta, repasar explicación, simulador del subtema, activar resaltado y sugerir pausa)
  - student_message, de 2 a 3 frases con tono de tutor
- Si la evidencia no alcanza, la respuesta correcta es sin hipótesis
- Nunca introduce hechos médicos nuevos ni opina sobre la salud mental del alumno
- En la interfaz es una tarjeta de hipótesis con ver evidencia, aplicar acción y no me ayuda. La respuesta del alumno se guarda

### 8.3 Informe semanal del tutor

- Una vez por semana combina temas, sesgos, estructura, conducta, olvidos y planificador en un informe corto con tres prioridades, un hábito y un reto
- Se genera solo con datos ya calculados, nunca con texto libre del alumno
- Las secciones que siguen calibrando no aparecen
- Sin IA, la misma información sale con una plantilla fija

### 8.4 Generador de flashcards

- Entrada. La pregunta fallada (enunciado, clave, explicación y referencias), la opción que eligió el alumno con su etiqueta, la causa reportada y el prompt maestro de prompts/flashcards_maestro.md
- Usa solo el texto que esté debajo de la marca de ese archivo. Si no hay texto, usa prompts/flashcards_provisional.md, que escribes en la Fase D marcado como PROVISIONAL, y la interfaz lo avisa
- Salida de 1 a 5 tarjetas, básicas o cloze, cada una con source_quote, la frase exacta de la explicación que la respalda
- Validador
  - source_quote aparece literal en la explicación
  - Rechaza cifras, dosis o fármacos que no estén en la fuente
  - Rechaza duplicados muy parecidos a tarjetas que el alumno ya tiene
- Si la pregunta no tiene explicación en el banco, no genera nada y lo dice
- Las tarjetas quedan en borrador. El alumno aprueba, edita o descarta. Las aprobadas quedan privadas y para entrar a un mazo público pasan por la cola del médico

### 8.5 Consejos por sesgo

- Cada etiqueta tiene un texto base con una estrategia concreta, por ejemplo antes de responder, nombra el dato del caso que no encaja. En el prototipo esos textos son borradores tuyos marcados pendiente de revisión médica
- El LLM personaliza el texto con 2 o 3 preguntas reales donde el alumno cayó, sin agregar hechos médicos nuevos
- Se muestra solo cuando el patrón ya cumple su umbral

### 8.6 Motor de retos y preguntas reestructuradas

- Sin IA. Retos con el muestreo dirigido de 7.8 y con preguntas de la estructura y el tema donde más falla el alumno
- Con IA. Propone versiones reestructuradas de preguntas del banco, por ejemplo convertir una pregunta afirmativa en una de excepto, cambiar el dato que ancla o mover la pregunta al siguiente paso del manejo
- Cada propuesta entra a la cola del médico como borrador, con la pregunta original al lado. Nunca llega a un alumno sin aprobación
- Las aprobadas entran como variantes y quedan fuera del puntaje del examen hasta su umbral

### 8.7 Evaluaciones de IA

- Un set de 10 a 20 casos dorados por motor en server/evals, con la salida esperada o las reglas que debe cumplir
- npm run eval-ai corre todos los casos y reporta validez del esquema, anclaje, rechazos correctos, costo y latencia
- Con la bandera mock corre contra las respuestas fijas, sin clave y sin costo
- Metas para cerrar la Fase D (J). Esquema válido en 100% de los casos, anclaje correcto en 100% y rechazo correcto en todos los casos sin explicación

## 9. Gadgets y gamificación

### 9.1 Tablero de widgets programables

- Inicio es un tablero. El alumno agrega, quita, reordena y configura widgets. Arrastrar y soltar con alternativa por teclado. El acomodo se guarda
- Programable significa que cada widget tiene ajustes y que algunos aceptan horarios, como el Pomodoro programado o el recordatorio diario. Los widgets viven dentro de la página, nunca en la pantalla del teléfono
- Con la página cerrada, los recordatorios dependen de las notificaciones del navegador. En producción también podrán llegar por correo (J)

| Widget | Ajustes |
|---|---|
| Heatmap de estudio | Rango de 90, 180 o 365 días y métrica (tarjetas, preguntas o minutos) |
| Pomodoro | Duraciones, ciclos, sonido y sesiones programadas |
| Racha | Meta mínima diaria |
| Nivel y XP | Sin ajustes |
| Para hoy | Qué contar (vencidas, nuevas o errores pendientes) |
| Temas débiles | Cuántos mostrar y de qué rama |
| Cuenta regresiva al ENARM | Fecha |
| Patrón de sesgo o trampa | Sin ajustes, muestra calibrando si no llega a su umbral |
| Carga futura | 30 o 60 días |
| Meta diaria | Valor de la meta |
| Reto de Party | Grupo |
| Última hipótesis del tutor | Sin ajustes |

- Tres acomodos predefinidos, Esencial, Analítico y Competitivo
- Cada widget obtiene sus datos de un proveedor de instantáneas, para que agregar widgets nuevos no toque los motores

### 9.2 Pomodoro

- 25 minutos de enfoque, 5 de descanso y 15 de descanso largo cada 4 ciclos, configurable
- Cuenta con marcas de tiempo y no con intervalos, para que no se desfase en segundo plano
- Avisa al terminar con sonido y un aviso dentro de la página. Si el navegador lo permite y el alumno da permiso, también con notificación. En iPhone eso solo funciona si el alumno agregó la página a su pantalla de inicio (S), y la página se lo explica sin presionar
- Registra los minutos de enfoque reales, que usa el planificador

### 9.3 Heatmap

- Calendario por día con intensidad por actividad, con un resumen en texto para lectores de pantalla

### 9.4 Racha

- Un día cuenta si se cumple la meta mínima, configurable, por ejemplo 20 tarjetas, 10 preguntas o 15 minutos de enfoque
- El día cambia a las 4 a. m. hora de Mérida (America/Merida)
- Días de gracia. Un congelador por cada 7 días de racha, con un máximo de 2 guardados, que se usa solo (J)
- Muestra la racha actual y el récord

### 9.5 XP y niveles

- Opción múltiple. XP por acierto que sube con la dificultad de la pregunta. Un error da un XP mínimo por intentarlo
- Tarjetas autocalificadas. XP por repaso hecho, sin importar la calificación. Así nadie infla su calificación y contamina FSRS (J)
- Constancia. Bono por meta diaria cumplida y multiplicador por racha con tope de 1.5 veces
- Anti trampa. Repasos de menos de 1 segundo no dan XP y hay tope diario de XP por volumen
- Niveles con curva creciente y títulos por tramo (Pasante, R1, R2, R3, R4, Jefe de residentes, Adscrito y Profesor titular). Ajusta la curva con los alumnos simulados para que un alumno constante suba unos 2 niveles por semana al inicio y 1 cada 2 semanas a los 3 meses (J)
- Cada XP queda como evento con su motivo

### 9.6 Puntaje y Party

- Puntaje semanal igual al XP de la semana
- Grupos por código de invitación de 6 caracteres, de hasta 50 miembros (J)
- Tabla semanal que se reinicia el lunes a las 4 a. m.
- Retos de grupo con meta colectiva, por ejemplo 1,000 tarjetas entre todos, y duelos asíncronos con el mismo simulador de 20 preguntas, donde gana más exactitud y desempata el tiempo
- Compartir una tarjeta de logro como imagen con Web Share API, solo si el alumno quiere
- Privacidad. Por defecto se comparte alias, XP, nivel y racha. Exactitud por tema, patrones de sesgo y conducta nunca se comparten. Hay consentimiento antes de unirse
- En el prototipo Party es local, con amigos simulados de distinta constancia, detrás de un PartyService que en producción se implementará con Supabase Realtime. Confirma el alcance con Ricardo en la Fase 0

## 10. Pantallas

### 10.1 Alumno

1. Bienvenida y onboarding con fecha del ENARM, minutos diarios, ramas, meta diaria, aviso de privacidad simulado y consentimientos por finalidad
2. Inicio con el tablero de widgets
3. Repaso de tarjetas con confianza previa, los cuatro botones, causa después de fallar y tiempo
4. Pregunta de opción múltiple con caso clínico, resaltado de negaciones, opciones, confianza, cambios registrados, temporizador y botón para reportar error
5. Retroalimentación con explicación, por qué atrae la opción elegida (su justificación y su etiqueta), causa del error y botón para generar flashcards
6. Resumen de sesión con XP, exactitud, tiempo y hallazgos nuevos
7. Configurar simulador por rama, dificultad, sesgo, estructura o mezcla, en modo práctica o examen completo
8. Examen completo con navegación, marcar para revisar, tiempo total y sin retroalimentación hasta el final
9. Resultados del examen por rama, estructura y sesgo, con los errores enviados al repaso
10. Progreso con temas, sesgos, estructura, conducta, calibración metacognitiva, dificultad y carga futura
11. Tutor con hipótesis, informe semanal, consejos por sesgo y flashcards en borrador
12. Mazos con precargados, importados, creación manual e importador
13. Planificador del día y de la semana
14. Party con grupos, tabla, retos y compartir
15. Perfil y ajustes con fecha del ENARM, retención deseada, metas, Pomodoro, notificaciones, tema visual, privacidad, exportar y borrar datos, y captura del puntaje oficial
16. Suscripción simulada con planes y checkout simulado

### 10.2 Médico

17. Banco de preguntas con filtros, estado de calibración y alertas de distractores no funcionales
18. Editor de pregunta con caso, enunciado, hasta 10 opciones, etiqueta por opción con su definición a la vista, set canónico, explicación, referencias GPC, tema, estructura, dificultad estimada e historial de versiones
19. Cola de doble etiquetado y tablero de acuerdo con kappa
20. Cola de borradores de IA (preguntas reestructuradas, flashcards para mazos públicos y consejos)
21. Bandeja de reportes de error de contenido
22. Importador del banco de Ricardo desde CSV o JSON, con una plantilla documentada y reporte de errores por fila

### 10.3 Admin

23. Costos de IA y bitácora de llamadas
24. Datos de demostración para generar, borrar y ajustar alumnos simulados
25. Configuración de umbrales, pesos del ENARM, precios y modelos por motor
26. Selector de rol para cambiar entre alumno, médico y admin sin login

### 10.4 Diseño

- Sobrio y legible para sesiones largas. Tipografía grande en el enunciado, botones grandes al alcance del pulgar y navegación inferior con 5 secciones (Inicio, Repasar, Simular, Progreso y Perfil)
- Si Ricardo ya tiene un Design System de Claude Design, úsalo. Si no, crea tokens propios con una paleta sobria, definidos en un solo lugar
- Gráficas con texto alternativo y sin depender solo del color
- Cada pantalla tiene estados vacío, cargando, error, sin conexión y calibrando

## 11. Contenido de demostración y alumnos simulados

### 11.1 Contenido de demostración

- 60 preguntas, 15 por rama (Medicina interna, Pediatría, Ginecología y obstetricia, y Cirugía general), salvo que Ricardo pida otras ramas
- Cada pregunta con 10 opciones (1 correcta y 9 distractores etiquetados con su justificación), set canónico, explicación de 80 a 150 palabras, tema, subtema, estructura y dificultad estimada
- Al menos 20% de preguntas negativas o de excepción y al menos 6 casos seriados con 2 o 3 preguntas cada uno
- Referencias. Nombra la GPC por su título general, sin inventar claves, años ni páginas, y marca la referencia como por verificar
- 4 mazos precargados con 200 tarjetas en total, básicas y cloze, de los mismos temas
- Todo marcado como Demostración, no validado por médicos
- El contenido vive en archivos JSON en src/demo/content, validados por los mismos esquemas zod

### 11.2 Alumnos simulados

- Un generador con semilla crea 300 alumnos simulados por defecto (J)
- Cada alumno tiene parámetros verdaderos. Habilidad general, habilidad por rama, propensión a cada etiqueta de sesgo (la mayoría cerca de cero y algunos con propensión sembrada), tendencia a leer mal negaciones, velocidad de lectura, fatiga, constancia diaria y calibración de su confianza
- Sus respuestas salen de un modelo Rasch con atracción extra hacia los distractores de su sesgo, errores extra en preguntas negativas según su tendencia, tiempos y cambios de respuesta realistas y confianza correlacionada con el acierto
- Sus historiales de tarjetas salen de una simulación de FSRS de 90 días
- Los parámetros verdaderos se guardan en SimTruth solo para las pruebas
- Los datos simulados viven en una base separada de la de datos reales y la interfaz los marca

### 11.3 Alumno de la demo

- Un alumno principal con 60 días de historial, una fecha del ENARM provisional y configurable, y patrones sembrados a propósito, para que cada análisis tenga algo que mostrar. Por ejemplo anclaje, mala lectura de negaciones, fatiga después de 40 minutos y un tema débil claro en Pediatría
- Un botón de admin lo regenera desde cero

## 12. Umbrales

| Función | Deja de calibrar cuando | Marca |
|---|---|---|
| Dificultad provisional por pregunta | 30 respuestas | V, Linacre |
| Dificultad calibrada | 100 respuestas | V, Linacre |
| Variante dentro del puntaje del examen | 200 exposiciones por distractor | J |
| Patrón por sesgo por alumno | 40 errores etiquetados y límite inferior de Wilson sobre la línea base | J |
| Dominio por tema | Intervalo de 95% menor a 0.25 | J |
| Estructura por alumno | 20 respuestas por categoría y la regla del intervalo | J |
| Patrón de olvido que llama al LLM | 5 hallazgos del mismo tipo en 14 días | J |
| Distractor no funcional | Menos de 5% de elección tras 100 exposiciones | J |
| Hablar de sesgos y no de trampas | Kappa de 0.4 o más | J |
| Doble etiquetado | 20% de las preguntas | J |
| Optimizar parámetros FSRS por alumno | 1,000 repasos | J |

## 13. Taxonomías provisionales

Todas son provisionales, pendientes de aprobación de los médicos de Ricardo. Viven en archivos de datos y no en el código.

### 13.1 Sesgos y trampas

| Clave | Nombre | El distractor |
|---|---|---|
| ANC | Anclaje | Se apoya en el primer dato o en el más llamativo del caso e ignora el resto |
| CIE | Cierre prematuro | Es correcto para la primera hipótesis razonable, pero un dato posterior del caso la descarta |
| DIS | Disponibilidad | Es una entidad frecuente, reciente o muy conocida que solo comparte rasgos superficiales con el caso |
| REP | Representatividad | Corresponde al cuadro clásico de libro, aunque al caso le falta o le sobra un criterio clave |
| TAS | Tasa base | Encaja con el cuadro pero es mucho menos probable por edad, sexo, epidemiología o contexto |
| CON | Confirmación | Propone el estudio que confirma la hipótesis favorita en lugar del que distingue entre hipótesis |
| COM | Comisión | Propone intervenir cuando lo indicado es observar, esperar o no hacer |
| SEC | Secuencia | Es una acción correcta pero en otro momento del manejo, por ejemplo el tratamiento definitivo cuando se pregunta por el inicial |
| OTR | Otro | No encaja en ninguna. Se usa poco y se revisa |

- Una sola etiqueta primaria por distractor, para poder medir acuerdo
- SEC es más una trampa de formato que un sesgo cognitivo. Se queda porque es frecuente y se puede entrenar

### 13.2 Estructura de pregunta

- Polaridad. Afirmativa o negativa (excepto, no, incorrecta, falsa, menos probable, salvo o contraindicado)
- Tarea. Diagnóstico, siguiente paso, estudio inicial, estudio de elección o confirmatorio, tratamiento inicial, tratamiento de elección, mecanismo o fisiopatología, factor de riesgo o etiología, complicación o pronóstico, prevención o tamizaje, e interpretación de un dato (laboratorio, imagen o electrocardiograma)
- Formato. Caso clínico, pregunta directa o caso seriado

### 13.3 Causas de error autorreportadas

1. No lo había estudiado
2. Lo sabía pero lo olvidé
3. Lo confundí con otra cosa
4. Leí mal la pregunta
5. Me faltó un dato del caso
6. Me apresuré o estaba cansado
7. Dudé y cambié mi respuesta
8. Otra

### 13.4 Ramas, temas y pesos

- Ramas iniciales. Medicina interna, Pediatría, Ginecología y obstetricia, y Cirugía general. Ricardo puede agregar Urgencias, Salud pública o las que use su banco
- Crea una taxonomía inicial de unos 40 temas con sus subtemas y déjala editable
- Pesos del ENARM provisionales e iguales por rama hasta que Ricardo dé los oficiales
- Relación opcional de tema base, para la regla de brecha de base

## 14. Calidad, pruebas y seguridad

### 14.1 Pruebas

- Unitarias con Vitest para cada motor, con cobertura de 90% o más en src/engines (J)
- Por propiedades con fast-check para FSRS, muestreo, XP, racha e intercalado
- Funciones estadísticas (Wilson, beta-binomial y kappa) contra valores de referencia calculados a mano o con una librería reconocida
- De componentes con Testing Library en las pantallas con lógica
- De punta a punta con Playwright, en tamaño de teléfono y de escritorio, con estos flujos
  1. Onboarding completo
  2. Sesión de repaso con confianza, causa y XP
  3. Simulador en práctica con retroalimentación y flashcards generadas en modo simulado
  4. Examen completo corto de 20 preguntas, con resultados y errores al repaso
  5. Tablero de widgets, agregar, configurar y reordenar
  6. Party, unirse a un grupo, ver la tabla y completar un reto
  7. Importar un .apkg de prueba en formato viejo y en formato nuevo
  8. Médico edita una pregunta, etiqueta opciones y ve el kappa
  9. Exportar y borrar datos
- Accesibilidad con axe dentro de Playwright, con cero violaciones serias o críticas

### 14.2 Recuperación de parámetros

Con los alumnos simulados se conoce la verdad, así que los motores deben recuperarla. Metas iniciales (J). Reporta los números reales aunque no lleguen.
- Rasch. Correlación de 0.90 o más entre dificultad verdadera y estimada
- Elo. Correlación de 0.80 o más
- Sesgos. Detecta al menos 80% de los alumnos con propensión sembrada y marca como máximo 10% de los alumnos sin propensión
- Temas. El encogimiento reduce el error frente a la proporción cruda
- Mala lectura y fatiga. Mismas metas que sesgos
- Si una meta no se cumple, explica por qué y propone el ajuste antes de seguir

### 14.3 Seguridad

- Una prueba busca en la carpeta dist la clave, el nombre de la variable y el prefijo de las claves de Anthropic, y falla si encuentra alguno
- El proxy escucha solo en localhost y el modo LAN pide token
- Todo lo que entra al proxy se valida con zod y tiene tamaño máximo
- El HTML de las tarjetas importadas se sanea con DOMPurify y una lista corta de etiquetas permitidas, sin scripts, iframes ni manejadores de eventos. Importa porque las tarjetas de Anki traen HTML y un mazo malicioso podría inyectar código (J)
- El importador limita el tamaño descomprimido, el número de archivos y los tipos de medios, para evitar bombas zip
- Content Security Policy en el build
- npm audit sin vulnerabilidades altas ni críticas al cerrar la Fase F
- Revisión contra los controles aplicables de OWASP ASVS 5.0 (V). Documenta cuáles aplican al prototipo y cuáles quedan para producción

### 14.4 Rendimiento y modo sin conexión

- JavaScript inicial menor a 300 KB comprimido (J). sql.js, gráficas y panel médico se cargan solo cuando se usan
- La app abre sin conexión después de la primera carga y las funciones de IA dicen que necesitan conexión
- Una sesión de 200 tarjetas no se traba en un teléfono de gama media

## 15. Proceso por fases

### 15.1 Cómo se cierra cada fase

1. Corre npm run check y las pruebas de punta a punta de la fase
2. Toma capturas de las pantallas nuevas en teléfono y escritorio, en modo claro y oscuro, en docs/screenshots
3. Pide revisión a un subagente que no escribió el código. Que revise el diff contra este documento y PLAN.md, verifique que cada criterio de aceptación tiene prueba y busque secretos, texto médico de IA sin anclaje, funciones sin estado calibrando, eventos que se editan y datos simulados sin etiqueta. Que reporte solo lo que afecta corrección, seguridad o requisitos. Corrige lo que encuentre
4. Actualiza PROGRESS.md con lo hecho y su evidencia, conteo de pruebas, desviaciones, decisiones y preguntas para Ricardo
5. Haz commit con un mensaje claro en español
6. Detente y pide aprobación con un resumen de 5 a 8 viñetas

### 15.2 Fase 0. Entrevista, entorno y plan

Tareas
1. Verifica Node en una versión LTS vigente, npm y Git. Si falta algo, explica a Ricardo cómo instalarlo y espera
2. Revisa que la carpeta del proyecto no esté dentro de OneDrive. Si lo está, recomienda moverla, porque sincronizar node_modules causa errores y lentitud (J)
3. Lee prompts/flashcards_maestro.md
4. Haz la entrevista de la sección 16
5. Escribe PLAN.md con arquitectura, carpetas, modelo de datos, tareas por fase con criterios de aceptación y su prueba, riesgos y umbrales. Crea PROGRESS.md, DECISIONES.md e IDEAS.md

Criterios de aceptación
- Cada respuesta de Ricardo está en DECISIONES.md
- PLAN.md permite empezar la Fase A sin volver a preguntar lo básico
- No hay código todavía

### 15.3 Fase A. Esqueleto, datos y proxy

Tareas
1. git init, .gitignore con node_modules, dist y server/.env.local, proyecto Vite con React y TypeScript estricto, ESLint, Prettier, Vitest y Playwright
2. Tailwind, componentes base, tokens de diseño, modo claro y oscuro, navegación inferior y todas las rutas como esqueleto
3. Esquemas zod, Dexie con versiones, repositorios, bitácora de eventos y derivación de estado
4. Página instalable de forma opcional como PWA, con modo sin conexión básico
5. Proxy de IA con Hono, ruta de salud, modo simulado y lectura de server/.env.local, más un server/.env.example sin valores
6. Selector de rol sin login
7. Script dev que levanta app y proxy juntos

Criterios de aceptación
- npm run check pasa
- La página abre en el navegador y navega entre todas las rutas sin instalar nada, y además se puede instalar como PWA en localhost
- Una prueba de humo de punta a punta pasa
- La prueba de secretos en dist pasa

### 15.4 Fase B. Motores núcleo y alumnos simulados

Tareas
- Motores de 7.1 a 7.11, racha de 9.4, XP de 9.5 y Party local de 9.6, en src/engines, con sus pruebas
- Generador de 11.2 y alumno de la demo de 11.3, en src/demo
- Contenido de demostración de 11.1

Criterios de aceptación
- Cobertura de 90% o más en src/engines
- Metas de recuperación de 14.2 reportadas con números reales
- Ningún motor importa React ni Dexie

### 15.5 Fase C. Pantallas del alumno y gadgets

Tareas
- Pantallas 1 a 15 de 10.1 con el contenido de demostración. En la pantalla 15, exportar y borrar datos y el puntaje oficial quedan como botones para la Fase E
- Tablero con todos los widgets de 9.1, Pomodoro, heatmap, racha, XP, Party local y planificador
- Todos los análisis con su estado calibrando

Criterios de aceptación
- Flujos 1, 2, 4, 5 y 6 de 14.1 pasan en teléfono y escritorio
- Cero violaciones serias de accesibilidad
- Capturas de todas las pantallas

### 15.6 Fase D. Motores de IA y evaluaciones

Tareas
- Sección 8 completa, con modo real y simulado, bitácora de costo y pantalla de costos
- prompts/flashcards_provisional.md, solo si Ricardo no pegó su prompt maestro

Criterios de aceptación
- Metas de 8.7 cumplidas en modo simulado. Con clave, reporta números reales, costo y latencia
- Flujo 3 de 14.1 pasa
- Sin clave, toda la app funciona en modo simulado sin errores

### 15.7 Fase E. Panel médico, importadores, reportes, pagos y consentimientos

Tareas
1. Pantallas 17 a 22 de 10.2, con versiones, set canónico, doble etiquetado, kappa, cola de borradores de IA y reportes
2. Importador .apkg en un Web Worker
   - Formato viejo con collection.anki2 o collection.anki21 y mapa de medios en JSON
   - Formato nuevo con collection.anki21b comprimido con zstd y mapa de medios en protobuf (S). Revisa si los archivos de medios también vienen comprimidos y maneja ambos casos
   - Si algo falla, un mensaje claro que sugiera exportar desde Anki con la opción de compatibilidad con versiones anteriores
   - Notas básicas y cloze, etiquetas, imágenes y audio, HTML saneado, mazo privado y casilla de derechos sobre el contenido
   - Fixtures de prueba generados por código en tests/fixtures, nunca mazos de terceros
3. Importador del banco de Ricardo desde CSV o JSON
4. Reportes de error de contenido, del alumno a la bandeja del médico
5. Pantalla 16 de suscripción y checkout simulados, con banderas de acceso y recibo marcado como simulado
6. Gestión de consentimientos desde el perfil, exportar y borrar datos, y captura voluntaria del puntaje oficial. El aviso y los consentimientos del onboarding ya vienen de la Fase C

Criterios de aceptación
- Flujos 7, 8 y 9 de 14.1 pasan
- El importador rechaza un zip malicioso de prueba

### 15.8 Fase F. Endurecer, documentar y demo

Tareas
1. Suite completa de punta a punta, accesibilidad, rendimiento y seguridad de la sección 14
2. Si Ricardo lo aprobó en la Fase 0, publica una demo en Cloudflare Pages con la IA en modo simulado
3. Entregables de la sección 17

Criterios de aceptación
- Todo pasa y está documentado
- Ricardo puede seguir el guion de DEMO.md sin ayuda

### 15.9 Si te atoras

- Si fallas dos veces en corregir lo mismo, detente. Documenta en PROGRESS.md qué intentaste y qué crees que pasa, y pregunta
- Si una decisión es difícil de revertir, presenta dos alternativas con su costo antes de elegir
- Antes de una compactación o al acercarte a un límite de uso, guarda el avance en PROGRESS.md

## 16. Entrevista de la Fase 0

Usa la herramienta AskUserQuestion, en español, con hasta 4 preguntas por ronda y la opción recomendada primero. No preguntes lo que ya responde este documento. Si Ricardo elige Otro, adapta el plan.

Ronda 1. Producto
1. ¿Qué incluye widget programable? Ajustes y horarios dentro de la página (recomendada), o solo ajustes sin horarios. Los widgets en la pantalla del teléfono quedan descartados porque todo vive como página web
2. ¿Cómo funciona Party? Grupos con tabla semanal y retos (recomendada), solo tabla de puntaje, o duelos en vivo
3. ¿Con qué contenido arrancamos? Demostración escrita por Claude y marcada como no validada (recomendada), una muestra de su banco, o ambas
4. ¿Cómo viene su banco? Si trae clave, explicación, tema y referencias por pregunta, cuántas preguntas son y en qué formato están

Ronda 2. Examen e IA
5. Examen completo por defecto. Configurable con 280 por defecto (recomendada), 280 fijo o 450 fijo. Pregunta también si el ENARM usa casos seriados y cuántas opciones tiene cada pregunta
6. Ramas y pesos. Las 4 ramas grandes con pesos iguales provisionales (recomendada), o sus ramas y pesos
7. Prompt maestro de flashcards. Ya está en prompts/flashcards_maestro.md, lo pega ahora, o se usa uno provisional por ahora
8. IA del prototipo. Real con una API key de Console con saldo propio (recomendada si la tiene), o solo simulada por ahora. Recuérdale que la clave va en server/.env.local con el nombre ENARM_ANTHROPIC_KEY y nunca como ANTHROPIC_API_KEY

Ronda 3. Presentación y operación
9. Marca. Nombre provisional y paleta sobria (recomendada), su nombre y colores, o un Design System que ya tenga en Claude Design
10. Pruebas en teléfono. Demo publicada con IA simulada al final (recomendada), modo LAN con HTTPS local, o solo en la PC
11. Trato al alumno. Tú (recomendada) o usted
12. Repositorio. Repo privado en GitHub para respaldo y para /security-review (recomendada), o solo local

## 17. Entregables finales y relación con el plan maestro

- README.md con cómo instalar, correr, cambiar entre IA real y simulada, generar datos de demostración y probar en el teléfono
- DEMO.md con un guion de 10 minutos que recorre cada motor y cada gadget
- Tabla de real contra simulado, función por función, con lo que falta para producción
- DECISIONES.md, IDEAS.md y PROGRESS.md finales
- Capturas en docs/screenshots
- Informe de pruebas con conteos, cobertura, recuperación de parámetros y evaluaciones de IA con su costo
- Mapa de lo que falta contra las rebanadas del plan maestro de Ricardo

| Rebanada del plan maestro | Qué deja listo el prototipo | Qué falta para producción |
|---|---|---|
| R1 Cuenta, consentimientos, exportar y borrar | Consentimientos, exportar y borrar en local | Login real y backend |
| R2 Banco y panel de médicos con versiones | Panel completo en local | Roles reales y Row Level Security |
| R3 Hasta 10 opciones con etiqueta de sesgo | Completo | Etiquetas aprobadas por médicos |
| R4 Repaso con FSRS sin conexión y sincronización | Repaso sin conexión | Sincronización entre dispositivos |
| R5 Confianza, causa y señales de conducta | Completo | Nada en lo funcional |
| R6 Simulador por rama y examen completo | Completo | Contenido validado |
| R7 Simuladores por dificultad y por sesgo | Completo con datos simulados | Respuestas reales para calibrar |
| R8 Análisis por tema, sesgo y estructura | Completo con datos simulados | Datos reales y acuerdo medido |
| R9 Racha, calendario y planificador | Completo | Nada en lo funcional |
| R10 Widgets con heatmap y Pomodoro | Completo | Nada en lo funcional |
| R11 XP y niveles | Completo | Ajuste con alumnos reales |
| R12 Puntaje y Party | Local con amigos simulados | Backend en tiempo real y términos legales |
| R13 Importador .apkg | Completo | Términos para mazos subidos |
| R14 Resaltado de negaciones | Completo | Nada en lo funcional |
| R15 Reporte de errores de contenido | Completo en local | Aviso al médico |
| R16 Pagos | Simulado | Checkout alojado real |
| R17 Puntaje oficial | Completo en local | Backend |
| R18 Motor de IA de olvidos | Completo | Compuerta 1 del plan maestro, que audita con 2 médicos 300 textos generados por la IA |
| R19 Generador de flashcards | Completo | Compuerta 1 del plan maestro |
| R20 Consejos por sesgo | Con textos borrador | Textos escritos por médicos |
| R21 Apps nativas | Descartada, todo vive como página web | Nada |
| R22 Calibración con Rasch y Elo | Completo con datos simulados | Respuestas reales |
