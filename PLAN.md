# Plan del prototipo ENARM

Plan vigente, escrito al cerrar la Fase 0 el 1 de octubre de 2026.
La especificación completa está en docs/PROMPT_PROTOTIPO.md y manda sobre este plan, salvo donde DECISIONES.md registre un cambio de Ricardo. Las referencias entre paréntesis como (7.4) apuntan a secciones de la especificación.

## 1. Resumen

- Página web PWA en español de México, con trato de tú, que funciona completa en el navegador
- Cuatro pilares. Repaso con FSRS, simuladores, tutor de IA con hipótesis ancladas y motor de retos
- Todo local en IndexedDB. Un proxy pequeño en server habla con Claude. Hoy la IA corre solo en modo simulado (D-015)
- Contenido de demostración escrito por Claude y marcado. No hay banco real todavía (D-007)
- Seis fases de construcción, de la A a la F. Cada una se cierra con la sección 15.1 y espera aprobación

## 2. Arquitectura

### 2.1 Capas

```
Pantallas (src/features, src/app)          React, Router, Zustand para estado efímero
   │  leen por hooks y snapshot providers
Repositorios (src/data/repos)              interfaz + implementación Dexie (Supabase en producción)
   │
Eventos inmutables + caché derivada         event log append-only, derivación reconstruible
   │
Motores puros (src/engines)                 sin React, sin Dexie, sin reloj del sistema
Workers (src/workers)                       Rasch, simulación de alumnos, importador .apkg
IA (src/ai → server)                        cliente del proxy, esquemas, fixtures del modo simulado
```

- La dirección de dependencias es de arriba hacia abajo. Los motores no importan nada de las capas de arriba. Una regla de ESLint (no-restricted-imports) lo hace cumplir en src/engines
- Los motores reciben el reloj como parámetro (`now: Date` o un `Clock`) y la semilla del azar como parámetro. Así se prueban de forma determinista
- Las pantallas nunca tocan Dexie directo. Usan repositorios y hooks como useDeckRepo o useSnapshot
- Cada widget del tablero lee de un proveedor de instantáneas (snapshot provider) que llama a los motores. Agregar un widget no toca motores (9.1)

### 2.2 Flujo de un evento

1. La pantalla llama a un caso de uso, por ejemplo answerQuestion
2. El caso de uso arma el payload, lo valida con zod y lo agrega a la bitácora con `eventRepo.append`
3. En la misma transacción de Dexie actualiza las cachés derivadas (estado FSRS, Elo, XP, racha) llamando a los motores puros
4. Si una caché se corrompe o cambia un motor, `rebuildDerivedState` la recalcula desde cero leyendo la bitácora
5. Nada edita ni borra eventos. Hay dos excepciones, y las dos eliminan una base completa, nunca eventos sueltos. Borrar mis datos elimina la base del alumno por petición suya (4.5). Regenerar desde cero elimina la base de demostración, que no tiene datos reales, con confirmación y solo en enarm_demo (11.3, D-052)

### 2.3 Proxy de IA

- server/ con Node, Hono y @hono/node-server, escuchando solo en 127.0.0.1
- Lee server/.env.local al arrancar. Si existe ENARM_ANTHROPIC_KEY usa modo real, si no, modo simulado. La ruta /health dice el modo y la app lo muestra
- Rutas por motor, por ejemplo /ai/forgetting, /ai/weekly-report, /ai/flashcards, /ai/bias-tips y /ai/restructure
- Cada ruta valida la entrada con zod y un tamaño máximo, pasa el filtro de datos personales, llama al modelo o al fixture, valida la salida con zod, reintenta una vez con el error y si falla cae a la plantilla sin IA
- server/config/models.json y server/config/prices.json guardan modelos por motor y precios (8.1)
- server/prompts guarda los prompts versionados, por ejemplo forgetting.v1.md
- En el prototipo la app llama al proxy en desarrollo. En la demo publicada no hay proxy y el cliente usa directo los fixtures de src/ai/fixtures (D-017)

### 2.4 Bases de datos locales

- enarm_real para el alumno real y enarm_demo para la demo y los alumnos simulados (D-024)
- Un interruptor en el perfil cambia de base. En enarm_demo toda pantalla lleva la etiqueta Datos simulados

## 3. Carpetas

Las de la especificación (5.1), con estos detalles.

