# Plan del cambio V4. Uso, espacio y método de estudio

Fecha 2026-10-22. Continúa el plan V3 (docs/PLAN_DEL_CAMBIO.md, D-119) y manda sobre él donde no coincidan. Lo que V3 dejó pendiente (B15, B17, B18 y B19) se conserva y se reacomoda aquí. Nace del mensaje de Ricardo del 2026-10-22 con la lista de complementos de Anki, los métodos de estudio, la estructura del examen, los consejos y el acta de la reunión con Paco.

## Cómo se usa

- La sesión que ejecuta lee este archivo, CLAUDE.md y la sección Estado actual de PROGRESS.md. No necesita releer V3 completo, solo el bloque de V3 que toque
- Cada bloque es un PR a main con el CI en verde. Al cerrar un bloque se escribe una entrada corta en PROGRESS.md, de 5 a 10 líneas, y nada más
- La auditoría completa (capturas de todo, revisión independiente por área, axe en claro y oscuro, rendimiento, seguridad) se hace una sola vez al final, en el bloque V4-B10. Es la decisión de Ricardo para ahorrar tokens. Lo que sí se conserva en cada bloque está en la sección 1
- Si algo es ambiguo o contradice CLAUDE.md, se pregunta a Ricardo antes de suponer
- Las decisiones que esperan a Ricardo están en la sección 8. Mientras no conteste, se toma la opción recomendada y se marca en PROGRESS.md

## Índice

1. Reglas de ahorro de tokens
2. Qué cambia respecto a V3
3. Herramientas de la sesión. Plugins, conectores y skills
4. Tu lista nueva frente a lo que ya existe
5. Cómo se traduce cada complemento de Anki
6. Plantilla web y apariencia. Recomendación
7. Bloques de trabajo V4
8. Decisiones que esperan a Ricardo
9. Lo que no se hace y por qué
10. Orden y calendario sugerido

## 1. Reglas de ahorro de tokens

Lo que cuesta más tokens en V3 fueron las capturas por bloque, la revisión independiente por bloque y las entradas largas en PROGRESS.md. V4 los recorta así.

Se conserva en cada bloque, porque evita rehacer trabajo
- npm run check (typecheck, lint y unitarias). Es barato y atrapa lo que rompe otros bloques
- Las e2e del bloque, solo las specs que tocan sus pantallas, en teléfono y computadora
- Pruebas unitarias nuevas solo para motores puros y para lo que cambia datos. Las pantallas se cubren con una e2e de camino feliz
- Presupuesto de JavaScript inicial bajo 300 KB. Lo nuevo pesado se carga diferido

Se mueve al final (V4-B10)
- Capturas de todas las pantallas en tres anchos, claro y oscuro
- Revisión independiente de subagentes, una por área
- axe completo, rendimiento con el procesador lento, sin conexión, seguridad y ASVS
- La lista de flujos e2e de 14.1 de la especificación

Forma de trabajo
- Primero tokens y componentes compartidos, después pantallas. Un cambio en el componente base arregla veinte pantallas
- Un bloque toca una pantalla una sola vez. Si dos bloques tocan la misma pantalla, se juntan
- Reusar lo que ya existe antes de escribir. La sección 4 dice qué existe para que nadie lo vuelva a construir
- Sin subagentes para leer código salvo en V4-B10. La sesión lee con grep y extractos
- PROGRESS.md recibe 5 a 10 líneas por bloque. Las decisiones van a DECISIONES.md con número, como siempre
- Ideas fuera del alcance van a IDEAS.md, no al código

Riesgo que Ricardo acepta. Sin revisión independiente por bloque, un error puede vivir varios bloques antes de encontrarse. Lo compensan npm run check en cada PR y el barrido final.

## 2. Qué cambia respecto a V3

- V3 va en B0 a B16 hechos. Faltan B15 (analítica, recordatorios y recorrido), B17 (publicación), B18 (primeros alumnos) y B19 (auditoría final). Los cuatro siguen, con otra posición
- V4 agrega siete bloques nuevos antes de la auditoría. Densidad y espacio, identidad visual, repaso completo al estilo Anki, métodos y plan diario, estructura del examen con Bloom, calendario y comunidad
- La auditoría final de V3 (B19) se vuelve V4-B10 y abarca también todo lo nuevo
- B17 publicación no depende de código nuevo, solo de las cuentas de Ricardo. Puede correr en paralelo en cualquier momento
- Dos decisiones de V3 chocan con la lista nueva y se preguntan en la sección 8. Los logros y las ligas se quitaron en B3 por el comentario 14, y los fondos y los brillos se quitaron en B2 por el comentario 7

## 3. Herramientas de la sesión. Plugins, conectores y skills

Lo que vi instalado el 2026-10-22 en esta sesión y para qué sirve en este plan.

