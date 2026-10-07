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

Un reactivo con kinds no se rechaza por ser imperfecto. La explicación puede ser corta y lo que difiere del motor de estructura, como la polaridad que puso el médico en un reactivo de control, sale como aviso y no como problema, porque la etiqueta del médico gana (7.5). La cantidad de opciones ya no depende de los kinds, porque cualquier pregunta puede traer de 4 a 10 (ver la sección de 4 a 6 opciones). Lo que sí falla en cualquier tipo es un error de fondo, como dos respuestas correctas, un sesgo inventado, un set canónico que no incluye la correcta o una explicación vacía. Las reglas viven en scripts/content/draftRules.ts y tienen una prueba por tipo en tests/content/draftRules.test.ts.

## Lo que valida la prueba de cada lote

La prueba es src/demo/content/questions/questions.test.ts y el esquema es DemoQuestionBatchSchema en src/data/schemas/content.ts. Lo que sigue describe las 200 preguntas demo, que traen 10 opciones. El esquema en sí acepta de 4 a 10.

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

## Preguntas de 4 a 6 opciones (banco del médico)

En la reunión del equipo se acordó que el banco de preguntas tendrá hasta 6 opciones por pregunta. El examen real trae 4 y la plataforma sube la dificultad mostrando más. Cada opción incorrecta lleva el sesgo cognitivo que la hace tentadora y el banco incluye preguntas de control. El médico entrega un Excel con 4,000 a 5,000 preguntas a principios de noviembre.

- El esquema de lotes acepta de 4 a 10 opciones por pregunta, con o sin kinds. Antes exigía 10 salvo que la pregunta trajera kinds, lo que habría rechazado el banco nuevo. Las 200 preguntas demo siguen con 10 y siguen pasando
- El set canónico siempre es de 4 opciones, la correcta y 3 distractores. Con 4 opciones son todas. Con 5 o 6 lo elige el médico, o la plataforma toma la correcta y las tres primeras incorrectas. El esquema pide que sus claves existan entre las opciones de la pregunta, lo que antes se cumplía solo por traer a a j completas
- Las opciones van en orden a, b, c y así hasta la última, sin saltar letras
- check-draft ya no falla por no traer 10 opciones. Avisa en cada pregunta estándar con otra cantidad, muestra cuántas opciones trae cada pregunta y limita los avisos que imprime. Lo que sigue fallando es lo de fondo, como menos de 4 opciones, letras fuera de orden, dos correctas, un sesgo inventado o un set canónico que no incluye la correcta
- Si el alumno pide ver más opciones de las que tiene una pregunta, el simulador muestra todas, sin repetir y con la correcta dentro del rango de posiciones. El examen muestra siempre el set canónico de 4, así que una pregunta de 4, 5 o 6 opciones se ve igual
- Las pruebas de estas formas usan preguntas sintéticas generadas por código, con textos neutros como Opción A. Viven en src/data/testing/syntheticQuestions.ts y nunca llevan medicina inventada

## Plantilla de Excel del banco

Para que el médico entregue el banco sin tocar código hay una plantilla de Excel. Se genera con este comando.

```bash
npm run bank:template
```

Escribe content-drafts/bank-plantilla/Studiare-banco-plantilla.xlsx, que ya está en el repositorio. Si cambian las taxonomías o las columnas, se vuelve a generar. Trae cinco hojas.

- Instrucciones. Explica cada columna y las reglas del banco con trato de tú. Una sola opción correcta, un sesgo por opción incorrecta, de 4 a 6 opciones, tipos de reactivo con control incluido, dificultad de 1 a 5 y estado borrador
- Preguntas. Una fila por pregunta, con listas desplegables en rama, subespecialidad, subtema, dificultad, tipo de reactivo, tarea, polaridad, sesgo de cada opción y letra correcta, tomadas de las taxonomías de src/demo/content. Las listas cubren 6,000 filas. Trae una sola fila de ejemplo, en amarillo y con marcadores como Escribe aquí el caso clínico, que se borra antes de entregar
- Sesgos. Cada sesgo con la definición de cómo luce una opción incorrecta
- Temas. La tabla de rama, subespecialidad y subtema, para saber qué va con qué
- Listas. La fuente de las listas desplegables

Las columnas de la hoja Preguntas, en orden.

- ID, rama troncal, subespecialidad, subtema y dificultad
- Tipo de reactivo, tarea y polaridad, que son opcionales. Si el médico deja vacía la tarea o la polaridad, las detecta el motor de estructura. Si hay varios tipos, se separan con punto y coma
- Caso clínico y pregunta
- Opción, justificación y sesgo, de la A a la F. La A a la D son obligatorias y la E y la F se dejan en blanco si no se usan. La correcta no lleva sesgo
- Correcta, con su letra, y set canónico, que es opcional
- Explicación, referencias y estado

### Cómo entra el archivo lleno

El mismo bank-convert que convierte el banco de 1500 acepta archivos de Excel. Deja el JSON en una carpeta json junto al archivo, con el formato de borrador que revisa check-draft.

```bash
node scripts/content/bank-convert.ts ruta/al/banco.xlsx
```

```bash
node scripts/content/check-draft.ts ruta/al/json/banco.json
```

- Cada problema sale con el número de fila y, si la fila tiene ID, con el ID. Una fila con problemas no pasa al JSON y el comando termina con error, mientras las demás sí pasan
- La fila de ejemplo se omite por su ID, que empieza con Ejemplo. Si una fila conserva texto de la plantilla, como Escribe aquí o Elige de la lista, se señala
- Una fila sin ID recibe uno con el nombre del archivo, por ejemplo banco-q0001
- La rama, la subespecialidad y el subtema se validan uno dentro del otro. Una subespecialidad que existe pero es de otra rama se señala como tal
- El tipo de reactivo se traduce a kinds. Una pregunta de control entra como control y su polaridad declarada gana sobre la del motor
- Todo entra como borrador, pendiente de revisión médica. Un estado distinto de Borrador se señala
- El comando acepta --out para elegir la carpeta de salida

La prueba de ida y vuelta es tests/content/bankExcel.test.ts. Arma por código una plantilla con 3 preguntas sintéticas de 4, 5 y 6 opciones, una de ellas de control, la convierte con el comando real y comprueba que valida con el esquema del lote, con las reglas del borrador, con check-draft y con el adaptador del banco.

### Lo que la plantilla todavía no cubre

- Casos seriados y datos con su fuerza diagnóstica (clues). El esquema los acepta, pero la plantilla no tiene columnas para ellos. Se agregan cuando el médico los pida
- La clave de pregunta de los lotes demo, que es bN-qNN, solo alcanza para pocos lotes de 50. Un banco de miles necesita otra forma de clave y un destino distinto de los lotes demo, que se define con el importador del médico de la Fase E. Mientras tanto la plantilla acepta cualquier ID y la revisión se hace con check-draft
- check-draft trata como problema una tarea o una polaridad declarada que difiere del motor en una pregunta estándar, porque así se escribió para los borradores de Claude. En el Excel del médico la etiqueta del médico debería ganar, como en 7.5. Queda por decidir si ahí pasa a aviso

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