```
src/
  app/                 router, layout con navegación inferior, providers, guard de rol
  features/            review, simulator, exam, progress, tutor, widgets, party, decks,
                       planner, profile, onboarding, physician, admin, billing
  engines/             fsrs, mcqGrade, session, topics, bias, structure, behavior,
                       difficulty (elo), rasch, sampler, forgetting, xp, streak,
                       planner, party, agreement, stats (wilson, betaBinomial, kappa)
  ai/                  client.ts, schemas/, fixtures/, templates/ (salida sin IA)
  data/
    schemas/           un archivo zod por entidad y events.ts con la unión discriminada
    db/                Dexie, versiones y migraciones
    repos/             interfaces + dexie/
    derive/            rebuildDerivedState y derivaciones por caché
    usecases/          answerQuestion, reviewCard, closeDay, importDeck, etc.
  demo/
    content/           questions/*.json, decks/*.json, taxonomy.json, structure-dict.json,
                       bias-taxonomy.json, bias-tips.json
    generator/         alumnos simulados con semilla
  workers/             rasch.worker.ts, simulate.worker.ts, apkg.worker.ts
  ui/                  componentes shadcn copiados, tokens, iconos
  i18n/                es-MX.ts con todos los textos
  config/              brand.ts (nombre provisional), thresholds.ts por defecto
server/
  src/                 app Hono, rutas, filtro de datos personales, logger de costo
  prompts/             prompts versionados
  config/              models.json, prices.json, limits.json
  evals/               casos dorados por motor y runner
  .env.example         sin valores
prompts/               flashcards_maestro.md (de Ricardo), flashcards_provisional.md (Fase D)
tests/
  e2e/                 Playwright por flujo
  fixtures/            .apkg generados por código, zip malicioso, CSV de banco
docs/
  screenshots/         por fase, teléfono y escritorio, claro y oscuro
```

## 4. Modelo de datos

### 4.1 Reglas

- Una sola fuente de verdad en src/data/schemas con zod 4. De ahí salen los tipos con z.infer y la lista de índices de Dexie
- IDs con ULID (ordenables por tiempo)
- Fechas en UTC como ISO 8601. El día de estudio se calcula con @date-fns/tz en America/Merida y con corte a las 4 a. m. (9.4)
- Preguntas y opciones tienen versión inmutable. Editar crea `questionVersionId` nuevo y las estadísticas se guardan por versión
- Cada tabla con estado derivado lleva el sufijo Cache y se puede reconstruir

### 4.2 Tablas de Dexie

| Tabla | Llave e índices | Notas |
|---|---|---|
| users | id | alias, rol, examDate, dailyMinutes, tz, settings |
| consents | id, userId, purpose | finalidad party, ai_analysis o anonymized_improvement |
| decks | id, ownerId, origin | origin preloaded, imported, generated o manual |
| notes | id, deckId, *tags | contenido saneado, tipo basic o cloze, editorialStatus, sourceQuote |
| cards | id, noteId, deckId | ordinal de cloze. El estado FSRS va en cardStateCache |
| cases | id | viñeta compartida para casos seriados |
| questions | id, [questionId+version], branch, topic, subtopic | enunciado, estructura, explicación, refs GPC, dificultad del médico, set canónico |
| options | id, questionVersionId | texto, isCorrect, biasTag, rationale |
| events | id, [userId+type], [userId+at], sessionId | bitácora inmutable |
| sessions | id, userId, kind | review, practice, exam o challenge |
| findings | id, userId, rule, area, createdAt | evidencia como IDs |
| patterns | id, userId, rule, area, status | confirmed desde 5 hallazgos en 14 días |
| aiArtifacts | id, userId, kind, status | draft, approved, edited o rejected, modelo, promptVersion, validatorResult |
| aiCallLog | id, engine, at | tokens, costo, latencia, resultado |
| groups, memberships, challenges | id, code o groupId | Party local |
| widgetLayouts | userId | widgets, orden y ajustes |
| biasLabels | id, [optionId+physicianId] | para kappa |
| contentReports | id, targetId, status | |
| subscriptions | userId | plan simulado |
| officialScores | userId | con consentimiento |
| simTruth | userId | solo en enarm_demo y solo lo leen las pruebas y admin |
| cardStateCache, itemStatsCache, userAbilityCache, xpCache, streakCache | por clave natural | derivadas y reconstruibles |

### 4.3 Eventos

- Unión discriminada de zod por `type`, con los tipos de 6.3
- Campos comunes. id, type, userId (seudónimo), at (UTC), tz, schemaVersion, sessionId opcional y payload
- `eventRepo` solo expone append, query y stream. No hay update ni delete. Una prueba lo verifica revisando la interfaz y la implementación

### 4.4 Formato del contenido demo