| Herramienta | Estado | Para qué sirve aquí | Veredicto |
|---|---|---|---|
| Conector Supabase Studiare | Conectado | Migraciones, SQL, funciones, logs y avisos de seguridad del proyecto real | Se usa en cada bloque con base de datos |
| Conector GitHub (MCP) | Conectado | PRs, CI, ramas | Se usa siempre |
| Conector Figma | Conectado | Dirección visual en V4-B2. Generar una página en Figma desde el código y comparar opciones | Se usa en V4-B2, opcional |
| Conectores Canva y Adobe | Conectados | Imágenes para redes, portada y material de marketing. No sirven para la interfaz de la app | Solo para B17 y marketing |
| Conectores Gmail y Google Drive | Conectados | Leer el Sheet del banco, dejar archivos a Ricardo | Se usan en B11 y B17 |
| Conector Microsoft 365 | Conexión incompleta | Nada por ahora | Ignorar |
| Conector PubMed | Sin conectar | Textos de inglés médico con licencia | Opcional en B13 |
| Plugin stripe (skills de mejores prácticas, errores, tarjetas de prueba, docs) | Instalado | Pagos de B10 y B17 | Se usa |
| Plugin supabase (skill de Postgres y de Supabase) | Instalado | Se carga antes de cualquier migración | Se usa |
| Plugin engineering (code-review, architecture, testing-strategy, deploy-checklist) | Instalado | code-review y deploy-checklist en V4-B10 | Se usa al final |
| Plugin design (design-critique, accessibility-review, design-system, ux-copy) | Instalado | design-critique sobre las capturas en V4-B1 y V4-B2, accessibility-review en V4-B10 | Se usa |
| Skill security-review | Instalada | Barrido final | Se usa en V4-B10 |
| Skill dataviz | Instalada | Estadísticas por mazo y calendario | Se usa en V4-B3 y V4-B6 |
| Skill frontend-design (la nombran las instrucciones de Adobe) | No aparece en la lista | Sería la indicada para la interfaz | Pedirla si existe en el catálogo, ver sección 8 |
| Plugins de ventas, finanzas, legal, recursos humanos, bio, datarobot, carta, wix, brightdata | Instalados | Nada en este plan | Se pueden quitar para limpiar el menú. No gastan tokens si no se invocan |
| Servidores MCP de plugins que fallan al conectar (figma de design, github de engineering, notion, slack, stripe, supabase, etc.) | Error de proxy 403 | Duplican a los conectores que sí funcionan | Ignorar. No frenan nada |

Qué comprar o instalar
- Ningún plugin de pago hace falta. Las herramientas que aceleran son bibliotecas MIT dentro del proyecto, no plugins de la sesión
- Bibliotecas que se agregan en el bloque que las necesita, nunca antes. react-day-picker para el calendario (MIT, ligera). motion para animaciones sutiles solo si V4-B2 lo pide y cabe en el presupuesto. Ninguna otra. Las de D-086 siguen vigentes
- Bloques de shadcn/ui y Origin UI son MIT y se copian al proyecto como patrones de densidad y de layout. Se adaptan a los componentes que ya existen sobre Radix, no se cambia de librería

## 4. Tu lista nueva frente a lo que ya existe

Para no construir dos veces. Verificado en el código el 2026-10-22.

| Lo que pediste | Estado hoy | Dónde | Qué falta |
|---|---|---|---|
| Review heatmap | Existe | src/features/home/widgets/HeatmapWidget.tsx, 90, 180 o 365 días | Detalle por día al tocar y copia en Progreso |
| Posponer sin romper el algoritmo (FSRS Helper) | Existe | src/engines/reschedule.ts, OverdueTools.tsx. Repartir hasta 7 días, posponer hasta 30, adelantar, deshacer | Jerarquía visual y advertencias (lo que pidió Paco), cuántas se pueden posponer sin daño, días fáciles visibles |
| Delay overdue | No existe a propósito | Rechazado en docs/ANALISIS_GUIA_ANKI.md | Ver sección 5. Se ofrece su equivalente seguro |
| Confeti al terminar | Existe | src/ui/celebrate.ts en repaso, resumen, Party y Pomodoro | Nada |
| Tres contadores nuevas, aprendizaje y programadas | Existen | ReviewCounters.tsx y Repasar | Verlos por mazo |
| Estadísticas por mazo con intervalos | Parcial | Carga futura y dificultad en Progreso. No hay pantalla por mazo ni histograma de intervalos | Pantalla de mazo con totales, estados, intervalos, retención y botón a Buscar tarjetas |
| Explorar para añadir tarjetas | Existe | Buscar tarjetas, /mazos/explorar | Entrada directa desde el mazo |
| Tipos de tarjeta básica, inversa y cloze | Existen | manualDecks.ts, outline.ts, cloze.ts | Explicación clara de cada tipo (lo que pidió Paco) |
| Oclusión de imagen | No se dibuja | Al importar un .apkg la deja como aviso | Ver sección 9 |
| Editar el campo durante el repaso | Parcial | Solo en mazos del alumno | Extender a copias de mazos precargados en la capa Mis tarjetas |
| BetterSearch | Parcial | cardSearch.ts con Y, frase y exclusión, más chips | Sintaxis campo y valor (mazo, tema, estado, vence, etiqueta, intervalo) |
| Estudiar un tema desde cero | Parcial | ReviewSetup con mazos, temas y los modos hoy, vencidas o nuevas | Sesión por tema fuera de la cola diaria que no toca lo que toca hoy |
| Apuntes que se vuelven tarjetas (RemNote) | Existe | src/features/outlines con TipTap, tarjeta por línea, modo clase, IA de pago | Plegado de secciones, contador de puntos por recordar, importar desde Notion, Quizlet, Obsidian, Roam y Logseq |
| Subir PDF y seleccionar lo que se aprende | Parcial | El PDF se lee y la IA propone tarjetas ancladas | Selección de texto en el visor para mandar solo esa parte |
| Importar Anki, Excel, CSV, Word, PDF | Existe | src/data/import | Markdown, OPML y TSV cubren Notion, Obsidian, Roam, Logseq, Dynalist y Quizlet |
| Pomodoro | Existe | src/features/pomodoro | Nada |
| Simulador con aviso según el tiempo | Existe | ExamTimer.tsx y examAlerts.ts | Simulacros cortos diarios por especialidad |
| Plan diario y metas | Parcial | dailyGoal, misiones de hoy, límites de nuevas | Plan con las tres cifras de la guía y su estado calibrando |
| Comparar tu puntaje con otros | Existe | src/engines/comparison.ts, ComparisonSection.tsx, por rama, con permiso | Por especialidad a la que aspiras y por simulador completo |
| Foro | No existe | | Ver V4-B7 y sección 8 |
| Calendario | Parcial | Motor en planner.ts, tarjeta de la semana en Progreso. La pantalla se quitó en B3 | Pantalla de calendario, V4-B6 |
| Taxonomía de Bloom | No existe | Solo dificultad 1 a 5 | V4-B5 |
| Recorrido guiado | Existe desde B15 | TourLauncher en el cascarón | Revisarlo tras V4-B1 y V4-B2 |
| PostHog, Sentry, Resend | Código hecho en B15, falta tu cuenta | D-137 de DECISIONES.md | Tus cuentas |

