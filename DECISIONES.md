# Decisiones

Registro de decisiones del prototipo. Cada entrada lleva fecha, quién decidió, la decisión y el motivo.
Origen indica si respondió Ricardo en la entrevista de la Fase 0 (R) o si Claude decidió algo menor que la especificación deja abierto (C). Las de origen C se pueden cambiar con una palabra de Ricardo.

## Entorno

### D-001. Node 26
- Fecha 2026-10-01. Origen R
- Se queda Node v26.10.0, con npm 11.19.1 y Git 2.56
- Motivo. Node 26 es versión par y pasa a LTS a finales de octubre de 2026. Hoy es Current. Todas las librerías del stack declaran soporte para Node 22 o mayor, así que no hace falta instalar nada
- Desviación de la especificación. La sección 15.2 pide una versión LTS vigente. Se acepta Node 26 por decisión de Ricardo

### D-002. Mover el proyecto fuera de OneDrive
- Fecha 2026-10-01. Origen R
- El proyecto se mueve fuera de OneDrive y se quita la carpeta anidada (hoy está en enarm-prototipo/enarm-prototipo)
- Destino propuesto. La carpeta Proyectos dentro de tu carpeta de usuario, como Proyectos/enarm-prototipo
- Hecho el 2026-10-01. Claude lo movió con autorización de Ricardo. La carpeta vieja en OneDrive quedó vacía y se puede borrar
- Ricardo abre una sesión nueva de Claude Code en la carpeta nueva antes de la Fase A
- Motivo. OneDrive sincroniza node_modules, que son decenas de miles de archivos, y causa bloqueos y lentitud. El respaldo lo da el repo privado de GitHub (D-018)

### D-003. GitHub CLI
- Fecha 2026-10-01. Origen C
- gh no está instalado. No se instala nada global sin preguntar
- En la Fase A Ricardo elige entre crear el repo vacío en github.com y darme la URL, o autorizar la instalación de GitHub CLI

## Producto

### D-004. Widgets programables con ajustes y horarios
- Fecha 2026-10-01. Origen R
- Cada widget tiene ajustes y algunos aceptan horarios dentro de la página (Pomodoro programado y recordatorio diario). Nada vive en la pantalla del teléfono
- Coincide con la recomendación de la sección 16

### D-005. Party completo y local
- Fecha 2026-10-01. Origen R
- Grupos por código de invitación, tabla semanal, retos colectivos y duelos asíncronos con el mismo simulador de 20 preguntas
- En el prototipo todo es local con amigos simulados, detrás de una interfaz PartyService que en producción se implementa con Supabase Realtime

### D-006. Contenido inicial de demostración escrito por Claude
- Fecha 2026-10-01. Origen R
- 60 preguntas (15 por rama) y 200 tarjetas en 4 mazos, todo marcado como Demostración, no validado por médicos
- Referencias GPC solo por título general y marcadas como por verificar

### D-007. Todavía no existe un banco de opción múltiple
- Fecha 2026-10-01. Origen R
- La carpeta Mazos que señaló Ricardo solo tiene mazos de Anki de tarjetas. No hay banco con caso clínico, opciones y clave
- Consecuencia. El simulador arranca solo con las 60 preguntas demo. En la Fase E se entrega el importador de banco con una plantilla CSV y JSON documentada, lista para cuando exista el banco
- La afirmación de la sección 1 de que hay bancos de preguntas propios se lee como plan a futuro

### D-008. Mazos de Fer y Paco
- Fecha 2026-10-01. Origen R para Fer y especificación para Paco
- Ningún mazo de terceros entra al repositorio, ni completo ni en fragmentos, ni como fixture
- El mazo de Fer (12,050 notas, 313 MB, 1,163 archivos) se usa solo como prueba manual local del importador a escala, leyéndolo desde la carpeta de Ricardo
- Las pruebas automáticas usan mazos generados por código en tests/fixtures

### D-009. Lo que se encontró en los mazos reales y cómo afecta al importador
- Fecha 2026-10-01. Origen C
- Los 6 mazos usan la exportación compatible con Anki viejo. Traen collection.anki21, un collection.anki2 de relleno, un archivo meta con versión 2 y el mapa de medios en JSON. Ninguno trae el formato nuevo con zstd
- El formato nuevo (collection.anki21b con zstd y medios en protobuf) se sigue implementando porque lo pide la especificación, y se prueba con fixtures generados
- Tipos de nota encontrados en el mazo de Fer. Básico y Basic (98% de las notas), Respuesta anidada (148), Básico+ (116), Básico con tarjeta invertida opcional (13), Cloze (12) e Image Occlusion Enhanced (1)
- Regla del importador. Tipos con nombre o estructura de cloze se importan como cloze. Cualquier otro tipo se importa como básica, con el primer campo al frente y los demás campos al reverso. Image Occlusion se importa como básica con aviso de que la oclusión no se reproduce
- Los nombres de campo vienen en español y en inglés (Anverso y Front). El importador usa el orden de los campos, no su nombre
- La jerarquía de submazos (por ejemplo ENARM 2026, Cirugía, Oftalmo) se conserva como etiquetas para que el alumno pueda filtrar

