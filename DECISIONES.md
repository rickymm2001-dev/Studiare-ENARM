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

### D-051. Ajuste al análisis por sesgo tras la recuperación de 14.2
- Fecha 2026-10-02. Propuesta de Claude, aprobada por Ricardo el mismo día
- Con 300 alumnos simulados en 3 semillas, el método de 7.4 detecta 100% de los sesgos sembrados, pero marca entre 47% y 54% de los alumnos sin propensión. La meta es 10% o menos
- Causas. La atracción se mide contra todas las preguntas con la etiqueta a la vista, así que quien falla mucho parece atraído por todas. Y se prueban unas 20 etiquetas por alumno con 95% cada una
- Propuesta. Medir qué parte de los errores con la etiqueta a la vista fue a esa etiqueta, con la línea base calculada igual, y corregir el nivel por Bonferroni según las etiquetas evaluadas. Con eso detecta 100% y marca entre 3% y 6%
- Límite señalado por la revisión independiente. La variante se diseñó viendo las mismas semillas, y el modelo principal del generador simula el sesgo de una forma que favorece a la variante. Por eso se validó además con 3 semillas nuevas (marca 3 a 6%) y con un modelo de sesgo distinto, que solo atrae cuando el alumno sabía la respuesta (detecta 88 a 98% y marca 3 a 5%)
- Estado. Es el método por defecto de src/engines/bias.ts (method error_share con familywise). El método original de 7.4 queda como opción (method exposure). Detalle en docs/recovery-report.md

### D-052. Siembra de la demo en el navegador
- Fecha 2026-10-02. Decisión de Claude
- La base demo vive en IndexedDB dentro del navegador. Por eso la siembra real se hace en la app, en Perfil con Demostración activa, con los botones Generar datos de demostración y Regenerar desde cero. En la Fase D también vivirán en la pantalla de admin 24
- La generación corre en un Web Worker (src/workers/simulate.worker.ts) que se carga bajo demanda, así no traba la interfaz ni entra al JavaScript inicial
- Se guardan el contenido demo con IDs estables, 301 perfiles (alumno de la demo y 300 simulados), el SimTruth de todos y la bitácora completa del alumno de la demo. Las bitácoras de los 300 simulados no se guardan porque serían cerca de 900 mil eventos. La línea base de la población y las estadísticas de las preguntas se resuelven en la Fase C con la misma generación determinista
- Las fechas dependen del último día de la siembra. Por eso el SimTruth del alumno de la demo guarda las opciones de la siembra, incluido ese día, y con ellas la generación reproduce exactamente lo sembrado
- Nada de la bitácora simulada queda en el futuro. La app pasa el momento actual y se descartan las sesiones que terminarían después
- Desviación de 11.2 aprobada por Ricardo por ahora. En la siembra, los 300 alumnos simulados no traen su historial de tarjetas, porque pesaría demasiado en el navegador. La estructura queda lista. La opción cohortCardHistory de la siembra simula y guarda sus repasos con las mismas tarjetas, y tiene prueba
- Regenerar desde cero borra la base demo completa. Es la segunda excepción a la bitácora de solo agregar y quedó escrita en PLAN.md 2.2
- npm run demo-seed genera la siembra por defecto completa fuera del navegador, valida cada registro y reporta conteos. npm run demo-reset explica cómo regenerar desde la app, porque un script de Node no puede borrar una base del navegador
- Mientras no existan los mazos se usa una baraja de 200 tarjetas sintéticas sin contenido médico, marcada como datos simulados (D-050)
- Las pruebas de punta a punta aceptan PW_CHROMIUM_PATH para usar un Chromium ya instalado en entornos en la nube. En la computadora de Ricardo no se define

### D-053. Mazos de Paco completos en la demo
- Fecha 2026-10-02. Decisión de Ricardo, con autorización de Paco
- Reemplaza a D-008 para los mazos de Paco. El mazo de Fer sigue fuera del repositorio
- Los mazos de Medicina interna (2,122 notas), Ginecología y obstetricia (1,526) y Urgencias (123) entran completos al repositorio privado, con las 302 imágenes que usan sus notas, como mazos precargados de la demo con etiqueta Demostración y crédito visible a Paco. Solo se quitó una imagen externa
- La clave de cada nota sale del guid de Anki, así no cambia si Paco agrega o borra otras notas y se vuelve a convertir. Las imágenes se guardan con ruta absoluta (/demo-media/...)
- Todos los modelos de los 3 mazos tienen una sola plantilla, así que no hay tarjetas inversas. El script se detiene si llega un modelo con varias plantillas
- Ni las imágenes ni el worker de simulación, que trae los mazos, entran a la precarga del service worker. Se guardan al usarse
- fflate se queda en dependencies porque el importador de .apkg de la Fase E lo usará en la app (D-023)
- Sustituyen a las tarjetas sintéticas en la simulación de repasos del alumno de la demo (D-050)

### D-054. Fatiga por tendencia dentro de la sesión
- Fecha 2026-10-02. Prueba pedida por Ricardo. Propuesta de Claude, pendiente de aprobación
- Se agregó fatigueTrendSignal a src/engines/behavior.ts. Ajusta una recta de la exactitud ajustada por dificultad contra el minuto de la sesión, con cada sesión centrada en su media, y pide además que el tiempo por palabra suba. El método de tercios de 7.6 sigue siendo el que usa la app
- Con todos los alumnos con fatiga sembrada, ninguno de los dos llega a 80% (tercios 52 a 73%, tendencia 63 a 75%). La causa es que cerca de un tercio de esos alumnos casi no siente la fatiga, con un efecto medio cercano a un punto de acierto, que no es detectable con ningún método
- Entre los alumnos cuya fatiga sí pesa (efecto medio de 0.15 logits o más por respuesta), los dos cumplen. Tercios 83 a 97% y tendencia 94 a 97%, con 2 a 3% de falsos positivos para la tendencia
- Propuesta. Adoptar la tendencia como método por defecto, porque es más estable y marca menos, y medir la meta de 14.2 sobre los alumnos cuya fatiga pesa en sus respuestas

### D-055. Demo publicada en GitHub Pages
- Fecha 2026-10-02. Origen R
- Numeración. Se escribió en otra sesión al mismo tiempo que D-050 a D-054 y se renumeró al juntar las ramas
- Ricardo pidió ver la página en vivo y que se actualice sola con cada cambio. Eligió GitHub Pages en lugar de Cloudflare Pages (ajusta D-017 y la Fase F del PLAN) y dejar el repositorio público. El repo ahora se llama rickymm2001-dev/Studiare-ENARM
- Esta petición cuenta como su aprobación explícita para publicar la demo (D-017). La demo corre con la IA en modo simulado porque en Pages no hay proxy. /api/health responde 404 y la app muestra IA simulada
- El workflow .github/workflows/pages.yml construye y publica en cada push a main, con actions/configure-pages v6, upload-pages-artifact v5 y deploy-pages v5. No usa secretos y el build sigue revisándose contra secretos
- La ruta base sale de la variable BASE_PATH, que el workflow toma de configure-pages. Sin dominio propio es /Studiare-ENARM/ y con dominio propio queda en / sin tocar código. El manifest, el service worker y el router usan esa misma base
- GitHub Pages no sabe de rutas de una app de una sola página. Se copia index.html a 404.html para que un enlace directo como /perfil abra la app. Esa primera carga responde con código 404, sin efecto para quien la usa
- Ricardo todavía no tiene dominio propio. Cuando lo compre se agrega en Settings, Pages, Custom domain, y el siguiente push ya usa la base /
- Probado en Chromium sirviendo el build bajo /Studiare-ENARM/. Abre el inicio y /perfil directo, la navegación conserva la base, el service worker queda con alcance /Studiare-ENARM/, Chromium la marca instalable y la etiqueta dice IA simulada

### D-056. Logo de Studiare en el encabezado
- Fecha 2026-10-02. Origen R
- Numeración. Se escribió en otra sesión al mismo tiempo que D-050 a D-054 y se renumeró al juntar las ramas
- Ricardo compartió el logo de Studiare y pidió ponerlo en la página. Va en el encabezado en lugar del texto del nombre, como enlace al inicio
- Se usa sin el lema "Impulsamos tu aprendizaje", porque a la altura del encabezado (32 px) sería ilegible
- Dos versiones en src/assets/brand. La original para modo claro y otra con las letras en blanco para modo oscuro, porque el azul marino no se lee sobre fondo oscuro
- El nombre de la app (BRAND.name en src/config/brand.ts), el título de la pestaña, el manifest y los íconos de la PWA siguen provisionales (D-016) hasta que Ricardo confirme el cambio

### D-057. Marco más ancho en computadora
- Fecha 2026-10-02. Origen R
- Numeración. Se escribió en otra sesión al mismo tiempo que D-050 a D-054 y se renumeró al juntar las ramas
- A Ricardo no le gustaron las franjas vacías a los lados en computadora. Eligió un marco más ancho con tarjetas en dos columnas
- El encabezado y el contenido usan el nuevo ancho max-w-app de 88rem (unos 1,400 px) en lugar de 44rem. En el teléfono no cambia nada
- Perfil acomoda sus 4 tarjetas en 2 columnas desde lg. El índice de pantallas del inicio pasa a 3 columnas
- Los textos largos siguen en el ancho de lectura de 44rem para no cansar la vista, como la descripción de cada pantalla. Las pantallas de pregunta y retroalimentación de la Fase C deben usar ese ancho para el texto

### D-058. Ícono de la pestaña con el símbolo de Studiare
- Fecha 2026-10-02. Origen R
- Numeración. Se escribió en otra sesión al mismo tiempo que D-050 a D-054 y se renumeró al juntar las ramas
- Ricardo pidió que la pestaña del navegador muestre el símbolo de play de Studiare
- public/favicon-32x32.png y public/favicon-64x64.png salen del logo que compartió, solo el símbolo, centrado y sin fondo. Se probó sobre pestaña clara y oscura y se distingue en ambas
- Se quitó public/favicon.svg con la E provisional. scripts/generate-icons.ts ya no lo genera
- Los íconos de la PWA instalada (pwa-*, maskable y apple-touch-icon) y el nombre de la app siguen provisionales (D-016) hasta que Ricardo confirme el cambio

### D-059. Bienvenida más simple, un solo aviso de privacidad y roles sin autoservicio
- Fecha 2026-10-02. Origen R
- La bienvenida es una página aparte, sin la barra de navegación ni el riel lateral
- Se quitan de la bienvenida y de Perfil la fecha del ENARM, los minutos al día y las ramas que estudia. La fecha del ENARM es la misma para todos, así que vive en la plataforma (src/config/exam.ts) como fecha provisional que después cambia el administrador. Los minutos al día se van a inferir de la conducta real del alumno
- Se quitan los consentimientos por finalidad. Un solo aviso de privacidad cubre todas las finalidades y aceptarlo guarda la aceptación de cada una con la versión del aviso. Esto ajusta 4.5 de la especificación
- El alumno ya no puede cambiar su rol. Toda cuenta nace como alumno y solo un administrador la sube a médico o administrador. En el prototipo la pantalla 26 queda solo para pruebas, sin enlaces. Los roles reales necesitan cuentas con servidor, ver docs/ANALISIS_PLATAFORMA.md
- La interfaz no menciona Anki. Se habla de subir tu mazo

### D-060. Rumbo a plataforma real, respuestas de la entrevista
- Fecha 2026-10-02. Origen R, tras el análisis de docs/ANALISIS_PLATAFORMA.md
- Servidor. Supabase para cuentas, base de datos Postgres, archivos y permisos por fila. Dexie se queda como copia local para estudiar sin conexión. Ajusta 3.2 de la especificación, que pedía inicio de sesión y pagos simulados
- Pagos. Stripe y Mercado Pago, los dos. Los datos de tarjeta nunca pasan por nuestra base
- Cuentas. Ricardo crea los proyectos de Supabase, Stripe y Mercado Pago con una guía paso a paso. Mientras tanto todo se construye y se prueba en modo prueba
- Diseño. Look premium con animaciones al ganar. El alumno personaliza fuente y tamaño, fondo, y enciende o apaga animaciones y sonidos por separado
- Orden. Diseño, cuentas con pagos y estadísticas de técnica avanzan juntos, sin prisa
- Perfil. Correo y alias obligatorios. Opcionales año de nacimiento, sexo con prefiero no decir, estado, situación actual, número de intento y especialidad objetivo
- Foto de perfil subida o avatar generado
- Juego en la primera versión. Ligas semanales con misiones del día, insignias y niveles con títulos médicos, duelos y tarjetas para compartir en redes
- Portada de venta antes del registro, con lo que ofrece, precios y botón de registro
- Inicio abre en el plan del día. Botón grande para empezar, misiones y racha arriba
- Precios de ejemplo por ahora. Gratis con 20 preguntas al día, mensual 249 pesos y anual 1,990 pesos
- Mazos de Paco. Ricardo confirma que Paco autoriza que estén públicos
- Roles. Alumno sin poderes, médico revisa solo lo asignado, administrador todo, dueño fijo que nadie puede quitar

### D-061. Sistema de diseño premium y apariencia personalizable
- Fecha 2026-10-02. Origen R, con propuesta de Claude
- Paleta marfil y tinta azul en claro, medianoche en oscuro, azul petróleo de marca, oro para XP y logros, naranja para la racha y un color por rama (Medicina interna coral, Pediatría turquesa, Ginecología y obstetricia magenta, Cirugía esmeralda, Urgencias ámbar)
- Títulos en Bricolage Grotesque. Cuatro fuentes de lectura a elegir (Plus Jakarta Sans, Atkinson Hyperlegible, Lexend y Source Serif 4). Todas se sirven desde la app con Fontsource, sin CDN, para funcionar sin conexión
- El alumno elige fuente, tamaño del texto (4 pasos), fondo (liso, resplandor, colores de rama, puntos) y enciende o apaga animaciones, confeti y sonidos por separado. Se guarda en este dispositivo. prefers-reduced-motion siempre se respeta
- Celebraciones con canvas-confetti (licencia ISC), cargado solo al usarse, y un acorde corto con Web Audio. Suenan al terminar un repaso o una práctica, al reclamar un reto y al terminar un enfoque del Pomodoro

### D-062. Encabezado de juego y Pomodoro en Repasar
- Fecha 2026-10-02. Origen R
- Arriba a la derecha siempre se ven la racha, el nivel con su barra de XP y nombre, y la foto de perfil que lleva a Perfil. La etiqueta IA simulada sale del encabezado y queda en Perfil y junto al contenido de IA
- El Pomodoro sale de Inicio y vive solo en Repasar, como píldora a la altura del título. Arranca solo al empezar a repasar si estaba detenido, y se puede pausar, saltar o minimizar a un ícono que no muestra el tiempo. El minimizado se recuerda en el dispositivo
- Al terminar una fase suena y aparece un aviso con el botón para empezar la siguiente. La siguiente fase no arranca sola para que el alumno decida

### D-063. Pomodoro opcional, tiempo de estudio activo y tabla de niveles
- Fecha 2026-10-02. Origen R
- El Pomodoro es opcional. Empieza como ícono en Repasar y no arranca solo. Sus ajustes se abren ahí mismo con el engrane de la píldora, además de en Configuración. Ajusta D-062
- El tiempo de estudio se cuenta aunque no se use el Pomodoro. Suma el tiempo entre interacciones mientras el hueco no pase de 2.5 minutos. Si pasa, sale "Estudio pausado" con Reanudar o Finalizar sesión, y el rato en pausa no cuenta. session_ended guarda ese tiempo activo
- Los minutos de estudio del día son el mayor entre el tiempo activo de las sesiones y los enfoques del Pomodoro, para no contar dos veces el mismo rato. La meta y el heatmap dicen minutos de estudio
- Al tocar el nivel del encabezado o del Perfil se abre la tabla de niveles y títulos, con el título actual marcado, el siguiente y cuánto XP falta

### D-064. Intervalo máximo del repaso con compresión suave
- Fecha 2026-10-02. Origen R. Le pareció que 47 días en Difícil y 100 en Fácil lo dejaban sin volver a ver las tarjetas antes del examen
- Nuevo ajuste maxIntervalDays, 30 días por defecto, configurable en Configuración (7, 14, 21, 30, 45, 60, 90, 180 o sin tope)
- Compresión suave d' = tope × (1 − e^(−d / tope)). Los intervalos cortos casi no cambian, ninguno pasa del tope y Difícil, Bien y Fácil siguen distintos. Con tope de 30, 47 días pasan a unos 23 y 100 a unos 29. Solo cambia la fecha de vencimiento, la estabilidad de FSRS queda igual
- Más repasos por día es el costo. Con 3,700 tarjetas maduras y tope de 30 son unos 120 repasos diarios como mínimo

### D-065. Configuración aparte, fondo personalizado y sin cuenta regresiva
- Fecha 2026-10-02. Origen R
- Perfil muestra quién eres (foto, nivel, racha, cuenta y plan). Configuración es la pantalla 27 en /configuracion, con apariencia, metas y repaso, estudio, Pomodoro, base activa, IA, exportar y borrar
- Apariencia muestra los cambios al instante como vista previa y solo se quedan con Guardar. Descartar o salir sin guardar regresa lo guardado
- Fondo personalizado con un color o una foto propia. La foto se reduce a 1,600 px y se comprime en el navegador, se guarda solo en este dispositivo y lleva un velo del color del tema para que el texto se lea
- Se corrigió que el fondo elegido no se veía. El marco de la app pintaba su propio color encima
- La muestra de fuentes dice "Así se verá tu texto"
- Se quita por completo el widget de cuenta regresiva al ENARM. La fecha del ENARM se sigue usando por dentro para el modo examen de FSRS
- El heatmap se divide por meses con el nombre del mes en chiquito arriba

### D-066. Seis ramas troncales, subespecialidades, títulos médicos y Progreso por rama
- Fecha 2026-10-02. Origen R
- La taxonomía pasa a 6 ramas troncales con pesos iguales. Medicina interna, Pediatría, Ginecología y obstetricia, Cirugía general, Medicina familiar y Urgencias. Medicina familiar y Urgencias todavía no tienen preguntas y se muestran como "Sin preguntas todavía"
- Ricardo pidió la lista oficial del ENARM para las subespecialidades. La CIFRHS no publica un temario detallado. El examen se basa en las GPC, las NOM y los protocolos nacionales. Por eso la lista de subespecialidades es propia, se conservan los 40 temas que ya usa el banco y se agregan los que faltaban (por ejemplo Oncología, Dermatología, Oftalmología, Otorrinolaringología, Ortopedia y los de Medicina familiar y Urgencias). Queda pendiente de revisión médica como el resto de la taxonomía
- La simulación de alumnos solo usa las ramas y temas con preguntas en el banco (src/demo/generator/bankTaxonomy.ts). Así los datos simulados y la prueba de recuperación no cambian
- Configurar práctica, Mazos y Progreso dividen entre troncales y subespecialidades, en tantas columnas como quepan
- Progreso tiene una primera versión. Resumen, dominio por troncal y por subespecialidad con el modelo beta-binomial, con estado calibrando hasta tener respuestas suficientes
- Títulos de nivel para médicos ya egresados. R0, R1, R2, R3, R4, Jefe de residentes, Especialista, Subespecialista, Adscrito, Jefe de servicio, Adscritosaurio, Jubilado y Eminencia. Se agregaron Jefe de residentes y Jefe de servicio a la idea de Ricardo
- El encabezado dice "Nivel 1", la barra es más ancha y abajo dice en chiquito la XP que falta para el siguiente nivel
- El heatmap muestra por defecto desde el mes en que empezó el alumno y crece mes con mes. Se puede cambiar a 90, 180 o 365 días

### D-067. Separación entre botones del repaso
- Fecha 2026-10-02. Origen R. Con tope de 14 días los botones quedaban demasiado pegados
- El tope por defecto sube a 21 días y se aplica a Bien con compresión suave. Difícil y Fácil se escalan en la misma proporción que Bien, así conservan la separación que da FSRS. Ajusta D-064
- Cada botón (Difícil, Bien y Fácil) tiene su multiplicador de 50% a 200%. 100% es lo recomendado y es lo que calcula FSRS. La retención de 90% también queda marcada como la recomendada por los creadores de FSRS
- Un botón en Configuración regresa todo a lo recomendado
- Los perfiles creados antes guardaron el tope anterior. Se actualizan con ese botón

### D-068. Portada de venta, cuenta con correo, datos del perfil y avatares
- Fecha 2026-10-02. Origen R (D-060), implementación de Claude
- Sin sesión, la raíz muestra la portada de venta. Qué es Studiare, qué lo hace distinto, para quién es, planes con precios de ejemplo, preguntas frecuentes y botón de registro. Va sin navegación
- La bienvenida tiene dos pestañas. Crear cuenta (alias, correo, meta diaria, datos opcionales y aviso de privacidad) y Ya tengo cuenta (entrar con el correo). Los perfiles creados antes de las cuentas se pueden abrir desde ahí y agregar su correo en Perfil
- Los datos de cuenta viven en una tabla nueva, accounts, aparte del perfil seudónimo. Así el correo y los datos personales nunca viajan a la IA ni a Party. La base local sube a la versión 2 y Dexie agrega la tabla sin tocar lo demás. Exportar mis datos ya incluye la cuenta
- Datos opcionales. Año de nacimiento, sexo, estado, situación actual, intento en el ENARM y especialidad objetivo. Cada uno con prefiero no decir
- La lista de especialidades de entrada directa sale de fuentes públicas del 50º ENARM. Está por verificar contra la convocatoria oficial, que no se pudo abrir desde el entorno de desarrollo
- Foto de perfil con iniciales, uno de 12 avatares médicos generados por la app (bata, estetoscopio, gorro, lentes, espejo frontal), sin librerías ni imágenes de terceros, o una foto propia reducida a 256 px
- Sigue sin contraseña porque no hay servidor. Con Supabase el correo se verifica y se agrega contraseña o acceso con Google

### D-069. Esquema de Supabase con permisos por fila y roles
- Fecha 2026-10-02. Implementación de Claude según D-060
- supabase/migrations/20261002000001_platform.sql crea roles, perfiles, cuentas privadas, aceptación del aviso, configuración de la plataforma, suscripciones, pagos, avisos de pago, contenido con asignaciones y decisiones de revisión, reportes, mazos, bitácora de solo agregar, grupos, retos y borradores de IA
- Permisos por fila en todas las tablas. Los roles solo cambian con la función set_user_role, que exige admin o dueño, impide cambiar el propio rol, no deja asignar ni quitar el rol de dueño y solo deja al dueño nombrar o quitar admins. Cada cambio queda en role_audit
- El dueño se fija una sola vez desde el SQL Editor de Supabase. Un índice único impide que haya dos
- npm run test:sql levanta un Postgres local temporal con un esqueleto de Supabase Auth y corre 12 pruebas de permisos. Se comprobó que detectan un permiso roto a propósito. El CI las corre en cada push
- La llave anon de Supabase es pública por diseño y la protegen los permisos por fila. La llave service_role nunca va al navegador ni al repositorio
- docs/SUPABASE.md es la guía para que Ricardo cree el proyecto, cargue el esquema, se haga dueño y pase las llaves públicas
- La app todavía no habla con Supabase. Se conecta cuando Ricardo pase las llaves (bloque 9, sincronización)

### D-070. Usuarios, roles por nivel y asignación de preguntas a médicos
- Fecha 2026-10-02. Origen R (roles por nivel), implementación de Claude
- Se agrega el rol de dueño al modelo local. Alumno, médico, admin y dueño. Admin y dueño comparten pantallas
- src/engines/roles.ts tiene las mismas reglas que set_user_role de Supabase, con pruebas. La interfaz solo ofrece los cambios permitidos
- Nueva pantalla 28, Usuarios en /admin/usuarios. El admin cambia roles y asigna subespecialidades a cada médico. Al asignar una subespecialidad se le asignan todas sus preguntas
- Banco de preguntas, primera versión. El médico ve solo lo asignado. El admin ve todo y a quién está asignada cada pregunta. El editor con decisiones llega en la Fase E
- La base local sube a la versión 3 con la tabla reviewAssignments
- En el prototipo quien llama usa el rol del selector de pruebas de la pantalla 26 (sin enlaces). Con Supabase el rol sale de la cuenta y lo aplica el servidor

### D-071. Marco compacto a todo lo ancho y botones de guardar
- Fecha 2026-10-02. Origen R
- La racha, el nivel con su barra y la foto van a la derecha del título de cada pantalla, a la misma altura. En computadora ya no hay barra superior. El símbolo de Studiare va arriba del riel lateral. En el teléfono queda una barra delgada con el logo
- El contenido usa todo el ancho de la pantalla. Se quitan el marco de 88rem y el ancho de lectura en pregunta, retroalimentación y repaso. Ajusta D-057
- Menos espacio perdido. Títulos un poco más chicos, menos separación entre tarjetas y relleno más compacto
- Configuración tiene su propio botón en el riel lateral, debajo de Perfil. En el teléfono se llega desde Perfil
- Nuevos botones de guardar en Configuración. Opciones de estudio y tema visual ya no se aplican al tocarlos. El tema muestra vista previa y regresa al guardado si sales sin guardar
- En Simular, Seleccionar todo y Quitar todo son botones visibles con el conteo de subespecialidades elegidas

### D-072. Elegir qué repasar
- Fecha 2026-10-02. Origen R
- Antes de repasar el alumno elige el modo (lo que toca hoy, solo vencidas o solo nuevas), sus mazos y las ramas troncales o subespecialidades, con el número de tarjetas de cada una. El botón dice cuántas tarjetas tocan con esa selección
- Las tarjetas cuya nota no trae subespecialidad entran con su mazo si el alumno lo deja marcado
- Durante el repaso, Cambiar mazo o tema regresa a la selección. Cada calificación ya quedó guardada, así que no se pierde avance. Al terminar se puede repasar otros temas
- Agregar mazo lleva a Mazos. Subir mazos propios llega en el bloque P8
- La última selección se recuerda en el dispositivo

### D-073. Protección del contenido al final y análisis docente
- Fecha 2026-10-02. Origen R
- Ricardo pide que nadie pueda descargar el banco ni las tarjetas. Decide dejarlo para el final para seguir viendo la página actualizarse, asumiendo el riesgo porque nadie conoce la página todavía
- Cuando se haga. Repositorio privado y la demo pública con una muestra pequeña (unas 20 preguntas y 30 tarjetas por mazo). El contenido completo se servirá desde Supabase solo con sesión
- docs/ANALISIS_DOCENTE_ENARM.md recoge cómo es el examen, qué se ha preguntado, 13 tipos de trampa con el sesgo que explotan y la señal que la app puede medir, lo que dice la evidencia sobre responder y las implicaciones para el banco, Progreso y la IA. No usa preguntas reales ni filtradas

### D-074. Motor de autoconocimiento en Progreso (Conócete)
- Fecha 2026-10-02. Origen R
- Ricardo pide un espacio de introspección para que el alumno sepa cómo mejorar su estudio y cómo responder mejor. Nuevo motor puro en src/engines/insights.ts que junta conducta, estructura, sesgos y repaso, con las trampas de docs/ANALISIS_DOCENTE_ENARM.md
- Tres áreas. Cómo respondes (ritmo contra 77 segundos por reactivo, responder sin terminar de leer, preguntas en que te atoras, negativas y mala lectura, tipo de pregunta más débil, casos seriados, casos largos, saldo de cambios de respuesta, confianza, fatiga y mejor horario). Qué trampas te atrapan (patrones por tipo de distractor y perfil de las tres que más atraen). Cómo estudias (constancia, retención real contra la deseada, tarjetas que se resisten, duración de sesiones y causas reportadas)
- Cada hallazgo es fortaleza, a vigilar o foco, con una frase con sus números y una acción concreta. Mientras no hay datos suficientes dice cuánto falta (calibrando). Arriba va un resumen de dónde enfocarte y lo que ya haces bien
- Sesgos con error_share (D-051) contra una línea base de azar calculada con los distractores que el propio alumno vio al fallar. No necesita población real y no inventa comparaciones con otros alumnos
- Responder sin terminar de leer usa el ritmo de lectura plausible (6 palabras por segundo) y no el percentil personal, porque el percentil siempre deja cerca del 10% debajo
- Fatiga con el método de tercios mientras Ricardo decide D-054
- Los textos y acciones son borrador pendiente de revisión médica y docente. Aviso visible de que son estimaciones, no diagnóstico ni predicción del puntaje
- La sección va justo debajo del resumen de Progreso, antes del dominio por rama

### D-075. Cuenta en la nube con Supabase, primera parte
- Fecha 2026-10-02. Origen R
- Ricardo creó el proyecto de Supabase, corrió el esquema de D-069 y guardó en GitHub la URL y la llave pública. El despliegue de Pages ya las pasa al build
- Se entra con un enlace al correo, sin contraseña. Crear cuenta guarda el perfil en el navegador como antes y además envía el enlace. Ya tengo cuenta envía el enlace. El enlace abre en cualquier dispositivo (flujo implicit)
- Al volver con sesión, la app busca el perfil local con ese correo o lo crea con el alias de la nube, abre la sesión, aplica el rol que da el servidor, registra la aceptación del aviso y sube alias y datos de cuenta. La foto propia todavía no se sube
- Con la nube configurada el selector de rol de la pantalla 26 queda bloqueado. El rol solo lo cambia un administrador con set_user_role. Al cerrar sesión se cierra también en la nube y el rol vuelve a alumno
- Sin las variables la app funciona igual que antes, completa en el navegador
- Pendiente para la segunda parte. Subir la bitácora de estudio, administrar usuarios desde Supabase y mover el banco y las tarjetas (protección de D-073)
- Límite conocido. El correo que trae Supabase de fábrica solo envía a los correos del equipo del proyecto y pocas veces por hora. Antes de abrir a alumnos hay que conectar un proveedor de correo propio (SMTP)

### D-076. Auditoría completa de la página
- Fecha 2026-10-02. Origen R
- Ricardo reportó que cambiar las tarjetas nuevas por día no se notaba y pidió una auditoría profunda
- Tarjetas nuevas. El cambio sí se guardaba, pero solo con el botón y sin aviso. Ahora el formulario avisa si hay cambios sin guardar y los límites diarios se ajustan también en Repasar, con efecto inmediato en el número de tarjetas
- Navegación. Dueño y administrador ven la app del alumno más su grupo de administración en el riel. Su inicio es Inicio. La configuración de administración se llama Plataforma para no repetir Configuración. Mazos y Party entran al riel. En el teléfono se llega desde Accesos en Perfil
- Progreso. Error de cálculo corregido. Con pocas respuestas y una media extrema en la rama, temas sin respuestas salían en 100% o 0%. Ahora cada tema necesita al menos 5 respuestas propias además de la regla del intervalo
- Conócete agrupa lo que sigue calibrando en una lista compacta
- Pantallas pendientes con aviso de Próximamente. Las etiquetas internas solo con ?estado=
- Suscripción y portada marcan como Próximamente lo que aún no existe y muestran el ahorro del plan anual
- Mazos en cuadrícula a todo lo ancho. Banco con búsqueda, filtros, páginas de 25 y detalle de cada pregunta
- Botones de guardar con el mismo texto, encabezado que no se sale en el teléfono, textos que mandaban a Perfil o hablaban de fases y bloques

