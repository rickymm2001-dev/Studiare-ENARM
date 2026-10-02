# Avance

## Estado actual

- Fase 0 aprobada por Ricardo el 2026-10-01
- Fase A aprobada por Ricardo el 2026-10-02
- Fase B en curso desde el 2026-10-02. Ricardo la aprobó junto con la Fase A
- Bloques 9 y 10 terminados. Bloque 8 (contenido demo) pausado con 4 de 6 lotes y sin mazos (D-050)
- Siguiente paso. Cierre de la Fase B según 15.1, con el banco y los mazos pendientes para el final (D-050). Antes del cierre Ricardo decide el ajuste de sesgos (D-051) y si se prueba el cambio del método de fatiga. El lote 5 quedó a medias en content-drafts/b5, con Medicina interna (13) y Pediatría (12) validadas
- Todo el trabajo se sube a GitHub con push frecuente y el CI corre npm run check en cada push a cualquier rama (D-050)
- Trabajo desde GitHub listo (D-049). CI con npm run check en cada push, scripts de contenido en scripts/content y workflow de revisión en .claude/workflows
- Repo remoto privado en https://github.com/rickymm2001-dev/enarm-prototipo, rama main con seguimiento a origin (D-048)

## Fase B. Motores núcleo, alumnos simulados y contenido demo

### Respuestas de Ricardo al aprobar la Fase A (D-042)
- Sesgos de conducta como etiqueta y también medidos con señales de conducta
- Sin trampas de formato. La taxonomía son solo sus 24 sesgos
- Repo remoto pospuesto, el proyecto queda solo local. Resuelto después con D-048
- 300 preguntas demo, 75 por rama, en 6 lotes mezclados de 50
- Las preguntas abiertas 1 a 4 de la Fase A quedan contestadas, salvo la confirmación manual de la PWA, que sigue opcional

### Bloques
- [x] 1. Funciones estadísticas (Wilson, beta-binomial con empirical Bayes y kappa de Cohen con IC)
- [x] 2. fsrs y mcqGrade
- [x] 3. sampler, distractors y structure
- [x] 4. behavior, difficulty (Elo) y rasch en Web Worker
- [x] 5. topics, bias, forgetting y agreement
- [x] 6. session, planner, streak, xp y party
- [x] 7. Taxonomías y diccionarios en JSON
- [ ] 8. Contenido demo, 300 preguntas en 6 lotes y 4 mazos con 200 tarjetas
- [x] 9. Generador de 300 alumnos simulados y alumno de la demo
- [x] 10. Prueba de recuperación de parámetros e informe, con 2 metas por debajo y su ajuste propuesto

