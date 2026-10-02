# Informe de recuperación de parámetros (14.2)

Generado por npm run recovery-report a partir de tests/recovery/recovery.test.ts. Versión del generador b9-2. Los números son reales y salen de los motores de src/engines sobre alumnos simulados con parámetros verdaderos conocidos. No sustituyen datos reales.

## Cómo se generó

- 300 alumnos simulados por semilla, 90 días de historial y el banco demo actual de 200 preguntas (lotes 1 a 4). En promedio 1026 respuestas por alumno, así que cada alumno ve varias veces el mismo banco
- 20% de los alumnos con una propensión de sesgo sembrada entre las 10 etiquetas más frecuentes del banco, 20% con mala lectura de negaciones (probabilidad de 0.3 a 0.5 de leer al revés una negativa) y 20% con fatiga (empieza entre el minuto 15 y el 30 de la sesión y quita de 0.05 a 0.08 logits por minuto)
- Respuestas con modelo Rasch sobre la dificultad verdadera, que es la del médico más ruido normal de 0.6 logits, opciones muestreadas por el motor real en modo diverso y tiempos que dependen de las palabras y la velocidad de lectura de cada alumno
- La probabilidad esperada que usan la mala lectura y la fatiga viene de la calibración de Rasch, igual que en la app. La verdad de cada tema es el promedio de la probabilidad con que el modelo generó esas respuestas
- La simulación de tarjetas con FSRS no entra a esta prueba porque 14.2 no tiene metas de tarjetas

## Resultados

### Semillas de diseño

Las semillas con que se vieron los primeros resultados y se diseñó la variante de sesgos.

| Medida | Meta | Semilla recuperacion-1 | Semilla recuperacion-2 | Semilla recuperacion-3 | Cumple |
|---|---|---|---|---|---|
| Rasch, correlación con la dificultad verdadera | 0.90 o más | 0.988 | 0.988 | 0.986 | Sí |
| Elo, correlación con la dificultad verdadera | 0.80 o más | 0.976 | 0.980 | 0.978 | Sí |
| Temas, error del dominio crudo contra encogido (RMSE) | El encogido es menor | 0.239 contra 0.123, baja 48.5% | 0.241 contra 0.121, baja 49.7% | 0.243 contra 0.118, baja 51.5% | Sí |
| Sesgos con el método de 7.4, detectados entre los sembrados | 80% o más | 100.0% (59 de 59) | 100.0% (50 de 50) | 100.0% (53 de 53) | Sí |
| Sesgos con el método de 7.4, marcados sin nada sembrado | 10% o menos | 51.5% (124 de 241) | 54.0% (135 de 250) | 47.0% (116 de 247) | No |
| Sesgos con la variante propuesta (D-051), detectados entre los sembrados | 80% o más | 100.0% (59 de 59) | 100.0% (50 de 50) | 100.0% (53 de 53) | Sí |
| Sesgos con la variante propuesta (D-051), marcados sin nada sembrado | 10% o menos | 5.8% (14 de 241) | 3.6% (9 de 250) | 3.2% (8 de 247) | Sí |
| Mala lectura de negaciones, detectados entre los sembrados | 80% o más | 92.3% (48 de 52) | 100.0% (48 de 48) | 88.9% (48 de 54) | Sí |
| Mala lectura de negaciones, marcados sin nada sembrado | 10% o menos | 0.0% (0 de 248) | 0.8% (2 de 252) | 0.8% (2 de 246) | Sí |
| Fatiga, detectados entre los sembrados | 80% o más | 69.5% (41 de 59) | 72.7% (56 de 77) | 60.6% (40 de 66) | No |
| Fatiga, marcados sin nada sembrado | 10% o menos | 5.8% (14 de 241) | 4.9% (11 de 223) | 3.8% (9 de 234) | Sí |