### D-077. Banco grande de 1500 preguntas en borrador
- Fecha 2026-10-03. Origen R
- Ricardo pidió completar todas las ramas troncales y subespecialidades con 1500 preguntas, en Supabase o en Excel si no se podía en la nube
- Reparto parejo, 250 por troncal, con 10 opciones como el banco actual, según lo que eligió Ricardo
- Fuentes en content-drafts/bank1500/src en formato compacto, convertidas a JSON con scripts/content/bank-convert.ts y validadas con scripts/content/check-draft.ts. Las 1500 pasan la validación, sin claves repetidas y con subtemas que existen en la taxonomía
- Se entrega en Excel con scripts/content/bank-excel.ts porque la segunda parte de la nube, que sube el banco a Supabase, sigue pendiente
- Es borrador generado con IA. Queda fuera del banco de la app y de la demo hasta que un médico lo revise y se cite la frase que respalda cada respuesta
- Algunos temas sin subtema exacto quedaron en el subtema más cercano. La lista vive en content-drafts/bank1500/README.md

### D-078. Compactación de pantallas
- Fecha 2026-10-03 los bloques 1 a 5 y 2026-10-06 la integración y el bloque 6. Origen R, implementación de Claude
- Ricardo pidió que las pantallas ocuparan menos alto y se leyeran de un vistazo, sobre todo en el teléfono. Se hizo en 6 bloques con capturas de antes y después en docs/screenshots/compactacion
- Modo enfoque. En pregunta, tarjeta y retroalimentación el encabezado es delgado, sin racha, nivel ni descripción (SessionHeader). En el teléfono una barra fija abajo reúne confianza, revelar, calificar y siguiente (ActionDock). En computadora el caso va a la izquierda y las opciones a la derecha. El reporte para revisión médica queda plegado
- Repasar y Simular. El botón de empezar queda arriba. Mazos, ramas, subespecialidades y límites de hoy se pliegan con un resumen de lo marcado (Disclosure)
- Progreso en una sola página con las cifras en una fila, tus 3 focos de la semana con atajo al simulador, las lecturas de Conócete como filas que se abren y las ramas que se abren a sus subespecialidades. Las que no tienen datos quedan ocultas
- Marco de pantallas. La explicación de cada pantalla queda tras un ícono de información. El aviso de demostración ocupa una línea y es la única etiqueta de Datos simulados en los encabezados. Inicio y Perfil no repiten racha y nivel. Agregar mazo pasa a la tarjeta de Repasar
- Configuración en 4 secciones con pestañas, Estudio, Apariencia, Pomodoro y Cuenta y datos, con la sección abierta en la dirección (seccion). Una sola barra de guardar por sección que aparece solo con cambios (SaveBar)
- Inicio y Mazos. En el teléfono racha y meta diaria van lado a lado, el heatmap ocupa todo el ancho y Editar tablero pasa al encabezado. Cada mazo es una tarjeta compacta con sus temas plegados, y Sube tu mazo y Crear mazo quedan en una sola tarjeta. La meta diaria muestra el cociente grande y la métrica debajo, y el congelador concuerda en singular
- Alto de la página en el teléfono, antes y después. Repasar 4613 a 844, Simular 4256 a 844, Progreso 8362 a 2310, Configuración 5405 a 938, Inicio 1422 a 1082, Mazos 1820 a 1376 y Perfil 1338 a 1106
- Integración. La rama main-y84jz2 con los bloques 1 a 5 quedó sin juntar con main entre el 2026-10-03 y el 2026-10-06, así que la demo publicada no la tenía. El merge salió limpio con la corrección de Codex del repaso. Pasan typecheck, lint y las 357 pruebas unitarias

### D-079. Pruebas de punta a punta al día y en el CI
- Fecha 2026-10-06. Origen R (pidió seguir con la programación), implementación de Claude
- Las 12 pruebas e2e que fallaban desde el rediseño de la Fase P se actualizaron al diseño actual. Buscaban la navegación en la bienvenida y en la portada, el selector de tema y de base en Perfil, el enlace Cambiar de rol y la vista previa de estados en Progreso. Nadie lo notó porque el CI solo corría npm run check
- Nuevo ayudante signUp en tests/e2e/support/fixtures.ts. Crea una cuenta local por la bienvenida y deja la sesión abierta, para las pruebas que necesitan un alumno sin generar la demo
- Flujos de 14.1 con prueba nueva. 1 onboarding, 2 repaso con confianza, causa y XP, 5 tablero de widgets y 6 Party. Faltan el 4 (examen corto), que llega con la pantalla del examen, y los 3, 7, 8 y 9, que llegan con las Fases D y E
- El CI corre las e2e en un trabajo aparte del archivo check.yml, con el Chromium de Playwright dentro del proyecto (D-033). Reintenta 2 veces como pide la configuración
- Defectos reales que las pruebas encontraron y se corrigieron. Las fuentes propias no estaban en la precarga del service worker y sin conexión la app perdía su tipografía, y ahora entran a la precarga con unos 440 KB más. El botón de cambiar mazo o tema del repaso no tenía nombre en el teléfono porque solo mostraba el ícono. Las iniciales blancas de los avatares no alcanzaban el contraste de 4.5 a 1 con los colores de las ramas, así que usan colores fijos de 4.9 a 7.8. El aviso de que la app ya abre sin conexión tapaba la barra de guardar y la de acciones del repaso en el teléfono, así que pasó arriba y se quita solo a los 8 segundos
- La prueba de instalación PWA ignora el error in-incognito. Algunas versiones de Chromium lo dan por el contexto aislado de Playwright. Con un contexto persistente la lista de errores sale vacía y la app sí es instalable
- Resultado. 94 pruebas e2e, 47 en teléfono y 47 en escritorio, pasan en un Chromium de una sesión en la nube

### D-080. Directrices V2, simulador imperfecto, motores y estructura comercial
- Fecha 2026-10-06. Origen R. Ricardo pegó el Prompt V2, que une las reglas de arquitectura de Silvano con la filosofía clínica y comercial de la plataforma. Claude actúa como estructurador de backend e investigador
- Filosofía. El objetivo no es solo enseñar medicina sino enseñar a contestar el examen y entrenar el descarte de opciones. El simulador es imperfecto a propósito, como el ENARM, que tiene fallas, preguntas raras y redacciones confusas. La interfaz y la retroalimentación entrenan el manejo de la frustración con preguntas que el alumno no sabe, para que use la lógica y no solo la memoria
- Tipologías de reactivo que el esquema y la ingesta deben aceptar. Patognomónico y característico como etiquetas distintas, resolución inversa (casos casi idénticos que solo se separan por las opciones de tratamiento), y reactivos anómalos intencionales, es decir con incoherencias, de control para medir atención, con datos muy específicos u oscuros y desde la perspectiva del paciente. Ningún validador los rechaza. Se marcan para que los motores y los resultados los traten aparte
- Motores. El muestreo dirigido sube las opciones con los sesgos a los que el alumno es propenso y no solo una (amplía el modo dirigido de 7.8). El simulador incluye alarmas de entrenamiento según el tiempo restante para replicar el estrés y la gestión del tiempo del examen
- Datos pre-clasificados. La IA no clasifica datos en bruto en tiempo real. Opera detrás de la base de datos sobre lo que el médico ya etiquetó, incluidos los sesgos. Esto ya era la regla de D-025 y de la sección 8, y queda reforzada
- Comercial. Plan Gratis con límites estrictos de acceso al banco, aplicados en el servidor además de la interfaz. Referidos dentro de Party con un código por alumno y un mes gratis automático cuando el referido se concreta, modificando la suscripción o los permisos en Supabase
- Decisión técnica de Claude, origen C. El nivel Gratis es un plan de suscripción con banderas de acceso (src/config/billing.ts) y no un rol, porque los roles son alumno, médico, admin y dueño, y mezclarlos rompería las reglas de set_user_role de D-069. La interfaz sigue consultando banderas y no el nombre del plan
- Decisión técnica de Claude, origen C. El mes gratis y cualquier cambio de suscripción los hace solo el servidor con el aviso de pago verificado. El navegador nunca da meses gratis, porque se podría falsificar
- Dónde se aplica. Alarmas de tiempo, descarte de opciones, tipologías en el esquema y muestreo dirigido en el examen y el simulador de la Fase C bloque 9. Editor e importador del médico con las tipologías en la Fase E. Plan Gratis con permisos por fila y referidos en la Fase P, bloques 10 y 11 nuevos. Detalle en PLAN.md sección 10
- Pendiente de confirmar con Ricardo, porque choca con reglas escritas en CLAUDE.md. Primero, el LLM conversacional de OpenAI como segundo proveedor, cuando CLAUDE.md dice proxy hacia la API de Claude y nada de chat libre. Mientras no se confirme, el proxy de la Fase D se diseña sin atarse a un proveedor y la IA solo da explicaciones estructuradas, ancladas al banco y en borrador, sin chat abierto. Si se aprueba, su clave tendría su propio nombre ENARM_ y viviría solo en server/.env.local. Segundo, qué cuenta como referido concretado, entre el registro, la primera sesión y el primer pago. Recomendación, el primer pago verificado por el aviso de la pasarela, porque evita cuentas falsas

### D-081. Planificador con minutos declarados primero
- Fecha 2026-10-06. Origen C, implementación de Claude según 7.10
- Pantalla 13 con el plan de hoy (repasos, nuevas, bloque de práctica del tema más débil y un reto), la semana de 7 días y el aviso de sobrecarga con dos ajustes que se aplican con un botón y muestran su efecto en minutos al día. Bajar las nuevas propone la mitad de las de hoy y subir el tiempo propone lo que pide la carga
- Los minutos disponibles salen primero de lo que declara el alumno, después de su promedio real de los últimos 14 días con estudio, desde 3 días, y mientras tanto de un valor inicial de 60 minutos que aparece como calibrando con los días que faltan. Esto ajusta al motor planner, que prefería el promedio medido, porque si lo declarado no pesara el botón de subir el tiempo no cambiaría nada. Con lo declarado se informa al lado el promedio real
- La carga viene del motor fsrs con los límites del alumno. Se descuenta lo que ya repasó hoy y la segunda vista de las tarjetas nuevas, que la proyección cuenta como repaso y el motor ya cobra dentro del tiempo de una nueva. Así el plan coincide con lo que ofrece Repasar
- No hay cuenta regresiva al ENARM, por D-065. La fecha solo se usa por dentro para el modo examen de FSRS
- Los temas a reforzar salen del mismo análisis de Progreso y, mientras ningún tema alcanza su umbral, el plan lo dice y la práctica es mezclada
- La configuración del programador se comparte en src/features/review/schedulerConfig.ts para que Repasar, el plan y la carga futura proyecten con las mismas reglas
- Plan entra al riel lateral y a Accesos en Perfil, como Mazos y Party. Nuevo componente CalibratingNote para mostrar calibrando en una línea dentro de tarjetas

### D-082. Errores al repaso y examen completo
- Fecha 2026-10-06. Origen C y D-080, implementación de Claude según 7.1 y 10.1 pantallas 8 y 9
- Errores al repaso. Cada pregunta fallada en práctica o examen pasa a Repasar como tarjeta de pregunta, en un mazo privado del alumno que se llama Mis errores. La tarjeta se arma con texto del banco sin cambios, viñeta y frase al frente y clave, explicación y lo que eligió atrás, con las etiquetas de la interfaz. Por eso hereda el estado editorial y la marca de demostración de su pregunta y cita la explicación como fuente. No pasa por la revisión de contenido generado, que es para texto nuevo de la IA
- Los IDs son estables por alumno y pregunta, así fallar la misma pregunta dos veces no duplica la tarjeta ni reinicia su historial. Las preguntas en blanco del examen no pasan al repaso porque no fueron un error, ni las que no alcanzó a ver
- En Repasar los errores van primero entre las nuevas y comparten el cupo de tarjetas nuevas por día. Se decidió así y no un cupo propio para no tocar el motor fsrs ni la proyección del planificador. El alumno regula la mezcla eligiendo mazos en Repasar o subiendo su límite. Si en la práctica hace falta un cupo propio queda anotado en IDEAS.md
- Los mazos propios del alumno siempre cuentan como seguidos. Un mazo nuevo entra marcado en la selección de Repasar aunque ya hubiera una selección guardada, lo que arregla también el caso de un mazo recién seguido. El ajuste de la cuenta para mandar los errores al repaso se respeta en práctica y examen
- Examen completo con tamaños de 20, 50, 100 y 280 preguntas a 77 segundos por reactivo (D-074). Si el banco tiene menos preguntas toma todas y avisa cuántas faltaron (D-012). Reparto parejo entre ramas, casos seriados juntos y en orden y set canónico del médico para que el examen cuente para el puntaje (7.8)
- Reloj de pared y sin pausa, como el real. El estado vive en el navegador con respaldo en memoria y retoma tras una recarga. Navegación libre, marcar para revisar, cuadrícula de preguntas y descarte de opciones con un botón en cada una. La confianza es opcional y viene apagada, que se parece más al examen real
- Alarmas de tiempo apagables en la mitad, un cuarto, 10, 5 y 1 minuto, y por ritmo, con el motor timeAlerts. Un aviso aparte si el alumno lleva más del doble del ritmo en una pregunta sin contestar
- Sin retroalimentación hasta el final. Durante el examen solo se registran question_shown y answer_changed. Al terminar se registran las respuestas con su XP, fechadas cuando el alumno las eligió, y el fin de la sesión, por pasos que quedan anotados en el estado. Una recarga a la mitad retoma sin duplicar nada en la bitácora
- Resultados por rama, tema (con al menos 2 preguntas), estructura, tipo de tarea, trampa, reactivos raros aparte y descarte, con la revisión de cada pregunta y qué se podía descartar. Son cifras de este examen. Dicen que no predicen el puntaje del ENARM y la comparación entre afirmativas y negativas dice cuando todavía no es confiable. Cierra con una nota para leer el resultado sin frustración (D-080)
- Plan Gratis. El examen se limita a las preguntas que le quedan hoy y el de 280 es de los planes de pago, con banderas de acceso y no preguntando por el plan (D-080)
- El contraste de las etiquetas de rama no llegaba a 4.5 en cinco de seis ramas. Ahora el texto usa un tono ink más oscuro en modo claro. También faltaba el tono de Medicina familiar en el tema oscuro forzado
- Correcciones de la revisión independiente del cierre de la Fase C
  - El cierre del examen es idempotente. Cada respuesta lleva un ID de evento fijo, ordenado por su rango dentro de la bitácora, y un reintento recupera lo ya guardado con recordEventOnce en lugar de chocar o duplicar. Si se cortó entre la nota y la tarjeta de un error, reintentar completa la tarjeta y no repite la nota
  - Un examen terminado que no alcanzó a registrarse no se pisa con otro nuevo. Los resultados lo retoman y, si el guardado falla, ofrecen reintentar. El estado guarda cuántas acertó, y el último examen lo dice en Simular
  - Pasado el límite de tiempo ya no cuentan respuestas, marcas ni descartes, y la pantalla cierra el examen sola
  - El tamaño inicial es 280 cuando el plan lo permite. El plan Gratis aparta del día las preguntas de un examen abierto y el plan del día no propone más práctica de la permitida
  - Al cambiar de pregunta el foco pasa al enunciado y el lector de pantalla oye su posición. Borrar los datos también quita el examen guardado
  - Repasar lleva la etiqueta Demostración cuando el contenido lo es. Los resultados del examen y el plan dicen cuánto falta mientras calibran

### D-083. Progreso con carga futura y dificultad, y mazos hechos a mano
- Fecha 2026-10-06. Origen C, implementación de Claude según 7.1, 7.7 y 3.1
- Carga futura en Progreso con la misma proyección y los mismos límites del planificador, a 30 o 60 días, con barras de repasos y de tarjetas nuevas, el promedio, el día más cargado y una tabla por semana para quien no ve la gráfica. Dice que supone Bien en cada repaso y las nuevas al ritmo del límite diario. Sin mazos seguidos lo dice y lleva a Mazos
- Dificultad en Progreso con la exactitud en preguntas fáciles, medias y difíciles, con los mismos grupos del filtro de Simular (1 a 2, 3 y 4 a 5), que ahora comparten una sola función. Cada grupo calibra con cuánto falta hasta 20 respuestas. Usa la dificultad que estimó el médico porque la calibración de cada pregunta necesita las respuestas de toda la población. Las bandas del motor difficulty no se usaron porque el nivel 3 caía en difícil y chocaba con la Media de Simular
- Mazos a mano. El alumno crea mazos privados, de origen manual y en borrador, con tarjetas básicas o con huecos. El texto es plano y se guarda escapado, solo con las etiquetas p y br, así que nada de lo que escribe se vuelve código. Una tarjeta con huecos lleva una carta por hueco y al editarla las cartas de los huecos que siguen conservan su ID y con él su historial de repaso. Solo se editan y borran los mazos manuales, no Mis errores
- Los mazos propios siempre cuentan como seguidos, así que sus tarjetas aparecen en Repasar y en el plan sin seguir nada
- Subir mazos desde otras apps sigue como Próximamente (Fase E)

### D-084. Tutor sin IA, widgets de análisis, duelos de Party y tarjeta de logro
- Fecha 2026-10-06. Origen C, implementación de Claude según 8.2, 9.1 y 9.6
- Tutor sin IA, pantalla 11. Las hipótesis salen de las 9 reglas de olvido aplicadas a los errores de los últimos 14 días y se calculan de la bitácora cada vez que se abre la pantalla, no se guardan. Un patrón se confirma con 5 hallazgos del mismo tipo y la misma área en 14 días. Antes solo se está formando y se muestra calibrando con cuánto falta. La confianza es baja o media, nunca alta
- Cada hipótesis es una plantilla por regla con el área que salió de los datos, los errores que la forman como evidencia y las acciones de la lista cerrada de 8.2 que la app sabe ejecutar. Crear una tarjeta de contraste entre dos preguntas que el alumno confunde, encender el resaltado de negaciones, poner pausas más cortas en el Pomodoro, o llevarlo a practicar el tema o a repasar las explicaciones. Solo se guarda lo que el alumno hace, su respuesta (me sirve o no me ayuda) y la acción que aplicó, como artefacto de tipo hipótesis. Una que descarta no se le vuelve a mostrar salvo que la reabra
- De entrada solo se abren 3 hipótesis, de reglas distintas mientras las haya, y las demás quedan plegadas. Con la demo salían más de 40 y la página medía 16,000 px
- Informe semanal con plantilla fija armado con los números del propio alumno y consejos por sesgo. Las secciones que todavía calibran no aparecen. Los consejos son borradores pendientes de revisión médica y lo dicen. El espacio de las tarjetas que proponga la IA en la Fase D ya existe, siempre en borrador, con la frase del banco que las respalda. Nada de chat libre ni de predecir el puntaje
- Widgets de análisis en Inicio. Temas débiles con 3, 5 u 8 temas y filtro por rama, patrón de sesgo, carga futura a 30 o 60 días y última hipótesis del tutor. Usan los mismos cálculos que Progreso y el tutor, con una sola función (buildAnalysis), y mientras no hay datos suficientes dicen cuánto falta. Los ajustes guardados se validan al leerlos y un valor que ya no existe vuelve al de siempre en lugar de romper el tablero. Se quitó el marcador de patrón de sesgo y el texto de Próximamente
- Duelos de Party. El alumno reta a un compañero simulado con las mismas 20 preguntas, que se fijan al crear el duelo con una semilla que sale del duelo, y con las mismas opciones en cada una. Se juega con el simulador de práctica como una sesión de tipo reto. Gana más exactitud y desempata el menor tiempo de respuesta, sin contar lo que tarda en leer la retroalimentación. Es un solo intento y las preguntas sin contestar cuentan como incorrectas. El resultado del alumno sale de su bitácora y el del compañero simulado de una semilla por compañero y duelo, marcado como simulado. Mientras no juega no se le muestra nada del compañero. No da XP aparte, solo el de responder cada pregunta
- Plan Gratis en duelos. Un duelo pide sus 20 preguntas y el plan Gratis deja 20 al día, así que un duelo las gasta todas. Con menos preguntas disponibles el duelo no se puede jugar y lleva a los planes. El conteo es el mismo del simulador y del examen y quedó en una sola función
- Privacidad en Party. En un grupo se comparte alias, XP, nivel y racha. En un duelo, además, cuántas acertó y cuánto tardó en esas preguntas. Nunca exactitud por tema, sesgos ni conducta. El aviso de Party lo dice
- Tarjeta de logro. Imagen cuadrada con nivel, racha y XP de la semana, solo del propio alumno, como pide D-028. El alias va solo si lo pide y no sale nada hasta que toca el botón. Con la Web Share API manda la imagen con su texto y sin ella la descarga. Cancelar el menú no es un error. En una cuenta de demostración la imagen lleva la etiqueta de datos de demostración. Se dibuja con el canvas del navegador, sin librería nueva
- Premio de los retos colectivos. Los compañeros simulados pueden cumplir una meta por sí solos, así que el premio de 100 XP exige que el propio alumno haya aportado algo al reto y se da uno por día de estudio, y dos toques seguidos no lo pagan dos veces. Lo encontró la revisión independiente del cierre. Antes se podían crear retos de meta 1 y reclamarlos sin parar
- Llaves de Supabase. El cliente rechaza también la llave anterior de servicio, que es un JWT con rol service_role y se parece a la pública, y el escáner del build busca llaves de servicio por su forma y por el rol que declaran. Solo pasa el rol anon
- Opciones del duelo. Salen del set canónico de cada pregunta, siempre 4 y con una semilla que sale del duelo, así los dos jugadores ven exactamente lo mismo sin importar su sesión ni cuántas opciones prefiere ver en su práctica
- Desviación de D-028. Los grupos, compañeros y retos simulados del Party local se guardan en la base activa, marcados como simulados, y no en enarm_demo. Exportar mis datos no incluye grupos. Cuando la bitácora se sincronice con la nube hay que dejar fuera lo simulado
- Desviación en los ajustes de los widgets de Inicio. Solo tienen ajustes el heatmap, los temas débiles y la carga futura. Los demás widgets no traen nada que ajustar todavía y no muestran panel de ajustes al editar el tablero
- El informe del tutor se llama Tu resumen y no informe semanal, porque todavía no es semanal ni incluye olvidos ni planificador. El nombre se revisa cuando los incluya
- Correcciones de la revisión independiente del cierre de la Fase C
  - Los consejos por sesgo dicen cuántos errores con trampa etiquetada llevan y cuántos piden, y llevan la marca de borrador pendiente de revisión médica donde aparezcan. La marca puede pasar a dos renglones, porque en una sola línea el informe se salía de la pantalla del teléfono
  - El widget de temas débiles calibra solo con los temas de la rama elegida. Una hipótesis descartada no vuelve a salir como patrón en formación y reabrirla deja un evento. La causa que reporta el alumno se ata al error que la precede y no a todos los de esa pregunta
  - El editor de tarjetas rechaza huecos sin cerrar o sin respuesta, conserva el resalte del hueco, no guarda dos veces con un doble toque y muestra el foco en el tipo de tarjeta. Las acciones del tutor siguen disponibles después de Me sirve
  - La práctica guarda en cada respuesta las opciones que el alumno descartó y la retroalimentación explica qué se podía descartar. Simular tiene muestreo dirigido a las trampas del alumno, con estado calibrando y sin llenar toda la pregunta con ellas, y la opción correcta se reparte parejo entre posiciones en práctica y examen
  - Se registra cuándo la pestaña queda oculta durante práctica y examen, para medir distracción sin adivinar
  - Las pruebas e2e ahora fallan si una pantalla se sale de lado en el teléfono. Con ello se encontró el desbordamiento del tutor y se corrigieron también las cuadrículas de una columna en Progreso, Planificador, Configuración y Resultados
- Pendiente con Ricardo, como en D-080. Qué cuenta como referido concretado, que vivirá en Party y dará un mes gratis desde el servidor, y el segundo proveedor de LLM

### D-085. Guía de Anki, apuntes tipo RemNote y todo en uno
- Fecha 2026-10-07. Origen R, análisis y plan de Claude
- Ricardo compartió una guía de Anki y pidió integrar sus ideas. Se hizo por fases. Diagnóstico del código, entrevista de 12 preguntas, tabla de 14 controversias con su solución recomendada y aprobación de Ricardo el 2026-10-07
- El registro completo de la conversación vive en docs/ANALISIS_GUIA_ANKI.md, con el diagnóstico, las preguntas con las respuestas de Ricardo, la tabla de las 14 controversias y la aprobación
- Respuestas de Ricardo. El alumno estudia dentro de Studiare y no en Anki. Se adoptan las prácticas de la guía dentro de la app (jerarquía, etiquetas por tema, valores por defecto y ayuda con atrasos). No hay una colección de Anki que cuidar ni repasos reales que perder. Quiere una app con todos esos complementos ya incluidos, con mazos precargados y facilidad para crear mazos propios, fusionada con las ideas de RemNote. Es un producto comercial pensado para muchos alumnos, así que los ajustes deben servirles a todos. Las fuentes son guías clínicas en PDF, apuntes propios, libros y preguntas falladas. Pide la mayor versatilidad sin importar el costo de programar. No usa la terminal, así que Claude hace todo y Ricardo prueba en pantalla con una lista de verificación
- Alcance aprobado. Los 14 elementos de la tabla con su solución recomendada, sin distinción de esfuerzo, en la Fase C2 con 7 etapas. Etapa 0 cierra la Fase C. Etapa 1 organización. Etapa 2 carga diaria. Etapa 3 apuntes tipo RemNote. Etapa 4 importar y exportar. Etapa 5 IA para tarjetas. Etapa 6 sincronización. Cada etapa cierra según 15.1 y espera la aprobación de Ricardo. Va antes de la Fase D porque las tarjetas con IA y los importadores necesitan mazos en árbol, etiquetas en ruta y fecha de modificación
- Se mantiene el intervalo máximo de 21 días por defecto de D-064 y D-067. Los 365 días de la guía quedan como perfil guía de un toque. Las nuevas por día no se fijan en 9999. Se calculan según la carga proyectada y los minutos de cada alumno, y existe un modo sin límite con aviso
- Lo que no se hace. Instalar complementos de Anki, porque sus funciones se construyen dentro. Poner 9999 nuevas por defecto. Delay Overdue, que no se pudo confirmar que exista ni lo que hace. AnkiWeb, que lo reemplaza la sincronización propia
- Pregunta 11, opción B con la regla de señalar sin corregir. La IA puede generar tarjetas a partir de PDF y textos del alumno, con cita literal obligatoria, validador de cifras, dosis y fármacos, siempre en borrador y con la etiqueta de no validada por médico. Cuando la IA considera que algo puede estar mal nunca lo cambia por su cuenta. Lo señala con un texto que explica por qué se marca la controversia y que se apoya solo en textos académicos fundamentales del ENARM, de una lista cerrada. El alumno puede marcar que ya lo verificó, y la señal se va y queda registrada, o editar esa misma tarjeta
- Esto amplía la regla que anclaba el texto de la IA solo al banco. Ricardo lo aprobó y la regla de CLAUDE.md ya quedó actualizada el 2026-10-07. El texto del alumno que viaja al modelo pasa por el filtro de datos personales y por una cuota por plan, y la IA con PDF es función de pago
- Pendiente con Ricardo. La lista de textos académicos fundamentales, que se propone como provisional y la confirma él o un médico. La licencia de Paco para uso comercial, porque D-053 solo cubre la demo. Qué funciones son gratis y cuáles de pago, con propuesta de gratis para mazos en árbol, etiquetas, Explorar, contadores y atrasos, y de pago para la IA con PDF. Qué cuenta como referido concretado y el segundo proveedor de LLM, como en D-080

### D-086. Bibliotecas para la Fase C2
- Fecha 2026-10-07. Origen R, que pidió buscar bibliotecas ya hechas aunque haya que pagar. Se revisó versión, licencia y fecha de la última publicación en el registro de npm
- Criterio. Licencia MIT, Apache o BSD, con mantenimiento y sin código AGPL ni GPL. Anki es AGPL-3.0, así que no se copia código suyo. FSRS4Anki Helper es MIT y sirve de referencia para repartir carga, posponer y adelantar
- Elegidas. TipTap 3 con sus extensiones MIT para los apuntes (núcleo, react, list, mention, suggestion). pdfjs-dist y tesseract.js para leer PDF y escaneos. papaparse para CSV. read-excel-file para Excel. mammoth para Word. sql.js y fzstd para leer los .apkg del formato viejo y del nuevo. minisearch para buscar texto. @tanstack/react-table y @tanstack/react-virtual para las listas largas de Explorar. react-arborist para el árbol de mazos
- Descartadas. BlockNote, porque su núcleo es MPL-2.0 y sus paquetes XL son GPL o propietarios. xlsx de npm, que está en una versión vieja. react-pdf-highlighter-extended, sin publicar desde 2024. exceljs, que pesa 21 MB
- Compras. Ninguna es necesaria ahora. Las extensiones Pro de TipTap y los visores de PDF comerciales no aportan lo suficiente por ahora
- Cada paquete se instala dentro del proyecto, nunca de forma global, y se revisa su documentación vigente antes de usarlo. Se agregan en la etapa que los necesita y no antes