### D-010. El importador no trae el historial de repasos de Anki
- Fecha 2026-10-01. Origen C
- El mazo de Fer trae 150,818 repasos de la persona que lo estudió. El importador ignora la tabla revlog y la programación de Anki, y todas las tarjetas importadas empiezan como nuevas
- Motivo. Es historial de otra persona, no aporta al alumno que importa y es un dato personal. Importar el historial propio del alumno queda en IDEAS.md

### D-011. Formato del ENARM
- Fecha 2026-10-01. Origen R
- Cada pregunta muestra 4 opciones, configurable. El examen completo incluye casos seriados

### D-012. Tamaño del examen completo
- Fecha 2026-10-01. Origen R con un ajuste de Claude
- Configurable, con 280 preguntas por defecto
- Ajuste (C). Con 60 preguntas demo no se puede armar un examen de 280 sin repetir. En lugar de repetir preguntas, el examen toma todas las elegibles y avisa cuántas hay. Repetir la misma pregunta en un examen contaminaría Elo, Rasch y los análisis. Esto cambia lo que te dije en la opción de la entrevista, así que lo dejo explícito para que lo apruebes
- Aprobado por Ricardo el 2026-10-01 al aprobar la Fase A. El examen nunca repite preguntas

### D-013. Ramas y pesos
- Fecha 2026-10-01. Origen R
- Medicina interna, Pediatría, Ginecología y obstetricia, y Cirugía general, con pesos provisionales iguales (25% cada una) y editables desde admin
- Urgencias aparece como rama en los mazos de Fer y Paco. Por ahora sus temas se reparten dentro de las 4 ramas y se puede agregar como quinta rama sin tocar código, porque la taxonomía vive en un archivo de datos

### D-014. Prompt maestro de flashcards provisional
- Fecha 2026-10-01. Origen R
- prompts/flashcards_maestro.md sigue vacío debajo de la marca. En la Fase D se escribe prompts/flashcards_provisional.md marcado PROVISIONAL y la interfaz lo avisa
- Ricardo puede pegar su prompt después sin tocar código