### Bitácora por bloque
- Bloque 1. Normal, Wilson, beta, beta-binomial con empirical Bayes y kappa de Cohen con IC en src/engines/stats, más azar con semilla (D-043). Umbrales en src/config/thresholds.ts. 26 pruebas contra valores de referencia, entre ellas la de encogimiento con menor error que la proporción cruda (7.3). Cobertura de src/engines de 100% en líneas y 99% en ramas. npm run check exige 90%. ts-fsrs 5.4.2, comlink 4.4.2 y fast-check 4.10.2 instalados en el proyecto
- Bloque 2. src/engines/fsrs.ts con ts-fsrs 5, modo examen, retención de 0.93 en los últimos 30 días, sanguijuelas, cola del día con límites y hermanas enterradas, y carga futura a 30 y 60 días (D-044). src/engines/mcqGrade.ts con la tabla de 7.1. src/engines/studyDay.ts con corte a las 4 a. m. de Mérida. Propiedades con fast-check. Otra vez nunca vence después que Bien, nada vence después del ENARM en modo examen, y la tabla de opción múltiple es determinista y completa contra un oráculo escrito desde 7.1. 50 pruebas de motores
- Bloque 3. src/engines/sampler.ts con los modos canónico, diverso, dirigido y estratificado, correcta en la posición menos usada y regla de 200 exposiciones para variantes en el examen. src/engines/distractors.ts con atracción, intervalo de Wilson y no funcional bajo 5% tras 100 exposiciones. src/engines/structure.ts con polaridad, tarea, formato, doble negación, rangos de resaltado sobre el texto original y probable mala lectura. El diccionario de negaciones y tareas se adelantó del bloque 7 a src/demo/content/structure-dict.json porque el motor lo necesita, marcado pendiente de revisión médica, con su esquema en src/data/schemas/content.ts. Propiedades del muestreo con fast-check. 85 pruebas de motores
- Bloque 4. src/engines/behavior.ts con ritmo personal, puntaje z, adivinanza rápida, percentil 25, dirección de cambios, fatiga entre sesiones largas, distracción, franjas horarias y calibración de la confianza. src/engines/difficulty.ts con Elo, estados de calibración, bandas y modo adaptativo. src/engines/rasch.ts con JML y corrección de Wright, en un Web Worker con Comlink (src/workers). Correlación de Pearson en stats. En pruebas de humo, Rasch recupera dificultades con r mayor a 0.95 con datos completos y mayor a 0.9 con 40% de cobertura, y Elo con r mayor a 0.8 (D-045). La recuperación formal de 14.2 llega en el bloque 10. 109 pruebas de motores y worker
- Bloque 5. src/engines/topics.ts con dominio por tema encogido hacia su rama, prioridades con porqué y acción, y análisis por estructura. src/engines/bias.ts con atracción por etiqueta contra la línea base y 7 indicadores de conducta (D-042, D-046). src/engines/forgetting.ts con las 9 reglas de 7.9, causa reportada contra señales y patrones de 5 hallazgos en 14 días. src/engines/agreement.ts con muestra de 20%, kappa global y por etiqueta, y vocabulario sesgos o trampas. Pruebas de humo de detección de sesgo sembrado sin falsos positivos y de encogimiento por tema. 135 pruebas de motores, 207 en total
- Bloque 6. src/engines/session.ts con selección por tiempo y proporciones, e intercalado sin más de 2 seguidos del mismo subtema ni confusables seguidos. src/engines/planner.ts con plan del día y la semana y aviso de sobrecarga con opciones y su efecto. src/engines/streak.ts con corte a las 4 a. m. y congeladores. src/engines/xp.ts con premios, tope diario, multiplicador y curva de niveles ajustada con un alumno constante simulado. src/engines/party.ts con tabla semanal, retos, duelos y códigos (D-047). Propiedades con fast-check para XP, racha e intercalado. 163 pruebas de motores, 235 en total
- Bloque 7. En src/demo/content, todo marcado pendiente de revisión médica. topic-taxonomy.json con las 4 ramas de peso igual, 40 temas (10 por rama), 118 subtemas con claves únicas y 13 relaciones de tema base. bias-taxonomy.json con los 24 sesgos de Ricardo, la definición de cada distractor para el médico, 21 usables como etiqueta y 8 con señales de conducta (D-042). bias-tips.json con un consejo base por sesgo. Cargador validado en src/demo/content/index.ts y 8 pruebas de conteos y referencias cruzadas
- Bloque 8, lote 1. src/demo/content/questions/batch-01.json con 50 preguntas (13 de Medicina interna, 12 de Pediatría, 13 de Ginecología y obstetricia y 12 de Cirugía general), 11 negativas o de excepción y un caso seriado de hiperplasia prostática con 3 preguntas. Cada pregunta con 10 opciones, una correcta, 9 distractores con sesgo de la lista de Ricardo y su justificación, set canónico de 4, explicación de 80 a 150 palabras y referencia GPC solo por título, por verificar. Esquema DemoQuestionBatchSchema y prueba que valida cada lote, incluida la polaridad contra el motor de estructura. Pendiente de revisión médica
- Bloque 8, lote 2. src/demo/content/questions/batch-02.json con 50 preguntas (12 de Medicina interna, 13 de Pediatría, 12 de Ginecología y obstetricia y 13 de Cirugía general), 11 negativas o de excepción y un caso seriado de oclusión intestinal por adherencias con 3 preguntas. Temas nuevos respecto al lote 1, como insuficiencia cardiaca, fibrilación auricular, reumatología, EPOC, cirrosis, VIH, anticoagulación, cardiopatías congénitas, leucemia, eclampsia, enfermedad trofoblástica, menopausia, hernias, colon y vascular. Primer uso de la falacia del apostador. Validado también contra el motor real de estructura (polaridad y tarea). Pendiente de revisión médica
- Bloque 8, lote 3. src/demo/content/questions/batch-03.json con 50 preguntas (13 de Medicina interna, 12 de Pediatría, 13 de Ginecología y obstetricia y 12 de Cirugía general), 11 negativas o de excepción y un caso seriado de control prenatal con 3 preguntas (ácido fólico, tamizaje y profilaxis anti D). Cubre los subtemas que faltaban, como dislipidemia, asma, lesión renal aguda, hepatitis B, Helicobacter, sepsis, leucemia promielocítica, cefalea, lupus, abstinencia alcohólica, sepsis neonatal, anemia ferropénica, criptorquidia, virus del papiloma, anticoncepción hormonal, cáncer de páncreas, hernia incisional, hemorroides, fisura, aneurisma de aorta, ayuno y líquidos posoperatorios y cáncer de próstata. Con esto los 118 subtemas tienen al menos una pregunta. Validado contra el motor real de estructura. Pendiente de revisión médica. Ricardo lo guardó en el commit f7f00e4
- Bloque 8, lote 4. src/demo/content/questions/batch-04.json con 50 preguntas (12 de Medicina interna, 13 de Pediatría, 12 de Ginecología y obstetricia y 13 de Cirugía general), 11 negativas o de excepción y un caso seriado de infarto inferior con afección del ventrículo derecho con 2 preguntas. Segunda mirada a subtemas con una sola pregunta, como edema agudo de pulmón, dímero D, antituberculosos, várices, dengue, síndrome serotoninérgico, estado hiperosmolar, profilaxis en VIH, meconio, realimentación, varicela, crup, conducto arterioso, corioamnionitis, placenta previa, ectópico roto, agenesia mülleriana, absceso mamario, apendicitis en el embarazo, seudoquiste, vólvulo, hernia femoral, vía aérea en trauma, bazo, diverticulitis complicada, isquemia aguda y litiasis infectada. Pendiente de revisión médica
- Revisión de IA de los lotes 1 a 4. Workflow con dos revisores por paquete de 10 preguntas, uno clínico y otro de calidad del reactivo, y un verificador escéptico por hallazgo medio o alto. Las 40 revisiones terminaron con 194 hallazgos, 3 altos, 43 medios y 148 bajos. Solo 2 alcanzaron verificador antes del límite de uso de la cuenta. Los 3 altos son b1-q35 opción g (exclusión de otras causas en Rotterdam), b2-q03 opción h (losartán en una lista de fármacos que reducen la mortalidad) y b3-q23 opción i (antecedente familiar en una lista de características de la crisis febril simple). Todo queda en docs/revisiones/revision-ia-lotes-1-a-4.json, con el paquete de cada hallazgo para retomarlo. No sustituye la revisión médica
- Correcciones bajas de la revisión de IA de los lotes 1 a 4. Se atendieron los 148 hallazgos bajos. 145 corregidos y 3 sin cambio con su razón en el campo resolution. Los de contenido clínico incluyen umbrales de potasio y pH en cetoacidosis con el consenso internacional reciente (b1-q04), osmolalidad de 349 y umbral de 300 (b4-q11), cortes de edad de 1 a menos de 10 años (b4-q23), TAES y dosis de la norma (b1-q10), angiotomografía y tenecteplasa en el infarto cerebral (b1-q12), meta de LDL menor de 55 (b3-q01), orquidopexia entre 6 y 12 meses (b3-q16), masaje uterino y compresión bimanual por separado (b1-q30 y b3-q38) y datos que faltaban en 7 viñetas. Los demás son etiquetas de sesgo que no coincidían con su justificación, opciones que delataban la clave por su forma, sets canónicos con pares opuestos y la doble negación de b3-q22. Sin cambio, b1-q30 y b2-q35 porque su tarea y polaridad siguen la regla del motor de estructura, y b4-q34 porque la taxonomía no tiene subtema de mama benigna
- Bloque 9. src/demo/content/bank.ts convierte los lotes en casos, preguntas y opciones con IDs estables (src/demo/stableId.ts). src/demo/generator con el modelo del alumno (habilidad general y por rama, propensión por sesgo, mala lectura de negaciones, velocidad de lectura, fatiga, constancia y calibración de la confianza), la simulación día por día con opciones del muestreador real y tarjetas con el FSRS real, la cohorte de 300 alumnos y el alumno de la demo con 60 días y sus patrones sembrados (anclaje, mala lectura, fatiga después de 40 minutos y Pediatría débil). Su bitácora sale con IDs estables, validada por el esquema de eventos y con XP del motor real. Siembra en enarm_demo con src/data/usecases/seedDemo.ts, generada en un Web Worker y disparada desde Perfil (D-052). Nueva señal negationSignal en el motor de conducta. Pruebas unitarias del banco, el generador, la siembra en Dexie y el worker, y una e2e que genera y regenera la demo en Chromium en teléfono y escritorio
- Bloque 10. tests/recovery/recovery.test.ts e informe en docs/recovery-report.md con 3 semillas (npm run recovery-report). Rasch de 0.985 a 0.987, Elo de 0.976 a 0.980, encogimiento por tema que baja el error 53 a 56%, mala lectura con 89 a 100% de detección y 0 a 0.8% de falsos positivos. No cumplen sesgos con el método de 7.4 (marca 47 a 54% sin propensión) ni fatiga (61 a 73% de detección). Ajuste de sesgos propuesto e implementado como opción (D-051) y dos opciones para fatiga en el informe
- Migración para trabajar desde GitHub (D-049). README.md, docs/contenido-demo.md, scripts/content (check-draft, merge-batch y review-chunks), content-drafts, .claude/workflows/enarm-demo-review.js y .github/workflows/check.yml. Se quitó .claude.zip porque .claude/launch.json ya está en el repositorio