### D-087. Acuerdos de la reunión del equipo del 2026-10-07
- Fecha 2026-10-07. Origen R, acta de la reunión que Ricardo compartió con la transcripción de Gemini. Claude separó lo que cambia el producto de lo que no toca el código y Ricardo aprobó hacer todo lo aplicable
- Se aplica. Confianza previa fuera. La pregunta de seguridad antes de responder, en tarjetas y en preguntas, queda apagada por defecto y se puede encender en Configuración. Se usa el ajuste que ya existía para tarjetas (cardConfidenceStep) y ahora también manda en el simulador. Una migración de la base lo apaga una vez para quien lo tenía encendido por defecto. Las lecturas que dependían de la confianza, como los errores con mucha seguridad, siguen en estado calibrando hasta que haya datos y ahora dicen que se activan con ese ajuste
- Se aplica. Retroalimentación al final. En la práctica del simulador la retroalimentación pasa al final de la sesión y cada pregunta lleva directo a la siguiente. El resumen trae la revisión de cada pregunta con explicación, por qué atrae la opción elegida, qué se podía descartar, causa del error y reporte para revisión médica. Quien prefiera verla pregunta por pregunta lo elige en Simular. El examen completo ya funcionaba así
- Se aplica. Simulador y repaso más prácticos, petición de Ricardo porque el ratón recorría toda la pantalla. Teclado en la pregunta con letras o números para elegir, Mayús con la letra para descartar y Enter para responder. Un doble clic en una opción la responde. El botón de responder queda pegado a las opciones y en el mismo lugar que el de seguir. En tarjetas Espacio o Enter muestra la respuesta y 1 a 4 califica
- Se aplica. Repasar y Mazos se unen en una sola sección de la navegación, con dos pestañas. La ruta de Mazos se conserva
- Se aplica. Precios. La suscripción mensual estándar queda en 150 pesos. Se agrega un plan Fundador para los primeros 100 usuarios con precio fijo de por vida. El acta habla de 59 a 79 pesos y Ricardo confirmó 79 el 2026-10-07. El anual conserva el mismo descuento que ya tenía sobre el mensual hasta que Ricardo fije su precio. El cupo de 100 se verifica en el servidor al cobrar y la pantalla no muestra un contador inventado
- Se aplica. Banco con hasta 6 opciones por pregunta. El esquema acepta de 4 a 10 y deja de exigir 10 en los lotes. El Excel del banco lleva opciones, sesgo por opción y tipo de reactivo, con las preguntas de control incluidas, y hay una plantilla vacía para llenarlo. La cantidad que se muestra sigue siendo un ajuste del alumno
- Se aplica. Un solo dispositivo activo por cuenta para evitar compartir cuentas. Gana el último dispositivo en entrar y el anterior ve un aviso la siguiente vez que revisa. Necesita aplicar una migración de SQL en Supabase, que Claude deja lista y probada
- Ya coincide. El plan Gratis con 20 preguntas al día, mazos propios, Party, examen completo y tutor con IA bloqueados es lo que describe el acta. Las preguntas de control y los casos seriados ya existían (D-080 y D-082) y el acta pide mantenerlos
- No se aplica ahora. Estudiantes de pregrado, porque falta definir qué cambia para ellos, ver IDEAS.md. Entrenar modelos con las interacciones de alumnos de una universidad, porque pide un consentimiento específico y un diseño de datos que todavía no existen, ver IDEAS.md
- No se escribe en el repositorio, que es público. Reparto de utilidades, trámites personales, videos, asesoría externa y fechas de reuniones. No tocan el código
- Metas del banco que salen del acta. De 4,000 a 5,000 preguntas en Excel para principios de noviembre y 10,000 para mediados de noviembre, con la IA de la Fase D. El banco sigue en pausa para Claude, que solo programa
- Cómo quedó. Ajustes nuevos en el perfil, practiceFeedback con end por defecto y cardConfidenceStep apagado por defecto. La base sube a la versión 4 para apagar una vez la confianza previa. Los atajos de teclado viven en un solo gancho, useShortcuts, y no actúan al escribir en un campo, con Ctrl, Alt o Cmd, ni con el foco en un botón cuando la tecla es Enter o Espacio. Las preguntas falladas pasan al repaso en segundo plano para no frenar la siguiente pregunta
- Cómo quedó el plan. Mensual 150 pesos, anual 1,200 pesos (el mismo descuento que ya tenía sobre 12 meses) y Fundador 79 pesos al mes de por vida, confirmado por Ricardo con un cupo de 100 que se confirma al cobrar. El Fundador da lo mismo que el mensual
- Cómo quedó el banco. El esquema acepta de 4 a 10 opciones por pregunta, con o sin tipo de reactivo, y el set canónico debe usar opciones que existan. Lo que no encaja con el motor sale como aviso y no como error. Hay una plantilla de Excel con el comando npm run bank:template, con hojas de instrucciones, preguntas, sesgos, temas y listas, y bank-convert ahora lee el Excel lleno además del texto compacto. La plantilla vive en content-drafts/bank-plantilla. Queda por definir con el importador de la Fase E el destino final de un banco de miles de preguntas, porque la clave de lote bN-qNN no alcanza
- Cómo quedó el dispositivo único. La tabla device_sessions y la función claim_device viven en la migración 20261007000001_single_device.sql, que Ricardo pega y ejecuta en el editor de SQL de Supabase. El dispositivo se reclama solo al entrar, no en cada aviso de sesión, porque Supabase repite ese aviso cada vez que la pestaña vuelve a verse y el dispositivo viejo le quitaría la cuenta al nuevo. Cerrar la sesión ahora es local y ya no revoca las sesiones de los demás dispositivos. Es un freno y no una barrera, porque la revisión corre en el navegador. Una versión que revise en el servidor queda en IDEAS.md. El aviso de privacidad debería mencionar el identificador de dispositivo y está pendiente
- Cómo quedó la barrera del dispositivo único. Segunda migración, supabase/migrations/20261008000001_device_barrier.sql, que no edita la primera. claim_device guarda el session_id del token y la función is_active_device() deja pasar solo al dispositivo que ganó, a un administrador o a una cuenta que nunca reclamó. 22 políticas de las tablas del alumno la exigen (perfil propio y de compañeros de grupo, cuenta privada, suscripción propia, reportes, mazos, notas, tarjetas, eventos, grupos, membresías, retos y artefactos de IA). Las tablas de contenido compartido, el aviso de privacidad y los flujos de médicos quedan sin barrera. Una prueba falla si aparece una política nueva con auth.uid sin la barrera
- Cambios por día. Tomar la cuenta desde otro dispositivo cuenta como cambio y a partir del cuarto en 24 horas el servidor lo rechaza con el código DV001 y la hora en que podrá reintentar. Volver al mismo dispositivo no cuenta. Los valores viven en platform_settings, clave device_limits. La bitácora device_claims solo se agrega, y un administrador libera una cuenta con admin_release_device y ve sus reclamos con admin_device_claims
- Alcance honesto. La barrera impide usar una cuenta desde dos lugares a la vez y frena el cambio constante. Quien comparta usuario y contraseña y se turne sin pasar de tres cambios al día sigue pasando, y para detectarlo sirve device_claims. El rechazo de un reclamo solo queda en la bitácora si el navegador llama a log_rejected_claim, así que un navegador manipulado puede no dejar rastro del rechazo. Los cambios aceptados siempre quedan
- Pendiente con Ricardo. Precio del anual, aplicar en Supabase las dos migraciones de SQL del dispositivo único y poner el correo de ayuda en la variable VITE_SUPPORT_EMAIL, que sin ella deja el aviso sin enlace


### D-088. Etapa 1 de la Fase C2, organización
- Fecha 2026-10-08. Origen C, decisiones de diseño dentro de lo que Ricardo aprobó en D-085. Cubre las filas 3, 4, 9 y 12 de la tabla de controversias
- Mazos en árbol. Cada mazo puede colgar de otro con parentId, hasta 8 niveles, sin ciclos. Los mazos de Paco quedan como ENARM 2027, luego las 3 ramas y debajo las 37 materias. Repasar elige por rama y no por cada materia. Los IDs de notas y tarjetas no cambian al migrar, así que el historial de repaso se conserva. La prueba parte de una base plana con las 3,771 notas y comprueba que quedan las mismas notas y tarjetas
- Etiquetas en ruta. Los niveles se separan con dos dos puntos y una etiqueta nunca lleva espacios, que pasan a guion bajo, como en Anki. El tope sube de 80 a 200 caracteres porque una ruta de cinco niveles de Paco pasaba de 80 y se cortaba
- Fecha de modificación y marca de borrado. Mazos, notas y tarjetas llevan updatedAt y deletedAt. Borrar pone la marca y no quita el registro, así otro dispositivo se entera al sincronizar. Los repositorios ocultan lo borrado y solo listAll y getRaw lo muestran. Una carta que se quita y vuelve a ponerse conserva su ID y su historial. La base sube a la versión 5
- Suspender es un evento. cards_suspended y cards_unsuspended se suman a la bitácora, de hasta 500 tarjetas cada uno, y el último evento de cada tarjeta manda. Repasar, el Planeador y la carga futura no cuentan las suspendidas. Se puede suspender cualquier tarjeta, también las precargadas, porque no cambia su contenido
- Explorar es la tercera pestaña de Repasar y Mazos, en /mazos/explorar, y la pantalla 29 del registro. Busca por palabras sin importar acentos ni mayúsculas, con frases entre comillas y palabras a excluir con un guion. Filtra por mazo con sus submazos, ruta de etiqueta con todo lo que cuelga de ella, estado, tipo y origen. Cada opción muestra cuántas tarjetas daría con los demás filtros puestos. Con 20,000 tarjetas arma las filas en menos de 4 segundos y filtra en menos de 150 milisegundos
- Acciones por lote. Mover notas a un mazo propio, poner o quitar una etiqueta, suspender y reanudar. Lo precargado y lo de otra persona no se edita, solo se suspende, y el resultado dice cuántas notas se quedaron sin cambio. El permiso se comprueba en el caso de uso y no solo en la pantalla
- Tipos de nota. Se agregan la básica con tarjeta inversa, que genera dos cartas, y el cloze anidado con un analizador real de huecos con pila y sin recursión. Un hueco sin cerrar se trata como cerrado al final del texto para que su respuesta nunca quede a la vista en la pregunta, aunque el editor lo rechaza igual. Al cambiar el tipo de una tarjeta ya escrita se conserva lo escrito, como Cambiar tipo de nota de Anki
- Calidad de tarjetas. Avisos y sugerencias, nunca un bloqueo, por largo, varias ideas, listas largas, demasiados huecos, respuesta que se delata y duplicados exactos o casi iguales (similitud de 0.85 sobre palabras). Los umbrales viven en src/config/cardQuality.ts y son juicio de diseño ajustable. El editor revisa tras una pausa de medio segundo para no anunciar cada letra al lector de pantalla
- Se mantiene la arquitectura. Los motores nuevos (tagPath, deckTree, explore, suspension, cardText, cardQuality, duplicates) son funciones puras en src/engines y el límite de importaciones lo vigila la prueba de arquitectura
- Desviación. El cierre de la Etapa 1 agrega una pantalla al registro, que pasa de 28 a 29 pantallas. Solo cambia el conteo de la prueba de rutas
- Revisión independiente. Un subagente que no escribió el código revisó el diff contra la especificación y no encontró fallas críticas ni pérdida de datos. Se corrigió todo lo que reportó. Inicio contaba tarjetas suspendidas, Explorar y los duplicados del editor leían lo de otros perfiles de la misma base y lo de mazos que ya no se siguen, Repasar no incluía los submazos de un mazo propio, había dos analizadores de huecos que se contradecían, plainText de Explorar era cuadrático con entradas hostiles, una carta de una inversa heredaba el historial de un hueco al pasar a cloze, crear un mazo no respetaba el tope de niveles, y el Tutor nombraba la inversa por el lado equivocado. La sangría de los selectores de mazo también pasó a un solo ayudante con espacios que no se rompen, por si una herramienta normalizaba los espacios del código
- Se decidió además que guardar un mazo precargado escribe los mazos al final, para que una interrupción a la mitad se repare sola, y que mover notas escribe primero las cartas. SyncableRepo ya no ofrece borrado duro
- Un solo analizador de huecos, src/engines/cloze.ts, lo comparten la capa de datos y los motores de calidad y duplicados. Un :: seguido de otro hueco no es pista, y un hueco sin cerrar se trata como cerrado al final del texto
- Entre una cloze y una básica el mismo número de carta es otra pregunta, así que al cambiar entre esas familias las cartas viejas quedan con marca de borrado y salen cartas nuevas sin historial. Dentro de una misma familia se conserva el ID
- Mazos propios en Repasar. La unidad de selección es el mazo de primer nivel con todos sus submazos. ENARM 2027 solo agrupa y se elige por rama. Queda como pregunta para Ricardo si prefiere otra regla
- Desviación. D-086 proponía @tanstack/react-table y react-virtual para Explorar. El código pagina de 50 en 50 y no instaló nada nuevo, y con 20,000 tarjetas el motor filtra en menos de 150 milisegundos
- Bug que ya existía y no se tocó. Borrar de auth.users a alguien con eventos falla, porque el disparador de solo agregar de la tabla events bloquea el borrado en cascada. Afecta el derecho a cancelar la cuenta y se atiende en la Fase E, con las rutas de privacidad
- Pendiente con Ricardo. Confirmar los umbrales de calidad de tarjeta cuando haya tarjetas de alumnos reales. Qué funciones son gratis y cuáles de pago, con la propuesta de gratis para mazos en árbol, etiquetas, Explorar y calidad

### D-089. Etapa 2 de la Fase C2, carga diaria
- Fecha 2026-10-08. Origen C, decisiones de diseño dentro de lo que Ricardo aprobó en D-085. Cubre las filas 5, 6, 7, 8 y 14 de la tabla de controversias
- Contadores. Repasar muestra Nuevas, Aprendizaje y Programadas, con la que cuenta la tarjeta de ahora subrayada y su nombre escrito, nunca solo el color. El motor es puro (src/engines/counters.ts) y baja el contador al calificar. En Aprendizaje cuentan las tarjetas que se están aprendiendo y las que se olvidaron y vuelven a verse
- Temporizador de tarjeta. Apagado por defecto para no subir la ansiedad. Con él encendido muestra el tiempo sugerido (de 10 segundos a 2 minutos) y, si el alumno lo pide, muestra la respuesta sola al acabarse. Nunca califica, no suena y no quita la tarjeta. Se detiene si el estudio se pausa. El tiempo que se guarda en cada paso (hasta ver la respuesta y hasta calificar) nunca pasa de 120 segundos, para que una tarjeta olvidada abierta no distorsione el ritmo del alumno, y al estimar cuánto tarda una tarjeta la suma de los dos pasos también se recorta a 120 segundos
- Sanguijuelas. Una tarjeta es sanguijuela a los 8 olvidos, como en Anki, y el aviso sale en ese olvido y después cada 4. Se atiende justo después de contestar la causa del fallo, con cuatro sugerencias que salen de la forma de la tarjeta (dividir, acortar, dar contexto o reescribir). Se puede suspender, editar si el mazo es propio y hecho a mano, o seguir con ella. Las precargadas y las generadas no se editan desde ahí y solo se pueden suspender. Repasar avisa cuántas sanguijuelas hay y lleva a Explorar con el filtro puesto
- Repartir, posponer y adelantar. Es un evento nuevo, cards_rescheduled, que guarda las tarjetas con su fecha de antes y la de ahora. Solo cambia la fecha de vencimiento y la memoria de la tarjeta (estabilidad y dificultad) no se toca. El estado derivado toma esa fecha hasta el siguiente repaso, que reemplaza el estado completo. Cada acción se parte en lotes de hasta 500 tarjetas que comparten la misma marca de tiempo, así Deshacer reconoce todo el lote y solo regresa las tarjetas que no se han repasado desde entonces. Deshacer es otro evento, nada se edita ni se borra
- Aviso de recuperación. Aparece con 40 tarjetas vencidas de días anteriores o más, o con la mitad del límite diario de repasos o más, lo que sea mayor. Propone repartir entre los días que ya calculó el motor y no pasa del día del examen. Repartir entre 1 y 7 días útiles, posponer hasta 30 y adelantar hasta 5,000. Repartir salta los días marcados como casi sin repasos y da la mitad de capacidad a los de menos repasos, para no cargar un domingo que el alumno quiso libre. Hoy cuenta siempre. El resultado se ve aunque el bloque de herramientas siga plegado
- Perfil guía de un toque. Retención de 90%, botones en 100% y un intervalo máximo igual a los días que faltan para el ENARM, entre 1 y 3,650, o 365 si no hay fecha o ya pasó. Muestra qué cambia antes de aplicarlo y no toca las nuevas por día, que se calculan aparte
- Nuevas por día según la carga. La sugerencia usa la carga proyectada de 30 días, el tiempo real que tarda el alumno por tarjeta (mediana, con tope de 120 segundos por muestra) y los minutos que declaró en Plan, de los que el 50% va a tarjetas. Es el mayor número cuyo día más pesado cabe en ese tiempo. Hasta tener 100 repasos medidos usa 10 segundos por repaso y 30 por nueva y lo dice con el aviso de calibrando. Si el atraso ya rebasa el tiempo sugiere 0 y lo avisa. No sugiere más nuevas de las que existen ni más de 200, que es el techo de la búsqueda. Se calcula al pedirlo, con un botón, porque con colecciones grandes tarda unos cientos de milisegundos y no tiene que frenar la apertura de Repasar. Sin minutos declarados manda a Plan
- Sin límite de nuevas. Se enciende con un aviso escrito junto a la opción, queda guardado aparte y conserva el número de antes, así al apagarlo vuelve a regir. Para el programador equivale a un tope de 100,000 por día. Si el planificador propone bajar las nuevas, parte del número guardado, apaga este modo y recorta la propuesta a 500, que es lo máximo que acepta el ajuste
- Días fáciles. Cada día de la semana puede ser normal, con menos repasos o casi ninguno. Solo se mueve el siguiente repaso de tarjetas con intervalo de 3 días o más, con una ventana que crece con el intervalo (1 día de 3 a 6, 2 de 7 a 19, 3 de 20 a 59 y 5 de 60 en adelante) y nunca después del día del examen. Con menos repasos acepta cerca de la mitad de las tarjetas. La elección sale de un hash estable del estado de la tarjeta, de la calificación y de la clave de la tarjeta (su ID), no del azar, así la misma tarjeta siempre da la misma fecha y la proyección de carga futura es reproducible. La clave importa porque las tarjetas que se aprendieron el mismo día tienen el mismo estado y sin ella se movían todas en bloque. Con la misma distancia entre el día anterior y el siguiente desempata con el mismo hash. Sin el desempate todo el domingo caía en el sábado y el pico subía hasta 1.7 veces. Con la clave y el desempate el pico queda dentro de 1.4 veces el base, medido en 8 simulaciones con semillas distintas que ahora forman parte de las pruebas. Marcar dos días seguidos como casi ninguno sí carga unas 2 veces los días vecinos, y el texto de Configuración lo avisa. La memoria de la tarjeta no cambia, solo su fecha
- Proyección con muchas nuevas. Las nuevas que entran el mismo día son idénticas, así que la proyección las simula en 8 grupos con su propia clave de días fáciles y multiplica. Con el modo sin límite y 20,000 tarjetas sin ver tarda milisegundos y no segundos. La sugerencia de nuevas por día usa los mismos grupos y da exactamente lo que daría proyectar todas las tarjetas, también con días fáciles. Con días fáciles la proyección es una aproximación de lo que hará cada tarjeta real
- Eventos de cambio de fecha. El esquema exige que un deshacer diga qué cambio deshace y que los demás no, y que solo repartir y posponer lleven días
- Banderas de acceso por función. Cada plan trae una bandera por cada función de la carga diaria (Explorar, herramientas de atrasos, perfil guía, sugerencia de nuevas, días fáciles y temporizador) y la interfaz las consulta en un solo componente, FeatureGate. Hoy todas están abiertas en todos los planes porque Ricardo todavía no decide cuáles serán de pago. Cuando decida solo cambia la tabla de planes. Las banderas gobiernan los puntos de entrada de la interfaz y no el programador, que sigue usando lo que el alumno ya configuró. Si algún día una función se vuelve de pago habrá que decidir si lo ya configurado se conserva
- Se mantiene la arquitectura. Los motores nuevos (counters, leech, reschedule, rescheduleLog, dailyLoad, guideProfile y easyDays) son funciones puras en src/engines y la prueba de arquitectura vigila sus importaciones. Los umbrales viven en src/config/thresholds.ts, sección daily, y quedaron en el PLAN. Los radios de los días fáciles, el mínimo de 20 nuevas medidas y el techo de 200 nuevas de la sugerencia son constantes de los motores y no se editan desde administración
- Agentes en paralelo hicieron los motores de atrasos, de días fáciles y de carga diaria con perfil guía. Las ramas se integraron a mano porque un agente en su propia copia no puede juntar ramas. Una revisión independiente de un subagente que no escribió el código no encontró fallas críticas. Reportó 4 medias y varias bajas, y se atendieron todas menos dos notas menores que quedan abajo
- Hallazgo sin atender. Uno de los agentes reportó que studyDayOf y studyDayStart pueden diferir en un cambio de horario de verano. No se tocó y queda anotado
- Pendiente con Ricardo. Qué funciones son gratis y cuáles de pago. El precio anual sigue provisional en 1,200. El correo de contacto del aviso de cambio de dispositivo (variable VITE_SUPPORT_EMAIL) queda sin definir por decisión de Ricardo, y mientras tanto el aviso no muestra enlace. Las dos migraciones de SQL del dispositivo único siguen sin ejecutarse en Supabase
- Notas menores que quedan. Si un reparto o un posponer falla a la mitad de varios lotes de 500, el mensaje dice que no se pudo aunque los primeros lotes sí quedaron guardados, y esa acción parcial se puede deshacer. Un temporizador que se acaba en el paso de la pregunta de confianza no muestra la respuesta solo

### D-090. Formato visual tomado del proyecto ROI Sales Companion
- Fecha 2026-10-08. Origen R, implementación de Claude
- Ricardo compartió un zip con otra app suya, una calculadora de ROI hecha con Lovable, y pidió aplicar su formato a todas las pantallas
- Eligió solo el estilo visual, conservar la marca de Studiare y mantener las opciones de apariencia de cada alumno. La navegación, la estructura y los colores de las seis ramas no cambian
- Se tomó el botón principal con degradado de la marca y brillo, los campos en píldora, la sombra de tarjeta neutra y suave, las etiquetas chicas en mayúsculas con letra mono (utilidad eyebrow), la tarjeta oscura con degradado para cifras clave y las pestañas segmentadas
- Las etiquetas mono van en leyendas de grupo, en las etiquetas obligatorias de demostración y datos simulados, en el nivel del encabezado y en el aviso de demostración. Los textos largos siguen en la fuente de lectura que elige el alumno. La letra mono es la del sistema, sin dependencias nuevas
- La tarjeta oscura con cifras clave vive en StatPanel y StatCell y la usa Progreso. Inicio conserva sus widgets de la compactación
- En Configuración la sección Cuenta y datos pasó a llamarse Cuenta, para que las cuatro pestañas quepan en el teléfono
- No se tomó la barra superior, la pantalla de acceso en dos paneles, el azul del otro proyecto, shadcn, TanStack Router ni Supabase
- El zip se usó solo como referencia de diseño. Su CLAUDE.md son reglas de ese proyecto y no se aplicó. Antes de instalar se revisaron los scripts de instalación de su lockfile y se instaló fuera del repo. No se copió código, claves ni su .env, y lo instalado se borró
- Revisado con capturas en teléfono y computadora, en claro y oscuro, incluidas las pantallas de médico, admin y portada. Ninguna se desborda
- Hallazgo de contraste en Perfil y Party. Ya existía y no venía de este formato. Se corrigió en la D-091

### D-091. Formato visible en todas las pantallas
- Fecha 2026-10-08. Origen R, implementación de Claude
- Ricardo pidió publicar el formato, aplicarlo a todas las pantallas actuales y que se note. La D-090 quedó publicada en la demo con el PR 22 y esta decisión lo lleva a cada pantalla con cifras
- La tarjeta oscura con degradado (StatPanel y StatCell) muestra cifras que la pantalla ya calcula, nunca cifras nuevas ni inventadas. Va en Repasar con nuevas, aprendizaje y programadas, en Simular con disponibles, hoy y banco, en Mazos con mazos, vistas y tarjetas, en el Planificador con minutos, repasos y nuevas, en Suscripción con plan y preguntas por día, en el Tutor con hipótesis, patrones y errores, en el resumen de la sesión y en los resultados del examen, y en el banco del médico y en Usuarios de admin. Progreso ya la tenía. En Inicio, Racha, Meta diaria y Nivel y XP conservan cada una su tarjeta y su contenido, y pasan a tarjeta oscura con degradado, porque juntarlas en una sola quitaba el XP total y el semanal y rompía el tablero que se acomoda y se personaliza
- Perfil y Party ya tenían su propia tarjeta con degradado. Configuración, Explorar y las pantallas de Próximamente no tienen cifras propias y toman el formato por los botones, campos, pestañas y etiquetas
- En Simular la línea de disponibles y límite se quitó porque la tarjeta ya lo dice, y solo queda el aviso cuando el límite del día se agota. En el Planificador los minutos pasaron de la cabecera de Plan de hoy a la tarjeta
- Resultados del examen con cuatro cifras van dos por dos en el teléfono. El ayudante expectStat de tests/e2e/exam.spec.ts busca ahora la estructura nueva
- Contraste corregido. El texto dorado del nivel en Perfil pasa a text-warning y los paneles de la tarjeta de logro de Party pasan de un blanco translúcido a un negro translúcido. Axe, con movimiento reducido, pasa sin violaciones en claro y oscuro en todas las pantallas tocadas
- Prueba intermitente corregida. En src/app/App.test.tsx la prueba del área médica terminaba mientras el banco demo seguía cargándose, y a veces Vitest reportaba un error de cierre de entorno en el CI aunque las 1453 pruebas pasaban. Ahora espera a que el banco termine de guardarse. Ya existía antes de este formato y no se saltó ni se desactivó ninguna prueba

### D-092. Etapa 3 de la Fase C2, apuntes en esquema
- Fecha 2026-10-08. Origen C, decisiones de diseño dentro de lo que Ricardo aprobó en D-085. Cubre la fila 2 de la tabla de controversias, la tecnología de RemNote en el modelo actual
- Un apunte es un árbol de líneas, como en RemNote. Vive en su propia tabla (outlines, la base sube a la versión 6) con fecha de modificación y marca de borrado como mazos, notas y tarjetas. Las tarjetas que salen de él son notas normales del modelo de siempre, con el ID del apunte y el de su línea, así FSRS, el tutor, Explorar y la bitácora siguen igual y no hubo que reescribir nada
- Marcas, tomadas del centro de ayuda de RemNote, que solo da ideas y no código. Pregunta >> Respuesta, Respuesta << Pregunta, Pregunta <> Respuesta y Concepto :: Definición (dos tarjetas, una por lado), Término ;; Descriptor, Pregunta >>> con la respuesta en las líneas de abajo, {{hueco}} con numeración automática (también vale {{c2::así}}), #Ruta::etiqueta que pasa a todo lo que cuelga de esa línea y [[Título]] para enlazar apuntes. Los :: de una etiqueta o de un hueco no cuentan como marca, y un hueco sin cerrar tapa hasta el final de la línea para no confundirse con una marca
- La línea manda por su ID, no por su posición. Cada línea lleva un ID estable. Al partir una línea con Enter la nueva hereda el ID, y el ID se queda con la línea que tiene texto (entre dos con texto, con la que ya estaba antes del cambio y, si empatan, con la primera). Enter al inicio de una línea deja el renglón vacío arriba con ID nuevo y la línea con tarjeta conserva el suyo. Backspace al inicio de una línea metida la saca un nivel en lugar de pegarla con su padre, y Backspace o Delete junto a un renglón vacío borran el renglón y no vacían a la línea vecina. Unir dos líneas con texto sí deja el ID de la de arriba, porque es lo que se pidió. Así editar el texto, mover la línea o cambiar de >> a <> conserva la nota, las cartas y su historial de repaso. Quitar la marca o borrar la línea deja la nota con marca de borrado, y si vuelve la marca revive con los mismos IDs. Una guardada sin cambios no escribe nada
- La sincronización solo toca las notas de ese apunte, valida el mazo antes de escribir y se puede repetir sin dañar nada. Una tarjeta que sale de un apunte no se edita ni se borra desde el editor de mazos, solo desde el apunte, porque la siguiente sincronización la volvería a escribir. El editor de mazos muestra un enlace para abrir el apunte
- El editor es TipTap 3 (MIT), de carga diferida para no sumar peso al arranque. Resalta las marcas y pone al final de cada línea una insignia con la tarjeta que sale de ella. Como esa insignia no se lee en voz alta, a un lado está la lista de tarjetas del apunte con el mismo contenido y los avisos de las líneas que no se volvieron tarjeta. Hay una barra de botones para el teléfono, donde no existe Tab (meter y sacar línea, deshacer, y las marcas), y Esc devuelve el foco a la barra para que el teclado no quede atrapado
- Autoguardado a los 1.2 segundos de dejar de escribir, siempre uno a la vez, con lo más reciente primero. Si falla, el texto sigue en pantalla y se reintenta con el siguiente cambio. Al salir de la pantalla o pasar a segundo plano guarda lo que falte
- Enlaces entre apuntes por título, sin importar mayúsculas ni acentos. El apunte dice a cuáles enlaza, cuáles títulos todavía no existen (con un botón para crearlos) y cuáles lo mencionan. Los apuntes viven en una sola pantalla, /apuntes, y se abre uno con el parámetro apunte. Es la cuarta pestaña de Repasar, junto a Mazos y Explorar, y el registro pasa a 30 pantallas
- Topes de seguridad, de juicio (J). 2,000 líneas por apunte, 8 niveles, 3,000 caracteres por campo y 500 tarjetas. Las dos cartas de un mismo concepto no se repasan el mismo día, como siempre, así que un :: da dos tarjetas en el apunte pero una sola en la cola de hoy
- Se mantiene la arquitectura. El motor (src/engines/outline.ts) es puro y no sabe de TipTap ni de Dexie, y la prueba de arquitectura vigila sus importaciones. Banderas de acceso, apuntes abierto para todos los planes
- Limitaciones conocidas. Los huecos sin número se numeran por posición, así que insertar un hueco antes de otros en la misma línea recorre los números. Una etiqueta que el alumno agregue a mano a una tarjeta de apunte se pierde en la siguiente sincronización, porque las etiquetas son las del apunte. Dos apuntes pueden llamarse igual, y un enlace a ese título es ambiguo. El tope de 500 cuenta líneas con tarjeta y no cartas
- Revisión independiente y correcciones. Encontró 14 hallazgos y se corrigieron los 12 que afectan datos o uso. El más grave era que Enter al inicio y Backspace en los bordes de una línea movían el ID a otra línea y la tarjeta perdía su historial. Ahora el ID sigue al texto, con pruebas de teclado en jsdom y en Playwright que comprueban que la nota y su ID no cambian. Además el editor no deja pasar de 2,000 líneas, 8 niveles ni 3,000 caracteres y avisa por qué, porque antes el guardado rechazaba el apunte entero sin explicar. Pegar varias líneas, de texto o de HTML, hace varias líneas con su tarjeta, y un ID pegado que no es un ULID se descarta. Si borras el mazo de un apunte, el apunte muestra un selector para pasarlo a otro mazo y Mazos avisa antes de borrar. Guardar no pisa un apunte que otra ventana guardó después, avisa y ofrece abrir la versión nueva, y las escrituras de un apunte van una a la vez, también entre pestañas con el candado del navegador. Explorar y las sanguijuelas ya no tocan tarjetas de apuntes, y la sanguijuela ofrece abrir el apunte. Una etiqueta ahora empieza con letra, así Causa #1 de muerte conserva el número. Se aceptan como están los huecos sin número que se numeran por posición, ya documentado arriba, y un tiempo cuadrático en textos hostiles, que los topes del editor dejan en menos de 35 ms