- src/demo/content/questions/{branch}.json con un arreglo de preguntas validadas por QuestionSchema
- Cada pregunta trae caso opcional, enunciado, rama, tema, subtema, estructura (polaridad, tarea y formato), 10 opciones con isCorrect, biasTag y rationale, canonicalOptionIds (4), explicación de 80 a 150 palabras, refs GPC con estado por verificar, dificultad de 1 a 5 y la marca demo
- src/demo/content/decks/{deck}.json con notas básicas y cloze
- La plantilla del importador de banco de la Fase E usa los mismos campos en CSV (una fila por pregunta y columnas option_1 a option_10 con su tag y rationale) y en JSON

## 5. Motores y sus contratos

Cada motor documenta al inicio de su archivo qué hace, entradas, salidas y umbrales (7). Resumen de contratos.

| Motor | Entrada principal | Salida | Sección |
|---|---|---|---|
| fsrs | estado de tarjeta, calificación, now, retención, examDate | estado nuevo, vencimiento acotado a examDate | 7.1 |
| mcqGrade | acierto, confianza, señales | calificación FSRS por la tabla de 7.1 | 7.1 |
| session | vencidas, nuevas, errores, retos, minutos, semilla, mapa de confusables | lista ordenada e intercalada | 7.2 |
| topics | respuestas por tema, taxonomía, pesos, retrievability | dominio con IC95, calibrando o top 5 con acción | 7.3 |
| bias | exposiciones y elecciones por etiqueta, línea base | atracción, Wilson, patrón o calibrando | 7.4 |
| structure | texto de pregunta, diccionario | polaridad, tarea, rangos a resaltar | 7.5 |
| behavior | respuestas con tiempos, cambios y visibilidad | z de tiempo, adivinanza rápida, fatiga, calibración | 7.6 |
| difficulty | respuesta, habilidad y dificultad previas, conteos | Elo actualizado y estado de calibración | 7.7 |
| rasch | matriz de respuestas | dificultades y habilidades por JML (D-025) | 7.7 |
| sampler | pregunta, modo, historial del alumno, semilla | 4 opciones barajadas con correcta balanceada | 7.8 |
| distractors | exposiciones y elecciones por opción y versión | atracción por opción y marca de no funcional | 7.8 |
| forgetting | error con su contexto | hallazgos y patrones | 7.9 |
| planner | examDate, minutos, carga FSRS, temas, pesos | plan del día y semana, avisos con efecto | 7.10 |
| agreement | pares de etiquetas | kappa global y por etiqueta con IC | 7.11 |
| streak | días con actividad, meta, congeladores | racha, récord y congeladores usados | 9.4 |
| xp | eventos de actividad, racha | XP con motivo, nivel y título | 9.5 |
| party | XP semanal de miembros, retos | tabla, progreso de reto, ganador de duelo | 9.6 |

## 6. Tareas por fase

Cada fase se divide en bloques. Al terminar cada bloque hay commit y PROGRESS.md actualizado (CLAUDE.md, Flujo).

### Fase A. Esqueleto, datos y proxy

Antes de empezar
- Proyecto movido fuera de OneDrive (D-002) y sesión abierta en la carpeta nueva
- Repo privado de GitHub creado o GitHub CLI autorizado (D-003)

Bloques
1. git init, .gitignore (node_modules, dist, server/.env.local, coverage, test-results), Vite con React y TypeScript estricto, ESLint con typescript-eslint y regla de importaciones de engines, Prettier, Vitest y Playwright. Scripts de 5.2
2. Tailwind 4 con tokens (color, espacio, tipografía, radios) en un solo archivo, modo claro y oscuro con preferencia del sistema y selector manual, shadcn/ui base, navegación inferior de 5 secciones y todas las rutas de las 26 pantallas como esqueleto con estados vacío, cargando, error, sin conexión y calibrando como componentes reutilizables
3. Esquemas zod de todas las entidades y eventos, Dexie con versión 1 para enarm_real y enarm_demo, repositorios con interfaz e implementación Dexie, eventRepo solo de agregar, rebuildDerivedState con una derivación de ejemplo
4. vite-plugin-pwa con manifest, íconos provisionales y caché de la app para abrir sin conexión
5. Proxy Hono con /health, modo simulado, lectura de server/.env.local, server/.env.example vacío, escucha solo en 127.0.0.1
6. Selector de rol sin login (alumno, médico y admin) e interruptor de base real o demo
7. npm run dev con concurrently para app y proxy

| Criterio de aceptación | Prueba |
|---|---|
| npm run check pasa | El propio comando en limpio |
| Navega entre todas las rutas sin instalar nada | e2e smoke.spec.ts recorre cada ruta en teléfono y escritorio |
| Se puede instalar como PWA en localhost | e2e revisa manifest y service worker registrado, más captura manual |
| Ningún secreto en dist | tests/security/no-secrets.test.ts busca la clave, ENARM_ANTHROPIC_KEY, ANTHROPIC_API_KEY y el prefijo sk-ant- en dist |
| El proxy escucha solo en localhost | prueba del servidor que revisa la dirección de escucha |
| La bitácora no se edita ni se borra | prueba unitaria sobre eventRepo |
| Los motores no importan React ni Dexie | regla de ESLint más prueba que revisa importaciones de src/engines |