## 5. Cómo se traduce cada complemento de Anki

Studiare es una página web, no Anki. Ningún complemento de Anki se instala. Cada uno se vuelve una función propia o se descarta con motivo. El código de Anki y de sus complementos es AGPL o GPL y no se copia, solo se toma la idea (D-086).

| Complemento | Código | Qué hace en Anki | Qué hace Studiare | Bloque |
|---|---|---|---|---|
| FSRS Helper | 759844606 | Posponer, adelantar, repartir carga, días fáciles, dispersar hermanas, reprogramar | Ya hay posponer, adelantar y repartir. Se agrega cuántas se pueden posponer sin daño (la cifra que Paco ve), días fáciles visibles y dispersar tarjetas hermanas. Reprogramar con parámetros propios queda en IDEAS.md, porque Ricardo eligió FSRS de fábrica (respuesta 90) | V4-B3 |
| Delay overdue | 43919973 | Empuja las vencidas al futuro como si no hubieran vencido | No se hace. Su autor desaconseja usarlo y la guía dice que altera el algoritmo. En su lugar, el panel de atrasos ofrece tres caminos ordenados por riesgo con advertencia visible. Repartir, posponer sin castigo y, como último recurso, borrón de la fecha sin tocar la estabilidad. Es lo que Paco llamó Layer Redo pero sin dañar el historial | V4-B3 |
| Review heatmap | 1771074083 | Calendario de actividad con racha | Ya existe en Inicio. Se agrega el detalle por día y una copia en Progreso | V4-B3 |
| Congrats confetti | 206062158 | Confeti al terminar | Ya existe | Nada |
| Synapse | 236979321 | Tablero de inicio con widgets | No encontré ese complemento con ese número en la web, así que tomo tus ajustes como preferencias de tablero y los traduzco en la tabla de abajo | V4-B1 y V4-B2 |
| Anki MCP server | 124672614 | Deja que un modelo de lenguaje lea y escriba en Anki de escritorio | No aplica a una página web. El equivalente ya existe, la IA de Studiare trabaja detrás de la base con lo que el médico etiquetó. Queda la idea de importar el historial propio de Anki (ya en IDEAS.md) | Nada |
| BetterSearch | 1052724801 | Búsqueda con campos, regex y sugerencias | Sintaxis campo y valor en Buscar tarjetas con sugerencias al teclear. Sin regex, que casi nadie usa y cuesta | V4-B3 |
| Edit field during review | 385888438 | Editar el campo sin salir del repaso | Ya existe en mazos propios. Se extiende a la copia del alumno de cualquier tarjeta | V4-B3 |

Tus ajustes de Synapse traducidos

| Ajuste | Traducción | Bloque |
|---|---|---|
| Opacidad 100%, cristal 6 px, sombra 40% | Barra superior y dock de acciones con fondo translúcido y desenfoque de 6 px. Superficies de las tarjetas sólidas. Choca con la regla sobria de B2, ver sección 8 | V4-B2 |
| Fondo personalizado | Se quitó en B2 por el comentario 7. Volverlo a poner pide decisión, ver sección 8 | V4-B2 |
| Lista de mazos ancha | Repasar y Mazos usan todo el ancho con una tabla densa y el árbol de temas visible | V4-B1 |
| Widgets de gamificación | XP, nivel y racha siguen en la barra. Logros, insignias y ligas se quitaron en B3 a petición tuya. Ver sección 8 | V4-B1 |
| Widget de plan de estudio | Plan de hoy con las tres cifras y los simulacros del día | V4-B4 |
| Barra de fecha límite apagada | La cuenta regresiva al ENARM se queda discreta en el calendario y no en Inicio | V4-B6 |
| Estadísticas avanzadas | Pantalla de mazo y Progreso | V4-B3 |
| Widget de datos o tareas | Misiones de hoy ya existe. Un dato del día solo si sale del banco con su cita, nunca redactado por la IA | V4-B4 |

## 6. Plantilla web y apariencia. Recomendación

Diagnóstico. Lo que se ve genérico no son los componentes, son cuatro cosas. Una sola familia tipográfica para todo, un solo azul sobre blanco, tarjetas del mismo tamaño con mucho aire y poco contenido, y pantallas de una columna angosta en monitores anchos. En Repasar, la pantalla usa menos del 40% del alto en una computadora. En Inicio hay tarjetas con la mitad vacía. El repaso, la pregunta y el examen van en una columna de 44rem alineada a la izquierda.

Lo que no recomiendo. Comprar una plantilla completa de tablero (Next.js, otra librería de componentes, otro enrutador). La app tiene 32 pantallas, 118 mil líneas, componentes propios sobre Radix y un presupuesto de 300 KB. Migrarla a una plantilla costaría más tokens que todo V4 y volvería a verse igual, porque las plantillas de tablero también se ven genéricas.

Lo que sí recomiendo, en este orden
1. Dirección visual propia antes de tocar código (V4-B2, primer paso). La sesión arma tres direcciones como páginas HTML con las pantallas de Inicio y Repasar maquetadas, con tipografía, color, densidad y superficies distintas. Tú eliges una. Cuesta poco y evita rehacer
2. Tipografía con carácter. Ya están instaladas Source Serif 4, Lexend, Plus Jakarta Sans y Atkinson Hyperlegible. Una serif para títulos y cifras grandes y una sans para el cuerpo quitan de inmediato la cara de plantilla. Sin descargar nada
3. Color con dos tonos. El azul de acción se queda por accesibilidad, y entra un tono de superficie cálido o profundo (crema, grafito, verde oscuro) para fondos y bordes, con la paleta de ramas de D-128. Modo oscuro con el mismo criterio
4. Densidad. Una escala compacta de espaciado y tres anchos de contenido. Es V4-B1 y es lo que más vas a notar
5. Si quieres comprar algo, que sea Tailwind Plus (299 dólares una sola vez, incluye Catalyst) como libro de patrones de layout denso. Su licencia no permite dejar sus componentes en un repositorio público, y el repo es público hasta B17. Así que se compra solo cuando el repo sea privado, o no se compra. Las alternativas MIT (bloques de shadcn/ui y Origin UI) cubren lo mismo para este plan
6. Si prefieres un diseñador humano, el conector de Figma permite subir las pantallas actuales a Figma y que la persona trabaje encima. La sesión después lee ese archivo con el conector