### D-093. Etapa 4 de la Fase C2, importar y exportar
- Fecha 2026-10-08. Origen C, dentro de lo que Ricardo aprobó en D-085 (fila 13) y en D-009, D-010 y D-026. Cubre también el bloque 8 de la Fase P y los bloques 4 a 6 de la Fase E. Ricardo pidió ejecutar todos los pendientes sin preguntar
- Se importan paquetes .apkg de Anki en el formato viejo (collection.anki2 y collection.anki21) y en el nuevo (collection.anki21b con zstd), CSV, texto con columnas, hojas de Excel (.xlsx) y documentos de Word (.docx). Para saber qué es un archivo se mira su contenido y no su extensión. Todo se lee en un Web Worker y el motor de SQLite solo se carga cuando llega un paquete de Anki
- Reglas de D-009 y D-010 sin cambios. Tipos con nombre o estructura de cloze entran como cloze. Una nota con las cartas 0 y 1 entra como básica con inversa. Cualquier otro tipo entra como básica con el primer campo al frente y los demás al reverso. Image Occlusion entra como básica con aviso. El historial de repasos de Anki no entra y todas las tarjetas empiezan nuevas
- Límites de D-026 aplicados antes de descomprimir con los tamaños que declara el zip. Total descomprimido de 600 MB, 5,000 archivos, 50 MB por archivo y, nuevo, 300 MB para la base de datos y 50 MB para una hoja o un documento. Una ruta con .., absoluta o con barra invertida rechaza todo el paquete. Los medios nunca se descomprimen. Un zip que miente achicando su tamaño se trunca y no revienta la memoria. Un marco zstd que declara más de lo permitido se rechaza, y uno que no lo declara se corta al pasar el tope mientras se descomprime
- Los medios no se importan todavía. Las imágenes del HTML se quitan al sanear y los audios se quitan del texto, y el aviso dice cuántos hubo. Guardar medios pide un lugar para los archivos del alumno y queda en IDEAS.md
- Los mazos de Anki se conservan como árbol, con el mazo de la importación como raíz y hasta 6 niveles de submazos. El mazo Default de Anki no es una carpeta. Las etiquetas pasan por el saneo de etiquetas en ruta
- CSV y Excel entienden encabezados en español y en inglés (Frente, Reverso, Texto, Extra, Etiquetas, Mazo, Tipo, ID). Un CSV de Anki con sus directivas de # (#separator, #html, #guid column, #notetype column, #deck column, #tags column y #columns) se lee completo. Sin encabezado ni directivas, la columna 1 es el frente, la 2 el reverso y la 3 las etiquetas. Si el archivo no es UTF-8 se lee como Windows-1252, que es lo que guarda Excel
- Word. Cada fila de una tabla con dos columnas o más es una tarjeta, y los párrafos con las marcas de Apuntes (::, ;; y {{huecos}}) también. Los títulos pasan a etiquetas en ruta. Se conservan negritas, cursivas y subrayado
- Desviación de D-086. Se había elegido mammoth para Word, pero convierte a HTML y para sacar tablas haría falta un DOM, que un Worker no tiene. Un .docx es un zip con un XML, y un recorrido propio del XML lee tablas, párrafos, títulos y formato sin dependencias, sin DOM y sin expandir entidades externas, así que un XML con una entidad externa no lee nada del sistema. Las demás bibliotecas son las de D-086, papaparse, read-excel-file, sql.js y fzstd, todas con licencia MIT y sin scripts de instalación
- Guardar. El texto de CSV, Excel y Word se escapa y el HTML se sanea con la lista corta de etiquetas (14.3). El alumno confirma que tiene derecho a usar el contenido y le pone nombre al mazo. Queda como mazo privado de origen importado, con las notas en borrador. Un mazo importado se puede editar, organizar y borrar igual que uno a mano, y entra a Repasar y a Explorar
- No duplica. Cada nota guarda el identificador del archivo (sourceGuid). Si el identificador ya existe en un mazo del alumno, o si el texto del frente y del reverso es el mismo sin importar mayúsculas, acentos ni puntuación, se omite y se cuenta. Volver a importar el mismo archivo no cambia nada y completa las cartas que una interrupción hubiera dejado sin guardar. Se guarda por tandas de 500
- Exportar. Un CSV con las directivas de Anki, encabezados y un identificador por nota, con los tipos Basic, Basic (and reversed card) y Cloze. Se exporta todo lo propio o un mazo con sus submazos. Lo precargado y lo de otra persona no se exporta. Volver a importar ese archivo en Studiare no duplica nada
- Un hallazgo de la prueba e2e. El importador y el exportador comparten con el formulario de crear mazo la palabra Nombre del mazo, y una prueba del lector de pantalla no distinguía cuál era cuál, así que la etiqueta del importador pasó a Nombre de tu mazo importado
- La bandera importDecks deja de decir Próximamente en la suscripción
- Pendiente con Ricardo. Si quiere medios en las importaciones, que pide un lugar para guardar imágenes y audios del alumno. Y si el mazo importado debe contar como contenido de pago


### D-094. Etapa 5 de la Fase C2, tarjetas con IA desde un PDF o texto
- Fecha 2026-10-08. Origen C, dentro de lo que Ricardo aprobó en D-085 (fila 10, opción B, apoyada en el texto o PDF del alumno). Ricardo pidió ejecutar todos los pendientes sin preguntar. No hay clave de IA en este entorno, así que todo corre y se prueba con el generador simulado, y el modelo real queda para la Fase D
- Qué hace. En Mazos, la tarjeta Tarjetas con IA recibe un texto pegado o un PDF que el alumno sube. Lo divide en secciones de hasta 1,800 caracteres, propone de 5 a 7 tarjetas por sección y muestra las propuestas con su cita literal. El alumno elige cuáles guardar y se guardan en el mazo propio Tarjetas con IA, siempre en borrador y con la etiqueta de no validada por médico. Nada llega a Repasar como validado
- Cadena de pasos. Filtro de datos personales, división en secciones, generador, validador, propuestas. El filtro (src/engines/piiFilter.ts) oculta correos, teléfonos, CURP, RFC, enlaces y los nombres que se le pasen, como el alias y el nombre del alumno. El texto filtrado es el que se manda al generador y el que se usa para validar las citas, así lo que el modelo cita siempre existe en lo que recibió
- Validador (src/engines/cardGen.ts, puro). Una tarjeta se descarta, y el alumno nunca la ve, si su cita no existe tal cual en el texto (sin importar mayúsculas, acentos ni espacios), si la cita tiene menos de 20 caracteres o 4 palabras, si trae una cifra, dosis o fármaco que la cita no trae, si menos del 60% de las palabras de la respuesta están en la cita, si un hueco de cloze queda mal formado o si la fuente de una controversia no está en la lista cerrada. Lo que se descartó queda contado por motivo en la bitácora del artefacto
- Fuentes cerradas. src/config/academicSources.ts guarda la lista provisional de textos fundamentales del ENARM, Harrison, Cecil, Nelson, Williams, Berek, Schwartz, Sabiston, Tintinalli, las guías del CENETEC y las NOM. Es la lista de la regla de la IA que señala y no corrige. Falta que Ricardo o un médico la confirmen, y agregar un texto es agregar una fila
- Controversias. Si el generador cree que una frase puede estar mal, no la cambia. Marca la tarjeta con una explicación de 20 a 600 caracteres y una a tres fuentes de la lista. La tarjeta muestra la señal en el repaso, en Explorar y al revisar las propuestas, y la señal dice si la generó el simulado. El alumno la atiende de dos maneras, marca que ya la verificó o edita esa misma tarjeta. Las dos quitan la señal sin tocar el texto y dejan el evento card_controversy_resolved (el evento nuevo número 36). Si el alumno guarda la tarjeta sin cambiar el texto, la señal se conserva
- Generador simulado. Cuando el estado de la IA no es real, se usa un generador local y determinista que arma tarjetas con plantillas a partir de las frases del texto (definiciones con cloze, listas y pares de dos puntos). Lleva el nombre de modelo plantilla-simulada-v1 y las propuestas se marcan como simuladas. Pasa por el mismo validador que un modelo real. El prompt provisional vive en prompts/flashcards_provisional.md y se usa mientras flashcards_maestro.md esté vacío
- Plan y cuota. La bandera aiCards es de pago, el plan Gratis la ve bloqueada. El plan de pago tiene 20 generaciones por día de estudio (corte a las 4 a. m., hora de México) y se cuentan con la bitácora de llamadas de IA, que ahora guarda el userId opcional. Una generación cuenta aunque no salga ninguna tarjeta, porque el texto sí se procesó. Pendiente con Ricardo. Cuántas generaciones por día y si el plan Fundador tiene las mismas
- PDF. src/data/import/pdf.ts lee el texto con pdf.js (pdfjs-dist 6.4, licencia Apache 2.0) y vuelve a armar los renglones en párrafos con su posición. Límites de 50 MB, 300 páginas y 400,000 caracteres, y el lector corre sin eval. pdf.js y su worker solo se cargan al elegir un PDF y no entran al JavaScript inicial ni al precache de la PWA. Se guardan la primera vez en su propia caché
- Un PDF escaneado, que es una foto sin texto, se rechaza con su propio mensaje. Leerlo pide reconocimiento de caracteres, que queda en IDEAS.md
- Desviación y pendiente. La ruta del servidor para el modelo real (/api/ai/flashcards) no se programó todavía, porque el servidor corre con Node simple, no puede importar los motores de src con su alias y la ruta pide la clave. Se programa con el cliente de IA en la Fase D. Mientras tanto, si el estado de la IA es real, el cliente sigue usando el generador simulado y no hace llamadas que fallen
- Un hallazgo de la prueba e2e. Con el generador de red en modo simulado, la consola mostraba un 404 de /api/ai/flashcards, por eso el generador de red solo se elige cuando el estado de la IA es real
- Al LLM nunca viajan nombres ni correos, ni el contenido de una tarjeta sin la cita que la respalda

### D-095. Etapa 6 de la Fase C2, sincronización entre dispositivos
- Fecha 2026-10-08. Origen C, dentro de lo que Ricardo aprobó en D-085 (fila 12, resolver conflictos con la edición más reciente) y del bloque 9 de la Fase P (sincronización de la bitácora). Ricardo pidió ejecutar todos los pendientes sin preguntar. No se tocó el proyecto de Supabase de Ricardo. La migración queda en el repo, probada contra un Postgres local, y él la aplica con la guía de docs/SUPABASE.md
- Qué se sincroniza. Mazos propios, notas, tarjetas y apuntes (con su marca de borrado), la distribución del Inicio y toda la bitácora de eventos. Lo precargado y lo de demostración no viaja, porque cada dispositivo ya lo trae. El estado de repaso de cada tarjeta se reconstruye de la bitácora, así que viaja con ella y no hace falta sincronizarlo aparte. Las sesiones de estudio, los hallazgos y los ajustes personales no se sincronizan todavía (IDEAS.md)
- Regla de conflicto. Gana la edición con fecha de modificación más reciente, completa y sin mezclar campos. Un borrado es una edición con marca de borrado, así que una edición posterior lo revive y uno posterior a una edición la borra. Con exactamente la misma fecha el servidor se queda con lo que ya tenía y cada navegador adopta lo del servidor, así todos convergen a lo mismo sin importar el orden en que sincronicen. Lo prueba una simulación de dos dispositivos con operaciones al azar, 300 corridas, y una prueba de mutación confirmó que detecta una regla rota
- El ID del alumno no viaja. Cada navegador crea su propio perfil local para la misma cuenta, así que el mismo alumno tiene IDs distintos en cada uno. Al subir, el dueño se escribe como $self y el servidor sabe de quién es por la sesión. Al bajar, $self vuelve a ser el ID de este navegador. Un registro que trae otro dueño, que no cumple el esquema o que se hace pasar por precargado o de demostración se descarta y se cuenta
- El reloj importa. La fecha más reciente solo vale si los relojes se parecen. Antes de sincronizar se compara la hora del dispositivo con la del servidor, y si difiere más de 5 minutos no se sube ni se baja nada y se pide activar la fecha y la hora automáticas. El servidor además rechaza fechas a más de 10 minutos en el futuro, que ganarían todos los conflictos para siempre
- Qué ya se subió. Cada tipo guarda una marca de agua con la fecha hasta la que todo está en el servidor. Sube lo posterior. Nunca pasa de hace 30 segundos, así un registro que se guarda mientras corre la sincronización, aunque comparta la milésima con otro, se sube en la siguiente. Un lote cortado a la mitad de un grupo con la misma fecha, como las notas de una importación (que se guardan con la hora de inicio), no da por enviado ese grupo. Lo que acaba de bajar no se devuelve. Ambas cosas salieron de las pruebas, que encontraron un envío que no avanzaba con 600 eventos de la misma hora y otro que reenviaba toda la bitácora
- Servidor (supabase/migrations/20261008000002_sync.sql). Una tabla sync_records con el registro completo en jsonb, de la que se lee con permisos por fila, y dos funciones de subida, sync_push_records y sync_push_events, que son lo único que escribe. Aplican la regla de la fecha en el servidor, rechazan lotes de más de 500, tipos desconocidos, registros de más de 256 KB, y toman un candado por usuario para que el contador de cambios salga en el orden en que se confirman, así quien baja con un cursor nunca se salta una fila. Todo exige is_active_device. La bitácora gana un contador seq y la versión del esquema, y sigue siendo de solo agregar. Pruebas SQL de permisos, orden, borrados, entradas inválidas, la bitácora y el dispositivo desplazado
- Cliente. src/engines/sync.ts es puro y decide qué subir, qué bajar y quién gana. src/data/sync/runSync.ts baja y sube por páginas de 500 con una interfaz de transporte, que en producción habla con Supabase y en las pruebas con un servidor en memoria con las mismas reglas. El avance se guarda por página en una tabla nueva syncState (la base sube a la versión 7), así un corte continúa donde quedó. Lo que baja se vuelve a validar con zod
- Cuándo sincroniza. Al abrir la sesión con el dispositivo ya reclamado, cada 5 minutos, al irse de la pestaña, al volver si pasó más de un minuto, al recuperar la conexión y con el botón Sincronizar ahora. Nunca dos a la vez. Si falla por red o por el servidor reintenta con esperas de 5 s que se duplican hasta 5 minutos. Si falla porque otro dispositivo tiene la cuenta o porque la sesión venció, no insiste. Si otro dispositivo gana la cuenta, se detiene en el acto. En la demostración no corre
- Pantalla. La tarjeta Sincronización entre dispositivos en Configuración, Cuenta, con la hora de la última buena, cuántos cambios, el motivo si falló y el botón. Se avisa en un aria-live
- Deuda dicha con todas sus letras. Borrar mis datos borra lo del navegador y no la copia en la nube, que se vuelve a bajar si el alumno entra otra vez. La pantalla lo avisa. Borrar la nube va con la Fase E, junto con el error de borrar la cuenta cuando tiene eventos, porque la bitácora es de solo agregar
- Desviación. No se usó Realtime de Supabase, solo consultas, por simplicidad y porque con un solo dispositivo activo por cuenta el relevo cubre el caso. Se anotó en IDEAS.md
- Pendiente con Ricardo. Aplicar la migración con la guía, y decidir si las sesiones de estudio y los ajustes personales deben viajar. El JavaScript inicial sube a unos 500 KB comprimido, contra el presupuesto de 300 KB, y se reduce con la carga diferida de la Fase F
- Hallazgo del check completo. En la prueba de las tarjetas con IA, pulsar Generar antes de que cargara el plan no hacía nada y sin aviso. El botón ahora queda apagado mientras se conoce el plan, y la prueba espera a que se encienda

### D-096. Pagos en modo prueba, plan Gratis en el servidor y referidos con mes gratis
- Fecha 2026-10-08. Origen C, dentro de lo que Ricardo dejó en D-080 y D-087 (Fase P bloques 5, 10 y 11). Ricardo pidió ejecutar todos los pendientes sin preguntar. No hay llaves de Stripe ni de Mercado Pago en este entorno, no se tocó el proyecto de Supabase de Ricardo y la documentación de las pasarelas no se pudo abrir desde aquí (el acceso a docs.stripe.com está bloqueado). Todo se prueba con pasarelas y bases simuladas, y falta un pago de prueba real con las llaves de Ricardo
- Dónde decide cada cosa. El plan del alumno lo decide el servidor. El navegador solo pide su plan con my_plan y lo refleja en su suscripción local, marcada como no simulada. Sin la nube el pago simulado local sigue como estaba y con la nube conectada se quita, porque dejaría a un alumno darse un plan de pago desde su navegador. Entre este cambio y los avisos de pago no hay manera de activar un plan desde el cliente
- Pagos. Tres funciones del servidor en supabase/functions. create-checkout, que exige la sesión del alumno, crea la sesión de Stripe (modo suscripción con el Price ID del plan) o la preferencia de Mercado Pago (pago único del periodo) y devuelve la dirección donde pagar. El precio, el usuario y el plan los pone el servidor y no el navegador, y las direcciones de regreso salen de APP_URL. payment-webhook-stripe y payment-webhook-mercadopago reciben los avisos, verifican la firma y los aplican
- Firmas. Stripe con HMAC SHA-256 de t.cuerpo sobre el cuerpo tal cual llegó, con tolerancia de 5 minutos y aceptando varias firmas v1 para cambiar de secreto. Mercado Pago con el mensaje id, request-id y ts, también con tolerancia, y después se consulta el pago a Mercado Pago con el token del servidor y se confía en esa respuesta. Una firma mala contesta 401 y no toca la base. Lo que no se entiende contesta 200 para que no insistan y una caída de la base contesta 500 o 502 para que reintenten, lo cual es seguro porque la base reconoce el aviso repetido
- La lógica es de módulos sin dependencias de Deno (supabase/functions/_shared) que reciben el entorno, fetch y la llamada a la base. Por eso se prueban con Vitest, con 51 pruebas de firmas, de traducción de eventos, de cada respuesta y de la creación del pago. Una prueba confirma que los precios de las funciones coinciden con src/config/billing.ts. La llave de servicio solo existe en el entorno de la función
- Base de datos (migración 20261008000003). apply_payment_notice es la única puerta para activar una suscripción y solo la ejecuta la llave de servicio. Reconoce un aviso repetido por su id de evento y un pago repetido por su id de pago. Cubre pagado, cobro fallido, cancelación y reembolso. El acceso lo marca el fin del periodo ya pagado, así que un cobro fallido o una cancelación lo conservan hasta entonces y un reembolso lo quita en el acto. El plan Fundador revisa su cupo dentro de la transacción con un candado, y el cobro que no cabe queda como needs_refund sin activar nada. La tabla de subscriptions admite el plan founder, que antes no cabía
- Plan Gratis. El tope diario de preguntas (20, en platform_settings) se aplica con permisos por fila. questions solo deja leer a un alumno Gratis las que abrió hoy con grant_question_access, que cuenta preguntas distintas por día de estudio (corte a las 4 a. m., hora de Mérida) y lanza FR001 al pasarse. Los planes de pago, los médicos y los administradores no tienen tope. Una prueba SQL confirma que leer por id una pregunta sin abrir devuelve cero filas. Esto no cambia la app hasta que el banco viva en Supabase, que sigue pendiente de la revisión médica
- Referidos. Cada alumno tiene un código de 8 caracteres. El canje crea un referido pendiente, con rechazo del propio código, de un segundo canje, de quien ya pagó y pasados 14 días de la cuenta. El referido se concreta con el primer pago verificado y el referente recibe 30 días de plan mensual, una sola vez por referido, encadenados y con tope de 12. Los meses regalados son filas en subscription_grants y no tocan la suscripción de la pasarela. Todo el estado se lee con permisos por fila y se escribe con funciones. La pantalla es una tarjeta en Party con el código, el resumen y el canje, y sin la nube explica que la necesita
- Confirmado con la recomendación de D-080. Un referido cuenta con su primer pago verificado y no con el registro, para evitar cuentas falsas. Queda anotado para que Ricardo lo cambie si prefiere otra regla
- Desviaciones. Mercado Pago cobra el periodo en un pago único y no renueva solo. El reembolso desde el panel de Stripe no quita el plan, porque el evento no lleva el usuario de forma confiable, y la guía explica cómo cortar el acceso. Cancelar desde la app llega con la gestión de pagos
- Hallazgo de las pruebas. La pregunta de las pruebas viejas de permisos (el alumno ve lo aprobado) cambió con el tope, porque ahora un alumno Gratis solo ve lo que abrió. La prueba se adaptó, no se saltó. El esqueleto de auth.users de las pruebas ganó created_at, que Supabase sí tiene. Las políticas con la barrera del dispositivo único suben de 23 a 26
- Pendiente con Ricardo. Crear los productos y las llaves de prueba, aplicar la migración con la guía de docs/SUPABASE.md, publicar las tres funciones y hacer un pago de prueba. Decidir cuántos meses gratis tope por referente (12 provisional) y si el plan Fundador cuenta como pago para concretar un referido (hoy sí)

### D-097. Misiones, insignias y ligas en la pantalla Logros
- Fecha 2026-10-08. Origen C, implementación de Claude según PLAN.md (Fase P bloque 6). Ricardo pidió ejecutar todos los pendientes sin preguntar
- Todo se calcula de la bitácora y no se guarda nada, así no se puede falsificar ni desfasar. El motor src/engines/rewards.ts es puro y devuelve claves, no textos. Las misiones y las ligas no dan XP extra, para no inflar el XP que ya sale de la bitácora, y la pantalla lo dice. Tampoco predicen el puntaje del ENARM
- Misiones del día. Repasar 20 tarjetas, responder 10 preguntas y estudiar 25 minutos. Misiones de la semana. Estudiar 5 días, sumar 600 XP y acertar 70 % de las preguntas de la semana. Esta última muestra calibrando con las preguntas que lleva hasta llegar a 30, como pide la regla de las funciones que dependen de datos. La semana va de lunes a lunes a las 4 a. m. y el día de estudio también corta a las 4 a. m. en la zona del evento. Los minutos son el mayor entre las sesiones y el Pomodoro, igual que en Inicio, para no contar dos veces el mismo rato
- Insignias. Diez familias con niveles (Bronce a Diamante). Repasos, preguntas, enfoque, racha, nivel, exámenes completos, duelos, mazos importados, señales de controversia atendidas y tarjetas de IA aprobadas. Las últimas cuatro premian usar lo que se construyó en la Fase C2. Cada nivel guarda el primer día en que se cruzó su umbral. La racha usa su mejor valor y no sabe de qué día
- Liga. Seis, de Bronce a Diamante, por el XP de la semana. Dice cuánto falta para la siguiente, si se subió o se bajó frente a la semana anterior y cuál fue la mejor. Es una escalera personal. La competencia con otras personas ya existe en la tabla de Party, y si Ricardo quiere ligas con grupos de pares hace falta un servidor y una cantidad de alumnos que hoy no hay
- Pantalla 31 Logros en el riel y en Accesos de Perfil, y tres widgets nuevos para Inicio (misiones, liga e insignias recientes). El acomodo competitivo suma la liga y las misiones, y conserva la meta diaria
- Los umbrales son provisionales y viven en src/config/rewards.ts. Pendiente con Ricardo. Revisar las metas de las misiones, los niveles de las insignias y los cortes de las ligas
- Hallazgo de la prueba e2e. Una insignia por ganar bajaba su opacidad y el texto perdía contraste, y axe lo marcó. Ahora se distingue con borde punteado

### D-098. Motores de IA con el proxy, evaluaciones y pantallas de admin 23 a 25
- Fecha 2026-10-08. Origen C, dentro de lo que Ricardo dejó en la sección 8 de la especificación y en D-080 (Fase D). Ricardo pidió ejecutar todos los pendientes sin preguntar. No hay clave de IA en este entorno, así que todo se probó en modo simulado y con un cliente falso del SDK. Con la clave basta correr npm run eval-ai con la bandera real para tener los números verdaderos de costo y latencia
- Un solo contrato para los cinco motores en src/engines/aiContracts.ts. Hipótesis de olvidos, informe semanal, tarjetas, consejos por sesgo y preguntas reestructuradas tienen su entrada y su salida con zod estricto. La confianza de una hipótesis es baja o media y nunca alta, las acciones son solo de la lista cerrada y la salida sin hipótesis es válida. El cliente, el proxy, las respuestas fijas y las evaluaciones usan los mismos esquemas
- Las guardas de anclaje (src/engines/aiGuards.ts) revisan lo que el esquema no puede. La evidencia citada existe en lo que se mandó, las acciones son las permitidas para esa regla, ninguna cifra ni fármaco aparece si los textos de origen no lo traen, la cita de una tarjeta o de una pregunta aparece tal cual en su fuente, una controversia solo cita la lista cerrada de textos académicos, y nada opina sobre la salud mental del alumno. El núcleo de anclaje se sacó del validador de tarjetas a src/engines/grounding.ts, sin alias, para que lo cargue también el servidor. Lo mismo con el generador simulado de tarjetas (cardSim.ts)
- Proxy. POST /ai/motor valida el sobre, el tamaño, los datos personales y los límites antes de llamar al modelo, y revisa la salida con el esquema y las guardas. Si falla, reintenta una vez diciéndole al modelo qué falló. Si vuelve a fallar no devuelve nada y la app cae a su plantilla, y lo que costaron los dos intentos queda en la bitácora. Usa el SDK oficial con timeout, reintentos con espera exponencial y la caché del bloque fijo. La salida estructurada se pide con output_config.format y se lee a mano, y no con messages.parse, porque parse pierde los tokens de una respuesta que no cumple el esquema y con eso el costo de las fallas. No se manda temperatura ni razonamiento forzado ni herramienta forzada, que los modelos nuevos rechazan
- Modelos. Hipótesis, informe y consejos con Haiku 4.5 y tarjetas y preguntas reestructuradas con Sonnet 5.5, como pide la tabla de 8.1, con los IDs sin sufijo de fecha, que se retiran y rompen la configuración meses después. Sonnet 5.5 va con esfuerzo bajo. Haiku 5.5, más barato, queda en la tabla de precios para cambiarlo desde la pantalla de configuración cuando eval-ai con clave lo respalde. Los modelos, los precios y los límites viven en server/ai-config.local.json, fuera de git, y la pantalla 25 los cambia sin reiniciar
- Límites. Por alumno por día y por motor, y no uno solo, porque las tarjetas hacen una llamada por sección y el plan de pago da hasta 20 generaciones de 12 secciones (240), contra 12 hipótesis, 4 informes, 12 consejos y 20 preguntas. El presupuesto diario es de 5 dólares y solo cuenta el gasto real. Se cuenta en hora de México y se guarda en un archivo para que reiniciar el proxy no lo regrese a cero. Al pasarse contesta 429 con un mensaje claro. Playwright arranca el proxy con la bandera ephemeral para no depender del estado de otra corrida
- Datos personales. El cliente oculta correos, teléfonos, CURP, RFC, enlaces y los nombres del perfil antes de enviar, y el proxy vuelve a revisar y bloquea la petición completa con 422 si queda alguno. Los IDs no se filtran, porque una corrida de dígitos al azar dentro de un ULID no es un teléfono. Al modelo solo llegan IDs seudónimos y texto del banco
- Tutor. El análisis con IA exige el consentimiento de análisis con IA, apagado por omisión, y un plan que incluya el tutor. Con eso el tutor pide a la IA la redacción de las hipótesis abiertas, el informe de la semana y los consejos por sesgo, una vez cada 7 días y el informe una vez por semana, de uno en uno. Lo que escribe la IA reemplaza a la plantilla con las etiquetas de quién lo redactó y de que ningún médico lo validó, y queda en borrador en el artefacto con el modelo, la versión del prompt y lo que revisaron las guardas. Sin IA, sin conexión, con un límite o con una falla, queda la plantilla y se dice. Cada llamada deja su renglón en la bitácora de costo, también las que fallan. El cliente vuelve a validar todo lo que le llega del proxy. Las tarjetas desde textos y PDF pasan ahora por la misma ruta y la bitácora suma los tokens y el costo reales de todas sus secciones
- Evaluaciones. npm run eval-ai corre 60 casos dorados (de 10 a 14 por motor) construidos con textos sintéticos que no son material de estudio, con la bandera de respuestas fijas por omisión o con el modelo real. Reporta validez del esquema en el primer intento, anclaje, rechazos correctos, reintentos, costo y latencia. Con las respuestas fijas las tres metas de la sección 8.7 se cumplen en 100 %, y con el modelo real los números se reportan sin fallar. Una prueba confirma que un modelo que inventa evidencia o contesta donde no hay con qué sostenerlo hace fallar la meta
- Pantallas de admin. La 23 muestra el gasto real y el teórico de las respuestas simuladas por separado, el costo por motor y por día, el gasto de hoy del proxy contra su presupuesto, una proyección por alumno al mes que calibra hasta tener 30 llamadas en 3 días y la bitácora con filtros. La 24 genera, regenera y borra los datos de demostración con la cantidad de alumnos simulados, la semilla y la fecha del ENARM, con confirmación para lo que no se deshace. La 25 edita los umbrales de la sección 12, los pesos del ENARM, y los modelos, precios y límites por motor, que se guardan en el proxy
- Umbrales y pesos. Se guardan en este navegador y se aplican al abrir la app, porque 40 archivos leen los umbrales directamente. Un conjunto inválido, como una retención fuera de rango, no se guarda ni se aplica. La estimación del costo por alumno que prevé el plan maestro no está en el repositorio, así que se escribe en la pantalla 25 y la pantalla 23 la usa para decir si el costo va por encima o por debajo
- Hallazgos de las pruebas. La prueba entre el cliente y el proxy encontró que el costo de una falla viajaba con un campo que el esquema del error no admitía, y el cliente la descartaba. Los casos dorados encontraron que el generador simulado no sacaba tarjetas de un texto sin cifras, fármacos ni definiciones. La mezcla de umbrales ignoraba un grupo que no existe en vez de rechazarlo, y una fecha como 30 de febrero pasaba la validación de la fecha del ENARM. Las cuatro cosas se corrigieron con su prueba
- El tutor y las pantallas ya no se marcan como Próximamente en los planes. El examen completo sí sigue marcado
- Pendiente con Ricardo. Agregar la clave en server/.env.local y correr npm run eval-ai con la bandera real y pocos casos por motor para ver el costo verdadero. Revisar los prompts de server/prompts y pegar su prompt maestro de tarjetas, que se usa en cuanto tenga texto. Confirmar el segundo proveedor, que sigue sin confirmar, y qué modelos prefiere por motor. Escribir la estimación del plan maestro en la pantalla 25