### Fase B. Motores núcleo, alumnos simulados y contenido demo

Bloques
1. Funciones estadísticas (Wilson, beta-binomial con empirical Bayes, kappa de Cohen con IC) contra valores calculados a mano
2. fsrs y mcqGrade con ts-fsrs 5, modo examen, hermanas, sanguijuelas, límites y carga futura
3. sampler, distractors (atracción por opción y no funcional con menos de 5% tras 100 exposiciones) y structure con el diccionario de negaciones en datos
4. behavior, difficulty (Elo) y rasch en Web Worker con Comlink
5. topics, bias, forgetting y agreement
6. session, planner, streak, xp y party
7. Taxonomía de unos 40 temas con subtemas y relación de tema base, taxonomía de sesgos con solo los 24 de Ricardo, sin trampas de formato ni Otro (D-029 y D-042), diccionario de estructura y textos base de consejos marcados pendiente de revisión médica, todo como JSON en src/demo/content
8. Contenido demo. 300 preguntas, 75 por rama, en 6 lotes mezclados de 50 (D-042), con 10 opciones cada una, al menos 20% negativas o de excepción, al menos 6 casos seriados, y 4 mazos con 200 tarjetas
9. Generador de 300 alumnos simulados con semilla, simulación de FSRS de 90 días, alumno de la demo con 60 días y patrones sembrados (anclaje, mala lectura de negaciones, fatiga después de 40 minutos y Pediatría débil)
10. Prueba de recuperación de parámetros (14.2) e informe en docs/recovery-report.md

| Criterio de aceptación | Prueba |
|---|---|
| Cobertura de 90% o más en src/engines | vitest --coverage con umbral configurado para esa carpeta |
| Propiedades de FSRS (Otra vez nunca da más intervalo que Bien, nada vence después del ENARM en modo examen, tabla de opción múltiple determinista y completa) | fast-check en fsrs.property.test.ts |
| Muestreo sin repetir, con la correcta, por modo y reproducible | fast-check en sampler.property.test.ts |
| XP, racha e intercalado | fast-check en sus archivos |
| Negaciones solo en la frase de la pregunta | casos con mayúsculas, acentos, dobles negaciones y falsos positivos de viñeta |
| Metas de 14.2 reportadas con números reales | recovery.test.ts más el informe |
| Contenido demo válido | prueba que carga cada JSON con su esquema y verifica conteos y porcentajes |
| Wilson, beta-binomial y kappa contra valores de referencia | stats.test.ts con valores calculados a mano |
| Análisis de distractores | distractors.test.ts con casos en el borde de 5% y 100 exposiciones |

### Fase C. Pantallas del alumno y gadgets

Bloques
1. Onboarding con fecha del ENARM, minutos, ramas, meta, aviso de privacidad simulado y consentimientos por finalidad
2. Repaso de tarjetas con confianza previa (apagable), 4 botones, causa al fallar, tiempo y XP
3. Pregunta de opción múltiple con caso, resaltado de negaciones, confianza, cambios, temporizador y reporte de error, más retroalimentación y resumen de sesión
4. Configurar simulador, examen completo con navegación y marcar para revisar, y resultados con errores al repaso
5. Progreso con temas, sesgos, estructura, conducta, calibración, dificultad y carga futura, cada uno con estado calibrando
6. Tablero con los 12 widgets, tres acomodos predefinidos, arrastrar con teclado, Pomodoro con marcas de tiempo, heatmap con resumen de texto y recordatorios
7. Tutor (hipótesis de reglas, informe con plantilla, consejos y flashcards en borrador como espacio que llena la Fase D), mazos con seguir y dejar y creación manual de mazos y tarjetas, planificador y Party local con tarjeta de logro para compartir con Web Share API (D-028)
8. Perfil y ajustes, con exportar, borrar y puntaje oficial como botones para la Fase E

