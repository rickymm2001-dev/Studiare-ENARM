# Avance

## Estado actual

- Fase 0 aprobada por Ricardo el 2026-10-01
- Fase A terminada el 2026-10-02, esperando aprobación de Ricardo
- Siguiente paso. Ricardo revisa el resumen, contesta las preguntas abiertas de la Fase A y aprueba la Fase B
- No empezar la Fase B sin su aprobación explícita

## Fase A. Esqueleto, datos y proxy

### Respuestas de Ricardo al aprobar
- Aprueba el examen sin preguntas repetidas (D-012)
- Contenido demo de hasta 500 preguntas con opciones etiquetadas con su lista de 24 sesgos cognitivos (D-029 y D-030)
- Él es médico y tiene dos médicos más para revisar el contenido demo (D-031)

### Bloques
- [x] 1. git, Vite con React y TypeScript estricto, ESLint, Prettier, Vitest y Playwright, scripts de 5.2
- [x] 2. Tailwind con tokens, modo claro y oscuro, componentes base, navegación inferior y 26 rutas con sus estados
- [x] 3. Esquemas zod, Dexie para enarm_real y enarm_demo, repositorios, bitácora de solo agregar y derivación
- [x] 4. PWA instalable con modo sin conexión básico
- [x] 5. Proxy Hono con /health, modo simulado y lectura de server/.env.local
- [x] 6. Selector de rol sin login e interruptor de base real o demo
- [x] 7. npm run dev con app y proxy juntos

### Bitácora por bloque
- Bloque 1. Versiones verificadas con npm view, iguales a D-020. Dependencias nuevas en D-032. Chromium de Playwright dentro del proyecto (D-033). Tres proyectos de TypeScript (D-034). typecheck, lint, 1 prueba unitaria y 1 prueba e2e en teléfono y escritorio pasan. eval-ai, demo-seed y demo-reset existen como marcadores que fallan con un aviso de la fase en que llegan
- Bloque 2. Tokens en src/ui/tokens.css (D-037), claro, oscuro y según el sistema, con selector en Perfil que se recuerda. Componentes base al estilo shadcn sobre Radix (botón, tarjeta, etiqueta, opciones y barra de progreso), etiquetas Demostración y Datos simulados. Navegación inferior de 5 secciones que en escritorio pasa a riel lateral. Registro de las 26 pantallas con rutas en español (D-035). Estados vacío, cargando, error, sin conexión y calibrando con cuánto falta, visibles en cada esqueleto con ?estado=. Áreas de médico y admin con carga diferida. Foco al título al navegar y salto al contenido. 4 pruebas unitarias y 60 e2e (26 rutas, navegación, estados, tema y ruta desconocida, cada una en teléfono y escritorio, con axe sin violaciones serias)
- Bloque 3. Esquemas zod de las 25 entidades de 6.2 y de los 30 tipos de evento de 6.3 en src/data/schemas. Registro de tablas con sus índices de Dexie y prueba de que cada índice existe en su esquema. enarm_real y enarm_demo con Dexie versión 1, SimTruth solo en demo. Repositorios con interfaz y implementación Dexie. Bitácora de solo agregar protegida en el repositorio y en la base (D-038). recordEvent agrega y actualiza cachés en una transacción y rebuildDerivedState las reconstruye. Prueba de fronteras de src/engines. 34 pruebas unitarias. JavaScript inicial de 191 KB comprimido, bajo el presupuesto de 300 KB
- Bloque 4. vite-plugin-pwa con manifest en español, íconos provisionales y caché completa de la app (D-039). Aviso de versión nueva sin recarga automática. e2e de manifest, service worker activo, instalable según Chromium y apertura sin conexión con aviso, en teléfono y escritorio. 66 e2e en total
- Bloque 5. Proxy Hono en server/ con /health, modo real o simulado según server/.env.local, --mock para forzar simulado, Host solo localhost y tamaño máximo (D-040). server/.env.example sin valor. Cliente en src/ai/client.ts y etiqueta del modo de IA en encabezado y Perfil. 16 pruebas nuevas del proxy y del cliente, entre ellas la que revisa que escucha solo en 127.0.0.1. e2e que confirma IA simulada y cero peticiones fuera de localhost
- Bloque 6. Pantalla 26 con selector de rol sin login que lleva a la entrada de cada rol. Navegación propia de médico y admin. Guarda de rol en las áreas de médico (médico y admin) y admin (solo admin). Interruptor Mi cuenta o Demostración en Perfil, con franja Datos simulados en toda pantalla de la demo y botón para volver. Perfil abre la base activa y dice su nombre. 17 pruebas unitarias de app y 76 e2e
- Bloque 7. npm run dev usa concurrently para levantar la app en 127.0.0.1:5173 y el proxy en 127.0.0.1:8787. npm run check:dev lo comprueba de punta a punta (app, proxy y /api de la app hacia el proxy) y apaga todo al terminar. Pasó
- Criterio de secretos. scripts/secrets.ts busca en el build el nombre de la variable de la clave, el nombre prohibido, el prefijo sk-ant-, archivos .env y, si existe server/.env.local, el valor de la clave sin imprimirlo. Corre al final de npm run build y en tests/security/no-secrets.test.ts, que construye en una carpeta temporal y tiene un control que planta un secreto falso