### D-029. Taxonomía de sesgos cognitivos de Ricardo
- Fecha 2026-10-01. Origen R
- Ricardo dio una lista de 24 sesgos cognitivos para etiquetar las opciones del banco. Cada opción puede corresponder a uno o más de ellos
- La lista, con su nombre en español y en inglés como la dio Ricardo
  1. Cierre prematuro (Premature closure)
  2. Sesgo de anclaje (Anchoring bias)
  3. Heurística de disponibilidad (Availability heuristic)
  4. Falacia de la tasa base (Base rate fallacy)
  5. Sesgo de encuadre (Framing effect)
  6. Falacia del costo hundido (Sunk cost fallacy)
  7. Falacia del apostador (Gambler's fallacy)
  8. Ilusión de agrupamiento o apofenia (Clustering illusion)
  9. Aversión a la pérdida (Loss aversion)
  10. Ceguera inatencional (Inattentional blindness)
  11. Efecto de posición serial, primacía y recencia (Serial position effect)
  12. Heurística de representatividad (Representativeness heuristic)
  13. Efecto halo o efecto cuerno enfocado en el paciente (Halo / Horn effect)
  14. Efecto de ambigüedad (Ambiguity effect)
  15. Sesgo de complejidad o atracción por lo atípico (Complexity bias)
  16. Efecto Zeigarnik (Zeigarnik effect)
  17. Sesgo de confirmación intra-pregunta (Confirmation bias)
  18. Sesgo del statu quo o efecto de dotación sobre la primera respuesta (Status quo bias / Endowment effect)
  19. Sesgo de creencias o reactancia a la regla (Belief bias)
  20. Efecto de sobreconfianza o falsa fluidez (Overconfidence effect)
  21. Sesgo de información (Information bias)
  22. Ilusión de enfoque (Focusing illusion)
  23. Sesgo de omisión (Omission bias)
  24. Fatiga de decisión (Decision fatigue)
- Esta lista reemplaza la taxonomía provisional de 13.1 como base. Vive en un archivo de datos (src/demo/content/bias-taxonomy.json) que se escribe en la Fase B
- Cómo queda en el modelo de datos desde la Fase A (C). Cada distractor guarda una etiqueta primaria obligatoria y etiquetas secundarias opcionales, todas como claves de la taxonomía. La primaria es la que se usa para el acuerdo entre médicos (kappa) y para los análisis, porque 13.1 pide una sola etiqueta por distractor para poder medir acuerdo. Las secundarias guardan el resto de los sesgos que aplican
- Pendiente para la Fase B, se pregunta al cerrar la Fase A
  - Algunos de la lista describen la conducta al responder más que el atractivo de un distractor (Zeigarnik, fatiga de decisión, posición serial, statu quo sobre la primera respuesta, sobreconfianza, costo hundido, apostador y agrupamiento). La propuesta es medirlos también con las señales de conducta de 7.6 (cambios de respuesta, tiempo, confianza, posición en el examen)
  - Si se conservan las trampas de formato de 13.1 que no son sesgos cognitivos (Secuencia y Comisión) como etiquetas aparte

### D-030. Contenido demo de hasta 500 preguntas
- Fecha 2026-10-01. Origen R
- Ricardo autoriza tantas preguntas demo como haga falta, hasta 500 para empezar, con opciones etiquetadas con la taxonomía de D-029
- Ajusta D-006 en el número de preguntas. Se mantienen 10 opciones por pregunta, explicación de 80 a 150 palabras, referencias GPC por verificar y la etiqueta Demostración, no validado por médicos
- El número exacto y el reparto por rama se proponen al empezar la Fase B, junto con un orden de redacción que permita revisar por lotes

### D-031. Revisión médica del contenido demo
- Fecha 2026-10-01. Origen R
- Ricardo es médico y tiene dos médicos más que lo ayudan a revisar el contenido demo
- Consecuencia. La mitigación del riesgo de contenido escrito por IA tiene revisores. Con tres médicos también se puede hacer el doble etiquetado de 7.11 con personas reales cuando exista el panel médico de la Fase E

### D-015. IA solo simulada por ahora
- Fecha 2026-10-01. Origen R
- Sin clave. Todos los motores de IA corren con respuestas fijas de src/ai/fixtures y la interfaz dice Modo simulado
- La clave se puede agregar después en server/.env.local con el nombre ENARM_ANTHROPIC_KEY, sin cambiar código
- Consecuencia para la Fase D. Se cumplen las metas de 8.7 en modo simulado. Los números reales de costo y latencia quedan pendientes hasta que exista la clave

## Presentación y operación

### D-016. Marca provisional y paleta sobria
- Fecha 2026-10-01. Origen R
- Nombre provisional Prototipo ENARM, en un solo archivo de configuración (C, cambia con una palabra)
- Paleta sobria con tokens propios en un solo lugar, modo claro y oscuro, pensada para sesiones largas

### D-017. Pruebas en el teléfono con demo publicada
- Fecha 2026-10-01. Origen R
- En la Fase F se publica una demo en Cloudflare Pages con la IA en modo simulado y sin clave en ningún lado
- Requisitos. Una cuenta gratuita de Cloudflare de Ricardo y su aprobación explícita en el momento de publicar
- No se implementa el modo LAN con HTTPS local. El proxy de IA nunca sale de localhost

### D-018. Trato de tú
- Fecha 2026-10-01. Origen R

### D-019. Repo privado en GitHub
- Fecha 2026-10-01. Origen R
- Respaldo remoto y posibilidad de correr /security-review. Ver D-003 para cómo se crea

## Stack

### D-020. Versiones verificadas con npm view
- Fecha 2026-10-01. Origen C
- Se vuelven a verificar al instalar en la Fase A. Si una versión mayor cambió, se registra aquí

| Paquete | Versión | Nota |
|---|---|---|
| vite | 8.3.2 | |
| @vitejs/plugin-react | 6.1.1 | Pide Vite 8 |
| react | 19.3.0 | |
| typescript | 6.0.3 | Ver D-021 |
| tailwindcss y @tailwindcss/vite | 4.3.3 | Tailwind 4, configuración en CSS |
| vite-plugin-pwa | 1.3.0 | Soporta Vite 8 |
| react-router | 8.4.0 | Pide Node 22.22 o mayor |
| zustand | 5.0.15 | |
| dexie y dexie-react-hooks | 4.4.6 y 4.4.0 | |
| zod | 4.6.5 | |
| ts-fsrs | 5.4.2 | |
| recharts | 3.10.1 | |
| @dnd-kit/core | 6.3.1 | Ver D-022 |
| date-fns y @date-fns/tz | 4.4.0 y 1.5.0 | |
| comlink | 4.4.2 | |
| fflate | 0.8.3 | Ver D-023 |
| sql.js | 1.14.2 | |
| fzstd | 0.1.1 | |
| protobufjs | 8.8.0 | |
| dompurify | 3.4.16 | |
| hono y @hono/node-server | 4.13.12 y 2.1.3 | |
| @anthropic-ai/sdk | 0.131.0 | |
| vitest | 5.0.3 | |
| @testing-library/react | 16.3.3 | |
| fast-check | 4.10.2 | |
| @playwright/test | 1.63.0 | |
| @axe-core/playwright | 4.13.0 | |
| eslint y typescript-eslint | 10.11.0 y 8.71.0 | |
| prettier | 3.9.9 | |
| ulid | 3.0.2 | |
| concurrently | 10.0.5 | Para npm run dev |
| shadcn y radix-ui | 4.21.1 y 1.6.7 | shadcn copia componentes al repo, no es dependencia en tiempo de ejecución |

### D-021. TypeScript 6.0.3 y no 7.0.2
- Fecha 2026-10-01. Origen C
- typescript-eslint 8.71 declara compatibilidad con TypeScript menor a 6.1. TypeScript 7 rompería el lint
- Se usa la última 6.0 y se revisa de nuevo al cerrar cada fase

### D-022. dnd-kit estable
- Fecha 2026-10-01. Origen C
- Se usa @dnd-kit/core con @dnd-kit/sortable, que son estables. @dnd-kit/react sigue en 0.5, antes de la versión 1
- La alternativa por teclado del tablero se implementa con los sensores de teclado de dnd-kit más botones de subir y bajar

### D-023. fflate en lugar de JSZip
- Fecha 2026-10-01. Origen C
- fflate es más chico y rápido, descomprime archivo por archivo y permite cortar al pasar un límite de tamaño, lo que ayuda contra bombas zip y con mazos grandes como el de Fer

### D-024. Datos simulados en una base aparte
- Fecha 2026-10-01. Origen C
- Dos bases de IndexedDB. enarm_real guarda lo que hace el alumno real. enarm_demo guarda al alumno de la demo, los 300 alumnos simulados y su SimTruth
- Un interruptor en el perfil cambia entre Mi cuenta y Demostración. En Demostración toda la interfaz lleva la etiqueta Datos simulados
- La línea base de población para sesgos sale de enarm_demo y la interfaz dice que viene de alumnos simulados

### D-025. Rasch por máxima verosimilitud conjunta
- Fecha 2026-10-01. Origen C, se confirma en la Fase B
- Plan inicial. Máxima verosimilitud conjunta (JML) con la corrección de sesgo de Wright, porque no supone una distribución de habilidades, es simple de correr en un Web Worker y converge rápido con 300 alumnos y 60 preguntas
- Si la recuperación de 14.2 no llega a 0.90, se prueba máxima verosimilitud marginal y se documenta

### D-026. Límites del importador .apkg
- Fecha 2026-10-01. Origen C, valores (J)
- Tamaño descomprimido total máximo 600 MB, máximo 5,000 archivos, máximo 50 MB por archivo de medios y solo imágenes y audio comunes
- Motivo. El mazo de Fer mide 342 MB descomprimido y tiene 1,163 archivos, así que entra con margen. Los límites se ajustan en admin

### D-027. Fecha provisional del ENARM en la demo
- Fecha 2026-10-01. Origen C, valor (J)
- El alumno de la demo usa una fecha provisional en septiembre de 2027, editable. No es una fecha oficial y la interfaz lo dice

### D-028. Amigos simulados de Party
- Fecha 2026-10-01. Origen C
- Los amigos simulados viven en enarm_demo, como el resto de los datos simulados (D-024). En Mi cuenta el PartyService local combina el XP real del alumno, leído de enarm_real, con los amigos simulados de enarm_demo
- Cada fila de un amigo simulado y la tabla completa llevan la etiqueta Datos simulados, también en Mi cuenta
- La tarjeta de logro para compartir solo usa datos del propio alumno y nunca muestra amigos simulados como si fueran reales

## Fase A

### D-032. Dependencias que se suman al stack de D-020
- Fecha 2026-10-01. Origen C
- Todas con versión exacta en package.json, verificadas con npm view el 2026-10-01. Las versiones de D-020 no cambiaron
- lucide-react 1.49.0 para íconos de la navegación (es el que usa shadcn/ui)
- class-variance-authority 0.7.1, clsx 2.1.1 y tailwind-merge 3.7.0, que piden los componentes de shadcn/ui
- workbox-window 7.4.1, que pide vite-plugin-pwa para registrar el service worker
- Para pruebas. @testing-library/dom, @testing-library/jest-dom 7.0.1, @testing-library/user-event 14.6.7, jsdom 30.1.1 y fake-indexeddb 6.2.5 (IndexedDB en memoria para probar Dexie en Node)
- Para lint. @eslint/js 10.0.1, eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.7, @eslint-community/eslint-plugin-eslint-comments 4.8.1 (obliga a justificar cada excepción del lint, como pide la regla de any) y globals 17.13.0
- Las de fases posteriores (ts-fsrs, recharts, dnd-kit, comlink, fflate, sql.js, fzstd, protobufjs, dompurify, fast-check y el SDK de Anthropic) se instalan en su fase

### D-033. Navegadores de Playwright dentro del proyecto
- Fecha 2026-10-01. Origen C
- npm run e2e corre Playwright con PLAYWRIGHT_BROWSERS_PATH=0, así Chromium vive en node_modules y no en una carpeta global del usuario
- Motivo. CLAUDE.md pide no instalar nada global. Si se borra node_modules, npm run e2e:install lo vuelve a bajar
- Solo se usa Chromium, en dos proyectos de prueba. Teléfono de 390 por 844 con toque y escritorio de 1280 por 800

### D-034. Tres proyectos de TypeScript
- Fecha 2026-10-01. Origen C
- tsconfig.app.json para src (navegador, sin tipos de Node), tsconfig.node.json para server, scripts y configuración de Vite (Node con su soporte nativo de TypeScript) y tsconfig.tests.json para tests y Playwright
- TypeScript 6 cambió valores por defecto (strict activo, types vacío, rootDir). Cada proyecto declara sus types de forma explícita

### D-035. Rutas visibles en español
- Fecha 2026-10-01. Origen C
- Las direcciones que ve el alumno van en español (por ejemplo /repasar, /simular/examen y /medico/banco) porque son parte de la interfaz. Las claves y los nombres en el código siguen en inglés (por ejemplo la pantalla review vive en /repasar)
- El registro de las 26 pantallas con su ruta, área y fase vive en src/app/screens.ts

### D-036. Preferencias del dispositivo en localStorage
- Fecha 2026-10-01. Origen C
- Tema visual, rol activo y base activa (real o demo) se guardan en localStorage, validados con zod al leer y con valores por defecto si algo falla
- Motivo. Hacen falta antes de abrir IndexedDB, son de este dispositivo y no son datos del alumno. Los datos del alumno viven solo en IndexedDB

### D-037. Paleta y tokens
- Fecha 2026-10-01. Origen C, cambia con una palabra
- Tokens en src/ui/tokens.css. Fondo hueso, superficies blancas y un azul petróleo como color principal. En oscuro, fondo grafito y azul petróleo claro
- Se borran los colores por defecto de Tailwind para que toda la interfaz use la paleta
- Ámbar para Demostración y violeta para Datos simulados, siempre con texto e ícono, nunca solo color
- Tipografía del sistema, sin fuentes web, para cargar rápido y funcionar sin conexión

### D-038. Detalles del modelo de datos
- Fecha 2026-10-01. Origen C
- La bitácora se protege en dos capas. El repositorio solo expone append, query y stream, y un middleware de Dexie (DBCore) rechaza cualquier put, delete o borrado por rango en la tabla events con ImmutableEventError. Borrar mis datos elimina la base completa y no pasa por ese camino (4.5)
- Las preguntas guardan por separado la viñeta y la frase de la pregunta (prompt), porque el resaltado de negaciones solo busca en la frase (7.5)
- Cada versión de pregunta y de opción tiene su propio ID, y un ID estable las une entre versiones. Agregar una versión usa add y nunca reemplaza. Solo el estado editorial cambia sin crear versión
- Las claves de rama, tema, subtema y sesgo son texto validado contra las taxonomías de datos, no enumeraciones en código (13)
- Los esquemas rechazan campos desconocidos (strictObject). Así un dato personal como un correo no se cuela por accidente
- La derivación de ejemplo de la Fase A es xpCache, que suma xp_awarded. Se actualiza en la misma transacción al agregar y se reconstruye desde cero con rebuildDerivedState
- Las pantallas reciben repositorios y casos de uso por contexto (useRepositories y useDataApi). La base de Dexie no sale de src/data

### D-039. PWA con aviso de versión nueva
- Fecha 2026-10-01. Origen C
- vite-plugin-pwa con registerType prompt. Una versión nueva no se aplica sola, la app avisa y el alumno elige cuándo actualizar, para no recargar a mitad de un repaso o de un examen
- Toda la app queda en caché para abrir sin conexión. Las rutas /api del proxy de IA nunca se sirven desde caché
- Íconos provisionales con una E sobre el azul petróleo de la paleta, generados con scripts/generate-icons.ts. Cambian junto con la marca (D-016)
- La instalabilidad se prueba con Chromium (Page.getInstallabilityErrors sin errores). La captura manual del botón de instalar queda para que Ricardo la confirme en su teléfono o en Chrome, porque el navegador sin ventana de las pruebas no muestra ese botón

### D-040. Proxy de IA de la Fase A
- Fecha 2026-10-01. Origen C
- Hono con @hono/node-server, corriendo con el soporte nativo de TypeScript de Node 26, sin herramientas extra
- Escucha solo en 127.0.0.1, puerto 8787. La dirección está fija en server/src/config.ts y no se puede cambiar por argumento
- Lee server/.env.local con util.parseEnv y toma solo ENARM_ANTHROPIC_KEY. La clave no pasa por process.env, no se imprime y /health solo dice el modo
- Rechaza peticiones cuyo encabezado Host no sea localhost (defensa contra DNS rebinding) y peticiones de más de 64 KB
- node server/src/main.ts --mock fuerza el modo simulado aunque exista clave. Las pruebas e2e lo usan así
- La app consulta /api/health y muestra IA real, IA simulada o IA sin conexión en el encabezado y en Perfil. Sin proxy, como en la demo publicada, dice IA simulada
- El SDK de Anthropic se instala en la Fase D, que es cuando se usa. Al crear el cliente se le pasará la clave de forma explícita para que nunca lea otra variable de entorno

### D-041. Ajustes tras la revisión independiente de la Fase A
- Fecha 2026-10-02. Origen C
- Fechas UTC con un solo formato, el de toISOString con milisegundos. La bitácora ordena y filtra comparando texto, así que otro formato del mismo instante quedaría mal ordenado para siempre. Los límites from y to de las consultas se validan igual
- IDs de eventos con ULID monotónico. Dos eventos del mismo milisegundo, como una respuesta y su XP, conservan su orden al reconstruir
- Los esquemas hacen cumplir borrador primero y anclaje. Un artefacto de IA solo sale de borrador con quién y cuándo decidió, y solo se aprueba si pasó el validador. Una tarjeta generada siempre cita su frase y su pregunta de origen
- Los casos clínicos son de solo agregar, como las versiones de pregunta. Editar una viñeta es crear un caso nuevo y versiones nuevas de sus preguntas
- El contexto de datos ya no lleva la base de Dexie, solo repositorios, recordEvent y rebuildDerivedState. La regla de lint que prohíbe Dexie también cubre src/ai
- Los motores tienen lista blanca de importaciones. zod, ts-fsrs, date-fns, @date-fns/tz, otros motores, esquemas y configuración. Una prueba sigue las importaciones de forma transitiva
- El proxy rechaza cualquier Origin que no sea la app (5173 o 4173) y exige JSON en escrituras. Así otra página abierta en el navegador no puede gastar presupuesto cuando exista clave
- Las e2e nunca reusan un proxy ya abierto, porque podría estar en modo real

## Fase B

### D-042. Respuestas de Ricardo al aprobar la Fase A
- Fecha 2026-10-02. Origen R
- Aprueba la Fase A y pide empezar la Fase B
- Sesgos de conducta (ajusta D-029). Los sesgos que describen cómo responde el alumno se usan como etiqueta donde aplique y además se miden con las señales de conducta de 7.6, como tiempo, cambios de respuesta, confianza y posición en el examen. Así se detectan aunque ningún distractor los provoque
- Trampas de formato (ajusta D-029 y 13.1). Se quitan Secuencia y Comisión. La taxonomía son solo los 24 sesgos de Ricardo. Tampoco entra la etiqueta Otro de 13.1, porque Ricardo pidió solo su lista. Si un distractor no encaja en ninguno, se reescribe el distractor
- Repositorio remoto (ajusta D-003 y D-019). Por ahora el proyecto queda solo local. El respaldo fuera de la computadora queda pendiente y se vuelve a ver después. Es un riesgo anotado en PLAN.md
- Contenido demo (ajusta D-030). 300 preguntas, 75 por rama, en 6 lotes de 50 para revisar uno a la vez. Cada lote mezcla las 4 ramas con toda la variedad (negativas, casos seriados y todas las tareas), para que desde el primer lote se pueda probar todo. Con 300 se puede armar un examen completo de 280 sin repetir preguntas (D-012)

### D-043. Funciones estadísticas sin librerías externas
- Fecha 2026-10-02. Origen C
- Wilson, beta (acumulada y cuantiles), beta-binomial con empirical Bayes y kappa de Cohen están escritas en src/engines/stats, sin dependencias. Son pocas fórmulas y así no se suma peso al JavaScript del cliente
- Referencias de las pruebas, sin instalar nada global. Valores publicados por Newcombe (1998) para Wilson, la biblioteca estándar de Python para la normal, identidades exactas con fracciones para la beta de parámetros enteros, la fórmula cerrada del arcoseno para Beta(0.5, 0.5) y un ejemplo de kappa calculado a mano
- Kappa usa el error estándar asintótico de Fleiss, Cohen y Everitt (1969), que vale fuera de la hipótesis nula y sirve para el intervalo. Kappa por etiqueta trata cada etiqueta como sí o no
- El intervalo del beta-binomial es de colas iguales. Las respuestas que faltan para dejar de calibrar se estiman con la aproximación normal del ancho, como pide 7.3 ("aproximadamente")
- Azar con semilla propio (cyrb128 y sfc32) en src/engines/random.ts. Los motores nunca usan Math.random
- La cobertura mínima de 90% en src/engines aplica a líneas, sentencias, funciones y ramas, y npm run check la exige
- Los umbrales de la sección 12 y de los motores viven en src/config/thresholds.ts con su esquema zod, listos para editarse desde admin en la Fase D

### D-044. Detalles de FSRS
- Fecha 2026-10-02. Origen C
- ts-fsrs 5.4.2 con parámetros por defecto, pasos cortos de aprendizaje activos y sin fuzz. Sin fuzz, la misma historia da siempre el mismo vencimiento, que es lo que necesitan las pruebas, la simulación y la recuperación de parámetros
- Modo examen. Ningún vencimiento pasa del inicio del día del ENARM, a las 4 a. m. locales. En los últimos 30 días la retención sube a 0.93, salvo que el alumno ya tenga una mayor
- Si el reloj del dispositivo queda antes del último repaso, se programa desde el último repaso. ts-fsrs no acepta tiempo negativo y así la app no se rompe si el alumno cambia la hora
- La cola del día ordena las vencidas por retrievability de menor a mayor, entierra hermanas de la misma nota y respeta 20 nuevas y 200 repasos por día, descontando lo ya hecho hoy
- La carga futura supone que el alumno califica Bien en cada vencimiento y que introduce nuevas al ritmo de su límite. Es una proyección, no una predicción
- La calificación automática de opción múltiple (7.1) recibe como datos la adivinanza rápida y el percentil 25, que calcula el motor behavior

### D-045. Conducta, Elo y Rasch
- Fecha 2026-10-02. Origen C
- El tiempo se normaliza como logaritmo de milisegundos por palabra contra el ritmo propio del alumno. El ritmo personal se usa desde 20 respuestas. Antes solo cuenta el mínimo plausible de lectura de 6 palabras por segundo (J)
- Fatiga. Se compara el primer y el último tercio de cada sesión de más de 30 minutos con exactitud ajustada por dificultad (acierto menos probabilidad esperada). El patrón probable exige al menos 3 sesiones largas, una caída mayor a 1.64 errores estándar entre sesiones y que el tiempo suba (J)
- Calibración de la confianza contra probabilidades nominales de 0.25 para Adiviné, 0.60 para Dudé y 0.90 para Seguro (J), desde 30 respuestas
- Elo con factor K que baja con las respuestas, K(n) = máx(0.04, 0.4 / √(1 + n/20)) (J). Se ajusta con la recuperación de parámetros si no llega a la meta
- Escala del médico a logit, 1 → −2, 2 → −1, 3 → 0, 4 → 1 y 5 → 2. Bandas fácil, media, difícil y muy difícil cortadas en −1, 0 y 1 (J)
- Rasch con JML como dice D-025, con exclusión iterativa de puntajes extremos, dificultades centradas en 0 y corrección de Wright. Corre en un Web Worker con Comlink. La prueba usa un canal de mensajes en el mismo hilo para probar el protocolo. El worker se usa en la interfaz desde la Fase C o D

### D-046. Temas, sesgos, olvidos y acuerdo
- Fecha 2026-10-02. Origen C
- Temas. Prioridad = (1 − dominio) × peso del tema en el ENARM × (2 − retrievability promedio de sus tarjetas). Sin tarjetas el factor es 1. Solo entran a las prioridades los temas que ya dejaron de calibrar. Acción. Repasar tarjetas si la retrievability es menor a 0.85, simulador del tema si el dominio es menor a 0.6 y, si no, un reto (J)
- Estructura. Mismo modelo que temas, con 20 respuestas mínimas por categoría y la regla del intervalo
- Sesgos por distractor. Solo la etiqueta primaria cuenta (D-029). El mínimo de 40 errores con etiqueta es del alumno en total, no por etiqueta. La línea base viene de alumnos simulados mientras no haya población real, y la salida dice su fuente
- Indicadores de conducta (D-042), pendientes de revisión médica (J)
  - Sobreconfianza. Errores entre las respuestas con Seguro
  - Posición serial. Errores en los que eligió la primera o la última opción
  - Statu quo. Primera elección incorrecta, sin Seguro, que no cambió
  - Costo hundido. Respuestas con tiempo mayor a 2 desviaciones de su ritmo
  - Falacia del apostador. Errores cuando la correcta repite la posición de la anterior, contra su propia tasa de error
  - Ilusión de agrupamiento. Elegir la misma posición que en la pregunta anterior
  - Zeigarnik. Errores justo después de una pregunta que lo atoró, contra su propia tasa de error
  - Fatiga de decisión. La señal de fatiga del motor behavior
  - Cada indicador calibra hasta 30 casos y marca patrón probable solo si el intervalo de Wilson supera la línea base
- Olvidos. Las acciones de 7.9 son más que la lista cerrada de 8.2, porque incluyen repetir pronto, bajar el ritmo y repasar el tema base. La lista de 8.2 sigue siendo la única que puede proponer el LLM
- Olvido esperado con retrievability predicha menor a 0.8 tras 21 días o más (J). No forma patrones ni alarma
- Acuerdo. Mientras no exista kappa (sin doble etiquetado), la interfaz dice trampas y no sesgos, que es la lectura honesta de 4.4. Se pregunta a Ricardo al cerrar la fase

### D-047. Sesión, planificador, racha, XP y Party
- Fecha 2026-10-02. Origen C
- Sesión. Proporciones por defecto de 60% vencidas, 20% nuevas, 15% errores y 5% retos, y segundos estimados de 15, 40, 75 y 90 por tipo (J). El intercalado busca un orden válido con retroceso y, si no existe, rompe la regla lo menos posible
- Planificador. Usa los minutos reales de Pomodoro si hay al menos 3 días, si no los declarados. Avisa de sobrecarga cuando el promedio de los próximos 7 días no cabe y da el efecto de bajar nuevas (diferencia entre proyecciones del motor fsrs) y de subir minutos (J)
- Racha. Un congelador cuando la racha llega a un múltiplo de 7, máximo 2, y se usa solo para cubrir un día perdido si la racha es mayor a 0. Un día sin registro cuenta como perdido. Si hoy no se ha cumplido, la racha sigue viva desde ayer
- XP. Acierto 10 + 5 por nivel de dificultad del médico, error 2, tarjeta 3, meta diaria 50, reto 100, multiplicador por racha de 1 + 0.025 por día con tope de 1.5, y tope de 1,500 XP diarios por volumen (J). El bono por racha queda como premio aparte con su motivo
- Niveles. XP acumulado para el nivel n = 1700 · (n − 1)^1.7. Con un alumno constante simulado (100 tarjetas, 30 preguntas con 65% de aciertos y meta diaria) sube 2 niveles la primera semana y unos 0.5 por semana a los 3 meses, como pide 9.5. Títulos Pasante (1), R1 (4), R2 (7), R3 (10), R4 (13), Jefe de residentes (16), Adscrito (20) y Profesor titular (25) (J)
- Party. Códigos de 6 caracteres sin 0, O, 1, I ni L. Empates en la tabla comparten lugar. El duelo lo gana la exactitud y desempata el tiempo

### D-048. Repositorio remoto privado
- Fecha 2026-10-02. Origen R
- Ricardo pidió subir el proyecto a GitHub. Se creó el repo privado rickymm2001-dev/enarm-prototipo desde la web, vacío y sin README, y se subió main con todo el historial
- Sin GitHub CLI. El push usa el administrador de credenciales de Git
- Antes de subir se revisó que no hubiera secretos en ningún commit. server/.env.local no está en el historial
- A partir de aquí cada bloque termina con commit y push

### D-049. Trabajo desde GitHub
- Fecha 2026-10-02. Origen R
- Ricardo pidió poder seguir editando todo desde su repositorio de GitHub. Todo lo que hacía falta para continuar y que vivía fuera del repositorio ahora está dentro
- Las herramientas de validación de borradores, que estaban en una carpeta temporal, pasan a scripts/content y usan el motor real de estructura. La importación del motor es dinámica para no mezclar los proyectos de TypeScript de la app y de Node
- El workflow de revisión adversarial de IA vive en .claude/workflows/enarm-demo-review.js. Si un verificador falla, el hallazgo queda con verdict null y no se pierde. ESLint y Prettier ignoran .claude porque el workflow usa globales de su propio runtime
- GitHub Actions corre npm run check en cada push a main y en cada pull request, con Node 24, actions/checkout v7 y actions/setup-node v7. No usa secretos. El build se revisa contra secretos dentro de las pruebas
- Los borradores de contenido se guardan en content-drafts para poder retomar un lote a medias en otra sesión. Los paquetes de revisión van en .review, que no se sube
- Las revisiones de IA se guardan en docs/revisiones. Son ayuda para el autor y no sustituyen la revisión médica de D-031
- Se quitó .claude.zip. Solo traía .claude/launch.json, que ya está en el repositorio, y un archivo de bloqueo local

### D-050. Banco al final y trabajo verificable en GitHub
- Fecha 2026-10-02. Decisión de Ricardo
- El banco de preguntas (lotes 5 y 6) y los 4 mazos se pausan y se terminan al final del proyecto. El desarrollo de la aplicación sigue con los bloques 9 y 10 de la Fase B y las fases siguientes
- Todo el trabajo vive en el repositorio de GitHub. Cada bloque termina con commit y push, y el CI corre npm run check en cada push a cualquier rama, no solo en main
- Mientras no existan los mazos, la simulación de FSRS de los alumnos simulados usa tarjetas sintéticas por tema, marcadas como tales. Se cambian por las tarjetas reales cuando se escriban los mazos

