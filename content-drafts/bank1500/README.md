# Banco de 1500 preguntas (D-077)

Borrador escrito con IA, pendiente de revisión médica. No es contenido final.

- src. Preguntas en formato compacto, un archivo por subespecialidad o mitad
- json. Formato de borrador del banco, generado con `node scripts/content/bank-convert.ts`
- Validación con `node scripts/content/check-draft.ts content-drafts/bank1500/json/*.json`
- Excel con `node scripts/content/bank-excel.ts`

Reparto parejo, 250 por rama troncal, repartidas entre sus subespecialidades.

## Estado

- 1500 preguntas validadas, 250 por troncal. Medicina interna, Pediatría, Gineco-obstetricia, Cirugía, Medicina familiar y Urgencias
- Cada pregunta tiene 10 opciones con su trampa cognitiva, explicación de 80 a 150 palabras y referencias sin año ni clave de norma
- El Excel `Studiare-banco-1500-borrador.xlsx` trae hojas de preguntas, opciones, casos y resumen por rama

## Subtemas aproximados

La taxonomía actual no tiene un subtema exacto para algunos temas. En esos casos la pregunta se guardó en el subtema más cercano del mismo tema. Conviene revisarlos si se amplía la taxonomía

- Cirugía. Retinopatía diabética y oclusión arterial de la retina en catarata. Otras urgencias oftalmológicas en ojo rojo
- Urgencias. Crisis suprarrenal, coma mixedematoso, tormenta tiroidea e hipoglucemia grave en trastornos electrolíticos
- Urgencias. Síndrome neuroléptico maligno e hipertermia maligna en golpe de calor
- Urgencias. Hemorragia intracerebral, hemorragia subaracnoidea y estenosis carotídea en evento vascular cerebral
- Urgencias. Disección aórtica, taponamiento, pericarditis y perforación esofágica en dolor torácico
- Urgencias. Mordeduras de perro, gato y humana y picaduras de medusa en envenenamientos
- Urgencias. Trombocitopenia por heparina en tromboembolia pulmonar y angioedema por inhibidores de la enzima convertidora en vía aérea
- Urgencias. Intoxicación por sulfato de magnesio y eclampsia en estado epiléptico
- Medicina familiar. Violencia familiar en funcionalidad familiar y en riesgo del adolescente

## Revisión pendiente

Todo el contenido médico es borrador generado con IA. Debe revisarlo un médico antes de publicarse, como marca la regla del proyecto. Las referencias nombran guías y normas, pero no citan todavía la frase exacta que respalda cada respuesta