### Evidencia por criterio de aceptación
| Criterio | Prueba | Resultado |
|---|---|---|
| npm run check pasa | npm run check (typecheck de 3 proyectos, ESLint y Vitest) | Pasa. 71 pruebas en 13 archivos |
| Navega entre todas las rutas sin instalar nada | tests/e2e/smoke.spec.ts abre las 26 rutas, revisa título, navegación y axe, recorre la barra inferior, los 5 estados, el tema y la ruta desconocida | Pasa en teléfono y escritorio |
| Se puede instalar como PWA en localhost | tests/e2e/pwa.spec.ts revisa manifest e íconos, service worker activo, instalable según Chromium (Page.getInstallabilityErrors vacío) y apertura sin conexión | Pasa. Falta la confirmación manual de Ricardo (ver preguntas) |
| Una prueba de humo de punta a punta pasa (15.3) | smoke.spec.ts | Pasa |
| Ningún secreto en dist | tests/security/no-secrets.test.ts con scripts/secrets.ts, que además corre al final de npm run build | Pasa, con control positivo |
| El proxy escucha solo en localhost | server/src/server.test.ts revisa la dirección real 127.0.0.1. app.test.ts cubre Host, Origin, JSON y tamaño máximo | Pasa |
| La bitácora no se edita ni se borra | src/data/repos/dexie/eventRepo.test.ts revisa la interfaz, el código y 8 caminos de Dexie que fallan | Pasa |
| Los motores no importan React ni Dexie | tests/architecture/engine-boundaries.test.ts revisa la regla real de ESLint (lista blanca) y sigue las importaciones de forma transitiva | Pasa |
| npm run dev levanta app y proxy | npm run check:dev | Pasa |

### Conteo de pruebas al cierre
- Vitest. 71 pruebas en 13 archivos. Cobertura de líneas 78% en general, de 93 a 100% en la capa de datos (src/data/db, derive y repos). La meta de 90% aplica a src/engines desde la Fase B
- Playwright. 76 pruebas, 38 por proyecto en teléfono (390 por 844) y escritorio (1280 por 800). Todas con revisión de errores de consola y las de pantallas con axe sin violaciones serias ni críticas
- Capturas. 120 en docs/screenshots/fase-a. Las 26 pantallas más calibrando, error, Perfil en demostración y acceso por rol, cada una en teléfono y escritorio, claro y oscuro. Se regeneran con npm run screenshots

### Revisión independiente (15.1, paso 3)
- Un subagente que no escribió el código revisó los commits de la Fase A contra la especificación, PLAN.md y DECISIONES.md. Corrió npm run check y leyó todas las pruebas
- Sin hallazgos altos. Confirmó secretos bien guardados, bitácora protegida en dos capas y etiquetas de datos simulados en toda la demo
- 4 hallazgos medios y 6 bajos. Se corrigieron todos menos el repo remoto, que depende de Ricardo (D-041)
  - M1. npm run check falló 1 de 4 veces por tiempo en la prueba que carga ESLint. Ahora ESLint se carga una vez con 60 segundos de margen
  - M2. La frontera de motores tenía huecos (por ejemplo @/data/hooks traía Dexie de forma indirecta). Ahora es lista blanca con revisión transitiva
  - M3. Las fechas aceptaban varios formatos y eso rompía el orden de la bitácora. Ahora hay un solo formato
  - M4. No hay repo remoto. Queda como pregunta para Ricardo
  - B1. El proxy ya rechaza otros sitios (Origin) y exige JSON en escrituras
  - B2. Las e2e ya no reusan un proxy abierto que podría estar en modo real
  - B3. IDs de eventos monotónicos dentro del mismo milisegundo
  - B4. Los esquemas hacen cumplir borrador primero y anclaje
  - B5. Los casos clínicos son de solo agregar
  - B6. El contexto de datos ya no expone la base de Dexie

### Desviaciones y notas
- La confirmación manual de la instalación como PWA queda para Ricardo. El navegador sin ventana de las pruebas no muestra el botón de instalar, así que la evidencia automática es la revisión de instalabilidad de Chromium (D-039)
- Una vez, en la primera corrida completa después de las correcciones, una prueba de humo falló con un JSON incompleto al analizar con axe. No se repitió en 8 repeticiones de esa prueba ni en 3 corridas completas. Se agregó una espera a que la red quede quieta antes de cada análisis de axe. Si vuelve a pasar se investiga a fondo
- En las capturas de página completa del teléfono, la barra inferior se dibuja al final de la página para que no salga a media imagen. Es solo para las capturas
- El JavaScript inicial mide 191 KB comprimido. Cabe en el presupuesto de 300 KB de 14.4, pero las Fases B a E deben seguir cargando de forma diferida lo pesado