| Criterio de aceptación | Prueba |
|---|---|
| Flujo 1, onboarding | e2e onboarding.spec.ts |
| Flujo 2, repaso con confianza, causa y XP | e2e review.spec.ts |
| Flujo 4, examen corto de 20 con resultados y errores al repaso | e2e exam.spec.ts |
| Flujo 5, widgets | e2e widgets.spec.ts |
| Flujo 6, Party | e2e party.spec.ts |
| Todos los flujos en teléfono y escritorio | proyectos de Playwright mobile (390 por 844) y desktop |
| Cero violaciones serias o críticas | axe en cada spec |
| Pantallas con lógica | Testing Library en pregunta, repaso, tablero y progreso |
| Estado calibrando con cuánto falta (4.3) | e2e calibrating.spec.ts con un alumno nuevo en Mi cuenta revisa cada análisis y widget |
| Etiquetas visibles (4.6) | e2e labels.spec.ts revisa Demostración, no validado por médicos en preguntas y mazos demo de Mi cuenta, Datos simulados en toda la base demo y en los amigos de Party |
| Creación manual de mazos y compartir logro | Testing Library en el editor de tarjetas y en el botón de compartir |
| Capturas | docs/screenshots/fase-c en 4 variantes |

### Fase D. Motores de IA y evaluaciones

Programada el 2026-10-08 en modo simulado (D-098). Falta la clave de Ricardo para medir costo y latencia reales. La cola del médico para las preguntas reestructuradas va en la Fase E.

Bloques
1. Cliente del proxy, filtro de datos personales, límites por alumno y por día, timeout y reintentos con espera exponencial, bitácora de costo
2. Motor de olvidos por patrón y tarjeta de hipótesis con ver evidencia, aplicar acción y no me ayuda
3. Informe semanal con secciones calibrando ocultas y plantilla sin IA
4. Generador de flashcards con prompts/flashcards_provisional.md (D-014), validador de cita literal, cifras, dosis, fármacos y duplicados, y aprobación del alumno
5. Consejos por sesgo y motor de retos con propuestas que van a la cola del médico
6. Evaluaciones con 10 a 20 casos dorados por motor y npm run eval-ai con la bandera mock
7. Pantallas de admin 23 a 25. Costos y bitácora de llamadas, datos de demostración (generar, borrar y ajustar alumnos simulados y regenerar al alumno de la demo) y configuración de umbrales, pesos del ENARM, precios y modelos por motor

| Criterio de aceptación | Prueba |
|---|---|
| Esquema válido en 100% de los casos | eval-ai mock |
| Anclaje correcto en 100% | eval-ai mock con casos que intentan meter cifras y fármacos nuevos |
| Rechazo correcto sin explicación | eval-ai mock |
| Flujo 3, práctica con flashcards en modo simulado | e2e practice-flashcards.spec.ts |
| Sin clave toda la app funciona sin errores | e2e con proxy en modo simulado y otro sin proxy |
| Filtro de datos personales (4.5) | prueba del servidor que manda correo, teléfono y alias del perfil y espera que se bloqueen |
| Entrada del proxy validada y con tamaño máximo | prueba del servidor con payload inválido y con payload demasiado grande |
| Límites por alumno y presupuesto diario | prueba del servidor que pasa el límite y espera rechazo con mensaje claro |
| Pantallas de admin | e2e admin.spec.ts regenera al alumno demo y cambia un umbral, y el cambio se refleja en un análisis |
| Números reales de costo y latencia | Pendiente hasta que exista clave (D-015) |

### Fase E. Panel médico, importadores, reportes, pagos y consentimientos

Bloques
1. Banco de preguntas con filtros, estado de calibración y alerta de distractores no funcionales, más editor con versiones, set canónico y etiquetas con su definición a la vista
2. Doble etiquetado al 20%, tablero de kappa y cambio de sesgos a trampas cuando kappa es menor a 0.4
3. Cola de borradores de IA y bandeja de reportes
4. Importador .apkg en Web Worker, formato viejo y nuevo, límites de D-026, DOMPurify con lista corta, tipos de nota de D-009, sin revlog (D-010), casilla de derechos y mazo privado
5. Fixtures generados por código y zip malicioso de prueba. Prueba manual con el mazo de Fer leído desde la carpeta de Ricardo, sin copiarlo (D-008)
6. Importador del banco desde CSV o JSON con plantilla documentada en docs/bank-import.md y reporte de errores por fila
7. Suscripción y checkout simulados con recibo marcado, consentimientos desde el perfil, exportar y borrar datos, y puntaje oficial

| Criterio de aceptación | Prueba |
|---|---|
| Flujo 7, .apkg viejo y nuevo | e2e import-apkg.spec.ts con fixtures generados |
| Flujo 8, médico edita, etiqueta y ve kappa | e2e physician.spec.ts |
| Sesgos pasan a trampas con kappa menor a 0.4 (4.4) | e2e con datos de etiquetado que dan kappa de 0.39 y revisa que la interfaz del alumno diga trampas, y otro con 0.40 que diga sesgos |
| Flujo 9, exportar y borrar | e2e privacy.spec.ts |
| Rechaza zip malicioso | prueba del worker con bomba zip, ruta con .. y HTML con script |
| Mazo de Fer importa a escala | prueba manual documentada en PROGRESS.md con tiempos y conteos |

