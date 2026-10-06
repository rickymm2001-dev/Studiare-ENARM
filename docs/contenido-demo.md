# Contenido demo. Cómo escribir, validar y revisar los lotes de preguntas

Guía para continuar la Fase B, bloque 8, desde cualquier sesión, local o en la nube. Todo lo necesario vive en el repositorio. Las reglas de fondo están en CLAUDE.md, la especificación en docs/PROMPT_PROTOTIPO.md (11.1) y las decisiones en DECISIONES.md (D-030, D-031, D-042, D-046 y D-049).

## Estado

- Lotes 1 a 4 escritos, 200 de 300 preguntas. Todos con estado pending_physician_review y etiqueta visible de demo
- Revisión de IA de los lotes 1 a 4 en docs/revisiones/revision-ia-lotes-1-a-4.json. Todos sus hallazgos están atendidos (campo resolution)
- Los 118 subtemas de la taxonomía ya tienen al menos una pregunta
- Faltan los lotes 5 y 6. Los mazos precargados son los de Paco (D-053), en src/demo/content/decks

## Reparto por lote

Cada lote lleva 50 preguntas mezcladas. El total queda en 75 por rama.

| Lote | Medicina interna | Pediatría | Ginecología y obstetricia | Cirugía general |
|---|---|---|---|---|
| 1 | 13 | 12 | 13 | 12 |
| 2 | 12 | 13 | 12 | 13 |
| 3 | 13 | 12 | 13 | 12 |
| 4 | 12 | 13 | 12 | 13 |
| 5 | 13 | 12 | 13 | 12 |
| 6 | 12 | 13 | 12 | 13 |

## Reactivos raros, opcionales (D-080)

El ENARM tiene preguntas raras y el simulador debe poder tenerlas. Cada pregunta de un lote acepta dos campos opcionales. Ninguno es obligatorio y ningún validador rechaza una pregunta por ser imperfecta.

- kinds. Lista con uno o varios tipos. inverse_resolution (casos casi idénticos que solo se separan por las opciones de tratamiento), incoherent (con incoherencias intencionales), control (para medir la atención), obscure_detail (con datos muy específicos u oscuros) y patient_perspective (desde la perspectiva del paciente)
- clues. Datos del caso con su fuerza diagnóstica. pathognomonic si el dato por sí solo define el diagnóstico, characteristic si es típico pero no exclusivo y nonspecific si no discrimina

Los resultados del examen reportan aparte los reactivos de control, incoherentes y de los demás tipos.

## Lo que valida la prueba de cada lote

La prueba es src/demo/content/questions/questions.test.ts y el esquema es DemoQuestionBatchSchema en src/data/schemas/content.ts.

- 50 preguntas con claves bN-qNN únicas y estado pending_physician_review
- Las 4 ramas con al menos 12 preguntas cada una
- Al menos 10 negativas por lote. La meta es 11
- Rama, tema y subtema existen en src/demo/content/topic-taxonomy.json
- 10 opciones a-j, una sola correcta y sin sesgo. Cada distractor lleva un sesgo usable de src/demo/content/bias-taxonomy.json
- Textos de opción únicos y set canónico de 4 claves que incluye la correcta
- Explicación de 80 a 150 palabras
- Referencias GPC solo por título, sin años ni claves de catálogo
- La polaridad declarada coincide con el motor de estructura y la tarea coincide en al menos 85% de las que el motor detecta
- Al menos un caso seriado por lote, con 2 o 3 preguntas en orden, y su viñeta en cases
- Entre todos los lotes, dificultades de 1 a 5

## Cómo se comporta el motor de estructura

El motor (src/engines/structure.ts) solo lee la frase de la pregunta, nunca la viñeta.