Fuentes de la búsqueda del 2026-10-22. [Tailwind Plus, UI kit](https://tailwindcss.com/plus/ui-kit), [Catalyst](https://tailwindcss.com/plus/templates/catalyst), [Untitled UI, tableros React](https://www.untitledui.com/blog/react-dashboards), [Shadcn Dashboard, MIT](https://bestofjs.org/projects/shadcndashboard), [ShadcnStore](https://21st.dev/@shadcnstore/library/shadcnstore). Precios y licencias se confirman en el sitio de cada uno antes de comprar.

## 7. Bloques de trabajo V4

Tamaño. S es menos de media sesión, M una sesión, L dos sesiones. Una sesión es una ventana de contexto con su PR.

### V4-B0. Arranque (S)

- Se crea este plan, se enlaza desde CLAUDE.md y PROGRESS.md, y se registra D-140 con el resumen y las decisiones tomadas por omisión
- Se cierran los PR abiertos de V3 (B12, B13, B14, B16) si siguen abiertos, y se fusiona B15 cuando esté. V4 arranca sobre main limpio
- Bandera nueva v4Density para poder comparar antes y después durante V4-B1 y quitarla al cerrar

Se acepta cuando main tiene este plan y el CI en verde.

### V4-B1. Densidad y espacio (L)

El bloque que más pediste. Toca el cascarón y los componentes base una vez, y después cada pantalla hereda.

- Tres anchos de contenido con tokens que ya existen pero no se usan. Lectura 44rem para texto largo, trabajo 72rem para formularios y paneles, app 88rem para tableros y tablas. Cada pantalla declara el suyo en el registro de pantallas (src/app/screens.ts) y el cascarón lo aplica centrado. Hoy el main va a todo el ancho sin tope y el contenido se pega a la izquierda
- Escala compacta. Card base pasa de p-4 a un token de densidad, con una variante densa para listas. Los StatPanel de tres celdas estiradas a 1,900 px se vuelven una fila compacta con el texto a un lado. La animación de entrada de las tarjetas se quita de las listas largas
- Repasar en una sola vista. Contadores, selector de qué repasar, árbol de mazos y temas abierto y el botón de empezar caben sin desplazarse en una computadora, y en el teléfono el botón queda fijo abajo. La fila Atrasos se vuelve un chip con número que abre el panel. Lo que pidió Paco de elegir un tema directo se resuelve aquí en la interfaz y en V4-B3 en el motor
- Repaso, pregunta y examen centrados en dos columnas desde 1,280 px. Tarjeta o caso a la izquierda, opciones, calificación y notas a la derecha. En el teléfono igual que hoy
- Inicio como tablero de dos filas. Arriba lo de hoy (plan de hoy, vencidas, misiones, botón de repasar) en una sola fila. Abajo lo de contexto (carga, trampas, temas, heatmap) en una cuadrícula. Las tarjetas con la mitad vacía se parten o se juntan
- Configuración en dos columnas desde 1,024 px con un índice a la izquierda. Hoy son tarjetas apiladas con poco contenido cada una
- Progreso con una barra de secciones pegajosa para saltar y las tarjetas en cuadrícula de dos o tres columnas según el ancho
- Avisos de demostración y de datos simulados se juntan en una sola franja de una línea con un botón, para recuperar 40 px en toda pantalla. La etiqueta sigue visible como manda CLAUDE.md
- Menú Más del teléfono con las mismas entradas, y en la barra de cinco entra Apuntes en lugar de Progreso si la analítica de B15 confirma que se usa más. Mientras tanto no cambia

Se acepta cuando Inicio, Repasar, Progreso y Configuración caben en una pantalla de 1,280 por 800 sin desplazarse en lo esencial, el repaso usa las dos columnas, ninguna pantalla rebasa su ancho declarado, las e2e de smoke, navigation, review, explore, progress y settings pasan en teléfono y computadora, y el JavaScript inicial sigue bajo 300 KB.

Estado de V4-B1 (2026-10-22)
- Respeta D-116 y D-117. La estructura de Inicio y los 20 px de separación que Ricardo fijó no se tocaron. Inicio gana espacio quitando huecos, con tres temas para reforzar en lugar de cinco. Esto cambia lo que dice la lista de arriba sobre Inicio como tablero de dos filas, que no se hizo para no pisar su diseño
- Hecho. Tope de ancho de 120rem en el cascarón, tokens de ancho de sesión, trabajo y contenido. Repasar en dos columnas con mazos y temas siempre a la vista y con su propio desplazamiento, y la columna del botón fija. Repaso, pregunta y examen centrados. Configuración con índice lateral y Perfil en dos columnas. Progreso en dos pilas. Mazos en dos columnas y las tarjetas de abajo en dos pilas. Party con lo compartible a un lado. Simular con Inglés médico y Examen completo lado a lado. Tutor en dos columnas
- Queda. Unir los avisos de demostración y de datos simulados en una sola franja corta en el teléfono, y el token de densidad de la tarjeta base. Se hacen en V4-B2, junto con los tokens nuevos, para no tocar dos veces los mismos archivos
- Pruebas. 7,314 unitarias pasan, lint y formato limpios, y las e2e de las pantallas tocadas en teléfono y computadora pasan, 48 de smoke y modo oscuro con axe, 43 de las de repaso y Configuración, 38 de las de Tutor, Simular, Mazos y Party, y 14 más de Party y Gratis después de un arreglo


### V4-B2. Identidad visual (M)

- Paso 1, tres direcciones como páginas HTML estáticas de Inicio y Repasar, con tipografía, color, superficies y densidad distintas, publicadas como artefacto para que elijas. Sin tocar la app. Si prefieres, la misma comparación en Figma con el conector
- Paso 2, con tu elección, tokens nuevos en src/ui/tokens.css. Familia de títulos aparte de la del cuerpo, dos tonos de superficie, bordes y sombras con criterio, radios consistentes, modo oscuro revisado. La prueba de diseño que ya existe se actualiza con las reglas nuevas
- Barra superior y dock con cristal de 6 px si lo apruebas (sección 8). Las superficies de contenido se quedan sólidas por legibilidad
- Íconos. lucide se queda. Se agrega una ilustración propia para los estados vacíos y la portada, hecha con Canva o Adobe desde el conector y optimizada como SVG, para que la app no se vea igual a las demás
- Portada pública con la misma identidad, lista para los textos de la agencia (B17)

Se acepta cuando eliges una dirección, los tokens están aplicados en toda la app sin estilos sueltos, el contraste pasa 4.5 a 1 en claro y oscuro, y las e2e de theme-dark y smoke pasan.

Estado de V4-B2 (2026-10-22, D-145)
- Hecho. Las tres direcciones están publicadas como Artifact privado (Studiare, tres direcciones visuales) y se aplicó la A, editorial clínico, que era la recomendada. Papel cálido en el modo claro, títulos en Source Serif 4 y el color de acción de siempre. Los títulos siguen a la fuente del texto cuando el alumno elige Atkinson o Lexend. El modo oscuro no cambia. La prueba de contraste de design.test.ts pasa con los tonos nuevos
- Capturas en docs/screenshots/v4/b2 (Inicio, Calendario, Progreso y repaso, en 390 y 1280 claro y en 1280 oscuro)
- No se hizo por ahora. Cristal en la barra superior y el dock, porque espera tu respuesta a la decisión 2 de la sección 8. Ilustración propia para estados vacíos y portada, que pide a Canva o Adobe y queda para después del barrido. Tokens de densidad de tarjeta y unir las dos etiquetas de demostración en el teléfono, porque ya caben en dos renglones. Si prefieres la B o la C, cambiar es editar los tokens y la regla de títulos, un commit
- Si las e2e de theme-dark y smoke pasan se confirma en el barrido de V4-B10

### V4-B3. Repaso completo al estilo Anki (L)

Lo de Paco y los complementos de la sección 5.

- Panel de atrasos reordenado con tres niveles y advertencia por nivel. Repartir en 1 a 7 días (seguro). Posponer con la cifra de cuántas se pueden posponer sin daño, calculada con la retención deseada como hace FSRS Helper (seguro con aviso). Borrón de la fecha de vencimiento sin tocar la estabilidad, con advertencia fuerte y confirmación (último recurso). Todo como eventos nuevos que solo se agregan, como manda la regla
- Días fáciles y dispersar hermanas visibles en Ajustes del repaso, con una línea que explica qué hacen. El motor ya los tiene en parte
- Sesión por tema fuera de la cola. Desde el árbol de temas, Estudiar este tema abre una sesión con las tarjetas del tema en cualquier estado, sin consumir el cupo del día ni cambiar lo que toca hoy. Lo que se califica sí cuenta para FSRS. Es lo que Paco describió como estudiar quemaduras desde cero y lo pidió como adicional a lo diario, nunca en lugar de
- Pantalla de mazo. Totales, nuevas, aprendizaje y programadas, histograma de intervalos, retención estimada, sanguijuelas, última vez que lo estudiaste y botones a Repasar, a Estudiar un tema y a Buscar tarjetas con el filtro puesto. Con estado calibrando mientras no haya datos
- Heatmap con detalle por día al tocar y copia en Progreso
- Buscar tarjetas con sintaxis campo y valor (mazo, tema, estado, vence, etiqueta, intervalo, marcada) y sugerencias al teclear, además de los chips. Sin regex
- Editar durante el repaso en cualquier tarjeta. En las precargadas se guarda como copia del alumno en Mis tarjetas, como hace la revisión del examen desde B5
- Explicación de los tipos de tarjeta en el menú de crear y en una página corta de ayuda. Básica, básica con inversa y cloze con un ejemplo médico de cada una tomado del banco. La oclusión de imagen aparece como lo que es hoy, se importa como básica, con el motivo

Se acepta cuando las e2e de review, review-tools, deck-topics y explore cubren los tres niveles de atrasos, la sesión por tema y la pantalla de mazo, los motores nuevos tienen unitarias y la bitácora sigue sin editar ni borrar.

Estado de V4-B3 (2026-10-22, D-142)
- Hecho. Atrasos por riesgo con posponer solo lo que aguanta y un último recurso con confirmación. Estudiar un tema aparte de la cola del día sin gastar su cupo. Estadísticas por mazo con histograma y retención estimada. Buscar con campo y valor, con ejemplos de un toque. Detalle por día en el heatmap, con su salida accesible en el Calendario. Ejemplos de cada tipo de tarjeta, que son de formato y no de medicina a propósito, porque ningún texto médico sale sin la validación de un médico
- Con salvedad. Las estadísticas por mazo viven en la pantalla Mazos con el catálogo que viene en la app. Con el catálogo de la nube, que es el de producción, todavía no se montan. Queda en IDEAS.md
- No se hizo. Editar durante el repaso una tarjeta de un mazo precargado, que pide una copia en Mis tarjetas. En la pantalla de mazo faltan las sanguijuelas, la última vez estudiado y los botones a Estudiar un tema y a Buscar tarjetas con el filtro puesto. Todo va a IDEAS.md

### V4-B4. Métodos de estudio y plan de hoy (M)

- Plan de hoy en Inicio y en Repasar con las tres cifras que da la guía. Tarjetas del día con el cupo de nuevas, preguntas del día y simulacros cortos. Los valores por omisión son los tuyos, 300 tarjetas, 50 nuevas y 50 preguntas, y el alumno los cambia en Ajustes del repaso. El cupo real de nuevas sigue mandando desde dailyLoad y el plan avisa cuando la cifra es imposible con el tiempo que declaró
- Guía de métodos dentro de la app, en Apuntes y en Tutor, como texto propio sin copiar material de terceros. Feynman, explicar con tus palabras una línea del apunte y volverla tarjeta. Recall sprint, escribir todo lo que recuerdas de un tema en 3 minutos antes de ver las tarjetas y compararlo con el apunte. Las ideas de Pandanote y RemNote se describen como método, sin usar sus nombres como marca en la interfaz
- Modo recall sprint en Apuntes. Botón que oculta el apunte, abre un cuadro con cronómetro y al terminar muestra el apunte al lado de lo que escribiste. No usa IA y no corrige nada, el alumno marca qué le faltó y eso se vuelve tarjeta con un toque
- Apuntes. Plegado de secciones con el triángulo, contador de puntos por recordar en cada tarjeta generada desde un esquema, y un importador de Markdown, OPML y TSV que cubre las exportaciones de Notion, Obsidian, Roam, Logseq, Dynalist y Quizlet. Un solo importador con tres entradas, no seis
- Visor de PDF con selección de texto para mandar solo esa parte a la IA de tarjetas. La cita literal se sigue verificando contra el PDF como hoy
- Consejos de la guía como texto fijo en Tutor y en el calendario. Simulacros cortos tres veces al día de la misma especialidad y de los mismos temas, nunca de todas las especialidades hasta las últimas semanas, y 8 a 10 simuladores completos los domingos al final

Se acepta cuando el plan de hoy se calcula en un motor puro con unitarias, el recall sprint tiene su e2e, el importador lee un archivo de muestra de cada formato y nada de la guía viene de la IA.

Estado de V4-B4 (2026-10-22, D-143)
- Hecho. Plan de hoy con las tres cifras en la meta diaria de Inicio y el plan de la guía en Ajustes del repaso. Guía de métodos en Tutor y Apuntes. Recall sprint dentro de cada apunte. Importador de Markdown y OPML
- No se hizo. Plan de hoy dentro de Repasar, los simulacros cortos como cifra aparte, el aviso de que una cifra es imposible con el tiempo declarado, el estado calibrando del plan, el plegado de secciones, el contador de puntos y seleccionar texto de un PDF. Todo va a IDEAS.md

### V4-B5. Estructura del examen con Bloom (M)

- Nivel cognitivo en el esquema de la pregunta con los seis niveles de Bloom agrupados en tres. Bajo con conocer y comprender, medio con aplicar y analizar, alto con sintetizar y evaluar. Columna nueva en el Sheet del banco con su lista de validación, el convertidor la lee y la pantalla del médico la muestra. Las preguntas sin nivel quedan sin nivel, nunca se adivina. La equivalencia exacta con la dificultad que pediste llenar (los tres igual a) espera tu dato, ver sección 8
- Simular con filtro por nivel y, en el examen completo, una mezcla por omisión que el admin cambia en Umbrales junto con los pesos por rama
- Progreso con la exactitud por nivel cognitivo al lado de la de dificultad, con estado calibrando
- Página Cómo es el examen dentro de la app, con la estructura de la sección 6 de V3 (280 reactivos, 250 en español y 30 de inglés, casos de 2 a 3 preguntas, las siete áreas) y las imperfecciones que listaste como entrenamiento, preguntas largas y mal redactadas, lo que se pregunta es confuso, imágenes de mala calidad. Enlaza con el simulador imperfecto a propósito que ya existe (D-080)
- Hoja de respuestas al estilo Ceneval como opción del examen completo. El alumno marca la burbuja en una hoja aparte en lugar de tocar la opción, para entrenar el llenado y el error de renglón. Se guarda igual, como evento de respuesta. Es barato y nadie más lo tiene
- Imágenes del banco con calidad baja a propósito solo donde el médico lo marque. No se degradan imágenes solas

Se acepta cuando una pregunta con nivel entra por el Sheet y sale en Simular con su filtro, el examen reparte por nivel, la hoja de respuestas tiene su e2e y la pantalla Cómo es el examen cita sus fuentes.

Estado de V4-B5 (2026-10-22, D-144)
- Hecho. Nivel cognitivo como campo independiente de la dificultad, opcional en el esquema del banco local y en el editor del médico, filtro por nivel en Simular, tarjeta de exactitud por nivel en Progreso con estado calibrando, tarjeta Cómo es el examen con las imperfecciones como entrenamiento y hoja de respuestas al estilo Ceneval como opción del examen, con su e2e (tests/e2e/exam-sheet.spec.ts)
- No se hizo. La columna del Sheet con su lista de validación, el convertidor y las columnas SQL del banco en la nube, porque no hay Postgres para probarlas aquí. Queda en docs/PENDIENTES_DE_RICARDO.md. El nivel está dormido hasta que haya preguntas con nivel. La mezcla por nivel del examen completo y su ajuste en Umbrales quedan en IDEAS.md hasta tener preguntas etiquetadas. Degradar imágenes a propósito todavía no existe, porque pide un campo en la pregunta para que el médico lo marque, y va a IDEAS.md

### V4-B6. Calendario (M)

- Pantalla Calendario en el menú, en lugar de la ruta vieja de planificador que hoy redirige a Progreso. Vista de mes y de semana con react-day-picker
- En cada día se ven la carga de repaso prevista (la de Carga futura), los simulacros cortos planeados con su especialidad, las sesiones hechas con su tiempo y el Pomodoro, y los recordatorios de B15 cuando existan
- Plan por semanas hasta el examen. El alumno elige el orden de especialidades y temas, la app reparte las semanas, marca los domingos de las últimas semanas para los simuladores completos y recalcula si se atrasa. Es la versión en pantalla de los consejos que listaste. Sale del motor planner.ts que ya existe
- Fecha del examen con cuenta regresiva discreta dentro del calendario, no en Inicio (tu barra de fecha límite apagada)
- Exportar el plan como archivo .ics para Google Calendar o el del teléfono. Sin integración de servidor

Se acepta cuando el plan de semanas se calcula en el motor con unitarias, el calendario pasa axe por teclado, y hay e2e de crear el plan, verlo en el mes y exportar el .ics.

Estado de V4-B6 (2026-10-22, D-144)
- Hecho. Pantalla Calendario en el menú con vista de mes, detalle del día, carga prevista a 60 días, plan por semanas hasta el examen con los domingos de simulador completo en las últimas 10 semanas, y exportar el plan como .ics. Motor puro en src/engines/studyCalendar.ts con sus pruebas, e2e en tests/e2e/calendar.spec.ts
- Cambio frente al plan. La cuadrícula del mes es propia, una tabla con botones, y no react-day-picker, porque el calendario necesita marcas por día y teclado propio y así no suma una dependencia. No se hizo la vista de semana aparte, porque el plan por semanas ya cubre esa lectura
- No se hizo. Que el alumno elija el orden de las ramas. El plan usa las ramas de sus ajustes, que hoy son las cuatro troncales por omisión y ninguna pantalla edita. Va a IDEAS.md. El Calendario es libre en todos los planes, y en Gratis el plan avisa que el simulador completo es de pago

### V4-B7. Comunidad (M, por etapas)

El foro completo que describes se evalúa y se parte en tres etapas, porque con menos de 100 alumnos un foro abierto queda vacío y exige moderación, reportes y responsabilidad legal desde el primer día.

- Etapa 1, ahora. Especialidad a la que aspiras en el perfil y la comparación de B14 segmentada por esa especialidad y por simulador completo. Percentil contra quienes aspiran a lo mismo, con el permiso que ya existe, estado calibrando bajo el mínimo de alumnos y sin nombres. Es lo que pediste de conocer tu competencia y casi todo ya existe
- Etapa 2, cuando haya 50 alumnos activos. Hilos por pregunta. Debajo de la revisión de cada pregunta, comentarios de alumnos con el seudónimo del grupo, botón de reportar, cola de moderación para el médico y el admin, y la regla de que un comentario nunca cambia el texto de la pregunta. Vale más que un foro general porque la conversación queda pegada al reactivo
- Etapa 3, cuando haya 300 alumnos activos. Foro general por especialidad con temas y respuestas, sobre la misma moderación. Queda en IDEAS.md con esa condición
- Tabla de posiciones de simuladores completos dentro de Party, opcional y con seudónimo, porque las ligas abiertas se quitaron en V3

Se acepta cuando la etapa 1 tiene su e2e y sus pruebas de permisos por fila en SQL, y las etapas 2 y 3 están escritas con sus condiciones en IDEAS.md y en este plan.

Estado de V4-B7 (2026-10-22, D-144)
- Etapa 1 ya existía. La especialidad a la que aspiras está en el perfil (targetSpecialty) y la comparación de B14 ya arma cortes por especialidad y para todos, con el permiso que ya existe, sin nombres y con estado calibrando bajo el mínimo de alumnos (src/engines/calibration/comparisonCells.ts). No se escribió código nuevo. Falta solo separar el percentil de simulador completo del de práctica, que va a IDEAS.md
- Etapas 2 y 3 siguen con sus condiciones, 50 alumnos activos para los hilos por pregunta y 300 para el foro general. Están en IDEAS.md

### V4-B8. Pendientes de la reunión con Paco (S)

Lo que no quedó en otro bloque.

- Urgencias gratis. Pasa al plan Gratis por configuración del catálogo y del servidor, con la prueba del límite del plan Gratis ajustada
- Explicación de los tipos de tarjeta, en V4-B3
- Atrasos con jerarquía y advertencias, en V4-B3
- Elegir un tema directo, en V4-B1 y V4-B3
- El tutor con IA ya tiene su compuerta de costo (B12). Se prende cuando pongas la clave y el presupuesto, ver docs/PENDIENTES_DE_RICARDO.md
- Precio de los planes fundadores. No toca código, los precios viven en Stripe y en la configuración. Cuando decidas subirlos, es un cambio de S
- Revisión pantalla por pantalla de Paco. Se le avisa después de V4-B2, cuando la apariencia esté estable, para que no revise algo que va a cambiar

Estado de V4-B8 (2026-10-22, D-144)
- Hecho en la interfaz, solo con el catálogo que viene en la app (demo y desarrollo). Urgencias se puede seguir en el plan Gratis (FREE_CATALOG_DECK_KEYS en src/config/billing.ts) y el aviso de ese catálogo lo dice. Con el catálogo de la nube, que es el de producción, Urgencias sigue de pago hasta que se autorice el cambio del servidor, y su aviso no lo promete. Su e2e queda en tests/e2e/free-plan.spec.ts
- Pendiente de Ricardo. La regla del servidor. deck_catalog_can_download(), deck_catalog_can_read() y record_deck_download() en supabase/migrations/20261023000005_deck_catalog.sql piden plan de pago, y deck_catalog_list() devuelve un solo canDownload para todo el catálogo, que el cliente valida como un booleano único (src/data/cloud/deckCatalog.ts). Con el catálogo en la nube un alumno Gratis no podría bajar Urgencias. El cambio es una migración nueva que deje pasar el mazo paco-urgencias, un canDownload por mazo en el contrato y en CloudDeckCatalog, con su prueba SQL. No se escribió porque no hay Postgres para probarla y no se toca Supabase sin tu autorización

### V4-B9. Lo que queda de V3

Al 2026-10-22 main ya trae B15 (analítica, errores, recordatorios y recorrido guiado, D-137 de DECISIONES.md) y B17 (publicación, D-138). B18 primeros alumnos (D-139) está construido. Lo que sigue aquí es solo lo que depende de Ricardo.

- Las cuentas de PostHog, Sentry y Resend, el dominio y Cloudflare, con sus pasos en docs/PENDIENTES_DE_RICARDO.md
- Revisar el recorrido guiado de B15 después de V4-B1 y V4-B2, porque cambió dónde está cada cosa en pantalla. Se cubre en la auditoría final
- B18. Que los 5 aspirantes entren cuando V4-B3 esté, para que vean el repaso completo

### V4-B10. Auditoría final y lanzamiento (L)

Es el B19 de V3 más el barrido de todo lo nuevo.

- Inventario de procesos con cada uno su e2e, incluidos los de V4
- Capturas de todas las pantallas en 390, 1280 y 1920, claro y oscuro, en docs/screenshots/v4/final
- Revisión independiente por área con subagentes que no escribieron el código. Interfaz y accesibilidad, datos y privacidad, pagos, IA y banco
- axe en claro y oscuro, rendimiento bajo 300 KB iniciales y sesión de 200 tarjetas fluida con el procesador lento, sin conexión, permisos por fila, sin secretos, CSP, npm audit y ASVS
- Skills de la sesión que se usan aquí y no antes. code-review, security-review, accessibility-review y deploy-checklist
- La lista de lanzamiento de la sección 11 de V3

## 8. Decisiones que esperan a Ricardo

Con la opción recomendada que se toma si no contestas.

1. Gamificación. En V3 pediste quitar Logros, insignias y ligas (comentario 14, respuesta 70). Ahora los widgets de gamificación de Synapse van encendidos. Recomiendo dejarlo como está, XP, nivel y racha en la barra, misiones en Inicio, y una tabla de posiciones opcional y con seudónimo solo para simuladores completos en Party (V4-B7). Las insignias no vuelven
2. Cristal y fondos. En V3 pediste quitar degradados, brillos y fondos (comentario 7). Ahora pides cristal de 6 px y fondo personalizado. Recomiendo cristal solo en la barra superior y el dock, superficies sólidas, y no regresar los fondos personalizados, porque pelean con la legibilidad y con el contraste del modo oscuro
3. Plantilla. Recomiendo no comprar. Si quieres comprar, Tailwind Plus cuando el repo sea privado
4. Foro. Recomiendo las tres etapas de V4-B7 y no el foro abierto ahora
5. Bloom. Los tres igual a de tu lista quedaron vacíos. Necesito saber si quieres que el nivel cognitivo se ligue a la dificultad 1 a 5 que ya existe (por ejemplo bajo con 1 y 2, medio con 3, alto con 4 y 5) o que sea un campo independiente. Recomiendo independiente, porque una pregunta de memoria puede ser difícil y una de análisis puede ser fácil
6. Orden de los bloques. Recomiendo V4-B1, V4-B2, V4-B3 y después los demás en el orden de la sección 10. Si prefieres ver primero algo de Paco, V4-B3 puede ir antes de V4-B2
7. Skill frontend-design. Las instrucciones de Adobe la nombran y no aparece en tu lista. Si existe en tu catálogo de Anthropic, instálala antes de V4-B1. Si no existe, el plugin design que ya tienes basta
8. Plugins que no se usan. Si quieres, los de ventas, finanzas, legal, recursos humanos, bio, datarobot, carta, wix y brightdata se pueden quitar. No gastan tokens si no se invocan, solo ruido en el menú
9. Delay overdue. Confirma que aceptas no hacerlo tal cual y tener el borrón de fecha con advertencia como último recurso

## 9. Lo que no se hace y por qué

- Instalar complementos de Anki. No son instalables en una página web. Se construye el equivalente
- Delay overdue tal cual. Su autor lo desaconseja y daña el resto de la colección. Va su equivalente seguro
- Anki MCP server. Es para conectar un modelo a Anki de escritorio. No aplica
- Oclusión de imagen real. Paco dijo que sirve más en la licenciatura que para el ENARM, y pide un editor de máscaras y una tabla de imágenes. Sigue en IDEAS.md
- Foro abierto desde ahora. Ver V4-B7
- Regex en Buscar tarjetas. Casi nadie lo usa y cuesta en el teléfono
- Degradar imágenes solas para imitar al examen. Solo donde el médico lo marque
- Un dato del día redactado por la IA. Todo texto médico de la IA va anclado y en borrador. Si hay dato del día, sale del banco con su cita
- Migrar a una plantilla de tablero. Ver sección 6
- Chat libre con IA y predicción del puntaje ENARM. Siguen prohibidos por CLAUDE.md
- Auditoría por bloque. Se mueve al final por tu decisión, con el riesgo dicho en la sección 1

## 10. Orden y calendario sugerido

| Orden | Bloque | Tamaño | Depende de |
|---|---|---|---|
| 1 | V4-B0 Arranque | S | Fusionar lo abierto de V3 |
| 2 | V4-B1 Densidad y espacio | L | V4-B0 |
| 3 | V4-B2 Identidad visual | M | Tu elección de dirección |
| 4 | V4-B3 Repaso completo | L | V4-B1 |
| 5 | V4-B4 Métodos y plan de hoy | M | V4-B3 |
| 6 | V4-B5 Bloom y estructura del examen | M | Tu respuesta 5 y la columna en el Sheet |
| 7 | V4-B6 Calendario | M | V4-B4 |
| 8 | V4-B7 Comunidad etapa 1 | M | V4-B2 |
| 9 | V4-B8 Pendientes de Paco | S | V4-B3 |
| 10 | Cuentas de B15 y B17 y revisión del recorrido | S | Tus cuentas, y V4-B2 |
| 11 | B18 de V3 primeros alumnos | S | V4-B3 |
| 12 | V4-B10 Auditoría final y lanzamiento | L | Todo lo anterior |

Son unas 14 sesiones de trabajo de código más la auditoría. Si el tiempo aprieta, lo que se puede recortar sin romper la promesa a los alumnos es V4-B7 etapa 1 (se queda la comparación por rama que ya existe), la hoja de respuestas de V4-B5 y el .ics de V4-B6.