### Fase F. Endurecer, documentar y demo

Bloques
1. Suite completa e2e, axe, presupuesto de JS inicial menor a 300 KB comprimido, sesión de 200 tarjetas fluida, CSP, npm audit sin altas ni críticas y revisión contra OWASP ASVS 5.0 en docs/asvs.md
2. Demo en Cloudflare Pages con IA simulada, previa aprobación de Ricardo al publicar (D-017)
3. README.md, DEMO.md, tabla de real contra simulado, informe de pruebas y mapa contra el plan maestro (17)

| Criterio de aceptación | Prueba |
|---|---|
| Todo pasa y está documentado | npm run check, npm run e2e e informe |
| JS inicial menor a 300 KB comprimido | script de presupuesto que mide el bundle inicial con gzip y falla si lo pasa |
| Abre sin conexión tras la primera carga y la IA avisa que necesita conexión | e2e offline.spec.ts con el contexto de Playwright sin red |
| Sesión de 200 tarjetas fluida | e2e perf.spec.ts con CPU limitada que mide el tiempo entre tarjetas |
| Content Security Policy en el build | prueba que revisa la política en dist y en los headers de Cloudflare |
| npm audit sin altas ni críticas | npm audit con nivel high en el cierre |
| Revisión OWASP ASVS 5.0 | docs/asvs.md con cada control aplicable y su estado |
| Ricardo sigue DEMO.md sin ayuda | Ricardo lo recorre |

### Fase P. Plataforma real (D-060)

Convierte el prototipo en un producto vendible. Corre junto a lo que falta de la Fase C. Detalle en docs/ANALISIS_PLATAFORMA.md.

Bloques
1. Sistema de diseño premium. Paleta con color por rama, tipografías, fondos, animaciones y sonidos apagables, y personalización de fuente, tamaño, fondo y movimiento. Se rehacen el marco y las pantallas actuales
2. Portada de venta, registro e inicio de sesión con correo, perfil con los datos de D-060, foto o avatar generado
3. Esquema de Supabase en supabase/migrations con permisos por fila, roles con dueño fijo y bitácora de cambios de rol, probado contra Postgres local
4. Panel de administración de usuarios y asignación de preguntas a médicos. El médico solo ve lo asignado
5. Pagos con Stripe y Mercado Pago en modo prueba, con funciones del servidor para checkout y avisos de pago, y guía para Ricardo
6. Inicio con plan del día, misiones, ligas semanales, insignias, niveles con títulos médicos, duelos y tarjetas para compartir
7. Progreso con las estadísticas de técnica de examen
8. Subir mazos desde paquetes de otras apps, CSV, Excel y Word
9. Sincronización de la bitácora local con el servidor

| Criterio de aceptación | Prueba |
|---|---|
| Personalización se guarda y se aplica | Testing Library y e2e de apariencia |
| Animaciones apagadas respetan la preferencia y prefers-reduced-motion | prueba unitaria del ajuste |
| Un alumno no puede cambiar roles ni ver preguntas no asignadas | pruebas SQL de permisos por fila en Postgres local |
| Nadie puede quitar el rol de dueño | prueba SQL |
| Aviso de pago repetido no activa dos veces | prueba de la función de avisos |
| Ninguna llave secreta en el repo ni en el bundle | tests/security/no-secrets.test.ts |

### Fase C2. Organización, carga diaria, apuntes e importación (D-085 y D-086)

Nace de la guía de Anki que compartió Ricardo y de su idea de sumar lo mejor de RemNote. Va antes de la Fase D y cada etapa cierra según 15.1 con aprobación de Ricardo. Las 14 filas son las de la tabla que aprobó el 2026-10-07. La conversación completa, con el diagnóstico, la entrevista, la tabla de controversias y la aprobación, está en docs/ANALISIS_GUIA_ANKI.md.