### D-099. Panel del médico, pantallas 18 a 22
- Fecha 2026-10-09. Origen C, dentro de lo que Ricardo dejó en la sección 10.2 de la especificación y en D-080 (Fase E). Ricardo pidió ejecutar todos los pendientes sin preguntar
- Vocabulario. La interfaz del alumno habla de trampas y solo habla de sesgos con kappa de 0.40 o más y al menos 30 opciones con dos etiquetas de médicos distintos. El mínimo de 30 pares es un umbral nuevo en src/config/thresholds.ts que el admin edita en la pantalla 25. Antes de llegar ahí la pantalla 19 y el Tutor dicen trampas y la pantalla 19 muestra el avance como calibrando
- Doble etiquetado (pantalla 19). El 20 % de las preguntas entra a la muestra con una semilla fija, así todos los médicos etiquetan las mismas. Cada médico etiqueta a ciegas, sin ver lo que puso el autor ni otro médico, y cada etiqueta se guarda al elegirla. El admin ve el tablero y no etiqueta. Mostrar el acuerdo por etiqueta con su intervalo ayuda a ver dónde conviene afinar las definiciones
- Editor de pregunta (pantalla 18). Editar nunca cambia una versión. Cada guardado crea una versión nueva en borrador con opciones que conservan su ID estable, así las etiquetas de los médicos y las estadísticas siguen valiendo. Un médico edita solo lo que le asignaron. Si la pregunta está en el doble etiquetado y le faltan distractores por etiquetar, el editor no se abre hasta que termine, para no ver la etiqueta del autor antes de poner la suya. Flujo editorial borrador, en revisión, aprobada o rechazada, y solo se mueve la versión más reciente. La viñeta de un caso seriado no se edita aquí porque editarla crea un caso nuevo
- Reportes de contenido (pantalla 21). Agrupados por pregunta con lo más grave primero (clave equivocada y error clínico), con marca cuando el reporte es de una versión anterior. Resolver, descartar o reabrir, de uno en uno o todos los abiertos de una pregunta. El alumno no manda dos veces el mismo reporte mientras el primero siga abierto. Los reportes de apuntes de alumnos no se revisan aquí porque los apuntes son privados
- Cola de borradores de IA (pantalla 20). Las propuestas de preguntas reestructuradas llegan como borrador con la original al lado y el médico las revisa con las mismas reglas del editor. Las opciones que cambian de papel, de clave a distractor o al revés, salen sin etiqueta ni razón para que el médico las escriba. Aprobar crea una variante nueva que apunta a la original, y rechazar no crea nada. Una variante sin aprobar no llega a ningún alumno. Una variante aprobada entra a la práctica y al planificador, pero no al examen hasta que cada distractor de su set canónico tenga 200 exposiciones, el umbral que ya existía en la configuración. Esto necesitó un campo opcional variantOf en la pregunta. Los casos seriados y las variantes no se reestructuran
- Las preguntas de salud mental no pasan la guarda de la IA y no se reestructuran. La pantalla lo dice cuando una propuesta no pasa las revisiones
- Consejos por sesgo. El médico aprueba, edita o rechaza el texto base de cada consejo. Lo aprobado o editado sale en el Tutor sin la marca de borrador y con la de revisado por un médico. Lo rechazado no se muestra. La decisión es un artefacto sin alumno, uno por consejo
- Tarjetas de mazos públicos. El médico aprueba o rechaza las tarjetas en borrador de mazos públicos que ya están en la base. Seguir un mazo otra vez ya no regresa a borrador una tarjeta que un médico decidió
- Importador del banco (pantalla 22, docs/bank-import.md). Lee Excel, CSV o JSON con las columnas de la plantilla que ya existía. El convertidor se movió a src/data/content para que la app y el script de Node acepten exactamente lo mismo. Antes de guardar muestra cuántas filas entran y cuáles no, con el número de fila y el motivo, y permite bajar el reporte. Todo entra como borrador y no como demostración. Con un ID por fila no duplica, y si una pregunta cambió sale una versión nueva. Las reglas de forma son las del editor. Límites de 50 MB y 20,000 filas
- Hallazgos de las pruebas. El banco demo tiene 11 preguntas con temas de salud mental cuya propuesta de IA no pasa la guarda y el proxy contesta con error. Una prueba de punta a punta fallaba por el 502 que anota el navegador y se resolvió eligiendo una pregunta que sí pasa. Axe marcó el contraste del verde sobre el gris en la opción clave y ahora se distingue con el texto Clave
- Pendiente con Ricardo. Revisar la lista de qué hace falta para que un reporte cuente, el umbral de 30 pares de doble etiquetado y la regla de 200 exposiciones para que una variante cuente en el examen

### D-100. Apuntes de main y del trabajo en paralelo, y textos académicos
- Fecha 2026-10-09. Origen C. Al publicar, la rama de trabajo y main tenían cada una su propia Etapa 3 de la Fase C2, Apuntes en esquema, hechas en sesiones distintas (D-092)
- Se conserva la de main, porque ya estaba publicada y revisada de forma independiente. Su apunte es un árbol de líneas con TipTap, vive en la tabla outlines, tiene la pantalla /apuntes y sus pruebas de punta a punta. La versión paralela, con líneas planas y la pantalla /mazos/apuntes, se quitó
- Lo que sí se rehízo sobre la de main. La sincronización entre dispositivos (D-095) ahora sincroniza los apuntes con su esquema. Exportar los datos incluye los apuntes dentro del contenido del alumno. Importar un Word entiende las marcas de main (>>, <<, <> , :: y ;;) y se salta las que piden respuesta en las líneas de abajo, porque un párrafo suelto no tiene niveles. La base queda en la versión 7, con los apuntes de la 6 y el avance de la sincronización de la 7
- Textos académicos. Había dos listas provisionales de textos fundamentales para las señales de controversia. Quedó una sola, la de las tarjetas con IA (D-094), con los tres textos de ciencias básicas que traía la otra (Guyton y Hall, Robbins y Cotran, Katzung). Sigue provisional hasta que Ricardo o un médico la confirmen
- El contrato de tarjetas con IA que traía main (src/ai/cardTypes.ts) se conserva sin usarse. La ruta que sí funciona es la de D-098, que comparte contrato con los otros cuatro motores
- Pendiente con Ricardo. Confirmar la lista de textos académicos y decidir si el contrato duplicado de src/ai/cardTypes.ts se quita

### D-101. Privacidad, borrar datos y cuenta, y puntaje oficial
- Fecha 2026-10-09. Origen C, dentro de lo que Ricardo dejó en 4.5 de la especificación y en D-080 (Fase E, bloque E6). Ricardo pidió ejecutar todos los pendientes sin preguntar
- El problema de fondo. La bitácora de la nube solo se agrega y su freno rechazaba también el borrado en cascada de quitar a un usuario, así que un alumno con una sola respuesta no se podía dar de baja. El freno ahora acepta el borrado de las filas de un solo usuario cuando una de las dos funciones de borrado lo marca en su transacción. Esa marca no la pueden poner ni el navegador ni la API, y vale solo hasta el final de la transacción. Todo lo demás sigue rechazado
- Borrar mis datos (delete_my_data) deja la cuenta, el perfil, el plan y los pagos, y quita la bitácora, los registros sincronizados, los borradores de IA, los reportes, los grupos y los mazos guardados. Eliminar mi cuenta (delete_my_account) quita además la cuenta con su correo, los pagos de la plataforma y los referidos. Las dos piden sesión y el dispositivo activo. El dueño no se puede eliminar a sí mismo. Las llaves sin regla hacia el usuario pasan a quedar en null, para poder dar de baja a un médico o a un admin sin perder el historial de lo que hicieron
- En la app, con la cuenta conectada, la nube se borra primero y, solo si salió bien, el dispositivo. Si el servidor falla, la pantalla dice por qué y no se borra nada. Eliminar la cuenta pide escribir ELIMINAR. Sin cuenta conectada, la app se comporta como antes
- Los pagos que ya cobró la pasarela se conservan allá, porque la ley pide guardar las facturas. Lo dice la propia pantalla
- Consentimientos. Configuración tiene una sección Privacidad donde el alumno da o retira cada permiso, con su evento. Antes solo se podían dar al crear el perfil, aunque el texto decía que se cambiaban en Perfil
- Puntaje oficial del ENARM. Es voluntario, uno por alumno, el más reciente, de 0 a 100 con dos decimales. Solo se guarda con el permiso de mejora anónima y retirarlo lo borra. No entra a ninguna predicción, porque la plataforma no predice el puntaje. Entra al archivo que el alumno exporta. Por ahora solo vive en el navegador. Su evento solo lleva el año, porque la bitácora solo se agrega y viaja a la nube, y el puntaje no debe quedar ahí cuando se retira el permiso
- Revisión independiente de E6 y la Fase F. Un subagente que no escribió el código encontró seis puntos importantes y se corrigieron. Borrar con la cuenta sin comprobar ya no deja la copia de la nube sin avisar, el cliente de la nube se pide al hacer clic y no al pintar, la sincronización se frena y espera antes de borrar la nube, el puntaje salió del evento, el envío del enlace al correo distingue una falla de la nube sin configurar, y un archivo de la nube que no baja ya no deja la app en blanco. El freno de la bitácora también deja pasar el borrado en cascada de un usuario que ya no existe, como cuando un administrador lo quita desde el panel de Supabase
- Se valida con la regla del caso de uso y no con la del navegador, para que el aviso salga en español. Un campo vacío no cuenta como cero
- Pendiente con Ricardo. Aplicar la quinta migración en Supabase con docs/SUPABASE.md, y probarla con una cuenta de prueba. Revisar el texto del aviso de privacidad, que sigue siendo un ejemplo. Decidir si el puntaje oficial debe subir a la nube cuando exista la medición con datos reales

### D-102. Endurecer, presupuesto de JavaScript y política de contenido
- Fecha 2026-10-09. Origen C, dentro de lo que Ricardo dejó en 14.3, 14.4 y 15.8 (Fase F). Ricardo pidió ejecutar todos los pendientes sin preguntar
- Qué cuenta como JavaScript inicial. Es el script de entrada y los módulos que index.html declara con modulepreload, comprimidos con gzip. Lo que se baja después, por ruta o al usarse, no cuenta. El SDK de Supabase y la sincronización se bajan justo después de pintar la primera pantalla y solo con la nube configurada, así que sí se descargan al abrir, pero no antes de pintar. Se dice aquí para que nadie lea el número como el total descargado
- Cómo se bajó de 580 a unos 275 KB. Todas las rutas cargan por demanda, el SDK de Supabase y el puente con la nube van en archivos aparte, y los textos del médico y de administración dejaron el objeto t del núcleo y cada pantalla los importa directo. Sin cambios de comportamiento y sin pruebas rotas
- El presupuesto es de 300 KB y lo vigila una prueba que construye la app. Si una función nueva lo pasa, la prueba falla con el desglose por archivo. El margen es de unos 25 KB
- La política de seguridad de contenido sale de un solo archivo (src/config/csp.ts) y se entrega en una etiqueta meta, que protege en cualquier alojamiento, y en el archivo _headers para Cloudflare Pages, que además lleva frame-ancestors. No permite scripts en línea ni eval, solo WebAssembly. Las conexiones van al propio sitio y al origen exacto de Supabase si está configurado. Se permiten estilos en línea, porque React pone atributos style, y fuentes data:, porque Vite incrusta las pequeñas
- Dependencias. concurrently pasa a la 10.0.6 por una vulnerabilidad crítica en shell-quote, y un override le da a exceljs un uuid corregido. npm audit queda en cero y corre en un trabajo aparte del CI
- Rendimiento. 200 tarjetas con el procesador 4 veces más lento dan una mediana de 90 ms, un p95 de 147 ms y un peor caso de 301 ms. La prueba falla si la mediana pasa de 150 ms, el p95 de 350 ms o el peor de 800 ms
- Sin conexión. Una prueba abre sin red pantallas que nunca se habían visitado y confirma que la IA avisa que necesita conexión
- Revisión ASVS 5.0 por capítulo en docs/asvs.md. Es una revisión propia y no sustituye una prueba de penetración. Los requisitos numerados se recorren antes de una auditoría externa
- Pendiente con Ricardo. Aprobar la publicación en Cloudflare Pages (D-017), comprar el dominio propio, y decidir si el margen de 25 KB justifica seguir recortando el JavaScript inicial

### D-103. Proxy de IA alojado
- Fecha 2026-10-10. Origen C, dentro de lo que Ricardo pidió el mismo día, construir todo lo que haga falta para que la plataforma funcione de verdad (Fase G)
- Qué es. El proxy local de siempre, con un modo alojado que pide la sesión de Supabase en cada llamada, deja usar la IA solo con un plan de pago, o siendo médico, admin o dueño, y cuenta los límites por alumno, el presupuesto del día y la bitácora de costos en Postgres. Corre en cualquier alojamiento que ejecute Docker o Node
- Por qué no una función de Supabase. Habría que reescribir las rutas, los prompts y las guardas para otro entorno de ejecución y probarlas sin poder correrlas aquí. El proxy ya tiene 150 pruebas. Con un Dockerfile se reutiliza todo tal cual y el costo es un servicio más, de unos pocos dólares al mes
- Lo que se pidió con una desviación. CLAUDE.md dice que la clave de IA vive solo en server/.env.local. Un servicio alojado no tiene ese archivo, así que la misma clave, con el mismo nombre ENARM_ANTHROPIC_KEY, vive como secreto del alojamiento. Sigue sin estar en el código, en el repositorio, en la imagen ni en el navegador. El proxy la quita del entorno al arrancar. Pendiente con Ricardo. Confirmar que le parece bien y, si sí, ajustar esa línea de CLAUDE.md
- El proxy alojado usa también la llave de servicio de Supabase, solo para el libro de IA. Vive como secreto del alojamiento, nunca en GitHub, y el escáner del build sigue buscándola
- La verificación de la sesión se hace preguntando a Supabase con el token del alumno y la llave pública. Así no se guarda ninguna llave de firma. my_plan trae la barrera del dispositivo único, así que un dispositivo desplazado tampoco usa la IA. Un token verificado se recuerda 30 segundos y una falla nunca se recuerda
- El alumno de cada llamada es la cuenta verificada, no lo que diga el sobre. La configuración y el gasto son solo del admin y del dueño
- Dos códigos de error nuevos en el contrato de la IA. unauthorized y plan_required. El mensaje del servidor llega tal cual al alumno
- Borrar mis datos quita el uso anterior y la bitácora de IA, pero conserva el uso de hoy, para que no sirva de truco contra el límite diario
- Corregido tras la revisión independiente. Las rutas de configuración y gasto se decidían con la dirección cruda, y una dirección codificada como /ai/%63onfig se saltaba la regla y dejaba a un alumno de pago cambiar el presupuesto. Ahora se decide con la ruta que usa el enrutador, y solo un POST a un motor es una llamada de motor. Todo lo demás pide ser admin
- Límites conocidos. El presupuesto diario es un tope blando bajo llamadas simultáneas, y no hay límite de peticiones con token falso antes de preguntar a Supabase. Se documentaron en docs/IA_ALOJADA.md y el segundo se resuelve con un límite por IP en el alojamiento
- Pendiente con Ricardo. Elegir alojamiento y poner las variables de docs/IA_ALOJADA.md, aplicar la sexta migración, poner VITE_AI_URL en GitHub y correr npm run eval-ai con la clave para medir el costo real

### D-104. Aviso de privacidad y términos como páginas de la app
- Fecha 2026-10-10. Origen C, Fase G bloque G2. Hacía falta un aviso real y unos términos antes de abrir a alumnos de pago, y el aviso que había era un ejemplo marcado como simulado
- Qué hay. Dos páginas públicas, /privacidad y /terminos, que se leen sin sesión y se enlazan desde la portada, desde la bienvenida y desde Configuración, Privacidad. Siempre dicen arriba que son un borrador pendiente de revisión de un abogado
- Un solo texto. Vive en src/i18n/legal.ts y sirve a la página y al archivo para el abogado. npm run legal:export lo escribe en docs/legal, y una prueba falla si el archivo se queda atrás
- El responsable. Su nombre o razón social, su domicilio y su correo vienen de VITE_LEGAL_NAME, VITE_LEGAL_ADDRESS y VITE_SUPPORT_EMAIL, que son públicos por diseño. Sin ellos el texto dice pendiente de completar y no inventa nada. Lo mismo con la política de reembolsos y los tribunales competentes
- El texto dice solo lo que la plataforma hace. A la IA viajan IDs seudónimos y texto del banco. No hay chat libre ni predicción del puntaje. Retirar la mejora anónima borra el puntaje oficial. Los datos de tarjeta nunca los ve la plataforma. El borrado quita la copia de la nube
- La versión del aviso pasó a ser 2026-10-10 y vive en src/config/legal.ts. Es la que se guarda al aceptar. Quien ya aceptó la anterior seguirá con ella guardada, y todavía no hay una pantalla que pida aceptar la nueva
- Edad mínima de 18 años, como supuesto que el abogado debe confirmar
- La aceptación que se registra en la nube es la versión del aviso bajo la que el alumno decidió en su dispositivo, no la que trae la app. Antes se registraba la versión nueva sin que la hubiera visto. Se corrigió tras la revisión independiente
- Pendiente con Ricardo. Decidir el responsable, el domicilio y el correo de privacidad, pasar los textos a un abogado, definir reembolsos y tribunales, y poner las variables en GitHub

### D-105. Configuración del admin en el servidor
- Fecha 2026-10-10. Origen C, Fase G bloque G3. Los umbrales, los pesos y la estimación de costo que el admin cambiaba en la pantalla 25 solo valían en su navegador, así que no cambiaban nada para los alumnos
- Qué hay. Los cambios se guardan en platform_settings, clave admin_overrides, que ya existía con permiso de lectura para todos y de escritura solo para el admin. No hace falta migración nueva. Con la cuenta de la nube conectada se guarda primero en el servidor y solo si salió bien en el navegador. Sin ella, como en la demostración, se guarda solo en el navegador
- Al abrir la app, el puente con la nube copia lo que dice el servidor. Con la cuenta conectada manda el servidor, y si no tiene cambios se borran los del navegador. Si algo cambió aparece un aviso para recargar. No recarga solo, porque el alumno puede ir a media sesión
- Por qué recargar. Los motores leen los umbrales una vez, al cargar el módulo, para que los motores se mantengan como funciones puras sin leer el estado de la app. Aplicar en caliente habría obligado a cambiar todos
- Un valor del servidor que no cumpla el formato se ignora completo, igual que uno guardado en el navegador. Los números siguen validándose contra el esquema de umbrales antes de usarse
- La clave la lee cualquiera, incluso sin sesión, por diseño de platform_settings. No debe llevar secretos
- Límite conocido. Entre guardar y que cada alumno recargue hay un lapso en que conviven valores viejos y nuevos. Los umbrales de funciones que muestran calibrando solo cambian cuándo aparecen, no borran datos

### D-106. Portal de facturación y reembolsos de Stripe
- Fecha 2026-10-10. Origen C, Fase G bloque G4. El alumno no tenía cómo cancelar desde la app y un reembolso de Stripe no quitaba el plan
- Qué hay. Una función nueva, create-portal-session, abre el portal de Stripe del alumno con sesión abierta. Una tabla nueva, billing_customers, liga a cada alumno con su cliente de Stripe a partir de un pago verificado. Es la séptima migración
- Por qué el portal de Stripe y no un cancelar propio. Stripe ya resuelve cancelar, cambiar tarjeta y facturas, y así Studiare no toca datos de tarjeta ni cobros. Un cancelar propio habría obligado a llamar a su API de suscripciones sin poder probarla contra Stripe aquí
- Verificado en la documentación de Stripe por búsqueda. El portal se crea con POST /v1/billing_portal/sessions con el cliente y la dirección de regreso, y devuelve una dirección. La pantalla del portal necesita guardar su configuración en el panel. Stripe quitó en su versión basil el vínculo del cargo con la factura, por eso el reembolso se identifica por cliente y monto
- No se pudo abrir docs.stripe.com desde este entorno, la red lo bloquea. Lo de los reembolsos no se probó contra eventos reales de Stripe. Falta un reembolso de prueba
- Reembolso. Solo los completos quitan el plan. El pago a devolver sale por cliente y monto, el más reciente. Un cliente desconocido deja el aviso guardado sin alumno
- Un cobro que quedó en needs_refund porque el cupo Fundador se llenó, al devolverse solo cambia a refunded y no quita otro plan del alumno
- Devolución automática desde la app no se hizo. Stripe no entrega ya la factura en el cargo y emitir un reembolso con datos que no se pudieron comprobar es riesgo de dinero real. Se devuelve a mano en el panel y el aviso hace el resto
- Eliminar la cuenta no cancela la suscripción en Stripe. La pantalla lo avisa y pide cancelar antes
- Corregido tras la revisión independiente. Un aviso de pago tardío de un pago ya devuelto no reactiva el plan. Un reembolso de un cobro viejo no quita el plan si hay un pago más reciente vigente, y sin id de pago se elige el cobro por monto y por la hora del cobro. La base se niega a eliminar la cuenta con una suscripción de Stripe activa. Cancelar al final del periodo se avisa desde que se cancela, con customer.subscription.updated. Un alumno que vuelve a pagar usa su mismo cliente de Stripe, con un reintento como alumno nuevo si el cliente ya no existe
- Pendiente con Ricardo. Activar el portal en el panel de Stripe, aplicar la séptima migración, publicar la función y hacer un pago y un reembolso de prueba

### D-107. HSTS y registro de errores del navegador
- Fecha 2026-10-10. Origen C, Fase G bloque G5. Producción necesitaba HSTS y alguna forma de enterarse de lo que se rompe en los navegadores de los alumnos
- HSTS. El archivo _headers del build lleva Strict-Transport-Security con un año y sin includeSubDomains ni preload, que son difíciles de deshacer y podrían comprometer otros subdominios. Solo vale en alojamientos que lean _headers, como Cloudflare Pages. GitHub Pages ya lo impone por su cuenta
- Errores del navegador. Una tabla nueva, client_errors, y una función report_client_error que cualquiera puede llamar. Es la octava migración
- Sin identidad. La tabla no tiene usuario, ni correo, ni IP. Una prueba SQL lo vigila mirando las columnas. El navegador quita correos, ids, claves, tokens, números largos y el pedazo de texto que copia el navegador al fallar al leer un JSON, y la base hace lo mismo otra vez con client_errors_scrub, porque cualquiera con la llave pública puede llamar a la función con lo que quiera
- Con permiso. Solo se manda si el alumno con sesión dio el permiso de mejora anónima, que ya existía. Se descartó una opción nueva en Configuración para no sumar un permiso más. El aviso de privacidad ya lo dice. Quien no tiene sesión o no dio el permiso no manda nada
- Contra abuso. Tope de 500 errores distintos por día, 14 días de conservación, un error cuenta una vez por sesión y 5 distintos por sesión como máximo
- Lo ve solo el admin, en la pantalla 25
- Limitación. Esto no es monitoreo del servidor ni manda alertas. Los errores del proxy de IA y de las funciones de pago se leen en los logs de su alojamiento
- Corregido tras la revisión independiente. La limpieza de datos personales ahora también ocurre en la base, y la llave de la lista de errores usa la huella
- Pendiente con Ricardo. Aplicar la octava migración y decidir si quiere un servicio de alertas

### D-108. Usuarios reales y roles con la nube
- Fecha 2026-10-10. Origen C, Fase H. Ricardo preguntó cómo se define el tipo de cuenta, y al revisarlo apareció que la pantalla Usuarios solo veía los perfiles del navegador y nunca llamaba a set_user_role. Con la nube conectada no se podía nombrar a un médico de verdad sin escribir SQL
- Qué hay. Una función nueva de Supabase, admin_list_users, que solo contesta a un admin o al dueño y devuelve alias, correo, rol, plan y fecha de alta con búsqueda, filtro por rol y páginas de 25. Es la novena migración. Con la cuenta de la nube conectada la pantalla Usuarios muestra esas cuentas y cambia el rol con set_user_role. Sin la nube sigue con los perfiles locales
- Los roles siguen siendo cuatro. Alumno, médico, admin y dueño. El dueño es el administrador general y el admin es un nivel que el dueño puede delegar. Se dejó así porque separa quién puede nombrar admins. Si Ricardo prefiere solo tres, se quita el rol admin sin cambiar nada más
- Asignar preguntas a un médico sigue siendo local. Pide que el banco viva en la nube y la pantalla lo dice
- Rol sin conexión. Antes, si fallaba la lectura del rol, la app bajaba a alumno a un médico o un admin que solo perdió la conexión. Ahora se queda con el último rol verificado, avisa que la nube falló y reintenta con espera creciente y al volver la conexión. Sin sesión el rol es alumno, aunque el dispositivo guarde otro
- Pendiente con Ricardo. Aplicar la novena migración y decidir si prefiere tres roles o cuatro


### D-109. Auditoría funcional, primera visita sin conexión y práctica que se retoma
- Fecha 2026-10-10. Origen C, Fase H. Ricardo pidió una auditoría de todas las funcionalidades. Se hizo como código repetible en tests/audit (npm run audit:ui), con el informe en docs/auditoria-2026-10-10
- Primera visita sin conexión. El service worker se instalaba pero no tomaba el control de la página abierta, así que una pantalla no visitada fallaba si la red se cortaba antes de recargar. Se activó clientsClaim. Con el aviso de versión nueva (registerType prompt) no hay recarga sorpresa, porque ese aviso solo reacciona a las actualizaciones y no a la primera instalación
- Práctica que se retoma. La práctica se guarda en la sesión de la pestaña con zustand persist. Solo lleva identificadores de preguntas y de opciones, nunca nombres ni correos, desaparece al cerrar la pestaña, se valida con zod al leerla y se descarta entera si no cuadra. Si el navegador bloquea el almacenamiento, sigue en memoria. Se eligió sesión de la pestaña y no almacenamiento local para no dejar rastros de un alumno en un dispositivo compartido. Una práctica de otro alumno se ignora por su userId
- Token vencido sin red. Supabase responde sin sesión y con un error de red cuando no puede renovar el token. Eso ya no se lee como sesión cerrada, falla y el puente reintenta, así que un médico no pierde su área por abrir la app sin conexión. Se revisa el nombre del error y no se importa el SDK, que se baja aparte del JavaScript inicial
- Límite. La auditoría corrió en Chromium, con una nube y una IA simuladas. Safari, Firefox, lector de pantalla, dispositivos reales y Supabase real quedan fuera y están dichos en el informe
- Pendiente con Ricardo. Nada nuevo. Sigue la lista de PENDIENTES_DE_RICARDO.md

### D-110. Practicar lo fallado, aviso de insignias y aviso de presupuesto de IA
- Fecha 2026-10-10. Origen C, Fase I. Ricardo pidió seguir con los pendientes de programación que no dependen de él. Salen de IDEAS.md y se quitaron de ahí
- Practicar de nuevo lo fallado. Los resultados del examen tienen una tarjeta que abre una práctica con las preguntas falladas, no las que quedaron en blanco, en el orden del examen y sin mostrar la respuesta anterior. Respeta el límite diario del plan Gratis y dice cuántas caben. Deja un session_started en la bitácora con sampling exam_missed
- Aviso de insignias. Al cruzar el umbral de un nivel aparece una franja arriba con una celebración corta, un enlace a Logros y cierre solo a los 9 segundos. Lo que ya vio el alumno se recuerda en el navegador por cuenta, no en la bitácora, porque es solo una comodidad de la pantalla. La primera vez en un dispositivo anota lo que ya tenía sin avisar de golpe. No aparece durante un examen en curso, para no distraer, ni en la demostración, donde el alumno es simulado. La lógica de qué es nuevo es una función pura del motor de recompensas, con prueba de propiedades
- Presupuesto de IA. La pantalla de costos del admin avisa con una alerta cuando el presupuesto diario se llenó, que es cuando la IA se pausa y los alumnos siguen con plantillas, y con un aviso desde el 80%. Un aviso al correo o al celular sigue pendiente porque pide un servicio de alertas, que Ricardo no ha decidido
- Se quedó fuera a propósito. Elegir la hoja de Excel al importar mazos pide pasar la elección por el procesador de importación y una pantalla de vista previa, y no vale la complejidad todavía. Sigue en IDEAS.md
- Pendiente con Ricardo. Nada nuevo

### D-111. Mazos de Pediatría y Cirugía de Paco
- Fecha 2026-10-10. Decisión de Ricardo. Pidió subir todos los mazos de Paco y dijo tener su aprobación escrita, porque Paco trabaja con él. El documento no está en el repositorio y lo conserva Ricardo
- Ya estaban en el repositorio Medicina interna, Ginecología y obstetricia y Urgencias (D-053), con la autorización de Paco para tenerlos públicos. Faltan Pediatría (Pedia.apkg, unos 90 MB) y Cirugía (Cirugia.apkg, unos 34 MB), en la carpeta Paco del Drive de Ricardo. Esa carpeta trae además un zip con los dos juntos y un PDF de estadísticas de Anki, que no se usan
- Bloqueo técnico. La herramienta de Drive solo baja archivos de hasta 10 MB y esta sesión no puede abrir drive.google.com porque la política de red del entorno lo bloquea. Urgencias, de 1.7 MB, sí se pudo bajar y salió idéntico en tamaño, así que la vía funciona para archivos chicos
- Qué hace falta. Que el entorno permita drive.google.com y drive.usercontent.google.com, y que los dos archivos estén compartidos con cualquier persona con el enlace mientras se bajan. Se puede revocar el enlace al terminar
- Cuando lleguen los archivos. Correr scripts/content/import-paco-decks.ts con los dos .apkg, agregar sus raíces de etiqueta a DECKS, que el script pide si no las reconoce, actualizar las pruebas que cuentan las 3,771 notas de Paco y los textos que dicen tres mazos, y repetir la prueba de migración a mazos en árbol
- Peso. Las imágenes se copian tal cual, como en los tres primeros. Sumarán unos 120 MB a public/demo-media, que hoy pesa 47 MB. No entran a la precarga del service worker
- Alcance de la autorización. Cubre la demo pública con la etiqueta Demostración y el crédito a Paco. Si el documento de Paco también cubre su uso dentro del plan de pago, Ricardo lo confirma, porque D-053 solo cubría la demostración y el mazo de Fer sigue fuera (D-008)
- Pendiente con Ricardo. Permitir los dos dominios en el entorno y compartir los dos archivos, o pasarlos de otra forma

### D-112. Revisión de la integración con Stripe
- Fecha 2026-10-10. Ricardo pidió ayuda para construir sobre Stripe con Billing, Facturas e Impuestos, y pegó en el chat una llave publicable y una secreta de prueba. La integración ya existía (D-106), así que se revisó en vez de rehacerla. El resultado está en docs/STRIPE.md
- La llave secreta no se guardó en ningún archivo ni commit, y no se usó, porque la red del entorno bloquea api.stripe.com. Se le recomendó cambiarla. El plugin oficial no estaba en el marketplace con ese nombre, se instaló el de anthropic-plugin-directory, y el servidor MCP de Stripe y su planeador no se pudieron usar por la red
- Cambios. Checkout se abre con locale es-419. Stripe Tax queda listo detrás del secreto STRIPE_AUTOMATIC_TAX, apagado por defecto, porque con Stripe Tax sin configurar Stripe rechaza abrir el pago. Un script crea los productos de prueba con los precios con el impuesto incluido, y rechaza llaves reales. El revisor de secretos del build ahora marca las llaves sk_ y rk_ de Stripe
- Sin cambiar a propósito. No se fijó la versión de la API ni se agregó idempotencia al crear la sesión, porque no se pudo verificar contra la documentación de Stripe. Quedan como recomendaciones
- Límite. Nada de esto se probó contra Stripe real. Las pruebas usan servidores falsos
- Pendiente con Ricardo. Cambiar la llave, crear los productos, configurar el webhook y los secretos, y revisar con su contador el IVA y las facturas con RFC