- Revisión independiente de los bloques 9 y 10. Un subagente que no escribió el código encontró 3 hallazgos medios, 1 de honestidad en el informe y 7 bajos, ninguno alto. Se corrigieron todos. Eventos en el futuro al sembrar (ahora se corta en el momento actual), excepción de Regenerar escrita en PLAN.md 2.2, siembra doble bloqueada, faltante de afirmativas en negationSignal, prueba de los patrones del alumno de la demo con los motores reales, pruebas de recuperación menos frágiles y atadas a la versión del generador, etiquetas vacías y verdad por tema en la recuperación. El informe ahora valida la variante de sesgos con semillas nuevas y con otro modelo de sesgo (D-051). La desviación de las tarjetas de la cohorte queda como pregunta

- Mazos de Paco (D-053). scripts/content/import-paco-decks.ts convierte los .apkg con fflate y node:sqlite, sanea el HTML con DOMPurify (src/data/content/cardHtml.ts, lista corta de etiquetas, sin estilos ni recursos externos) y ubica cada nota en la taxonomía por su etiqueta. Quedan en src/demo/content/decks (Medicina interna 2,122 notas, Ginecología y obstetricia 1,526, Urgencias 123) y sus 302 imágenes en public/demo-media. Solo se quitó una imagen externa de drugs.com. 96 notas quedan sin tema (72 de Urgencias, que no es rama todavía). La siembra de la demo usa estas 3,771 tarjetas en lugar de las sintéticas, que quedan solo como respaldo en pruebas. Las imágenes no entran a la precarga del service worker y se guardan al verlas. Pruebas del saneador, del contenido de los mazos y de sus entidades, y la e2e de la demo pasa con los mazos reales. Una revisión independiente corta no encontró nada alto. Se corrigieron sus 2 medios (rutas de imagen relativas y claves de nota por posición, ahora por guid) y sus bajos (prueba de que lo guardado ya está saneado, días locales al cortar con notAfter, worker fuera de la precarga y datos de D-053)