### Decisiones de la fase
- D-029 a D-031 con las respuestas de Ricardo y D-032 a D-041 de Claude. Todas en DECISIONES.md

### Preguntas abiertas para Ricardo
1. Repositorio remoto (D-003, M4). Hoy el código solo vive en tu computadora. Opciones, crear un repo privado vacío en github.com y pasarme la URL, o autorizar que instale GitHub CLI. Recomiendo la primera porque no instala nada global
2. Instalación como PWA. Cuando puedas, corre npm run build y luego npm run preview, abre http://127.0.0.1:4173 en Chrome y confirma que aparece el ícono de instalar en la barra de direcciones
3. Para la Fase B (D-029). Varios sesgos de tu lista describen la conducta al responder más que el atractivo de un distractor (Zeigarnik, fatiga de decisión, posición serial, statu quo sobre la primera respuesta, sobreconfianza, costo hundido, apostador y agrupamiento). Recomiendo medirlos con las señales de conducta de 7.6 además de usarlos como etiqueta donde aplique
4. Para la Fase B (D-029). ¿Conservamos como etiquetas aparte las trampas de formato de 13.1 que no son sesgos cognitivos, Secuencia y Comisión? Recomiendo que sí, porque son frecuentes en el ENARM y se pueden entrenar

## Fase 0. Entrevista, entorno y plan

### Hecho
- Leídos completos CLAUDE.md, docs/PROMPT_PROTOTIPO.md y prompts/flashcards_maestro.md
- Entorno verificado. Node v26.10.0 (Current, LTS a finales de octubre), npm 11.19.1, Git 2.56 con nombre y correo configurados. GitHub CLI no está instalado
- Carpeta del proyecto dentro de OneDrive y anidada dos veces. Ricardo aprobó moverla
- prompts/flashcards_maestro.md está vacío debajo de la marca
- Revisada la carpeta Mazos que señaló Ricardo. Seis mazos de Anki de tarjetas, ningún banco de opción múltiple. Se inspeccionaron estructura, tipos de nota y conteos desde una copia temporal fuera del proyecto, que se borró al terminar. Nada de su contenido entró al proyecto
- Entrevista de la sección 16 completa en cinco rondas (entorno, producto, aclaraciones del banco, examen e IA, y presentación). Las 17 respuestas están en DECISIONES.md
- Versiones del stack verificadas con npm view y registradas en D-020
- Escritos PLAN.md, DECISIONES.md, IDEAS.md y este archivo

### Evidencia
- Criterio. Cada respuesta de Ricardo está en DECISIONES.md. Ver D-001, D-002 y D-004 a D-019
- Criterio. PLAN.md permite empezar la Fase A sin volver a preguntar. Arquitectura, carpetas, modelo de datos, contratos de motores, bloques por fase con su prueba, umbrales y riesgos
- Criterio. No hay código todavía. La carpeta solo tiene documentos Markdown

### Revisión independiente (15.1, paso 3)
- Un subagente que no escribió los documentos los revisó contra la especificación
- Confirmó que las 17 respuestas están registradas, que ninguna decisión rompe las reglas no negociables y que no hay código
- Encontró 8 huecos en PLAN.md y se corrigieron todos
  - Pantallas de admin 24 y 25 sin fase. Quedan en la Fase D, bloque 7
  - Creación manual de mazos y compartir logro de Party. Quedan en la Fase C
  - Análisis de distractores sin motor. Nuevo motor distractors en la Fase B y alerta en la Fase E
  - Reglas 4.3 (calibrando) y 4.4 (trampas con kappa bajo) sin prueba. Pruebas agregadas
  - Regla 4.6 (etiquetas) sin prueba y amigos de Party sin etiqueta en Mi cuenta. Prueba agregada y D-028
  - Controles de seguridad del proxy sin prueba. Pruebas agregadas en las Fases A y D
  - Metas de 14.3 y 14.4 sin prueba propia en la Fase F. Una fila con su prueba para cada una
  - Funciones estadísticas fuera de la tabla de criterios de la Fase B. Fila agregada

### Pasos de cierre de 15.1 que no aplican en la Fase 0
- npm run check y e2e no existen todavía
- No hay pantallas que capturar
- No hay commit porque git init es la primera tarea de la Fase A

### Desviaciones
- Node 26 en lugar de una LTS vigente, por decisión de Ricardo (D-001)
- TypeScript 6.0.3 en lugar de 7.0.2 por compatibilidad con typescript-eslint (D-021)
- El examen de 280 no repite preguntas con el banco demo y avisa cuántas hay (D-012). Esto ajusta lo que se dijo en la entrevista

### Preguntas abiertas para Ricardo
- Contestadas el 2026-10-01 al aprobar la Fase A. Aprueba D-012 y él y dos médicos más revisan el contenido demo (D-031)

## Pruebas
- Ver el conteo al cierre de cada fase. Al cerrar la Fase A, 71 unitarias y 76 e2e, todas pasan
