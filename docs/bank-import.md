# Importar el banco de preguntas

Esta guía explica cómo entregar el banco de preguntas a la plataforma desde la pantalla 22, Importar banco. La pantalla lee Excel, CSV o JSON, te enseña qué entra y qué no antes de guardar nada, y reporta cada problema con el número de fila.

## Qué pasa al importar

- Todo entra como borrador. Nada llega a un alumno hasta que un médico lo apruebe desde el banco.
- No se importa nada de golpe. Primero ves el resumen y las filas con problemas, y tú decides si importas lo que sí está bien.
- Una fila con problemas se queda fuera y las demás entran. Corrige el archivo y vuelve a subirlo.
- Con un ID en cada fila, volver a subir el mismo archivo no duplica nada. Si una pregunta no cambió se deja igual. Si cambió, sale una versión nueva y la anterior se conserva en el historial.
- Sin ID, la plataforma inventa uno con el nombre del archivo y el orden de la fila. Si cambias el orden de las filas, las preguntas se leerán como nuevas. Por eso conviene poner siempre un ID.
- Las preguntas importadas no son contenido de demostración. Quedan como borradores del médico.

## Dónde conseguir la plantilla

- En la pantalla 22 hay tres descargas con los mismos encabezados, Excel, CSV y JSON.
- El Excel trae listas desplegables con las ramas, las subespecialidades, los subtemas y los sesgos, una hoja de instrucciones y una fila de ejemplo.
- La fila de ejemplo empieza con el ID "EJEMPLO, borra esta fila". La plataforma la omite sola, pero conviene borrarla.
- El comando npm run bank:template vuelve a generar la plantilla de Excel y la deja en content-drafts/bank-plantilla y en public/plantillas.

## Columnas

Los encabezados se leen sin importar mayúsculas ni acentos. El orden de las columnas no importa.

| Columna | Obligatoria | Qué lleva |
| --- | --- | --- |
| ID | Recomendada | Un identificador propio de la pregunta, sin repetirse |
| Rama troncal | Sí | Una de las ramas de la lista |
| Subespecialidad | Sí | Una subespecialidad que pertenezca a esa rama |
| Subtema | Sí | Un subtema que pertenezca a esa subespecialidad |
| Dificultad | Sí | Un número entero del 1 al 5 que estima el médico |
| Tipo de reactivo | No | Uno o varios, separados por punto y coma. Control, Con incoherencias, Resolución inversa, Datos oscuros o Desde el paciente |
| Tarea | No | Si la dejas vacía, el motor de estructura la detecta. Si la escribes, la tuya gana |
| Polaridad | No | Afirmativa o Negativa. Si la dejas vacía, se detecta |
| Caso clínico | No | La viñeta. Vacía si la pregunta es directa |
| Pregunta | Sí | La frase de la pregunta. Ahí se buscan las negaciones |
| Correcta | Sí | La letra de la opción correcta, de la A a la J |
| Set canónico | No | Cuatro letras, que incluyan la correcta, separadas por coma. Si está vacío, entran la correcta y las tres primeras incorrectas |
| Explicación | Sí | Por qué es la respuesta y por qué las demás no |
| Referencias | Sí | Un título de guía de práctica clínica por renglón, o separados por dos punto y coma seguidos. Sin claves, años ni páginas inventados |
| Estado | No | Solo Borrador. Cualquier otro valor se rechaza |
| Opción A a Opción F | De la A a la D | El texto de cada opción, de 4 a 6 como pide la plantilla. El esquema acepta hasta 10 |
| Justificación A a F | Sí, por cada opción escrita | Por qué atrae el distractor, o por qué es correcta la clave |
| Sesgo A a F | Sí, en cada distractor | La trampa que explota el distractor, de la lista. La opción correcta no lleva sesgo |

## Reglas que revisa la plataforma

- Las opciones van seguidas desde la A. No se puede saltar una letra.
- Una pregunta lleva al menos 4 opciones y exactamente una correcta.
- Ninguna opción repite el texto de otra, aunque cambien los acentos o las mayúsculas.
- Todo distractor lleva un sesgo de la lista de sesgos que se pueden etiquetar.
- El set canónico incluye la correcta y al menos un distractor.
- La fila no puede conservar texto de la plantilla como "Escribe aquí" o "Elige de la lista".
- El texto de cada campo respeta los largos del banco. La pregunta hasta 1,000 caracteres, el caso hasta 8,000, la explicación hasta 4,000 y cada opción hasta 1,000.

## JSON

El JSON es una lista de objetos y cada llave es un encabezado de la plantilla. También se acepta un objeto con la llave "preguntas" que contenga esa lista. En JSON no hay fila de encabezados, así que la primera pregunta es la fila 1. Las referencias pueden ir como lista de textos.

```json
[
  {
    "ID": "hta-001",
    "Rama troncal": "Medicina interna",
    "Subespecialidad": "Cardiología",
    "Subtema": "Hipertensión arterial sistémica",
    "Dificultad": 3,
    "Caso clínico": "Hombre de 58 años con cefalea occipital y presión de 190/110 mmHg.",
    "Pregunta": "¿Cuál es el diagnóstico más probable?",
    "Correcta": "A",
    "Explicación": "…",
    "Referencias": ["GPC Hipertensión arterial"],
    "Opción A": "…", "Justificación A": "…", "Sesgo A": "",
    "Opción B": "…", "Justificación B": "…", "Sesgo B": "anchoring",
    "Opción C": "…", "Justificación C": "…", "Sesgo C": "premature_closure",
    "Opción D": "…", "Justificación D": "…", "Sesgo D": "framing_effect"
  }
]
```

## CSV

- La primera fila son los encabezados.
- Se detecta solo el separador, coma o punto y coma, y se entienden las comillas.
- Si el archivo no es UTF-8 se lee como Windows-1252, que es lo que guarda Excel en español.

## Reporte de errores

- Cada problema dice el número de fila del archivo, el ID si lo tiene y qué falta o qué está mal. Por ejemplo, la rama "Brujería" no está en la lista.
- El botón de descargar el reporte genera un CSV con las columnas Fila, ID y Problema, para trabajarlo en Excel.
- Un problema que afecta a todo el archivo, como una columna que falta, sale con la palabra Archivo en vez de un número de fila.

## Límites

- 50 MB por archivo y hasta 20,000 filas por importación. Un banco más grande se divide en partes.
- Las preguntas de casos seriados no se importan por ahora. Cada fila es una pregunta suelta.

## Lo mismo desde la terminal

Los scripts de scripts/content usan el mismo convertidor que la app. Con node scripts/content/bank-convert.ts archivo.xlsx se convierte el Excel al formato de lotes para revisarlo con check-draft. La app y el script aceptan exactamente lo mismo porque comparten src/data/content/bankConvert.ts.