Etapas
0. Cerrar la Fase C con lo que falta de la revisión (descarte y muestreo dirigido en la práctica, calibrando en el plan y límite Gratis, pruebas de pantallas y visibilidad), la corrida final y su aprobación
1. Organización. Filas 3, 4, 9 y 12. Mazos en árbol con migración de los mazos de Paco, etiquetas en ruta sin espacios con migración de las 42 etiquetas con espacio, pantalla Explorar con filtros, búsqueda y acciones por lote, básica con tarjeta inversa, cloze anidado, revisión de calidad y duplicados, y fecha de modificación con marca de borrado
2. Carga diaria. Filas 5, 6, 7, 8 y 14. Contadores de Nuevas, Aprendizaje y Programadas, perfil guía de un toque, nuevas por día según la carga proyectada, temporizador opcional, flujo de sanguijuelas, repartir, posponer y adelantar como eventos nuevos, aviso de recuperación, días fáciles y banderas de acceso por función
3. Apuntes tipo RemNote. Fila 2. Editor en esquema con marcas rápidas que crean tarjetas, enlaces entre apuntes y etiquetas, guardado en el modelo de notas y tarjetas
4. Importar y exportar. Fila 13. Importador .apkg, CSV, Excel y Word, y exportación a CSV con encabezados y un identificador por tarjeta
5. IA para tarjetas desde PDF y textos. Fila 10 con la opción B de Ricardo. La IA nunca corrige. Señala la controversia con su explicación y el alumno la marca como verificada o edita la tarjeta
6. Sincronización entre dispositivos. Fila 12 completa, con la nube parte 2

| Criterio de aceptación | Prueba |
|---|---|
| Migrar a mazos en árbol no pierde notas ni tarjetas | Prueba de migración con los 3 mazos de Paco que compara conteos y claves antes y después |
| Ninguna etiqueta guardada tiene espacios y las rutas conservan su jerarquía | Prueba de saneo con las 42 etiquetas conocidas |
| Explorar filtra miles de tarjetas sin trabarse | Prueba de rendimiento con 20,000 tarjetas generadas |
| Repartir, posponer y adelantar no editan la bitácora y se reconstruyen igual | Prueba de reconstrucción de estado derivado con eventos nuevos |
| Los días fáciles bajan la carga de esos días sin pasar del límite diario ni subir el pico más de 1.4 veces | Prueba con la simulación de carga futura en 8 semillas |
| Los apuntes crean, actualizan y borran sus tarjetas sin perder el historial de las que siguen | Prueba de sincronización entre apuntes y tarjetas |
| El importador rechaza archivos dañados o maliciosos con un mensaje claro | Fixtures generados por código y un zip malicioso |
| La IA nunca cambia un texto y cada señal explica su motivo con textos de la lista cerrada | Evaluación con casos dorados y prueba de que la señal se quita al verificar y deja un evento |
| Dos dispositivos que editan lo mismo conservan la edición más reciente | Prueba de conflicto con fecha de modificación |

## 7. Umbrales

Valores por defecto en src/config/thresholds.ts, editables desde admin (12).

| Función | Deja de calibrar cuando | Marca |
|---|---|---|
| Dificultad provisional por pregunta | 30 respuestas | V |
| Dificultad calibrada | 100 respuestas | V |
| Variante dentro del puntaje del examen | 200 exposiciones por distractor | J |
| Patrón por sesgo por alumno | 40 errores etiquetados y límite inferior de Wilson sobre la línea base | J |
| Dominio por tema | Intervalo de 95% menor a 0.25 | J |
| Estructura por alumno | 20 respuestas por categoría y la regla del intervalo | J |
| Patrón de olvido que llama al LLM | 5 hallazgos del mismo tipo en 14 días | J |
| Distractor no funcional | Menos de 5% tras 100 exposiciones | J |
| Hablar de sesgos y no de trampas | Kappa de 0.4 o más | J |
| Doble etiquetado | 20% de las preguntas | J |
| Optimizar FSRS por alumno | 1,000 repasos, fuera del prototipo | J |
| Sanguijuela | 8 lapsos, reglas de olvido desde 3 | Anki |
| Retención deseada | 0.90, de 0.80 a 0.97, sube a 0.93 en los últimos 30 días | J |
| Límites diarios | 20 nuevas y 200 repasos | J |
| Ritmo propio de repaso para sugerir nuevas por día | 100 repasos medidos, con 20 tarjetas nuevas medidas para usar su tiempo. Antes usa 10 s por repaso y 30 s por nueva | J |
| Tiempo para tarjetas dentro de los minutos diarios | 50% de los minutos que declara el alumno, sobre el día más pesado de 30 días | J |
| Aviso de recuperación por atrasos | 40 vencidas de días anteriores o más, o la mitad del límite diario de repasos, lo que sea mayor | J |
| Tiempo máximo que se guarda en cada paso de una tarjeta, ver la respuesta y calificar | 120 segundos | J |
| Días fáciles | Solo mueven repasos de 3 días o más, con ventana de 1 día (3 a 6), 2 (7 a 19), 3 (20 a 59) y 5 (60 o más). Estos radios y el máximo de 200 nuevas de la sugerencia viven en los motores y no en la configuración | J |

## 8. Riesgos