### D-113. Proyecto real de Supabase conectado
- Fecha 2026-10-10. Origen C, Fase J. Ricardo conectó su proyecto Studiare (referencia bkjbcdwglyllizupokqm) como conector de claude.ai y autorizó aplicar las migraciones 2 a 10 y hacer lo necesario
- Estado que se encontró. Solo estaba aplicada la primera migración, con 23 tablas y 2 usuarios, y ninguna Edge Function. Se revisó antes de escribir que las nueve restantes no tocaran datos existentes
- Qué se aplicó. Las migraciones 2 a 10 con el conector, en orden y por trozos, más una migración 11 nueva (20261014000001_function_grants). Se desplegaron create-checkout, create-portal-session y payment-webhook-stripe. El webhook va sin verificación de JWT porque Stripe se identifica con su firma, que el código valida antes de tocar la base. Las otras dos la llevan
- Qué no se pudo aplicar. El conector pide una confirmación humana para toda sentencia con delete o drop, también dentro de una función, y la sesión en la nube no tiene dónde darla, así que la llamada se agota sin aplicar nada. No se disfrazaron las sentencias para esquivarla. Se omitieron los drop if exists que eran no-ops sobre objetos nuevos y las seis piezas que sí cambian algo quedaron en supabase/manual/ejecutar-en-sql-editor.sql para que Ricardo las pegue. test:sql ahora corre ese archivo dos veces sobre una base migrada
- Por qué la migración 11. El chequeo de seguridad de Supabase marcó que anon podía ejecutar seis funciones de la primera migración. Se verificó leyendo el código que ninguna era un hueco, porque current_app_role devuelve alumno sin sesión y set_user_role lanza error. Aun así se cerraron las que no tienen por qué estar expuestas, set_user_role, handle_new_user y forbid_event_changes, y la tabla payment_webhook_events. Las cuatro auxiliares de las políticas (current_app_role, is_admin, is_group_member y shares_group) se dejan abiertas a propósito, porque quitárselas a anon cambiaría un resultado vacío por un error de permisos. Se fijó el search_path de ai_day y ai_check_engine
- Lo que se comprobó contra el proyecto real. 36 tablas con permisos por fila, 26 políticas con la condición del dispositivo activo, las funciones internas sin acceso para anon, el webhook contestando 405 a un GET y 503 a un POST sin secreto, y las dos funciones con sesión rechazando una llave anónima. Nunca se escribió ni se leyó una llave secreta
- Límite. No se probó un pago, un alta ni un cambio de rol contra el proyecto real. Eso pide una cuenta de prueba y los secretos de Stripe
- Pendiente con Ricardo. Pegar el archivo manual, poner los secretos de Stripe, activar la protección contra contraseñas filtradas y decidir cuándo conectar la demo pública

### D-114. Precios nuevos, Fundador como promoción del mensual y una sola pasarela visible
- Fecha 2026-10-11. Origen R, Fase K. Ricardo pidió que el mensual cueste 149, el anual 1,499, que el Fundador sea una promoción del mensual con el precio regular tachado y que se corrija el porcentaje de ahorro del anual
- Cómo se ve. Tres tarjetas, Gratis, Mensual y Anual. El Mensual muestra $149 tachado y $79 como precio Fundador para los primeros 100. Al elegirlo se paga el plan founder, que es el que cuenta el cupo en el servidor. El anual dice que ahorra 16%, que sale de 1,499 contra 12 meses de 149 (1,788), redondeado hacia abajo para no prometer de más. Antes decía 33% porque comparaba 1,200 contra 12 de 150
- Por qué el ahorro se compara con el precio regular. Contra el Fundador el anual no ahorra nada, porque 12 meses de 79 son 948. Se dejó dicho a Ricardo para que decida si el anual debe bajar o si así está bien mientras dure la promoción
- Ricardo escribió 150 tachado y también que el precio real es 149. Se usó 149 en los dos lados para que el tachado sea el precio que de verdad se cobra después. Si prefiere 150, es una línea en src/config/billing.ts y otra en la migración
- Cupo lleno. Si el servidor responde que ya no hay lugares Fundador, la tarjeta de pago ofrece seguir con el mensual regular en un clic
- Mercado Pago queda oculto (PAYMENT_PROVIDERS en src/config/billing.ts) hasta que exista su cuenta y su función de avisos. Antes se ofrecía y el servidor respondía que no estaba configurado, que es uno de los errores que vio Ricardo en su teléfono
- Dónde vive cada precio. La app en src/config/billing.ts, el servidor en PLAN_PRICES_MXN de supabase/functions/_shared/payments.ts (con prueba de que coinciden), la base en platform_settings con la migración 20261015000001 y lo que de verdad cobra Stripe en sus Price ID, que Ricardo cambia en los secretos. Un Price de Stripe no se puede editar, así que 149 y 1,499 son precios nuevos

### D-115. Entrar con el código del correo desde otro dispositivo
- Fecha 2026-10-11. Origen R, Fase K. Ricardo creó su cuenta en la computadora, abrió el enlace en el teléfono y la computadora quedó sin sesión, así que no podía pagar en ella. Pidió que confirmar en el teléfono y seguir en la computadora funcione, como en otras apps
- Por qué pasa. El enlace mágico de Supabase abre la sesión en el navegador donde se abre el enlace. No hay forma segura de que esa sesión aparezca sola en otro navegador
- Qué se hizo. El mismo correo trae un código y la app tiene un campo para escribirlo, con verifyOtp de Supabase con tipo email. Aparece después de pedir el correo, al crear cuenta y en Ya tengo cuenta, y en Suscripción cuando el navegador no está conectado. Al abrirse la sesión, el puente de la nube une la cuenta igual que con el enlace, reclama el dispositivo y entra a Inicio
- Lo que falta de Ricardo. Agregar {{ .Token }} a las plantillas Magic Link y Confirm signup de Supabase (docs/SUPABASE.md, paso 6b). Sin eso el correo no trae el código
- Dispositivo único. Entrar con el código en la computadora toma la cuenta, y el teléfono sale con el aviso de siempre. Es la regla de D-087
- Se descartó esperar en la computadora a que el teléfono confirme, porque pide un canal propio entre los dos navegadores y Supabase no lo trae. El código es el camino que Supabase documenta
- Diagnóstico de pagos. create-checkout escribe en sus registros el motivo de todo pago que no abre (rechazo de Stripe con tipo, código, parámetro y mensaje, rechazo de Mercado Pago, falta de red), sin llaves ni datos del alumno. Con el registro nuevo, el intento de Ricardo de las 01:30 UTC del 2026-10-11 dio la causa. STRIPE_PRICE_FOUNDER tenía el ID del producto (prod_) y no el del precio (price_), y Stripe respondió No such price. Ahora el servidor revisa que cada Price ID empiece con price_ antes de llamar a Stripe, y si no, deja en el registro qué secreto cambiar

### D-116. Inicio con el diseño fijo de Ricardo
- Fecha 2026-10-12. Origen R. Ricardo mandó el diseño de su pantalla de Inicio y eligió que quede fijo para todos. Cambia la sección 9.1 de la especificación, donde Inicio era un tablero en el que el alumno agregaba, quitaba y reordenaba widgets. Ya no se edita. La distribución que se guardaba (widgetLayouts) sigue en la base y en la sincronización para no romper datos viejos, pero la pantalla ya no la lee
- Qué lleva. Arriba el saludo con el alias, que concuerda con el sexo que el alumno declaró en su cuenta (Bienvenida o Bienvenido) y sin dato usa Te damos la bienvenida, y a la derecha la racha, el nivel con su XP y la foto, como en el resto de la app. Tus repasos con la meta diaria y una frase del día con su autor, la carga de repaso y las tarjetas vencidas con el botón Repasar. Tus simuladores con los sesgos que te hacen fallar (trampas mientras el acuerdo entre médicos no alcance, 4.4) y los temas para reforzar, los dos con calibrando y cuánto falta. Una columna con el plan actual y su botón, las misiones de hoy y el reto de Party. Abajo el heatmap del año
- Plan actual siempre a la vista. El botón dice Mejorar tu plan en Gratis y Cambiar tu plan en un plan de pago, y abre Suscripción en un toque. Antes el único camino era la última tarjeta de Perfil, a 1,245 px de desplazamiento en el teléfono, según el recorrido de la fricción para pagar
- Carga de repaso. Gráfica de dos líneas con cinco meses, dos antes del actual y dos después. Realizados son los repasos que hizo el alumno. Programados son las citas de cada tarjeta, la fecha que FSRS le dio en cada repaso o cambio de fecha. Una cita cuenta en su mes si llegó su día antes de que la tarjeta se volviera a programar, así repasar antes de tiempo o posponer no la cuenta dos veces, y la última cita cuenta aunque no haya llegado si la tarjeta sigue activa. El cálculo es un motor puro (src/engines/monthlyLoad.ts) con sus pruebas. Arriba dice el promedio de repasos por día de este mes y un enlace a la carga completa en Progreso. Sin repasos no dibuja una gráfica vacía y explica qué va a mostrar. Los colores son tokens nuevos (chart-scheduled y chart-done) validados para daltonismo en claro y en oscuro, con leyenda, ayuda al pasar el cursor y una tabla para el lector de pantalla
- Frases. Cinco frases cortas con su autor, una por día de estudio. La de Antonio Machado es una cita breve con su autor, que la ley permite. Las demás son de autores antiguos o refranes
- En el teléfono todo va en una columna y el plan queda antes del heatmap. El heatmap abre en lo más reciente y en pantallas anchas sus celdas crecen para llenar el ancho
- Se quitó el código del tablero (acomodos, ajustes por widget, mover y quitar) y los widgets que ya no salen en Inicio (racha, nivel, carga futura, última hipótesis, liga e insignias). Siguen en sus pantallas, que son Progreso, el Tutor y Logros
- Lo que no se tomó del diseño. El menú de tres rayas arriba del riel, porque el riel de la app ya tiene las mismas secciones. El encabezado de nivel conserva su forma de siempre en todas las pantallas. Después Ricardo pidió el menú y la barra, ver D-117

