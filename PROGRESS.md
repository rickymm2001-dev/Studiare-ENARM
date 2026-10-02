# Avance

## Estado actual

- Fase 0 aprobada por Ricardo el 2026-10-01
- Fase A en curso desde el 2026-10-01. Ricardo la aprobó y pidió ejecutar solo la Fase A y detenerse al terminar
- Bloque terminado más reciente. Bloque 2 (interfaz base y 26 rutas)
- Siguiente paso. Bloque 3 (esquemas, Dexie, repositorios y bitácora)

## Fase A. Esqueleto, datos y proxy

### Respuestas de Ricardo al aprobar
- Aprueba el examen sin preguntas repetidas (D-012)
- Contenido demo de hasta 500 preguntas con opciones etiquetadas con su lista de 24 sesgos cognitivos (D-029 y D-030)
- Él es médico y tiene dos médicos más para revisar el contenido demo (D-031)

### Bloques
- [x] 1. git, Vite con React y TypeScript estricto, ESLint, Prettier, Vitest y Playwright, scripts de 5.2
- [x] 2. Tailwind con tokens, modo claro y oscuro, componentes base, navegación inferior y 26 rutas con sus estados
- [ ] 3. Esquemas zod, Dexie para enarm_real y enarm_demo, repositorios, bitácora de solo agregar y derivación
- [ ] 4. PWA instalable con modo sin conexión básico
- [ ] 5. Proxy Hono con /health, modo simulado y lectura de server/.env.local
- [ ] 6. Selector de rol sin login e interruptor de base real o demo
- [ ] 7. npm run dev con app y proxy juntos

### Bitácora por bloque
- Bloque 1. Versiones verificadas con npm view, iguales a D-020. Dependencias nuevas en D-032. Chromium de Playwright dentro del proyecto (D-033). Tres proyectos de TypeScript (D-034). typecheck, lint, 1 prueba unitaria y 1 prueba e2e en teléfono y escritorio pasan. eval-ai, demo-seed y demo-reset existen como marcadores que fallan con un aviso de la fase en que llegan
- Bloque 2. Tokens en src/ui/tokens.css (D-037), claro, oscuro y según el sistema, con selector en Perfil que se recuerda. Componentes base al estilo shadcn sobre Radix (botón, tarjeta, etiqueta, opciones y barra de progreso), etiquetas Demostración y Datos simulados. Navegación inferior de 5 secciones que en escritorio pasa a riel lateral. Registro de las 26 pantallas con rutas en español (D-035). Estados vacío, cargando, error, sin conexión y calibrando con cuánto falta, visibles en cada esqueleto con ?estado=. Áreas de médico y admin con carga diferida. Foco al título al navegar y salto al contenido. 4 pruebas unitarias y 60 e2e (26 rutas, navegación, estados, tema y ruta desconocida, cada una en teléfono y escritorio, con axe sin violaciones serias)

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
- ¿Apruebas el ajuste de D-012, examen sin preguntas repetidas?
- ¿Tienes un médico colaborador que pueda revisar una muestra del contenido demo antes de las pruebas con 5 aspirantes?

## Pruebas
- Ninguna todavía