| Riesgo | Efecto | Mitigación |
|---|---|---|
| Proyecto dentro de OneDrive | Archivos bloqueados y npm lento | Mover antes de la Fase A (D-002). Hecho |
| Respaldo remoto (D-048) | Resuelto con repo privado en GitHub | Hacer push al cerrar cada bloque |
| Contenido clínico demo escrito por IA | Un error médico en algo que ven aspirantes | Etiqueta visible, referencias por verificar y revisión por lotes de Ricardo y dos médicos más antes de las pruebas con 5 aspirantes (D-031) |
| Sin banco real | Las pruebas de usabilidad usan solo contenido demo | Hasta 500 preguntas demo (D-030), plantilla del importador lista en la Fase E y examen sin repetir preguntas (D-012) |
| Sin clave de API | No hay costo ni latencia reales para comparar con el plan maestro | Bitácora y pantalla de costos listas. Basta agregar la clave |
| TypeScript 7 y typescript-eslint | Lint roto si se actualiza | TypeScript 6.0 fijo (D-021) |
| Recuperación de parámetros por debajo de la meta | Análisis poco confiables | Informe con números reales y ajuste propuesto antes de seguir (14.2) |
| Mazos grandes en el navegador | Memoria y tiempo en teléfonos | Worker, descompresión por archivo, límites (D-026) y prueba con el mazo de Fer |
| Avisos en iPhone | Solo funcionan con la página agregada a inicio | La página lo explica sin presionar (9.2) |
| JS inicial mayor a 300 KB | Carga lenta en teléfono | Carga diferida de sql.js, gráficas y panel médico desde la Fase A |
| Kappa bajo con médicos reales | Hablar de sesgos sería engañoso | Cambio automático a trampas (4.4) |

## 9. Lo que queda pendiente de Ricardo

- Mover la carpeta antes de la Fase A
- Repo privado remoto. Hecho (D-048)
- Cuenta gratuita de Cloudflare antes de la Fase F
- Opcionales sin fecha. Prompt maestro de flashcards, clave de API y banco de opción múltiple

## 10. Directrices V2 (D-080)

Dónde se aplica cada directriz del Prompt V2. Antes de cada bloque se revisa en silencio que soporte la imperfección y los sesgos, que integre freemium y referidos y que evite el código espagueti.

| Directriz | Dónde se aplica | Cuándo |
|---|---|---|
| Simulador imperfecto, descarte de opciones y manejo de la frustración | Práctica y examen. El alumno tacha opciones, queda guardado en cada respuesta y la retroalimentación explica qué se podía descartar | Fase C, bloque 9 |
| Tipologías de reactivo (patognomónico, característico, resolución inversa, control, incoherente, dato oscuro y perspectiva del paciente) | Esquemas zod de pregunta y de contenido, validadores y plantilla del importador. Los de control y los incoherentes se reportan aparte | Esquema en Fase C bloque 9. Editor e importador en Fase E |
| Muestreo dirigido a los sesgos del alumno | Motor sampler con varias etiquetas y más opciones por pregunta. Opción en Simular con estado calibrando hasta tener los errores etiquetados que pide 7.4 | Fase C, bloque 9 |
| Alarmas de tiempo | Motor puro timeAlerts, con avisos por tiempo restante y por ritmo, en pantalla y para lector de pantalla, apagables | Fase C, bloque 9 |
| Datos pre-clasificados | Los motores de IA leen solo lo que el médico ya etiquetó y nunca clasifican en bruto | Fase D |
| IA con otro proveedor | Proxy sin atarse a un proveedor. OpenAI pendiente de confirmar y sin chat abierto | Fase D, tras confirmar |
| Plan Gratis | Banderas por plan con tope de banco, y el mismo límite aplicado en el servidor con permisos por fila | Fase P, bloque 10 nuevo |
| Referidos con mes gratis | Tablas, funciones y avisos de pago en el servidor, y la pantalla en Party. Antes se confirma qué cuenta como concretado | Fase P, bloque 11 nuevo |

Criterios de aceptación nuevos

| Criterio | Prueba |
|---|---|
| Un reactivo anómalo de cada tipo pasa el esquema y la ingesta | Pruebas de esquema y de check-draft con un caso de cada tipo |
| Las alarmas salen en los umbrales y se pueden apagar | Pruebas del motor timeAlerts y e2e del examen |
| El muestreo dirigido sube las opciones con el sesgo del alumno y sigue incluyendo la correcta | Pruebas por propiedades en sampler |
| El alumno Gratis no pasa de su tope ni con el navegador manipulado | Prueba SQL de permisos por fila en Fase P |
| El mes gratis solo lo da el servidor y una sola vez por referido | Prueba SQL y prueba de la función de avisos |