- La polaridad es negativa cuando hay un número impar de negaciones. Dos negaciones se cancelan
- Contraindicación y contraindicado cuentan como negación. Por eso NO es contraindicación da polaridad afirmativa. Para una pregunta de excepción usa Todas las siguientes son ..., EXCEPTO
- Una pregunta que pide la contraindicación, como Cuál es una contraindicación para, cuenta como negativa
- La tarea se detecta con la primera coincidencia en el orden de src/demo/content/structure-dict.json y con límites de palabra. Vacunas no coincide con vacuna, ni hallazgos con hallazgo
- Mortalidad, pronóstico y complicación disparan complication_prognosis. Diagnóstico dispara diagnosis salvo que antes coincida otra tarea, como confirma el diagnóstico o estudio de elección, que dan confirmatory_study
- Factores de riesgo y agente causal dan risk_factor. Tamizaje, prevenir, prevención y profilaxis dan prevention_screening

## Estilo

- Español de México. Las explicaciones van en tercera persona clara. Sin signos de dos puntos en el texto, salvo el EXCEPTO final de las preguntas de excepción
- Contenido consistente con las GPC mexicanas y las NOM. Si una guía internacional reciente difiere, la pregunta no debe depender de esa diferencia
- La justificación de cada distractor explica por qué tienta y su sesgo corresponde a distractorDefinition de la taxonomía
- Repartir sesgos. Los poco usados son gamblers_fallacy, sunk_cost_fallacy, halo_horn_effect, confirmation_bias, serial_position_effect y clustering_illusion
- En las preguntas de excepción las nueve opciones restantes deben ser verdaderas sin discusión. Nada de datos que solo se asocian o que son discutibles
- Si la viñeta da una escala, los datos deben sumar ese puntaje
- Evitar que la correcta sea siempre la opción más larga o la única completa

## Flujo de un lote

1. Escribe los borradores en content-drafts/bN/. Un cases.json con la viñeta del caso seriado y dos o más part-*.json con arreglos de preguntas
2. Valida cada parte con el motor real

```bash
node scripts/content/check-draft.ts content-drafts/b5/part-a.json content-drafts/b5/part-b.json
```

3. Une las partes en el lote y dale formato

```bash
node scripts/content/merge-batch.ts 5 content-drafts/b5
```

```bash
npx prettier --write src/demo/content/questions/batch-05.json
```

```bash
npx vitest run src/demo
```

4. Revisión adversarial de IA. Prepara los paquetes y copia el args que imprime el script

```bash
node scripts/content/review-chunks.ts 5
```

Después pide a Claude Code que corra el workflow enarm-demo-review con ese args. Hace dos revisiones por paquete, una clínica y otra de calidad del reactivo, y un verificador escéptico por cada hallazgo de severidad media o alta. Si se acaba el límite de uso, los hallazgos sin verificar quedan con verdict null. Para verificarlos después se pasan en args.findings, cada uno con su campo file
5. Aplica las correcciones confirmadas y guarda el resultado en docs/revisiones/
6. Corre npm run check, actualiza PROGRESS.md, haz commit y push. El CI de GitHub corre el mismo check en cada push

## Ideas de temas para los lotes 5 y 6

Subtemas con una sola pregunta, para dar una segunda mirada desde otro ángulo.

- Medicina interna. Fibrilación auricular, tiroides, dislipidemia, asma, EPOC, neumonía, lesión renal aguda, enfermedad renal crónica, cirrosis, hepatitis, úlcera péptica, sepsis, anticoagulación, leucemia del adulto, epilepsia, cefalea, artritis reumatoide, lupus, gota, ansiedad y consumo de sustancias
- Pediatría. Dificultad respiratoria neonatal, sepsis neonatal, contraindicaciones de vacunas, otitis, neumonía, anemia ferropénica, estenosis de píloro y criptorquidia
- Ginecología y obstetricia. Desprendimiento de placenta, parto pretérmino, enfermedad trofoblástica, infección puerperal, virus del papiloma, cáncer de endometrio, menopausia, anticoncepción hormonal, DIU y anticoncepción de emergencia
- Cirugía general. Perforación de víscera hueca, cáncer de páncreas, hernia ventral, reanimación del quemado, hemorroides, aneurisma de aorta, valoración preoperatoria, infección de sitio quirúrgico, líquidos posoperatorios, cáncer de próstata y torsión testicular