Pares alumno y etiqueta sin propensión marcados. Método de 7.4 14.0%, 14.5%, 15.2%. Parte de los errores sin corrección 2.7%, 2.7%, 2.4%. Con corrección de Bonferroni 0.2%, 0.2%, 0.1%.

### Semillas nuevas

Semillas que no se miraron al diseñar la variante, con el mismo modelo.

| Medida | Meta | Semilla validacion-4 | Semilla validacion-5 | Semilla validacion-6 | Cumple |
|---|---|---|---|---|---|
| Rasch, correlación con la dificultad verdadera | 0.90 o más | 0.983 | 0.979 | 0.986 | Sí |
| Elo, correlación con la dificultad verdadera | 0.80 o más | 0.973 | 0.967 | 0.973 | Sí |
| Temas, error del dominio crudo contra encogido (RMSE) | El encogido es menor | 0.237 contra 0.117, baja 50.7% | 0.241 contra 0.116, baja 51.9% | 0.241 contra 0.121, baja 49.9% | Sí |
| Sesgos con el método de 7.4, detectados entre los sembrados | 80% o más | 100.0% (49 de 49) | 100.0% (64 de 64) | 100.0% (68 de 68) | Sí |
| Sesgos con el método de 7.4, marcados sin nada sembrado | 10% o menos | 50.6% (127 de 251) | 52.1% (123 de 236) | 51.7% (120 de 232) | No |
| Sesgos con la variante propuesta (D-051), detectados entre los sembrados | 80% o más | 100.0% (49 de 49) | 100.0% (64 de 64) | 100.0% (68 de 68) | Sí |
| Sesgos con la variante propuesta (D-051), marcados sin nada sembrado | 10% o menos | 3.2% (8 de 251) | 5.9% (14 de 236) | 4.3% (10 de 232) | Sí |
| Mala lectura de negaciones, detectados entre los sembrados | 80% o más | 92.9% (52 de 56) | 96.5% (55 de 57) | 98.2% (56 de 57) | Sí |
| Mala lectura de negaciones, marcados sin nada sembrado | 10% o menos | 0.0% (0 de 244) | 0.0% (0 de 243) | 0.4% (1 de 243) | Sí |
| Fatiga, detectados entre los sembrados | 80% o más | 51.9% (28 de 54) | 68.2% (45 de 66) | 66.7% (34 de 51) | No |
| Fatiga, marcados sin nada sembrado | 10% o menos | 2.8% (7 de 246) | 3.0% (7 de 234) | 3.6% (9 de 249) | Sí |

Pares alumno y etiqueta sin propensión marcados. Método de 7.4 16.0%, 15.1%, 14.3%. Parte de los errores sin corrección 2.9%, 2.4%, 2.6%. Con corrección de Bonferroni 0.2%, 0.2%, 0.2%.

### Modelo de sesgo distinto (lure)

Semillas nuevas con un sesgo que solo atrae cuando el alumno sabía la respuesta.