### Respuestas de Ricardo (Fase B)
- Sesgos. Aprobó el ajuste (D-051). Ya es el método por defecto del motor
- Fatiga. Pidió probar la tendencia. Hecho (D-054). Los dos métodos cumplen la meta con la fatiga que sí pesa en las respuestas. Falta que decida si la tendencia pasa a ser el método por defecto
- Mazos. Paco tiene los mazos de Pediatría y Cirugía general. Están en su computadora y desde la nube no se puede leer su disco, así que hay que traerlos de otra forma (ver la pregunta abierta)
- Mapeo de temas de Ginecología y obstetricia. Aprobado
- Tarjetas de la cohorte. Sin historial por ahora, con la estructura lista para guardarlo después (opción cohortCardHistory, D-052)

### Preguntas abiertas para Ricardo (Fase B)
1. Fatiga (D-054). ¿La tendencia pasa a ser el método por defecto y la meta de 14.2 se mide sobre la fatiga que pesa en las respuestas? Recomiendo que sí
2. Mazos de Pediatría y Cirugía general. Esta sesión corre en la nube y no ve tu computadora. Recomiendo subir la carpeta de Paco a Google Drive y pasarme el enlace, porque tengo acceso a Drive y los archivos pesan más de lo que acepta la carga web de GitHub (25 MB). Otra opción es correr tú el script de conversión en tu computadora y hacer push

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