### D-117. Barra superior, menú lateral que se oculta y espacios parejos en Inicio
- Fecha 2026-10-12. Origen R. Ricardo pidió el menú de tres barras arriba a la izquierda para ocultar el menú lateral, la barra blanca de arriba que separa el saludo y el nivel del resto de la página, que la gráfica y el heatmap aprovechen su espacio y medio centímetro de separación en todos lados, con simetría. Reemplaza la última viñeta de D-116, que no había tomado el menú ni la barra
- Barra superior en computadora. Mide 4rem y va fija arriba. A la izquierda el cuadro verde azulado con las tres barras, del ancho del riel, y junto a él el símbolo de Studiare. Encima de la barra se pinta el encabezado de cada pantalla (ScreenHeader y SessionHeader) con el título, la racha, el nivel y la foto. El h1 sigue dentro de main, así el salto al contenido y el foco al cambiar de pantalla no cambian. La explicación de cada pantalla se abre fuera de la barra, al principio del contenido, para que la barra no crezca. Los avisos que salían arriba a la derecha (actualización de la app y alertas del examen) bajan para no tapar el nivel
- En el teléfono no hay menú de tres barras, porque la navegación de abajo siempre está. El encabezado de cada pantalla queda en una franja blanca de orilla a orilla bajo la barra del logo
- Menú lateral que se oculta. El botón dice Menú lateral, avisa si está abierto (aria-expanded) y qué controla (aria-controls). Oculto, el contenido usa todo el ancho. Se recuerda en ese navegador en las preferencias del dispositivo (navCollapsed), que es una comodidad de la pantalla y no un dato del alumno, así que no viaja a la nube
- Nivel en la barra. Ahora que hay espacio va en una línea, con una estrella, Nivel y título, y la barra de XP más larga con lo que falta para el siguiente nivel. En el teléfono conserva su forma compacta
- Separación. Medio centímetro (1.25rem, 20 px) entre todos los bloques de Inicio, en las orillas de la página de todas las pantallas y por dentro de las tarjetas de Inicio. Las líneas que separan las columnas quedan al centro, con el mismo espacio a cada lado
- Simetría. Las tarjetas de una fila crecen hasta la tarjeta más alta, así Tus repasos y Tus simuladores terminan a la misma altura. El botón Repasar y la barra de la meta quedan abajo de su tarjeta
- Gráfica de carga de repaso. Mide su espacio y se dibuja a esa medida exacta, sin estirar el texto, así llena la tarjeta. Sin repasos, el aviso de qué va a mostrar ocupa ese mismo espacio
- Heatmap a todo el ancho. En computadora va abajo de las tres columnas, de orilla a orilla, para que no quede espacio en blanco bajo la columna del plan. Cada mes crece en proporción a sus semanas, así todas las celdas miden lo mismo y llenan el ancho. Las celdas miden al menos 8 px en computadora, para que el año quepa desde 1024 px, y 12 px en el teléfono, donde el calendario se desplaza y abre en lo más reciente. A la izquierda van las iniciales de lunes a domingo (L, M, M, J, V, S, D), alineadas con sus filas y pegadas a la orilla cuando el calendario se desplaza
- Contraste del dorado. Con la franja blanca la revisión de accesibilidad ya pudo medir el título del nivel, y el dorado de siempre (#b7791f) da 3.6 a 1 sobre blanco, abajo del 4.5 a 1 que pide el texto chico. Antes el fondo con degradado impedía medirlo. Hay un token nuevo, accent-ink (#8f5d12 en claro, 5.6 a 1, y el mismo dorado claro en oscuro), para el texto del nivel, la etiqueta dorada y la escalera de niveles. Los íconos siguen con el dorado de siempre, que sí pasa el 3 a 1 que piden los gráficos
- Capturas en docs/screenshots/inicio-d117, en 1920, 1280, 1024 y 390, en claro y en oscuro, con datos de demostración y con el menú oculto

### D-118. Un solo plan pagado a la vez
- Fecha 2026-10-11. Origen R, Fase L. En el primer pago real en modo prueba, la cuenta de Ricardo pagó el Anual y luego el Fundador. Stripe abrió dos suscripciones que cobran aparte y la base, que guarda una fila por alumno, quedó con el plan de una y la fecha de la otra. Ricardo aprobó la propuesta
- Qué se hizo. create-checkout revisa la fila de subscriptions del alumno antes de abrir el pago. Si hay un plan pagado vigente responde 409 already_subscribed y no llama a la pasarela. Vigente es la misma regla que user_plan, activa, con cobro fallido o cancelada mientras no termine el periodo ya pagado. Si no puede revisar la base no abre el pago, porque un doble cobro es peor que pedir que lo intente de nuevo
- En la app. Con un plan que viene de un pago, las otras tarjetas de Suscripción muestran cómo cambiarse en lugar del botón de compra. Para distinguirlo, la suscripción local guarda de dónde viene el plan (source, opcional). Un mes regalado por referido sí deja pagar, para que pueda asegurar el precio Fundador
- Cambiar de plan. Por ahora se cancela en el portal y se contrata el otro plan al terminar el periodo. Que el portal cambie de plan pide leer el cambio que manda Stripe en customer.subscription.updated y queda para después
- Despliegue. Solo create-checkout, versión 15. El webhook y el portal publicados se comportan igual que el repo

### D-119. Plan del cambio V3
- Fecha 2026-10-12. Origen R. Ricardo contestó las 102 preguntas del cuestionario y dejó 19 comentarios, y la sesión anterior los convirtió en docs/PLAN_DEL_CAMBIO.md. Al mandar el mensaje de arranque dio la autorización de su sección 0.1. Ese documento manda sobre PLAN.md y sobre la especificación donde no coincidan. Las reglas de CLAUDE.md siguen, con los ajustes del bloque B0
- Qué decide. Rediseño sobrio con un solo color de acción (#156082) y sin degradados. Navegación más simple, con Configuración abajo con engrane, Perfil dentro de Configuración, Apuntes en el menú y sin Plan, Logros ni ligas. Revisión del examen que crea tarjetas y pregunta por qué fallaste. Pagos completos, con prueba gratis de 7 días, Fundador anual a 749, cambio de plan con prorrateo, Apple Pay, Google Pay, OXXO, SPEI, Mercado Pago, códigos de influencer y factura a pedido. Banco en la nube sincronizado con el Google Sheet de los médicos, con Salud pública e Inglés médico. IA real en Supabase con los cinco motores y OpenAI solo para comparar calidad. Modelo del alumno con comparación por percentiles y sin predecir el puntaje. Party real, cuentas con Google, registro por invitación hasta lanzar y segundo factor para médicos y admins. Analítica con permiso, alertas, recordatorios por correo y recorrido guiado. Auditoría de procesos al inicio y al final. Lanzamiento en Cloudflare Pages antes de que termine 2026. Van 20 bloques, de B0 a B19, un PR por bloque con el CI en verde
- Choques resueltos como dice la sección 4 del plan, que la sesión adopta tal cual (4.1 a 4.29). Los que más pesan. La etiqueta Demostración, no validado por médicos se quita de cada pantalla y queda un solo aviso global mientras se use el banco de demostración (4.1). La comparación con otros alumnos es de percentiles de lo que ya pasó, nunca un puntaje estimado, y FSRS se queda de fábrica (4.2). En Gratis se cierran grupos, tabla, retos y duelos, y la tarjeta de referidos sigue abierta (4.3). OXXO y SPEI son pases de un solo pago sin renovación y el Fundador solo con renovación automática (4.4). El Fundador mensual y el anual comparten los 100 lugares (4.5). El lugar se aparta al empezar la prueba y se libera si se cancela antes del primer cobro (4.6). Los colores de estado se quedan solo para correcto e incorrecto, avisos y errores, foco y gráficas (4.7). No hay tope diario en los planes de pago, hay un freno por minuto y un aviso al admin (4.10). El alumno elige entre Stripe y Mercado Pago (4.11). Se quitan Logros, insignias y ligas y se quedan XP, nivel, racha y misiones (4.12). Resend es el proveedor de correo (4.13). Los duelos pasan a rivales reales (4.14). Una tarjeta creada en un mazo precargado queda en la capa del alumno (4.16). Portada neutra con la marca Studiare mientras llegan los textos de la agencia (4.17). Prueba gratis y después garantía de 7 días, dichas antes de pedir la tarjeta (4.18). El inglés lo escribe el equipo y la IA solo propone anclada (4.19). Los siete motivos de error de Ricardo reemplazan a las ocho causas de hoy con una tabla de equivalencias (4.23). El catálogo compartido de mazos es de los planes de pago con vista previa en Gratis (4.25). Plexus Medica S. de R.L. de C.V. es la responsable (4.26). Cada consentimiento opcional se pide aparte y empieza apagado (4.27). En el teléfono la barra queda con Inicio, Repasar, Simular, Progreso y Más (4.28). Apple Pay y Google Pay van solo por Stripe, en dos partes (4.29)
- Lo que explicó la sección 5 y se toma como recomendado. Catálogo separado del texto de las preguntas (5.1), lectura solo por función con el tope en el servidor (5.2), la IA que reestructura preguntas sigue prendida para la cola del médico (5.3), la pantalla de datos de demostración se esconde en producción (5.4) y los umbrales de calibración suman alumnos distintos con su primer intento y un error estándar de 0.5 y 0.3 logits (5.5)
- Bloque B0. Se unió la rama de D-118 con main sin conflictos. CLAUDE.md dice dónde vive la clave en producción, que el proxy corre como Edge Function y que OpenAI solo compara calidad. La marca es Studiare en el manifest, la pestaña, index.html y README, con una descripción neutra para Google y WhatsApp, y los textos de la interfaz ya no dicen prototipo. BRAND.themeColor y backgroundColor se corrigen para coincidir con los tokens del modo claro (#0e5a6b y #f5f2ec), con una prueba que lo vigila junto con index.html. El identificador de exportación enarm-prototipo-export-v2 se queda para no romper los respaldos viejos
- Banderas de lanzamiento. src/config/featureFlags.ts con un valor por entorno (desarrollo, demo y producción) que se fija al construir con VITE_APP_ENV. Sin la variable un build de producción es la demo publicada, y producción se declara a propósito al publicar en Cloudflare, para que ningún despliegue esconda la demo por accidente. El servidor manda con la clave feature_flags de platform_settings, que el admin escribe y todos leen por el permiso por fila que ya existía, y cada navegador guarda una copia que se aplica al recargar, igual que los umbrales del admin (D-105). La primera bandera es demoTools, que esconde en producción la pantalla de datos de demostración, su panel y el selector de base, y se conecta a las pantallas en B3 y B7. Las banderas se copian también a quien no ha entrado, porque la tabla las deja leer sin sesión. Un valor del servidor que no cumple el formato cuenta como no leído y deja la copia del navegador como está, para que un error de dedo del admin no reinicie a todos en silencio
- Limpieza de la prueba de pagos. No se pudo hacer desde la sesión. La credencial de Stripe que inyecta el entorno es la llave publicable (pk_test) y no la restringida que pide la sección 10 del plan, y el camino alterno con una función temporal en Supabase lo bloqueó el modo Auto. Queda en docs/PENDIENTES_DE_RICARDO.md con los pasos exactos y con supabase/manual/limpiar-pagos-de-prueba.sql para borrar las filas después de cancelar en Stripe

### D-120. Auditoría inicial de procesos (B1 del plan del cambio)
- Fecha 2026-10-12. Origen C, bloque B1 de D-119. Ricardo pidió auditar a fondo todos los procesos y subprocesos (comentario 17). El inventario está en docs/auditoria-v3/procesos.md y los hallazgos con su gravedad en docs/auditoria-v3/hallazgos.md. El recorrido automático de 32 pantallas con cuatro roles en teléfono y computadora terminó sin hallazgos y los 10 flujos con interrupciones pasan. Lo que la auditoría encontró salió de leer el código y de los huecos de las pruebas
- Consentimientos opcionales apagados al crear el perfil (4.27 del plan). Cambia en parte D-059. El aviso único sigue explicando todas las finalidades, pero Party, análisis con IA y mejora anónima empiezan en no y el alumno las prende en Configuración, Privacidad, o desde la tarjeta del tutor. Se registran como retiradas bajo la versión del aviso que aceptó, así queda constancia de qué texto vio y no cambia cómo se detecta un aviso nuevo. Efecto inmediato. Los errores del navegador ya no se mandan sin permiso y el tutor de pago no llama a la IA hasta que el alumno lo prenda. La pantalla de registro que pide cada permiso por separado llega en B9 y los textos legales en B16
- El examen completo deja de decir Próximamente en Suscripción y en la portada. Existe desde D-082 y la etiqueta era un resto de D-076. La descripción de la retroalimentación deja de prometer un botón de generar tarjetas que llega en B5
- La prueba del SIGNED_IN rezagado deja de depender de un temporizador. El doble de prueba de la nube (src/data/testing/fakeCloud.ts) detiene el cierre de sesión con holdSignOut hasta que la prueba lo suelta con releaseSignOut. Las esperas fijas que quedan en ese archivo son comprobaciones de que nada pasa, que no fallan por carga
- Supabase simulado dentro de Playwright para las e2e de nube. El build de las e2e no tenía nube y ningún proceso de nube se probaba de punta a punta. Se agrega un proyecto cloud con su propio build, que apunta a un origen falso de Supabase, y un servidor falso que atiende auth, PostgREST, RPC y las Edge Functions de pago con una pasarela de mentira. Se eligió esto y no un Supabase local porque el CI no tiene Docker ni Postgres con Auth, y porque los bloques B7 a B10 piden e2e con dos cuentas, pasarela simulada y Google simulado, que necesitan el mismo servidor falso. Lo que simula y lo que no está en tests/e2e/cloud/README.md
- Hallazgos altos que no se corrigen en B1 y van a su bloque, con el motivo en hallazgos.md. El mazo de errores que se duplica entre dispositivos y los ajustes que no viajan, a B14, que cierra la sincronización antes de lanzar. El tope de Gratis solo en el navegador, a B11, donde el banco pasa a la nube y la lectura va por función. Party simulada, a B7. El selector de base de demostración abierto a cualquier alumno, a B3, con la bandera demoTools de B0

### D-121. Sistema de diseño sobrio y rediseño visual (B2 del plan del cambio)
- Fecha 2026-10-12. Origen R, bloque B2 de D-119, comentarios 7, 9, 10, 15 y 18. Ricardo pidió que Studiare se vea como un producto hecho por un equipo experto, sobrio y consistente, con un solo color de acción y sin degradados
- Tokens. Un solo color de acción, #156082, igual en claro y en oscuro, con texto blanco (6.9 a 1) y sus tonos de pasar el cursor y de presionado. Para texto e íconos de ese color sobre fondo claro hay primary-ink (#156082 en claro y #7fc1de en oscuro, para el contraste). Neutros para superficies, bordes y texto. Los colores de estado quedan solo para correcto e incorrecto, avisos y errores, el anillo de foco y las gráficas (4.7). Las ramas pasan de un color por rama a una escala de tonos del color de acción. Dorado, naranja de la racha, degradado del héroe y brillo se quitan en los tres bloques de tokens. Radios de 0.375rem y 0.5rem, bordes finos y sombras neutras y discretas. Una sola familia tipográfica, la de lectura que elige el alumno, y los títulos solo cambian de peso. Se desinstala Bricolage Grotesque, que era la fuente de los títulos
- Título de cada pantalla (comentario 7). La utilidad screen-title da 20 px en el teléfono y 24 px desde 640 px, siempre en negritas, para el saludo de Inicio, los títulos de pantalla y los grupos grandes. Antes el saludo iba de 20 a 30 px con extrabold
- Componentes. El botón primario es #156082 liso y las demás variantes son neutras; la dorada desaparece. Las tarjetas son superficie blanca con borde fino. StatPanel, el recuadro oscuro con degradado de 18 pantallas, pasa a superficie lisa con borde y texto del color de la página, y la barra de progreso deja sus variantes para fondo oscuro. Las etiquetas son neutras salvo los estados permitidos. Sin mayúsculas sostenidas ni letra mono en las etiquetas chicas. La navegación activa es un fondo suave del color de acción sin brillo. La barra de XP, el nivel y la racha van en gris
- Etiqueta de demostración (comentario 9, 4.1). Se quitó DemoContentLabel de sus 21 usos en 17 archivos y la frase de los tres mazos de Paco. Queda un solo aviso global en una línea delgada, Versión de demostración, con la bandera demoBank, prendida en todos los entornos hasta que B11 traiga el banco real. En la base de demostración se muestra solo la línea de Datos simulados, para no apilar dos avisos. Las páginas sin sesión no lo llevan
- Fondos. Se quitan los fondos resplandor, colores de rama, puntos y personalizado con color o foto, y el módulo que guardaba la foto en el navegador. Un ajuste guardado con fondo se ignora y la foto vieja se borra del almacenamiento al abrir la app
- Portada. Héroe sobre superficie blanca con borde, sin círculo difuminado ni texto blanco sobre color. El plan destacado lleva borde del color de acción y una etiqueta neutra. La imagen de logro para compartir y su vista previa son lisas, con la medalla blanca sobre #156082
- Fotos de perfil (comentario 15). Se quitan los 12 avatares generados (src/ui/avatarArt.ts y generated-avatar.tsx). Una cuenta vieja que todavía guarde uno se ve como iniciales. Quedan la foto propia, que el alumno encuadra en un círculo con vista previa antes de guardar (el recortador se carga aparte, solo al elegir un archivo, y la foto sale en 256 por 256 JPEG), y las iniciales sobre el tono suave del color de acción. La foto vive en el bucket privado avatars de Supabase Storage, en la carpeta del alumno, y en la fila de private_accounts queda solo su ruta y una huella para no subirla otra vez en cada sincronización. La ve y la cambia solo el alumno desde su dispositivo activo y la ven sus compañeros de un grupo activo de Party. Al cierre del bloque se quitó a los admins, que había agregado la primera versión, porque el plan dice solo el alumno y su grupo. Entre los dispositivos del alumno gana la elección más reciente de foto o iniciales (avatar_changed_at, que solo cambia al guardar en Tus datos). Si la nube no se pudo leer no se toca la foto ni Storage. Eliminar la cuenta quita antes la foto con la API de Storage y la sesión del alumno, porque el proyecto bloquea el borrado de archivos por SQL; si no se puede, no se elimina nada, y si la base se niega a borrar la cuenta la foto vuelve. Si Storage falla al guardar, la cuenta se guarda igual y se reintenta en la siguiente sincronización, con el motivo solo en consola. Migraciones 20261016000001_avatars y 20261017000001_avatar_changed_at, aplicadas, con pruebas SQL sobre un esqueleto de Storage que copia la protección de borrado del proyecto real. El aviso de privacidad pasa a la versión 2026-10-13 con la foto, Supabase Storage y los lugares nuevos de Configuración
- Pruebas. src/ui/design.test.ts falla si aparece un degradado en src (CSS, TSX o canvas), si el color de acción no es exactamente #156082 en los tres bloques, si vuelven los tokens o utilidades de degradado y dorado o si el botón recupera la variante dorada. tests/e2e/theme-dark.spec.ts pasa axe en todas las pantallas en oscuro. Las pruebas que buscaban la etiqueta por pantalla ahora comprueban que no exista y que el aviso global esté
- Lo que no cambió a propósito. Las frases de las ramas y sus colores siguen como tokens, para que un cambio de criterio sea solo de tokens, y los íconos siguen siendo lucide-react con grosor 2 en toda la app
- Revisión de diseño independiente (docs/auditoria-v3/revision-diseno-b2.md). 21 hallazgos, 2 altos, 8 medios y 11 bajos, sobre las 38 pantallas de antes y después. Los altos eran las píldoras en pestañas, filtros y etiquetas (66 usos en 40 archivos) y las etiquetas de colores de estado en Progreso e Inicio. Se corrigen en el mismo bloque con dos componentes nuevos, SegmentedControl para pestañas y filtros excluyentes y FilterChip para los demás, con Badge neutro para las etiquetas, el color de estado solo en un punto o ícono, un Skeleton de carga en lugar de la rueda, estados vacíos alineados a la izquierda sin marco punteado, el input de archivo en español con botón propio, el Disclosure con superficie propia y los ajustes de contraste y de teléfono que señaló. Dos hallazgos se dejan a propósito. Las pestañas de Configuración que desbordan a 390 px (H13), porque B3 las quita, y los usuarios del admin como tarjetas en lugar de tabla (H15), que pasa a B9 con las cuentas. La portada conserva un título de 30 y 36 px, más grande que la escala de la app, porque es la página de venta y la única excepción (H16)
- Cierre de la revisión (2026-10-13, sesión que retomó el PR 37). Las píldoras quedan prohibidas por prueba. src/ui/design.test.ts falla con un rounded-full que no sea círculo (con size- y sin relleno horizontal), salvo en las barras, las muestras de las gráficas, el reloj del Pomodoro y el recorte de la foto. Progreso e Inicio dejan el color de estado solo en un punto de 8 px junto al porcentaje y las palabras en Badge neutro. Los títulos de grupo de Inicio se quedan del tamaño del saludo y en negritas, porque el comentario 7 de Ricardo pide el saludo del tamaño de Tus repasos (manda sobre H05, que pedía bajarlos). La línea Realizados de la gráfica pasa a #6c98b0 (3.1 a 1 sobre blanco) y el relleno neutro de las barras a fg-muted (5.3 a 1). Un token indicator (#156082 en claro y #7fc1de en oscuro) pinta bordes, anillos, barras y gráficas, que en oscuro daban menos de 3 a 1 con #156082, y el botón principal sigue en #156082. Los bordes fuertes de los campos pasan a #7d8892 en claro y #66747f en oscuro (más de 3 a 1). La opción activa de los controles segmentados se ve como un filtro prendido. Los íconos decorativos, las iniciales, los cuadros de la portada y los avisos informativos pasan a neutro, y el color de acción queda en botones, enlaces, navegación activa, filtros prendidos y lo seleccionado (comentario 10). La prueba de diseño también falla con utilidades de degradado de Tailwind y degradados de SVG. Con la base de demostración salen juntos en una línea Versión de demostración y Datos simulados (4.1). El Tutor guarda la respuesta de cada hipótesis en el mismo toque y ya no recalcula toda la vista en cada escritura, lo que hacía tardar la tarjeta unos 4.5 s y dejaba responder dos veces. El héroe de la portada baja de py-14 a py-10 y su texto va en el ancho de lectura. Las pestañas de Configuración ya no esconden Cuenta a 390 px porque se acomodan en dos renglones, y B3 las quita

### D-122. Navegación, Configuración en una página, Perfil y Ajustes del repaso (B3 del plan del cambio)
- Fecha 2026-10-13. Origen R, bloque B3 de D-119, comentarios 3, 4, 5, 6, 12, 13, 14 y 16 de Ricardo, con 4.12 y 4.28 del plan
- Menú. Cada rol tiene secciones principales, grupos extra y lo fijo. En computadora el riel lleva Inicio, Repasar, Apuntes, Simular, Progreso, Tutor y Party, y abajo a la izquierda, sola y separada por una línea, Configuración con el engrane. Plataforma del admin deja el engrane y usa el ícono de controles. En el teléfono la barra lleva Inicio, Repasar, Simular, Progreso y Más, y Más abre una hoja de Radix con Apuntes, Tutor, Party y Configuración, más el grupo de administración del admin y del dueño. El médico ve Banco, Acuerdo, Borradores y Reportes, y Más con Configuración. Más queda marcado cuando la pantalla abierta es una de las suyas. Datos de demostración aparece en el grupo del admin solo con la bandera demoTools (5.4)
- Rutas viejas. /perfil lleva a Configuración y /planificador y /logros a Progreso, con un loader que reemplaza la dirección para que el botón de atrás no regrese. Los números de pantalla 13, 15 y 31 no se reusan
- Apuntes tiene su lugar en el menú y deja de ser pestaña de Repasar. Su ruta no cambia
- Configuración es una sola página con las secciones Perfil, Apariencia y Privacidad, cada una con su subtítulo y una línea entre ellas, y anclas #perfil, #apariencia y #privacidad. Los enlaces viejos con ?seccion= llevan a su sección, y los de Estudio y Pomodoro a Ajustes del repaso. Sin sesión quedan el aviso para entrar de toda la app y Apariencia
- Perfil. Primero Tu plan, con su nombre, su precio, hasta cuándo vale y Cambiar tu plan. Después Tus datos, de solo lectura, con la foto en línea con el alias y sin XP, nivel ni racha (están en la barra de arriba). Editar perfil abre alias, foto y datos de la cuenta con Guardar y Cancelar, y avisa al salir con cambios sin guardar, tanto al cambiar de pantalla como al cerrar la pestaña. El correo no se edita aquí y la fecha del ENARM es de solo lectura (D-059). Al final Tu sesión, con la sincronización y Cerrar sesión. Cómo nos conociste llega en B9 y Pedir factura en B10. El fin de la prueba gratis se muestra cuando exista en B10
- Ajustes del repaso. Todo lo que se guarda del repaso vive en un panel de Repasar, una hoja a la derecha en computadora y pantalla completa en el teléfono, que se abre con su botón o con ?ajustes=1 y ?ajustes=pomodoro. Metas del día, tarjetas nuevas y repasos, opciones al estudiar, temporizador, días fáciles, opciones avanzadas de FSRS, las ayudas de carga diaria y el Pomodoro. Cada ajuste tiene un solo lugar. Qué quieres repasar solo lee los límites y enlaza al panel. El engrane de la píldora del Pomodoro abre el panel en su parte (ajusta D-063). Con el panel abierto los atajos del repaso no responden. Queda marcado el lugar de los recordatorios por correo de B15
- Progreso recibe del planificador la semana de 7 días que empieza hoy, con lo hecho de hoy y lo planeado de los demás días, porque el planificador nunca guardó sus planes y lo planeado del pasado se tendría que inventar. Conserva el aviso de sobrecarga con sus dos opciones, que guardan lo mismo y con los mismos eventos que antes, y Tu tiempo al día con su calibrando. El motor del planificador acepta los minutos ya usados hoy y sigue siendo puro. Lo que ya está en Inicio, como las acciones de hoy, no se pasó
- El puntaje oficial del ENARM se captura en Progreso, al final de la pantalla. Su permiso sigue en Privacidad y sin él la tarjeta lleva ahí
- Logros se quita por completo con su pantalla, las insignias, el aviso al ganarlas (D-110) y las ligas (respuesta 70), sin tocar los eventos guardados. WidgetTypeSchema conserva sus valores para leer acomodos viejos. El motor de recompensas se reduce a las misiones de hoy, que siguen en Inicio, y el sonido de insignia pasa a llamarse de reto porque lo usan los retos de grupo. XP, nivel y racha se quedan en la barra de arriba (4.12)
- Lo que vivía en la pestaña Cuenta y no es del alumno, el selector de base de demostración y el generador, pasa a Datos de demostración del admin detrás de demoTools. El panel de datos de demostración de Configuración se quita porque el generador del admin hace lo mismo con más ajustes
- Cierre con la revisión independiente. Cuándo llega la retroalimentación de la práctica se cambia solo en Ajustes del repaso, y Simular lo muestra de solo lectura con un enlace al panel. Abrir el panel agrega un paso al historial, así que Atrás lo cierra. Cerrarlo con cambios sin guardar pregunta antes con Escape, la X, el fondo o Atrás, pero no al recargar ni al cerrar la pestaña, para no lanzar el aviso del navegador justo después de Guardar. El aviso de cambios sin guardar es uno solo para el panel y Editar perfil, enfoca Seguir editando y regresa el foco a lo que intentó salir
- Una demostración vacía lleva a Datos de demostración solo al admin o al dueño con demoTools. Los demás regresan a Mi cuenta. La tarjeta del modo de la IA vive siempre arriba en Costos de IA
- Las misiones semanales se quitan y quedan las tres de hoy. La portada ya no habla de ligas ni logros, y los grupos prometen la tabla de la semana, los retos y los duelos
- El botón de borrar se oscurece al pasar el puntero en lugar de perder opacidad, para no bajar de 4.5 a 1 de contraste. La sugerencia de tarjetas nuevas se llama así para no repetir el nombre del campo de nuevas en el mismo panel
- El puente con la nube no reabre una sesión que el alumno cerró mientras una revisión seguía en curso (carrera real que encontró la e2e de la cuenta)

### D-123. Temas de cada mazo y Buscar tarjetas (B4 del plan del cambio)
- Fecha 2026-10-13. Origen R, bloque B4 de D-119, comentarios 8 y 11 de Ricardo
- Temas de cada mazo. Salen de las tarjetas. En los mazos de Paco, de la ruta de la etiqueta (rama, materia y tema, como Medicina interna, Reumatología y Artritis reumatoide), porque las claves branch y topic de las notas solo llegan a la subespecialidad y no dan el ejemplo de Ricardo. En Mis errores, de las claves de la taxonomía. En importados y propios, del submazo o de la primera etiqueta en ruta. Cada mazo muestra un árbol de hasta tres niveles agrupado por rama, en orden de Intl.Collator es-MX con sensibilidad base, sin repetidos y sin recortar nombres. Los niveles cuarto y quinto, como Diarrea, Agentes y Salmonella, no se muestran. En Repasar los temas solo se muestran y se sigue eligiendo por mazo y subespecialidad
- Nombres legibles. La tabla src/demo/content/topicDisplayNames.ts traduce los nombres pegados de Paco (como AnticonceptivosyMPF y Hemorragias1T) y se aplica solo a las notas precargadas. En importados y propios solo se cambian guiones bajos por espacios. Una prueba exige que la tabla esté completa. Algunas elecciones piden revisión médica (Hongos como Micosis, Térmicos como Alteraciones por temperatura, GW como Granulomatosis con poliangitis, UNM como Enfermedades neuromusculares). Las materias guardadas con nombre pegado se renombran una vez al abrir la sesión
- Buscar tarjetas reemplaza a Explorar. Conserva su ruta /mazos/explorar, la clave explore, su permiso y los enlaces con ?estado=, y suma marcadas. Una barra de búsqueda con resultados al teclear y la misma sintaxis de antes, chips con su conteo (mazo, tema, estado, vencidas, sanguijuelas y marcadas) y Más filtros para lo raro. Desde 64rem una tabla que se ordena por columna con un panel al lado para ver y editar la tarjeta, y en el teléfono una lista con hojas de filtros y de tarjeta. Casillas y acciones en lote para suspender, reanudar, mover, etiquetar y reiniciar. Atajos /, flechas, Enter, Esc y X. Pinta de 60 en 60 con IntersectionObserver y un botón de respaldo
- Marcadas son las tarjetas con señal de controversia de la IA, con la etiqueta Marcadas por la IA, porque no existe una marca propia del alumno
- Reiniciar es un evento nuevo cards_reset que solo se agrega, en lotes de hasta 500 tarjetas. La tarjeta vuelve a ser nueva y sus repasos siguen en la bitácora
- El motor cardSearch recorre una sola vez las filas y da resultados y conteos. Con 10,000 tarjetas filtrar tarda menos de 10 ms de mediana (el límite es 100 ms)
- Cierre con la revisión independiente. Buscar tarjetas usa la misma profundidad de temas que Repasar (rama, materia y tema) en la columna, la lista, el panel y el filtro, y los niveles cuarto y quinto solo cuentan para buscar. La tabla de nombres legibles suma 44 entradas de los niveles de abajo y de nombres pegados, y su prueba revisa todos los niveles. En Repasar la lista de temas de cada mazo va abierta dentro de Mazos y temas, y en Mazos sigue plegada. Ordenar por texto sigue el español de México sin los signos de apertura. Con el panel abierto la tabla esconde Intervalo y Fallos. Reiniciar pone en cero los olvidos de la tarjeta en Conócete sin tocar la bitácora

### D-124. Crear tarjeta desde una pregunta y los siete motivos de error (B5 del plan del cambio)
- Fecha 2026-10-13. Origen R, bloque B5 de D-119, comentarios 1 y 2 de Ricardo, con 4.16 y 4.23 del plan
- Crear tarjeta. Un botón en cada pregunta de la revisión del examen y de la retroalimentación de la práctica. El alumno elige entre sus mazos editables, los precargados que sigue y Nuevo mazo. La tarjeta se arma con el texto del banco sin IA, con el caso en corto y la pregunta al frente, y la respuesta, la explicación y la referencia atrás, y se puede editar antes de guardar. En los planes de pago también está Sugerir con IA, anclado a la explicación de la pregunta con su cita literal y la etiqueta de borrador. Si el alumno edita una propuesta de la IA, se vuelve a revisar contra su cita
- Capa del alumno (4.16). En un mazo precargado la tarjeta va a un mazo privado Mis tarjetas que cuelga del precargado, así el mazo compartido no cambia para nadie
- Sin duplicados. Los IDs de la nota y la tarjeta salen del alumno, la pregunta, su versión y el mazo, y la creación corre de una en una. Queda el evento nuevo question_card_created, que solo se agrega, con la pregunta y su versión. Las tarjetas creadas no se ligan a la pregunta como las de Mis errores, para que Repasar no las trate como errores
- Por qué fallaste. Siete botones de un toque en cada pregunta fallada de la revisión: Conocimiento, Tiempo, Malinterpretación, Lectura superficial, Ansiedad, Exceso de confianza y Fatiga. Es opcional, se puede cambiar, cada cambio es un evento nuevo y vale el último del intento más reciente. Las preguntas en blanco no lo piden por ahora
- La lista de ocho causas de antes se reemplaza en toda la app (4.23). Los eventos viejos no se editan y se leen con esta tabla de equivalencias. No lo había estudiado, Lo olvidé y Lo confundí con otra cosa pasan a Conocimiento. Leí mal pasa a Malinterpretación. Se me pasó un detalle pasa a Lectura superficial. Fui muy rápido o estaba cansado pasa a Tiempo. Cambié mi respuesta pasa a Ansiedad. Otra razón queda sin motivo, porque no dice cuál de los siete aplica. Se leen los quince valores y solo se escriben los siete nuevos
- Los motivos alimentan Progreso con el reparto por rama, Conócete, las reglas de olvido, los contextos del tutor y los consejos por trampa. Las dos de lectura cuentan como lectura equivocada en las preguntas negativas. Ansiedad no tiene una señal propia en el tutor
- Cierre con la revisión independiente. Una propuesta de la IA que el alumno edita se revisa otra vez contra su cita y, si no pasa, se guarda en borrador con el aviso a la vista. Cada Crear tarjeta del resumen de la práctica lleva el número de su pregunta. Si el alumno movió su capa Mis tarjetas fuera del precargado se respeta y se arma otra. El motivo de error de la revisión del examen lleva la sesión del examen
- Versión paralela. El 2026-10-14 entró directo a main, sin PR, otra versión de B4 y B5 (commits f9040e4 y bb61d82) que dejó el e2e de main en rojo con 11 fallas. Ricardo eligió esta versión, revisada y con sus e2e en verde, y aquella se revirtió en 9bcf111. Lo que aquella traía y esta no se revisa aparte y lo que valga se porta con su propia prueba

### D-125. Apuntes que se vuelven tarjetas sin memorizar marcas, modo clase y búsqueda (B6 del plan del cambio)
- Fecha 2026-10-13. Origen R, bloque B6 de D-119, respuestas 20 y 74
- Tarjeta sin marcas. La línea del cursor cambia su viñeta por un botón y la barra del editor tiene el botón Tarjeta. Los dos abren un menú con Pregunta y respuesta, En los dos sentidos, Con hueco, Respuesta abajo y Quitar la tarjeta, y cada opción enseña su marca. El botón solo escribe la marca y nunca corrige el texto del alumno. La línea conserva su id, así la tarjeta conserva su historial. Las marcas se ven siempre en una línea bajo el editor. Salen de la barra los botones que insertaban marcas sueltas
- Mazo y tema de cada apunte. El mazo puede ser cualquier mazo propio o el automático dentro de Apuntes. Un tema del ENARM pone a las tarjetas la etiqueta topic:clave, la misma que leen Repasar y el tutor. Una materia libre pone Materia::Nombre y nunca topic:, así no cuenta en las estadísticas del ENARM
- Modo clase con las plantillas Clase, Caso clínico y Resumen de tema y materias libres fuera de la taxonomía del ENARM, para el uso de pregrado
- Búsqueda en todos los apuntes, sin acentos ni mayúsculas, que abre el apunte en la línea encontrada, y esquema de hasta tres niveles
- IA en los planes de pago. Solo lee las líneas sin marca, cada propuesta se ancla a una sola línea con su frase literal y llega con la etiqueta Borrador, no validada por médico. El alumno acepta, edita o descarta una por una
- En Gratis Apuntes se ve con candado, una vista previa y el botón de los candados, que dice Ver planes mientras la bandera freeTrial siga apagada y Prueba 7 días gratis cuando B10 la prenda. Los apuntes que ya existían se guardan y sus tarjetas siguen en Repasar. El candado del servidor llega en B8
- Cierre con la revisión independiente y la unión con B4 y B5. Guardar mazo y tema manda la versión que se abrió y, si otra ventana guardó antes, sale el aviso del editor con Abrir la versión nueva en lugar de pisarla. Las tarjetas de una materia libre no cuentan en Conócete, en Por qué fallas de Progreso ni en el tutor, que recalcula su vista cuando cambian. Las tarjetas con IA guardan el apunte de donde salieron. Una sola approveGeneration para Crear tarjeta (B5) y los apuntes, que suma lo guardado sin repetir el evento y no toca un artefacto rechazado. Los colores de Apuntes siguen el cierre de B2. Queda por decidir el color de las marcas dentro del texto del editor

### D-126. Party en la nube, modo enfoque, resumen semanal y referidos con el primer cobro (B7 del plan del cambio)
- Fecha 2026-10-13. Origen R, bloque B7 de D-119, respuestas 69 a 77, 82 y 83, con 4.3, 4.14 y 5.4
- Party en la nube para toda cuenta real con nube. La base de demostración conserva la Party simulada con su etiqueta y sin nube Party explica que la necesita. Grupos con invitación por enlace (/party?codigo=) o código, tabla de la semana con alias y XP de la semana, retos de 7 días y duelos reales de 20 preguntas que cada quien contesta cuando puede. Cada alumno manda una sola vez sus aciertos y su tiempo, y el resultado del rival solo se ve después de mandar el propio. El rival de práctica simulado se queda en la demo
- Toda escritura de Party pasa por funciones de la base y toda lectura por party_overview con las políticas. Solo viajan ids seudónimos, alias y cifras sumadas, nunca correos. Hay topes contra abuso (50 miembros por grupo, 10 grupos por alumno, 5 grupos nuevos al día, 10 códigos fallidos por hora, 10 retos activos por grupo y 10 duelos esperando). party_open es el único lugar donde B8 pondrá la condición del plan. El permiso de Party empieza apagado (4.27) y quitarlo saca de todos los grupos. Migración 20261018000001_party_cloud
- Modo enfoque (respuesta 82). Un interruptor en Apariencia que esconde en toda la app la racha, el nivel, el XP, la escalera de niveles, el reto de Party en Inicio, el XP de la práctica, el examen y el repaso, y la tabla y los retos dentro de Party. El XP se sigue ganando y las misiones de hoy se quedan
- Resumen semanal para compartir (respuesta 83). Comparte tu semana reemplaza a Comparte tu logro, con días de estudio, repasos, preguntas y racha de la semana en curso, sin aciertos, XP ni puntaje, sin degradados, con el menú de compartir del teléfono y, si no hay, descarga
- Referidos (4.3). Invita y gana un mes vive en Party y en Configuración, sección Perfil, abierta en Gratis, con el enlace /bienvenida?ref=CODIGO que la nube canjea sola al conectar la cuenta. El referido se concreta con el primer cobro verificado de más de 0 pesos, uno por referido. La factura de 0 pesos de una prueba gratis nunca concreta y un aviso repetido no da otro mes. Migración 20261019000001_referral_first_charge
- Producción sin demo (5.4). Sin la bandera demoTools la base es siempre Mi cuenta, el selector de rol queda cerrado y sin nube el rol es alumno
- Cierre con la revisión independiente y la unión con B4, B5 y B6. Un duelo cuenta desde que se empieza (party_start_duel), se juega una sola vez y las preguntas sin contestar cuentan como incorrectas. El mes por referido se revierte si el primer cobro se reembolsa completo y se rechazan los referidos en círculo. Quien administra cambia el código, quita miembros y borra retos, y si borra su cuenta el grupo pasa al miembro activo más antiguo (archivo manual party-dueno-al-borrar-cuenta.sql). Por columnas la API solo lee id y alias de profiles. Las cifras imposibles se rechazan (PT004). Exportar mis datos trae las filas de Party. La pantalla de la pregunta espera la pregunta del número que muestra, así un duelo no se traba con la máquina lenta. El aviso de privacidad pasa a la versión 2026-10-14 porque cambió el texto de Party
- Migraciones aplicadas al proyecto el 2026-10-14 con el conector, sin los comentarios largos y comprobadas función por función contra el repo

### D-127. Plan Gratis con candados en la app y en el servidor (B8 del plan del cambio)
- Fecha 2026-10-14. Origen R, bloque B8 de D-119, respuestas 18, 19 y 20, con 4.3 y 4.25
- En Gratis quedan cerrados, con una vista previa y el botón de los candados (Ver planes hasta que B10 prenda la prueba de 7 días), Party, Subir tus mazos, seguir mazos nuevos del catálogo y Apuntes. Un solo componente de candado (LockedPreview y LockedNote), con palomitas grises para respetar el color único de acción. FeatureGate sin vista previa muestra un aviso corto
- Siguen abiertos en Gratis las 20 preguntas al día con su explicación, Invita y gana un mes con las funciones de referidos, Comparte tu semana, exportar y borrar los datos propios, salir de Party y repasar lo que ya está en el dispositivo. Un mazo del catálogo con al menos un repaso en la bitácora cuenta como del alumno, también en un dispositivo nuevo
- En el servidor la regla de plan de pago es la de user_plan (incluye el mes por referido y el plan cancelado o con cobro fallido mientras siga vigente), en una sola ayuda interna. El rol no cuenta. party_open la usa, así quedan cerradas a la vez las políticas, los perfiles de compañeros, las fotos y las funciones de Party. Migraciones 20261021000001_free_plan_locks y 20261021000002_free_plan_party_moderation
- Apuntes en Gratis. El servidor ignora en silencio los apuntes nuevos o cambiados sin tumbar la subida, y la app los marca pendientes y los manda completos con el primer plan de pago. La marca de borrado entra y conserva lo que tenía la nube. Los candados esperan el plan de la nube solo si no hay uno guardado
- Party con miembros en Gratis. Quien baja a Gratis sigue en sus grupos hasta salir, sus compañeros lo ven con alias, foto y últimas cifras, y cuenta en el cupo de 50. Los duelos que esperan a un rival sin Party abierta no cuentan para el tope de 10, y contra un mismo rival se esperan a lo más 10. Modera quien administra mientras siga con Party abierta y, si no, el miembro activo más antiguo que sí la tenga. Las políticas calculan el plan una vez por consulta
- Subir mazos y el catálogo se cierran solo en la app hasta que el banco y los mazos vivan en la nube (B11). La demo sigue el plan del alumno de demostración
- Endurecimiento. is_group_member y shares_group dejan de poder ejecutarse sin sesión
- Revisión independiente con sus 13 hallazgos corregidos, y la unión con B4 a B7 en main con 5 choques que git no marcó, corregidos
- Migraciones aplicadas al proyecto el 2026-10-14, justo antes de fusionar el PR 49. 20261021000001_free_plan_locks y 20261021000002_free_plan_party_moderation, con sus 15 funciones iguales al repo por huella y ninguna ejecutable sin sesión

### D-128. Paleta de color sistemática por rama, acento cálido y contraste accesible
- Fecha 2026-10-13. Origen R, ajuste visual posterior a B2. Ricardo sintió la app demasiado monocromática después del rediseño B2 y pidió agregar color de forma sistemática mediante tokens para que toda la app lo herede, conservando la sobriedad, la accesibilidad y el color de acción único
- Esta decisión reemplaza por completo la regla 4.7 del plan del cambio. Se supera el esquema donde las ramas eran solo variantes del color de acción y donde racha, nivel y XP eran grises neutros
- Reglas que se mantienen firmes. El color de acción primario sigue siendo exactamente #156082 en claro y en los dos bloques oscuros con texto blanco encima a 6.9 a 1 de contraste. Se prohíben degradados, brillos y sombras con color en toda la app. El color nunca es la única señal, por lo que todo lo que ya lleva ícono y texto los conserva. Verde, ámbar y rojo continúan estrictamente reservados para estados de acierto, aviso y peligro, por lo que no se usan en ramas ni en acentos
- Color por rama. Cada una de las seis ramas troncales recupera un color propio distinguible y seguro para daltonismo, con sus variantes soft e ink en claro, en el bloque prefers-color-scheme dark y en el bloque root.dark. Todos los tonos principales pasan el contraste gráfico de 3 a 1 sobre la superficie, y todas las tintas ink pasan el contraste de texto de 4.5 a 1 sobre su fondo soft y sobre la superficie
- Medicina Interna (mi). En modo claro usa base #1d638f con contraste 6.49 a 1 sobre blanco, soft #e8f1f7 e ink #134666 con contraste 8.75 a 1 sobre soft y 10.02 a 1 sobre superficie. En modo oscuro usa base #6faed6 con contraste 7.03 a 1 sobre superficie, soft #142938 e ink #9ecbee con contraste 8.71 a 1 sobre soft y 9.88 a 1 sobre superficie
- Pediatría (ped). En modo claro usa base #087d8a con contraste 4.87 a 1 sobre blanco, soft #e6f5f7 e ink #06545d con contraste 7.71 a 1 sobre soft y 8.62 a 1 sobre superficie. En modo oscuro usa base #5bc2cf con contraste 8.13 a 1 sobre superficie, soft #112d33 e ink #8ee0ec con contraste 9.69 a 1 sobre soft y 11.33 a 1 sobre superficie
- Ginecología y Obstetricia (gyo). En modo claro usa base #8c3372 con contraste 7.41 a 1 sobre blanco, soft #f8eaf4 e ink #60214e con contraste 9.90 a 1 sobre soft y 11.50 a 1 sobre superficie. En modo oscuro usa base #cf6cb2 con contraste 5.20 a 1 sobre superficie, soft #331429 e ink #e89ed2 con contraste 8.05 a 1 sobre soft y 8.28 a 1 sobre superficie
- Cirugía General (cir). En modo claro usa base #4d4ba3 con contraste 7.36 a 1 sobre blanco, soft #edecf9 e ink #333175 con contraste 9.78 a 1 sobre soft y 11.43 a 1 sobre superficie. En modo oscuro usa base #918fe0 con contraste 5.82 a 1 sobre superficie, soft #1e1d38 e ink #b9b8f2 con contraste 8.69 a 1 sobre soft y 9.05 a 1 sobre superficie
- Medicina Familiar (fam). En modo claro usa base #913a5a con contraste 7.10 a 1 sobre blanco, soft #faeaf0 e ink #64243b con contraste 9.74 a 1 sobre soft y 11.30 a 1 sobre superficie. En modo oscuro usa base #d67394 con contraste 5.44 a 1 sobre superficie, soft #351420 e ink #eda4be con contraste 8.37 a 1 sobre soft y 8.60 a 1 sobre superficie
- Urgencias (urg). En modo claro usa base #63398c con contraste 8.41 a 1 sobre blanco, soft #f2eaf9 e ink #432462 con contraste 10.74 a 1 sobre soft y 12.59 a 1 sobre superficie. En modo oscuro usa base #a67dd4 con contraste 5.25 a 1 sobre superficie, soft #241336 e ink #caa9ee con contraste 8.53 a 1 sobre soft y 8.42 a 1 sobre superficie
- Acento cálido para racha, nivel y XP. Se sustituyen los tonos grises neutros por un color cálido terracota sobrio y distinguible, sin destellos ni dorado brillante. En modo claro el token accent y streak es #a64a13 con contraste gráfico 5.81 a 1 sobre blanco, accent-soft y streak-soft es #fbf0e8, accent-ink y streak-ink es #78320a con contraste 8.29 a 1 sobre soft y 9.29 a 1 sobre superficie, y accent-fg es #ffffff con contraste 5.81 a 1 sobre accent. En modo oscuro el token accent y streak es #ea8b48 con contraste gráfico 6.69 a 1 sobre superficie, accent-soft y streak-soft es #351d10, accent-ink y streak-ink es #f5ab7a con contraste 8.23 a 1 sobre soft y 8.87 a 1 sobre superficie, y accent-fg es #171d24 con contraste 6.69 a 1 sobre accent
- Gráficas y corrección del hallazgo H12. El token line-strong se ajusta a #707b85 en claro con contraste 4.32 a 1 sobre blanco, 3.78 a 1 sobre muted y 3.61 a 1 sobre lienzo, y en oscuro se mantiene #66747f con contraste 3.53 a 1 sobre superficie y 3.10 a 1 sobre muted, superando ambos el umbral de 3 a 1. El token chart-done se actualiza a #5687a1 en claro con contraste 3.90 a 1 sobre superficie y 3.61 a 1 sobre lienzo, y en oscuro a #4e7f96 con contraste 3.87 a 1 sobre superficie y 4.23 a 1 sobre lienzo, resolviendo la baja visibilidad reportada en H12. El token chart-scheduled se mantiene en #156082 en claro con contraste 6.93 a 1 sobre superficie y #7fc1de en oscuro con contraste 8.55 a 1 sobre superficie
- Escala de cinco pasos para el heatmap. Se agregan tokens sistemáticos del nivel cero al nivel cuatro para la intensidad de estudio. En modo claro van del paso cero #eef0f2 sobre muted, paso uno #c4dbe6, paso dos #84b7cf, paso tres #428fae, hasta el paso cuatro #156082. En modo oscuro van del paso cero #202831, paso uno #163647, paso dos #255973, paso tres #448ba8, hasta el paso cuatro #7fc1de. Cada paso mantiene una progresión perceptual armónica con contraste adecuado
- Verificación automatizada. La prueba src/ui/design.test.ts valida matemáticamente que todos los pares de texto cumplan al menos 4.5 a 1 de contraste y que todos los elementos gráficos, ramas y gráficas cumplan al menos 3 a 1 sobre su superficie, tanto en modo claro como en los dos bloques de modo oscuro
- Integración. La propuso otra herramienta en el PR 47 con el número D-122, que ya era de B3. Ricardo pidió más color el 2026-10-14 y se integró por la rama de trabajo con este número, sobre B3 a B8 ya fusionados, con sus pruebas y capturas en docs/screenshots/v3/paleta
- Dónde se ve el color de rama. Con etiqueta (BranchBadge, fondo suave y tinta de la rama) en la rama y el tema de la pregunta en práctica y examen, en los mazos y en el banco y los reportes del médico. Con marca (BranchMark, una línea delgada) en Ramas de Progreso, el selector de ramas de Simular y Repasar, Temas para reforzar, Por qué fallas y las ramas de los resultados del examen. El nombre de la rama siempre va al lado. Resuelve H20. Una rama desconocida queda en neutro
- El acento cálido es solo de racha, nivel y XP. Lo que lo usaba sin serlo pasa a neutro (aviso de pausa, fin del examen, consejos del tutor y corona del dueño), las tarjetas nuevas de la carga futura pasan a chart-done y el XP del repaso deja el verde, que es solo de estados
- El heatmap de Inicio usa la escala heatmap-0 a heatmap-4 en lugar de transparencias del color de acción
- Se quedan sin color de rama a propósito el árbol de temas de cada mazo, que solo tiene nombres, y el confeti, que tiene colores fijos
- Cierre. Typecheck, lint y formato limpios, Vitest con 3,203 pruebas, theme-dark 10 de 10 y la e2e completa en teléfono y computadora sin fallas de contraste ni de axe. Las dos que fallaron con la máquina cargada (offline y rendimiento) pasan solas 6 de 6. 30 capturas nuevas en docs/screenshots/v3/paleta
- Revisión independiente sin fallas graves. Se corrigió lo que encontró. El descanso del Pomodoro y las #etiquetas de Apuntes usaban los tokens de Cirugía y de Medicina familiar y ahora van en neutro, las dos partes de la carga futura se separan con una línea del color de la superficie, el paso 1 del heatmap oscuro sube a #1b4257 para separarse del paso 0, y design.test.ts suma los pares que se usan (texto sobre muted, acento sobre muted y sobre su fondo suave, XP sobre el lienzo) y exige que los dos bloques oscuros sean iguales

### D-129. Cuentas y acceso con invitación, Google, segundo factor del equipo y edad mínima (B9 del plan del cambio)
- Fecha 2026-10-14. Origen R, bloque B9 de D-119, respuestas 22, 26, 30, 52 y pregunta 45, con H15, H17 y H29
- Registro solo por invitación hasta el lanzamiento. Decide el servidor con el gancho Before User Created y la clave registration_open de platform_settings, que nace en false. Las invitaciones no se gastan al usarse. Un Gmail con puntos o con + cuenta como otro correo. Ya tengo cuenta sigue creando la cuenta de acceso al pedir el código, para que un correo invitado entre y complete su registro
- Segundo factor del equipo con una sola bandera, requireMfa de feature_flags, que leen la app y la base. current_app_role da el rol de médico, admin o dueño solo con sesión aal2 cuando la bandera está prendida, así que is_admin y todas las políticas lo heredan sin políticas restrictive aparte. assigned_app_role guarda el rol sin esa condición para las reglas que protegen al dueño. staff_mfa_required solo acepta el booleano true. El dueño restablece el factor de otro con la función admin-reset-mfa, que revisa con la base y deja constancia en mfa_resets. El segundo factor tiene 10 s de tiempo límite y Cerrar sesión siempre a la vista en las esperas
- Completa tu registro se decide con los datos y no con el proveedor. Lo pide una cuenta sin formulario cuando la nube no tiene confirmación de edad ni aceptación del aviso. Las cuentas de antes de B9 no cambian. Hasta completarlo no abre sesión local, no sube, no registra la aceptación ni sincroniza. Si la nube no contesta en 10 s queda bloqueado con reintento y salida
- El error al volver es de Google solo con la marca de sessionStorage (una hora, un regreso). Sin ella es del enlace del correo. Lo llenado en Crear cuenta se lee sin borrarlo y se borra ya unida la cuenta, para que dos revisiones a la vez no dejen un perfil vacío
- El alias de un perfil nuevo es Alumno y el nombre de Google no se usa. Un código de influencer sin canal cuenta como canal influencer. Cómo nos conociste vive en signup_sources, sin permisos de tabla para la API, y el equipo solo ve conteos
- La edad mínima es 18 años. Se guarda solo la fecha de la confirmación en private_accounts.adult_confirmed_at, que la base no deja borrar ni cambiar
- H29. detailsChangedAt solo sale de Tus datos. Lo del registro entra una vez campo por campo y gana la nube, sin mandar vacíos
- El canje del código de un compañero espera a que la cuenta complete su registro y registre el aviso
- El aviso de privacidad pasa a la versión 2026-10-14b. Las versiones se comparan como texto, así que queda después de 2026-10-14 y antes de cualquier fecha posterior
- La migración 20261020000001 lleva un número menor que las de B8, pero en el proyecto se aplica después de ellas. run.sh prueba ese orden y no pisa party_open, sync_push_records ni user_plan
- Revisión independiente con sus hallazgos corregidos. La e2e encontró tres fallas reales más, corregidas con su prueba
- Migración 20261020000001_accounts_access aplicada al proyecto el 2026-10-14, después de las de B8 y justo antes de fusionar el PR 52, con sus 12 funciones iguales al repo por huella. La consulta de comprobación de docs/SUPABASE.md dio registro cerrado, el gancho solo para Auth, las respuestas privadas y el segundo factor apagado. La función admin-reset-mfa se publica con B10

### D-130. Pagos completos con prueba gratis, pases, Fundador anual, Mercado Pago y facturas (B10 del plan del cambio)
- Fecha 2026-10-15. Origen R, bloque B10 de D-119, respuestas 1, 2 y 7 a 21, comentario 19
- Planes. Fundador 79 al mes y 749 al año (100 lugares compartidos, solo con tarjeta), regular 149 al mes y 1,499 al año, pases sin renovación de 149 y 1,499 con OXXO o SPEI. Prueba gratis de 7 días, una por persona y por correo normalizado, con el cobro automático dicho antes de pedir la tarjeta. Garantía de 7 días naturales
- user_plan y my_plan v2. La prueba, los pases, el mes por referido y founder_annual cuentan como pago. El servidor solo pregunta si el plan es distinto de free
- Lugares Fundador. Toda suscripción Fundador nueva toma lugar con candado global. Cupo lleno da founder_full con la cancelación en cola y el cobro marcado para devolver. Un lugar apartado de una cuenta borrada se libera en el acto. El confirmado sigue contando y queda sin el id de su suscripción. Pasar a Fundador en la misma suscripción sin lugar, o con el Fundador perdido, se trata como founder_full
- Prueba única. trial_history solo se agrega y guarda una huella SHA-256 sin sal del correo normalizado y la fecha. Al borrar la cuenta pierde la pasarela y el id de la suscripción, así que no se liga a nadie por Stripe. Va al aviso de privacidad de B16
- Avisos de pago. La firma se revisa antes de tocar la base (Stripe con tolerancia de 300 s, Mercado Pago con su manifiesto). Los eventos se deduplican por pasarela e id, los cobros por pasarela e id de pago. Un aviso tardío de una suscripción que no termina nunca acorta el periodo pagado, y state_at solo sube con el primer cobro. Mercado Pago con el cobro antes que la suscripción adopta el id de la suscripción en la fila que creó el cobro
- Reembolsos y contracargos. charge.refunded busca la factura por PaymentIntent con invoice_payments. Un reembolso con un id que no se encuentra queda ignorado. Solo se cancela la suscripción del cobro devuelto. Un contracargo perdido cuenta como reembolso completo y uno parcial se ignora con una línea en el registro. charge.dispute.created no cambia el acceso
- Datos del pagador. Los eventos de Stripe se guardan sin customer_details, billing_details ni otros datos del pagador. Los de Mercado Pago ya iban sin ellos
- Banderas freeTrial, cashPasses y mercadoPago. Solo el booleano true las prende y el servidor también las hace cumplir. create-checkout responde 503 not_configured si la bandera de lo que se pide está apagada, y la app lo explica. Siguen apagadas en producción hasta la corrida real en modo prueba. paymentsTestMode prendida mientras no haya cobros reales
- Portal de Stripe con dos configuraciones propias (actualizar y cancelar). Sin su configuración responde 503 not_configured en lugar de abrir la de omisión, que podía mostrar los precios Fundador
- Mercado Pago sin Fundador. El pase va por preferencia y la suscripción por preapproval, y el acceso llega con el primer cobro aprobado. Un cobro rechazado no marca past_due. Cancelar está en cancel-subscription con confirmación en la app
- Correos en email_outbox con tipos con llave foránea (content_report, daily_review_reminder y los de pagos). renderEmail lanza si falta un dato. noopSender deja solo una línea con el tipo hasta B15
- Facturas a pedido con régimen fiscal y uso de CFDI, que revisa un contador. Admin, Pagos marca emitida o rechazada con nota
- Interfaz. El candado lleva a la forma de pago del Mensual y ofrece la prueba solo si a esa persona todavía le toca según my_plan. Sin prueba dice que el primer cobro es hoy. El pase vencido nombra su método. Con una bajada programada la renovación dice el plan y el precio que se cobran. Los textos de pagos y facturas viven fuera de t para seguir bajo 300 KB
- Revisión independiente con 12 hallazgos (1 alto, 5 medios, 6 bajos), todos corregidos con su prueba
- Pendiente de Ricardo para la corrida real en modo prueba. La llave rk_test_ (también con lectura de Invoices), el webhook nuevo con 12 eventos, los medios de pago y el portal por omisión en Stripe, y la cuenta de Mercado Pago. Los pasos están en docs/PENDIENTES_DE_RICARDO.md y docs/STRIPE.md
- Antes de fusionar el PR 53 se aplicaron al proyecto sus tres migraciones (registradas como billing_emails, billing_plans_1 a billing_plans_5 e invoice_requests) y se verificaron por huella las 44 funciones. Se desplegaron create-checkout, create-portal-session, payment-webhook-stripe, payment-webhook-mercadopago y admin-reset-mfa. Faltan cancel-subscription, las dos piezas de supabase/manual/pagos-b10.sql y los secretos de los precios nuevos, que esperan el token de Supabase y la llave rk_test_ de Ricardo

### D-131. Despliegue desde el repo y Playwright en paralelo (herramientas del plan del cambio)
- Fecha 2026-10-15. Origen C, para avanzar sin transcribir SQL por el conector (Ricardo pidió dejar todo listo para que con la llave solo sea subirlo) y para correr pruebas de punta a punta de varios bloques a la vez
- npm run deploy:supabase aplica SQL, publica Edge Functions y pone secretos con la API de administración de Supabase, con el token del entorno. Manda los archivos tal cual están en el repo, también las piezas con drop o delete que el conector no corre (D-113). Guía en docs/DESPLIEGUE.md y planes por bloque en deploy/ (b9 y b10). B11 y B12 suman su archivo
- Nunca repite un SQL a ciegas. Salta lo registrado en la historia (también los trozos que deja el conector) y lo que ya coincide por huella. Se detiene sin escribir si una función registrada difiere y ningún paso posterior la arregla, o si aplicar dejaría una función más vieja que una migración posterior. Después de escribir comprueba por huella, que nada quede abierto a anon sin que un archivo lo diga, las consultas de los archivos manuales y la versión y verify_jwt de cada función
- Solo imprime nombres de secretos y tapa cualquier valor que la API repita. scripts/stripe/setup-test.ts suma --write-ids, que guarda los ocho IDs de Stripe en private/, ignorado por git
- Probada contra una API simulada y con las huellas de las 129 funciones contra un Postgres local. Todavía no corre contra el proyecto real, porque el token del entorno responde 401
- PW_PORT_OFFSET (server/src/testPorts.ts, tests/e2e/README.md) mueve juntos la vista previa, la nube simulada y el proxy de 10 en 10, entre 0 y 990, para que varias copias del repositorio corran Playwright a la vez. Matiza D-040. El proxy solo se mueve con --mock, que nunca lee la clave, y sin --mock se niega a arrancar con la variable puesta, así el proxy que puede tener clave sigue fijo en 8787. Con un número distinto de 0 nunca reusa un servidor abierto y da el triple de tiempo para arrancar
- Revisión independiente con 13 hallazgos (5 medios y 8 bajos), todos corregidos con su prueba. Entre ellos, el token nunca sale en pantalla aunque traiga un salto de línea, una comprobación en rojo detiene la publicación, un error de red o un 5xx nunca se toma como algo que falta aplicar, los trozos del conector se declaran en recordedAs y no se deducen, la huella suma security definer y search_path, y los secretos exigen --plan y un patrón completo. Lo que confirma la primera corrida real está en docs/DESPLIEGUE.md. PW_PORT_OFFSET salió sin hallazgos

### D-132. Aviso de privacidad y términos al día para el abogado (B16 del plan del cambio)
- Fecha 2026-10-15. Origen R, bloque B16 de D-119, respuestas 42 a 49, 4.26 y 4.27
- El aviso pasa a la versión 2026-10-15b y los términos a la 2026-10-15, y siguen marcados como Borrador para revisión del abogado. La marca se quita solo cuando Ricardo diga que el abogado los aprobó. La versión del aviso queda después de 2026-10-14, 2026-10-14b y 2026-10-15 al ordenarlas como texto. La 2026-10-15 es la del primer borrador que otra sesión (Gemini) fusionó a main, y este texto lo reemplaza, así quien aceptó cualquiera de las anteriores acepta de nuevo
- Los datos del responsable no van escritos en el texto. Salen de VITE_LEGAL_NAME (Plexus Medica S. de R.L. de C.V.), VITE_LEGAL_ADDRESS, VITE_PRIVACY_EMAIL (nuevo, cae a VITE_SUPPORT_EMAIL) y VITE_SUPPORT_EMAIL. Un cambio del contador no toca el código
- fillLegal tiene dos lectores. El alumno nunca ve una marca entre corchetes ni la palabra pendiente, lee un texto neutro o no ve la línea. El abogado ve en docs/legal cada dato que falta y quién lo pone
- El aviso nombra a cada encargado con lo que recibe. Los que no están activos (Mercado Pago, Resend, PostHog, Sentry y GitHub) dicen cuando se active. OpenAI solo recibe texto del banco en las evaluaciones internas
- Se corrigen dos frases que ya no eran ciertas. A la IA también viaja el texto que el alumno elige para sus tarjetas (D-085), y los pagos se borran con la cuenta en cascada
- Los permisos del aviso son exactamente los tres que guarda la app. La comparación con otros alumnos usa el permiso de mejora anónima (respuesta 87) y no se inventa uno nuevo. B15 agrega el de analítica, apagado, y deja apagados los recordatorios por correo
- Los términos suman planes y precios, formas de pago y prueba gratis, cambio de plan y garantía, precio Fundador e Invita y gana un mes. Una prueba compara precios, días de prueba, garantía y pases con la configuración de B10
- El texto completo vive en src/i18n/legalDocs.ts y solo carga con la página legal. src/i18n/legal.ts se queda con los textos cortos de la portada, el registro y Configuración, para no pasar los 300 KB del JavaScript inicial
- Se partió de los borradores de Gemini (rama gemini/legal-b16) y de la rama claude/keen-hopper-4oj3c2, y se dejó fuera lo que no coincide con el código, como la razón social escrita a mano, las marcas visibles de pendiente y un cuarto permiso para la comparación
- La lista de cambios, 18 preguntas para el abogado y 5 para Ricardo están en docs/legal/CAMBIOS-B16.md
- Se fusionó después de B11 (PR 55), porque el aviso da por hechas las lecturas del banco en el servidor
- Con B16 entra adelantado lo de Gemini para B17 (rama gemini/imagenes-marca). La imagen para compartir, public/og-image.png, va con dirección absoluta en el build publicado (SITE_URL en pages.yml) para que WhatsApp y Facebook la lean, y el manifest suma tres capturas de instalación. Esas capturas muestran la app antes de la paleta y se rehacen en B17. La imagen para compartir no se precarga en el service worker. Al pasar a Cloudflare (B17) el build necesita SITE_URL para que la dirección siga completa
- Revisión independiente con 13 hallazgos. Se corrigieron 12, entre ellos dos altos. El aviso ya no promete que el archivo de Acceder trae todos los datos, y al eliminar la cuenta ahora se borra el correo de la invitación (delete_my_account, también en supabase/manual/pagos-b10.sql, con su prueba SQL). Los demás alinean el texto con el código (avisos de cobro que se quedan, texto de las tarjetas en el tutor, tope y ventana de referidos, 20 preguntas al día, correo que se cambia por escrito, lecturas y mazos de B11, pista de Mejora anónima). No se cambió el nombre de las marcas {contactoPrivacidad} y {contactoSoporte}, porque siguen el patrón en español de {nombre} y son parte del texto que revisa el abogado
- Para B15. El aviso dice que Cómo nos conociste no va a herramientas de analítica, así que el evento signup_completed no lleva heard_from a PostHog

### D-133. Banco en la nube, Google Sheets, flujo editorial y catálogo de mazos (B11 del plan del cambio)
- Fecha 2026-10-15. Origen R, bloque B11 de D-119, respuestas 46, 47, 49, 58, 59, 64, 67, 68, 91 y 92, PC 7 y 4.x. Diseño en el plan de B11 (/home/user/wt/plans/b11.md, fuera del repo) y detalle técnico en docs/BANCO_EN_LA_NUBE.md y docs/SUPABASE.md
- Modelo. Versiones inmutables con su cuerpo, casos clínicos y catálogo con seq. Nadie lee las tablas del banco directo, todo pasa por RPC con security definer y search_path fijo. Las preguntas viejas no se editan, se publica una versión nueva
- Tope de Gratis en el servidor. fetch_questions cuenta las preguntas distintas que abre cada día de estudio (study_day, 4 a. m. de Mérida) con un candado por alumno, revisa dispositivo, plan y banco abierto, y aplica el freno de descargas de los planes de pago (300 lecturas nuevas por minuto y 900 por hora) con avisos al admin (8.10). Los umbrales y la tarifa viven en bank_private_settings, sin lectura pública
- Sincronización con el Sheet en la Edge Function bank-sync, con la cuenta de servicio de solo lectura y sin zod (8.21). Nunca pisa lo editado en la app (8.25), marca y no retira los renglones que desaparecen (8.26), no escribe mientras el ID tenga fórmulas (8.1), el Sheet de prueba siempre corre en solo reporte (8.27), y el Autor o Revisor que el admin reasignó en la app gana con los avisos author_differs y reviewer_differs. La huella para saltar una corrida sale solo de una corrida que aplicó y se ignora con forceNext o con cambios en claves y revisores
- Ningún validador rechaza un reactivo imperfecto (D-080). Una Tarea vacía que no se detecta entra como pendiente para aprobar y el médico la elige en el editor (cambia la recomendación de rechazarla). La subespecialidad se deduce del subtema con aviso (8.2) y el tipo De control se conserva con una casilla para el revisor (8.4)
- Flujo editorial. Etiquetado a ciegas en cada revisión y no en una muestra del 20% (8.9). El revisor no ve ni edita lo del autor en ningún estado hasta cerrar sus etiquetas. Acuerdo dice Sin medir hasta los 30 pares. Pedir cambios o rechazar exigen comentario, aprobar exige etiquetado completo, versión completa y casillas
- Pago a médicos por pregunta revisada (respuesta 58), no por decisión. Varias rondas sobre la misma pregunta en el mes de Mérida cuentan una vez, y los CSV traen la columna Paga. Tarifa opcional (8.8). Un médico con decisiones no borra su cuenta solo (8.33)
- Catálogo de mazos en Storage, partido por submazo en el navegador, sin upsert. Un mazo de terceros se publica, se lista y se baja solo con la confirmación del dueño, y solo el dueño puede pasarlo a propio. Pediatría y Cirugía de Paco van solo a Storage (8.18). El mazo de Fer espera su autorización escrita
- App del alumno. La fuente de la nube elige del catálogo y baja cuerpos. Sin red elige solo de lo ya bajado y lo dice. Los reportes sin conexión se reintentan al volver la red. El examen completo reparte por los pesos provisionales con cuotas (8.17). El candado de Simular y del examen usa el de B10
- El equipo con la nube nunca cae al banco local de demostración. Sin conexión ve Necesitas conexión
- Borrar mis datos conserva las lecturas del día en curso y quita las descargas del catálogo (8.24). Va en una Sección con delete de 20261023000005 y en supabase/manual/banco-b11.sql. Plan de despliegue deploy/b11.json
- Revisión independiente con 15 hallazgos (1 alto, 6 medios y 8 bajos), todos corregidos con su prueba, más el caso hermano del autor. La e2e de nube encontró y corrigió dos fallas reales más (el paso a ciegas contaba solo etiquetas cerradas y dos tablas con scroll no se enfocaban con teclado)
- Todo queda apagado hasta los pasos de Ricardo (cloudBank, sincronización en solo reporte, cuenta de servicio). Los alumnos siguen con la demo hasta las 300 aprobadas (8.14)

### D-134. IA real en Edge Functions de Supabase, lotes y compuerta de dos médicos (B12 del plan del cambio)
- Fecha 2026-10-15. Origen R, bloque B12 de D-119, respuestas 33 a 41, 4.19, 4.24, 5.3 y la sección 10. Diseño en el plan de B12 (/home/user/wt/plans/b12.md, fuera del repo) y detalle técnico en docs/IA_ALOJADA.md y docs/SUPABASE.md. Reemplaza a D-103 en dónde corre el proxy y conserva lo demás
- El proxy de producción es la Edge Function ai-proxy y los lotes los maneja ai-batch, con el mismo núcleo que el servidor de desarrollo de server/. El núcleo vive en supabase/functions/_shared/ai y los motores puros de src/engines se copian ahí con npm run ai:sync, con una prueba que falla si la copia no es idéntica. Se retiran el Dockerfile y el alojamiento de D-103
- El cliente del SDK de Anthropic siempre se crea con la clave explícita (apiKey, authToken, webhookKey, baseURL y logLevel), igual en server/ y en la función, para que nunca busque en el entorno la variable prohibida. ENARM_ANTHROPIC_KEY es un secreto de las funciones que pone Ricardo y ninguna sesión lo lee ni lo pide. OpenAI solo entra en las evaluaciones con ENARM_OPENAI_KEY y nunca en producción
- Los cinco motores quedan prendidos en el servidor y cerrados a los alumnos por la compuerta 1 hasta la auditoría. Alumnos de pago o en prueba para hipótesis, informe, consejos y tarjetas. Solo médicos, admins y dueño para preguntas reestructuradas, y solo en las marcadas
- Compuerta 1. Dos médicos califican a ciegas una muestra de textos, el veredicto se calcula en la base y el servidor hace cumplir una bandera por motor. Decide el acuerdo observado de 85% y kappa solo se reporta. La compuerta se ata al modelo y al prompt, con una auditoría corta de 60 textos por cambio. Abrir un motor pide un mínimo de textos calificados (60 en hipótesis y tarjetas, 40 en consejos y 30 en informes y reestructuradas, editable con minItems), que Ricardo debe confirmar antes de la auditoría
- Hipótesis de olvidos por Message Batches a mitad de costo (respuesta 39). Cola en ai_jobs, ciclo con pg_cron y pg_net cada 10 minutos hacia ai-batch con el secreto en Vault, lote borrado en Anthropic al procesarlo y ningún identificador del alumno. Informe y consejos siguen al momento. En la app la hipótesis queda pendiente, se recoge al abrir el Tutor y cada 60 segundos, y una falla espera 24 horas antes de pedirse otra vez
- Límites en el servidor. Tope de 0.30 dólares por alumno al día y cuotas por motor como techos dentro de los 5 dólares diarios (55% tarjetas, 15% reestructuradas y 10% cada motor del Tutor). La revisión encontró que las llamadas en paralelo se saltaban el tope, así que cada llamada aparta su peor costo al entrar, lo devuelve al asentar y una reserva huérfana vence a los 5 minutos. Plazo total de 120 segundos por petición y un reintento del SDK, para asentar antes del corte de 150 segundos
- Las negativas del modelo se tratan como refused con su categoría y sin reintento. Dos guardas nuevas, también en el cliente, bloquean las promesas de puntaje o de plaza (score_prediction) y los comentarios sobre la salud mental del alumno. Los consejos por sesgo solo se personalizan con un texto base ya revisado por un médico (D-099) y con el mismo vocabulario de sesgo o trampa que usa la app
- En producción, sin proxy o con la IA no disponible, la app usa sus plantillas sin decir IA. Las respuestas fijas del cliente quedan solo para desarrollo y la demo, con su etiqueta. La recolección de trabajos corre una sola vez por alumno, el respaldo en CSV de la auditoría es de cada médico y las e2e de nube corren el núcleo real de la función dentro de Playwright con Supabase y Anthropic simulados
- npm run eval-ai suma matriz de modelos, repeticiones, juez Opus 5.5 por lote y a ciegas como filtro previo, proyección de costo por alumno, prueba del camino por lotes y comparación con OpenAI. El banco real, las muestras y las razones del juez viven en private/ y nunca en el repo. No se corrió ninguna evaluación real, por decisión de Ricardo, así que los modelos de DEFAULT_CONFIG siguen siendo los de antes
- Despliegue con npm run deploy:supabase -- --plan b12, que aplica ai_proxy_v2, ai_jobs, ai_gate y ai_delete_my_data, la pieza manual ia-b12.sql y publica ai-proxy y ai-batch con verify_jwt apagado (se identifican por la sesión del alumno o por un secreto que se compara dentro de la base). Los secretos APP_ORIGINS y AI_ALLOW_MOCK van con --secrets-from. supabase/manual/ia-lotes-cron.sql lo corre la sesión con el conector después de ver /health en modo simulado. Para que la herramienta suba las dependencias por nombre, ahora manda también el deno.json de la función y su import_map_path, lo que todavía no se probó contra la API real. No se sumó Deno al repo
- Borrar mis datos v3 vive en una Sección con delete de 20261026000004_ai_delete_my_data.sql y la misma definición está en supabase/manual/ia-b12.sql, banco-b11.sql y ejecutar-en-sql-editor.sql. Los delete de las tablas de IA solo corren si existen (to_regclass), así que desplegar el plan de B11 solo no rompe nada
- Revisión independiente de servidor, evaluaciones e integración con 14 hallazgos (1 alto, 3 medios y 10 bajos), todos corregidos con su prueba. Ninguno tocaba secretos, autorización ni privacidad. Quedan sin probar contra servicios reales el arranque en frío de las funciones, que Deno resuelva zod/v4 desde el deno.json de la función, la forma real del 429 de tope mensual de Anthropic y un lote de punta a punta
- No hay chat libre con IA ni predicción del puntaje ENARM, y ningún validador rechaza reactivos imperfectos (D-080). La IA sigue operando detrás de la base sobre datos que el médico ya etiquetó

### D-135. Inglés médico, casos de lectura, parte en inglés del examen y vocabulario (B13 del plan del cambio)
- Fecha 2026-10-16. Origen R, bloque B13 de D-119, respuesta 61, 4.19, 4.20, 4.25 y la sección 6. Diseño en el plan de B13 (/home/user/wt/plans/b13.md, fuera del repo) y detalle técnico en docs/INGLES_MEDICO.md y docs/SHEET_DEL_BANCO.md
- Casos de lectura en inglés con la estructura del caso clínico. El texto va como viñeta del caso (Orden 1) y lleva dos o tres preguntas, con la pregunta y las opciones en inglés y las justificaciones y la explicación en español (8.2, Ricardo lo confirma con la convocatoria vigente). Los textos y las preguntas los escriben los médicos. No hay contenido médico hecho por IA ni propuestas de preguntas de inglés con IA (8.1 y 8.11), y la IA de reestructurar excluye las preguntas en inglés
- La fuente del texto viaja como primera referencia con forma fija (8.14). Una sola función de TypeScript la arma y la lee, con su espejo en SQL, comparados sobre los mismos 66 casos y sobre 89,035 referencias aleatorias. Licencias aceptadas, texto propio, dominio público, CC0, CC BY y CC BY-SA, y nada con NC ni ND (8.8, se revisa con el abogado). Sin fuente o con una licencia fuera de la lista queda pendiente (passage_source_missing y license_not_allowed), y no se puede mandar a revisión ni aprobar. El revisor a ciegas y el editor ven la fuente con su licencia. No hay una casilla del revisor que confirme la licencia, porque pediría redefinir más funciones de B11, así que la licencia es la que escribe quien captura
- El Sheet usa la misma pestaña Preguntas con la columna Idioma y tres columnas nuevas, Fuente del texto, Licencia del texto y Enlace del texto (8.7). Un Idioma vacío en Inglés médico queda en inglés y avisa. Un idioma que no va con la rama (language_branch_mismatch), un texto largo (passage_long) y un caso con fuentes o idiomas mezclados (case_inconsistent) son reglas de metadatos y no de calidad, así que no violan D-080. Un caso de una pregunta o de más de tres solo avisa. Un renglón en español con un texto largo que parece inglés avisa con language_suspect (más de 200 caracteres, al menos 20% de palabras vacías del inglés y a lo más 5% del español), solo como aviso y probado con 117 textos reales del banco de demostración como negativos
- Examen. La parte en inglés es de 30 de 280 y la misma proporción en los cortos, 2, 5 y 11 (8.5), mezclada por casos (8.4), con casos completos, sin repetir y sin relleno de español cuando faltan reactivos de inglés (8.6), con su aviso. Son 77 segundos por reactivo en español y 90 en inglés (8.3, provisional y editable) y los resultados salen por sección. Los duelos de Party no llevan inglés (8.12)
- La práctica de inglés es aparte en Simular, por textos completos, con tiempo sugerido por texto y aviso al pasarse. Los estados calibrando son desde el primer caso completo para la práctica, 30 reactivos publicados para la parte del examen y 20 respuestas para las cifras del alumno (8.18), todo editable en thresholds.english. Conócete deja el inglés fuera de ritmo, adivinanza rápida, tiempo atascado y casos largos
- El Banco del admin tiene una meta propia de 30 reactivos de inglés, aparte de la de 300 (8.17). Inglés médico no tiene color propio (8.15) y su tarea por omisión es data_interpretation (8.10). El diccionario de estructura suma 16 negaciones y 9 falsos positivos en inglés
- Vocabulario. El script arma el mazo con los temas de salud de MedlinePlus, de dominio público y sin IA, para el catálogo de pago con vista previa en Gratis (8.16). El mazo todavía no existe, porque desde la sesión no se puede bajar el XML de MedlinePlus. Un mazo de un tercero de Inglés médico conserva su autor
- Apertura. La bandera medicalEnglish queda prendida en desarrollo y en la demo y apagada en producción hasta que haya casos y mazo, y Ricardo la prende desde platform_settings. El inglés se abre para los alumnos con cloudBank (8.13)
- Despliegue. Una migración 20261027000001, idempotente y sin delete ni drop, redefine bank_version_issues y bank_incomplete_of con la misma firma de B11. deploy/b13.json la aplica y vuelve a publicar bank-sync con el convertidor nuevo. Como la herramienta no deja aplicar un plan si una función quedaría más vieja que la del repo, deploy/b11.json suma la migración de inglés como su paso 7. El orden b11, b12 y b13, y b13 antes que b12, están probados contra la API falsa, y la lista admite un plan nuevo al final
- De paso se arregló el contraste del botón Otra vez de Repasar (texto chico con opacity-80, 4.2 a 1, un defecto que ya estaba en main) y una prueba con axe lo cubre
- Revisión independiente con 13 hallazgos (1 alto, 5 medios y 7 bajos), todos corregidos con su prueba. El alto era que las tarjetas automáticas de Mis errores copiaban el texto completo de un caso de inglés sin su fuente ni su licencia. Ninguno abría el banco a Gratis ni cambiaba permisos del servidor
