# Instrucciones del Sheet del banco de preguntas

Este texto va en la pestaña Instrucciones del Google Sheet Banco de preguntas. Reemplaza al de antes, que hablaba de entregar un Excel y de una hoja Sesgos que ya no existe.

## Cómo funciona

- Escribes las preguntas aquí, en la pestaña Preguntas, como siempre. Un renglón es una pregunta
- Studiare lee este Sheet cada hora con una cuenta de solo lectura. Nunca escribe en él ni cambia lo que escribes
- Cada pregunta nueva entra a Studiare como borrador. Nada llega a un alumno hasta que un médico revisor la aprueba dentro de la app
- Si corriges una pregunta aquí, Studiare crea una versión nueva en borrador. Lo que ya estaba publicado sigue publicado hasta que el revisor apruebe la nueva
- Lo que no se puede leer no entra y aparece en el reporte de Banco y Sheet con el número de renglón y el motivo. Corrige el renglón y en la siguiente lectura entra

## Reglas que no cambian

- El ID de cada pregunta es fijo. Escríbelo a mano con la forma GO-0001, el siguiente número libre. Nunca lo cambies, nunca lo reuses y nunca lo calcules con una fórmula, porque al ordenar o insertar renglones cambiaría y mezclaría la historia de dos preguntas
- No borres renglones para retirar una pregunta. Pon Retirar en Estado. Si un renglón desaparece, Studiare lo marca como faltante y el admin decide
- Corrige en este Sheet. Si un médico corrige una pregunta dentro de la app, copia aquí la misma corrección. Si las dos versiones no coinciden, Studiare no pisa ninguna y le pide al admin o a un médico asignado que elija
- La aprobación vive en la app. Aprobado en Estado ya no existe y se ignora

## Columnas

Studiare busca cada columna por su nombre, sin importar acentos ni mayúsculas, y lee solo la primera línea del encabezado. El orden de las columnas no importa. Deja la ayuda de cada columna como nota de la celda y no como segunda línea del encabezado.

| Columna | ¿Es obligatoria? | Qué escribir |
|---|---|---|
| ID | Sí | Un código fijo como GO-0001, de 2 a 4 letras, guion y de 4 a 5 números |
| Rama troncal | Sí | Elige de la lista |
| Subespecialidad | Sí | Elige de la lista. Depende de la rama |
| Subtema | Sí | Elige de la lista. Depende de la subespecialidad. No escribas aquí el nombre de una subespecialidad, como Control prenatal |
| Dificultad | Sí | Del 1 (muy fácil) al 5 (muy difícil) |
| Tipo de reactivo | No | Vacío en una pregunta normal. Si la pregunta es especial, uno o varios separados por coma. De control, Con incoherencias, Resolución inversa, Datos oscuros o Desde el paciente |
| Tarea | No | Lo que pide la pregunta, por ejemplo Diagnóstico o Siguiente paso. Si la dejas vacía, Studiare la detecta por la frase de la pregunta |
| Polaridad | No | Afirmativa o Negativa. Una pregunta con EXCEPTO es negativa. Si la dejas vacía, Studiare la detecta |
| Caso | Solo en casos seriados | La misma clave en todas las preguntas del caso, por ejemplo GO-C001 |
| Orden en el caso | Solo en casos seriados | 1, 2, 3, 4 o 5, sin repetir ni saltar números |
| Caso clínico | No | La viñeta. En un caso seriado va completa solo en el Orden 1 |
| Pregunta | Sí | La frase que se contesta, completa |
| Correcta | Sí | La letra de la opción correcta |
| Opción A a Opción F | De la A a la D | El texto de cada opción, seguidas desde la A |
| Justificación A a F | Para aprobar | Por qué la opción es correcta, o por qué tienta si es incorrecta |
| Sesgo A a F | Para aprobar, en cada incorrecta | El sesgo que explota la opción incorrecta, de la lista. La correcta no lleva sesgo |
| Set canónico | No | Cuatro letras separadas por coma que incluyan la correcta. Si lo dejas vacío, entran la correcta y las tres primeras incorrectas |
| Explicación | Para aprobar | Por qué es la respuesta y por qué las demás no |
| Referencias | Para aprobar | Una guía de práctica clínica o norma por renglón dentro de la celda. Solo el título |
| Estado | No | Borrador, Lista para revisión o Retirar |
| Autor | No | La clave de quien escribió la pregunta, por ejemplo PM. Las claves las da el admin |
| Revisor | No | La clave del médico que la revisa. No puede ser el mismo que el autor. Si la dejas vacía, revisa quien tiene asignada la subespecialidad |
| Idioma | No | Español o Inglés. Vacío es español, y en Inglés médico es inglés |
| Fuente del texto | Solo en inglés | El título del texto o del artículo de donde sale. Va en el renglón con Orden 1 o en la pregunta suelta, y los demás renglones del caso la heredan |
| Licencia del texto | Solo en inglés | Elige de la lista. Texto propio del equipo Studiare, Dominio público, CC0, CC BY o CC BY-SA |
| Enlace del texto | Solo en inglés, con cualquier licencia que no sea Texto propio | La dirección exacta del texto, que empieza con https |

