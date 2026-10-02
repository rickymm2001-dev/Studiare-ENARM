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