| Medida | Meta | Semilla validacion-4 | Semilla validacion-5 | Semilla validacion-6 | Cumple |
|---|---|---|---|---|---|
| Rasch, correlación con la dificultad verdadera | 0.90 o más | 0.984 | 0.980 | 0.985 | Sí |
| Elo, correlación con la dificultad verdadera | 0.80 o más | 0.971 | 0.968 | 0.972 | Sí |
| Temas, error del dominio crudo contra encogido (RMSE) | El encogido es menor | 0.239 contra 0.119, baja 50.3% | 0.244 contra 0.119, baja 51.1% | 0.243 contra 0.123, baja 49.5% | Sí |
| Sesgos con el método de 7.4, detectados entre los sembrados | 80% o más | 100.0% (49 de 49) | 100.0% (64 de 64) | 100.0% (68 de 68) | Sí |
| Sesgos con el método de 7.4, marcados sin nada sembrado | 10% o menos | 48.2% (121 de 251) | 50.8% (120 de 236) | 50.4% (117 de 232) | No |
| Sesgos con la variante propuesta (D-051), detectados entre los sembrados | 80% o más | 98.0% (48 de 49) | 93.8% (60 de 64) | 88.2% (60 de 68) | Sí |
| Sesgos con la variante propuesta (D-051), marcados sin nada sembrado | 10% o menos | 3.2% (8 de 251) | 4.7% (11 de 236) | 4.7% (11 de 232) | Sí |
| Mala lectura de negaciones, detectados entre los sembrados | 80% o más | 92.9% (52 de 56) | 98.2% (56 de 57) | 98.2% (56 de 57) | Sí |
| Mala lectura de negaciones, marcados sin nada sembrado | 10% o menos | 0.0% (0 de 244) | 0.0% (0 de 243) | 0.4% (1 de 243) | Sí |
| Fatiga, detectados entre los sembrados | 80% o más | 51.9% (28 de 54) | 66.7% (44 de 66) | 60.8% (31 de 51) | No |
| Fatiga, marcados sin nada sembrado | 10% o menos | 3.3% (8 de 246) | 3.0% (7 de 234) | 4.0% (10 de 249) | Sí |

Pares alumno y etiqueta sin propensión marcados. Método de 7.4 16.1%, 15.2%, 14.9%. Parte de los errores sin corrección 2.8%, 2.3%, 2.6%. Con corrección de Bonferroni 0.2%, 0.2%, 0.2%.

## Lectura

- Rasch, Elo, temas y mala lectura cumplen sus metas en todas las semillas
- Elo sale muy alto porque cada alumno simulado responde cada pregunta varias veces. Con alumnos reales y menos respuestas por pregunta se espera más bajo, y la meta se vuelve a revisar con datos reales
- Sesgos. El método de 7.4 encuentra a casi todos los alumnos sembrados, pero también marca a cerca de la mitad de los que no tienen propensión. Hay dos causas. La atracción se mide contra todas las veces que la etiqueta estuvo a la vista, así que un alumno que se equivoca mucho parece atraído por todas las etiquetas. Y se prueban unas 20 etiquetas por alumno con un intervalo de 95% cada una, así que alguna sale arriba de la línea base por azar
- Fatiga. La detección queda por debajo de la meta. El motor compara el primer y el último tercio de las sesiones de más de 30 minutos. Cuando la fatiga empieza cerca del final de sus sesiones habituales, el último tercio casi no la refleja, y con pocas sesiones largas el error estándar es grande. Los falsos positivos sí cumplen

## Límites de esta validación

- La variante de sesgos (D-051) se diseñó viendo los resultados de las semillas de diseño. Por eso se evalúa también con semillas nuevas que no se miraron al diseñarla
- En el modelo principal del generador el sesgo pesa más al elegir distractor cuando el alumno falla, que es justo lo que mide la variante. Para no evaluarla en condiciones que la favorecen, se repite con un modelo de sesgo distinto (lure), donde el sesgo solo atrae cuando el alumno sabía la respuesta
- Ninguna simulación sustituye datos reales. Con la población real se vuelven a correr estas medidas

## Ajustes propuestos, pendientes de aprobación de Ricardo

1. Sesgos (D-051). Medir qué parte de los errores con la etiqueta a la vista fue a esa etiqueta, con la línea base calculada igual, y corregir el nivel del intervalo por Bonferroni según cuántas etiquetas se evalúan. Ya está en el motor como opción (method error_share y familywise), sin cambiar el comportamiento por defecto. Las tablas dicen si cumple con semillas nuevas y con el modelo lure
2. Fatiga. Opción a, mantener el método y mostrar calibrando hasta tener más sesiones largas. Opción b, cambiar la comparación por tercios por una regresión de la exactitud ajustada contra el minuto de la sesión, que aprovecha todas las respuestas. Recomiendo probar la opción b y repetir esta prueba antes de decidir