## Casos de lectura en inglés

La parte de inglés del ENARM son textos médicos con dos o tres preguntas cada uno. Se escriben en esta misma pestaña. La guía completa está en docs/INGLES_MEDICO.md.

- Rama troncal Inglés médico y Subespecialidad Comprensión de lectura. El Subtema es la rama clínica de la que trata el texto
- Idioma Inglés. Si lo dejas vacío en Inglés médico, Studiare lo toma como inglés. Inglés en otra rama, o Español en Inglés médico, no entra
- Caso y Orden en el caso, como en cualquier caso seriado. Un caso de lectura lleva dos o tres preguntas, y con otro número entra igual
- El texto en inglés va en Caso clínico del renglón con Orden 1. Por ahora la pregunta y las opciones van en inglés, y la justificación de cada opción y la explicación en español. Ricardo confirma con la convocatoria si eso cambia
- Fuente del texto, Licencia del texto y Enlace del texto van en el renglón con Orden 1. Los demás renglones del caso heredan la fuente, y si los llenas tienen que decir lo mismo
- La licencia se elige de la lista de la pestaña Listas. Texto propio del equipo Studiare no pide título ni enlace. Las demás piden título y una dirección https
- La fuente del texto cuenta como referencia, así que Referencias es opcional en inglés
- Tarea vacía se toma como Interpretación de datos
- Las tres columnas del texto se ignoran en las preguntas en español

## Estado

- Borrador. La pregunta entra o se actualiza en Studiare y espera
- Lista para revisión. Si está completa y tiene un revisor distinto del autor, pasa a revisión en la app. Si le falta algo, se queda en borrador y el reporte dice qué
- Retirar. Studiare avisa al admin, que confirma el retiro en la app. Los alumnos dejan de verla, pero quien ya la contestó conserva su historial

## Lo que entra incompleto

Estas preguntas sí entran como borrador, pero no se pueden aprobar hasta que se completen aquí o en el editor de la app. La app muestra en cada una qué le falta.

- Sin Explicación
- Sin Referencias
- Una opción sin Justificación
- Una opción incorrecta sin Sesgo, con Ninguno o con un sesgo que no está en la lista
- Sin Tarea, cuando Studiare no pudo detectarla por la frase de la pregunta
- Un texto en inglés sin Fuente del texto, sin Licencia del texto o, con una licencia que no sea Texto propio del equipo Studiare, sin una dirección https en Enlace del texto
- Un texto en inglés con una Licencia del texto que no está en la lista, como CC BY-NC o CC BY-ND

## Lo que no entra

El renglón se queda fuera y el reporte dice el motivo. Lo demás del Sheet entra igual.

- Sin ID, con un ID que no tiene la forma de arriba o con un ID repetido. Si dos renglones traen el mismo ID, no entra ninguno de los dos
- Sin Pregunta, sin Correcta o con una Correcta que no está entre las opciones
- Menos de 4 opciones o letras salteadas, por ejemplo A, B y D sin C
- Rama, Subespecialidad o Subtema que no están en la lista
- Dificultad fuera de 1 a 5
- Un valor que no está en la lista de Tipo de reactivo, Tarea o Polaridad
- Texto que se quedó como Escribe aquí o Elige de la lista
- Un caso seriado con órdenes repetidos, con huecos o sin el 1. Entra el caso completo o no entra ninguna de sus preguntas
- Idioma Inglés en una rama que no es Inglés médico, o Idioma Español en Inglés médico
- Un caso con preguntas en español y en inglés, o con Fuente del texto distinta en sus renglones. Entra el caso completo o no entra ninguna de sus preguntas

## Lo que solo se avisa

- Subespecialidad deducida del subtema. El revisor la confirma al aprobar
- Tipo de reactivo De control. El revisor confirma que de verdad lo es
- Tarea o Polaridad detectadas solas
- Aprobado en Estado, que se ignora
- Ninguno en el Sesgo de la correcta, que se toma como vacío
- Una clave de Autor o Revisor que no existe, o el mismo médico en las dos
- Preguntas de un mismo caso en renglones separados
- Un Idioma que no es Español ni Inglés, que se toma como español
- Idioma vacío en Inglés médico, que se toma como inglés
- Un caso de lectura en inglés con una sola pregunta o con más de tres, que entra igual

## Lo que nunca es error

El examen real tiene preguntas raras y Studiare las quiere. Ninguna de estas cosas rechaza una pregunta ni la deja incompleta.

- Datos que no cuadran a propósito, datos oscuros o la pregunta contada por el paciente
- Casos casi iguales que solo se separan por el tratamiento
- Preguntas de control
- Preguntas negativas
- Una pregunta que casi todos fallan
- Un caso largo o una redacción incómoda
- Un texto en inglés largo, una pregunta de inferencia o un distractor con un falso cognado

## Quién ve este Sheet

- Solo el equipo y la cuenta de servicio de Studiare, como Lector. El acceso general queda en Restringido
- Si revisas preguntas, hazlo en la app y no aquí. En la app etiquetas a ciegas antes de ver los sesgos del autor, y eso mide el acuerdo entre médicos
