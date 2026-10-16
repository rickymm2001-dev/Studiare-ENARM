# Inglés médico

Cómo se escribe, se revisa y se prepara la parte de inglés de Studiare (bloque B13). El ENARM trae 250 reactivos en español y 30 de comprensión de textos médicos en inglés, y Studiare trata cada caso de lectura como a cualquier otro caso del banco. Este documento es para los médicos que escriben casos de lectura y para quien prepara los textos. Las reglas de cada columna del Sheet están en docs/SHEET_DEL_BANCO.md, que es el texto de la pestaña Instrucciones.

## Lo esencial

- Un caso de lectura es un caso seriado del banco. El texto en inglés es la viñeta del caso y cada pregunta es una versión con su orden. Lleva dos o tres preguntas, como en el examen
- Los textos los escribe el equipo o vienen de una fuente con licencia que permite el uso comercial. Las preguntas las escriben siempre los médicos. Ninguna parte de este módulo la escribe la IA, y la IA de reestructurar preguntas (Borradores de IA) no ofrece ni acepta preguntas en inglés, aunque tengan un reporte abierto. Solo reestructura el banco en español
- Cada texto lleva su fuente y su licencia, y la app las muestra junto al texto. Sin fuente válida la pregunta entra como borrador, pero no se puede aprobar
- El examen real es imperfecto y Studiare también (D-080). Un texto largo, una pregunta de inferencia, un distractor con un falso cognado o un caso de una o de cuatro preguntas no se rechazan
- En Conócete las respuestas de inglés no entran al ritmo, a la adivinanza rápida, al tiempo atascado ni a las viñetas largas, porque el texto se lee una vez y sus preguntas se contestan sobre él, y la segunda y la tercera salen en unos 35 segundos. Su ritmo se ve en su tarjeta de Progreso. Sí entran a lo demás, como las trampas y los sesgos
- El formato del examen vive en un solo lugar, src/config/exam.ts, y los umbrales de calibrando en otro, src/config/thresholds.ts. Si la convocatoria cambia, se cambia ahí y no en cada pantalla

## Forma de un caso de lectura

| Parte | Dónde va | Idioma | Regla |
|---|---|---|---|
| Texto | Caso clínico del renglón con Orden 1 | Inglés | Hasta 8,000 caracteres. Se copia sin cambios de su fuente |
| Pregunta | Pregunta | Inglés | Igual que en las demás ramas |
| Opciones | Opción A a F | Inglés | De 4 a 10, una correcta, y cada distractor con un sesgo de la lista |
| Justificación de cada opción | Justificación A a F | Español | Por qué atrae o por qué es la correcta |
| Explicación | Explicación | Español | Qué dice el texto y en qué parte |
| Referencias | Referencias | Español | Opcional. La fuente del texto ya cuenta como referencia. Si quieres, agrega después una guía |
| Rama, subespecialidad y subtema | Rama troncal, Subespecialidad, Subtema | | Inglés médico, Comprensión de lectura y la rama clínica de la que trata el texto |
| Tarea | Tarea | | Vacía. Studiare toma Interpretación de datos |
| Idioma | Idioma | | Inglés. Si lo dejas vacío en Inglés médico, Studiare lo toma como inglés y avisa |
| Dificultad | Dificultad | | Del 1 al 5, como siempre |

- El idioma de la pregunta y de las opciones es una decisión pendiente de Ricardo (8.2 del plan de B13). Por ahora van en inglés, igual que el texto, y la explicación y las justificaciones en español. El esquema acepta cualquiera de las dos formas y cambiarlo es solo de contenido
- Una pregunta suelta en inglés, sin Caso, también es válida. Su Caso clínico es el texto
- Los subtemas de Comprensión de lectura son Medicina interna, Pediatría, Ginecología y obstetricia, Cirugía general, Medicina familiar, Urgencias y Salud pública. El subtema dice de qué rama clínica trata el texto, no de qué trata la pregunta

## Cómo se escribe en el Sheet

Los casos de inglés van en la misma pestaña Preguntas, con las columnas de siempre y tres nuevas al final. El orden de las columnas no importa. Esta es la forma de un caso de tres preguntas, con la ayuda en lugar del contenido.

| ID | Caso | Orden en el caso | Caso clínico | Pregunta | Idioma | Fuente del texto | Licencia del texto | Enlace del texto |
|---|---|---|---|---|---|---|---|---|
| GO-0301 | GO-C101 | 1 | El texto completo en inglés | La primera pregunta en inglés | Inglés | El título del texto | Dominio público | https://dirección-del-texto |
| GO-0302 | GO-C101 | 2 | Vacío | La segunda pregunta en inglés | Inglés | Vacío | Vacío | Vacío |
| GO-0303 | GO-C101 | 3 | Vacío | La tercera pregunta en inglés | Inglés | Vacío | Vacío | Vacío |

- El texto y su fuente van solo en el renglón con Orden 1. Los demás renglones del caso heredan la fuente. Si los llenas, tienen que decir lo mismo, y si dos renglones traen fuentes distintas, el caso entero se queda fuera
- Todos los renglones del caso van en el mismo idioma. Un caso que mezcla español e inglés no entra
- Las columnas Fuente del texto, Licencia del texto y Enlace del texto se leen solo en los renglones en inglés. En un renglón en español se ignoran
- Para un texto propio del equipo, la licencia es Texto propio del equipo Studiare y no pide título ni enlace
- La lista Licencia del texto está en la pestaña Listas del Sheet. La arma `npm run bank:sheet-lists`
- Los textos largos, las preguntas de inferencia y los distractores con un falso cognado son bienvenidos. Studiare no los rechaza ni los marca como pendientes (D-080)

## La fuente del texto

Studiare guarda la fuente como la primera referencia de la pregunta, con esta forma fija. Una sola función del código la arma y la lee, y la base de datos tiene su espejo, así la app, el servidor y el editor entienden lo mismo.

```text
Fuente del texto. {título}. {licencia}. {enlace}
Fuente del texto. Texto propio del equipo Studiare.
```

Las licencias que se aceptan son estas, y la lista se revisará con el abogado (8.8 del plan de B13).

| Cómo se escribe | Pide enlace | Qué exige |
|---|---|---|
| Texto propio del equipo Studiare | No | Que el texto lo haya escrito el equipo |
| Dominio público | Sí | Decir de dónde viene, por ejemplo MedlinePlus.gov (NLM) |
| CC0 | Sí | Nada más |
| CC BY | Sí | Atribución. La app la muestra bajo el texto con el título, la licencia y el enlace |
| CC BY-SA | Sí | Atribución, y copiar el texto sin cambios para no crear una obra derivada |

- Cualquier otra licencia, como CC BY-NC o CC BY-ND, no se acepta, porque Studiare cobra. La pregunta entra como borrador con el pendiente de licencia fuera de la lista
- Sin fuente, sin título, sin licencia o sin enlace https cuando la licencia lo pide, la pregunta entra como borrador con el pendiente de falta de fuente del texto
- La referencia mide hasta 300 caracteres. Si el título es muy largo, Studiare lo recorta y nunca recorta el enlace
- Como espacio cuentan el espacio, el tabulador, el salto de línea, el espacio sin salto y la marca de orden de bytes que a veces trae un texto copiado de la web o de un PDF. La app y la base los leen igual, y una referencia que los trae se lee como si trajera espacios normales
- La licencia de un artículo se lee en sus metadatos o en la propia página. Nunca se supone, y se guarda el enlace exacto
- La excepción es MedlinePlus. Sus temas se toman como dominio público por el aviso de uso de MedlinePlus.gov, sin leer la página de cada tema, y el médico que elige el tema lo confirma en su página antes de anotarlo en la lista. Si la página dice que el resumen viene de otra fuente o que tiene derechos reservados, ese tema no se usa

## De dónde sacar textos

| Fuente | Qué es | Licencia | Parecido al ENARM |
|---|---|---|---|
| Resúmenes de temas de MedlinePlus | Textos para pacientes de la Biblioteca Nacional de Medicina de EE. UU. (NLM) | Dominio público, con la mención que pide NLM | Bajo, de lenguaje sencillo |
| Resúmenes de artículos de PubMed Central | Artículos científicos del subconjunto de acceso abierto | Solo los que digan CC0, CC BY o CC BY-SA en su propia licencia | Alto, es el tipo de texto que describen las guías del ENARM |
| Páginas de los CDC | Salud pública | Dominio público en su mayoría, se revisa cada página | Medio, útil para Salud pública |

- Quedan fuera los textos con NC o ND, los libros, las guías con derechos, UpToDate y las revistas sin licencia abierta
- Se da prioridad a los resúmenes CC BY de PubMed Central sobre temas de las siete ramas, y MedlinePlus se usa para los textos más sencillos. Los eligen los médicos (8.19)
- El texto se copia tal cual, sin resumir y sin traducir. Si una frase no sirve, se elige otro texto

## Sesgos que aplican a la lectura

La lista de sesgos no cambia en B13. Estos son los que más aparecen cuando el alumno lee un texto.

- Sesgo de creencias (belief_bias). El distractor se apoya en lo que el alumno sabe o cree y contradice lo que dice el texto
- Ceguera inatencional (inattentional_blindness). El distractor ignora un dato presente en el texto que no se esperaba ver
- Ilusión de enfoque (focusing_illusion). El distractor exagera una sola frase del texto y descuida el resto
- Sesgo de encuadre (framing_effect). El distractor atrae por cómo está redactada una cifra o una frase, por ejemplo un riesgo como pérdida o como ganancia
- Sesgo de anclaje (anchoring). El distractor se apoya en la primera cifra o en la primera frase del texto

El falso cognado, una palabra que se parece al español y significa otra cosa, es la trampa de lectura más común en inglés y hoy no está en la lista. Se propone como etiqueta nueva y espera a Ricardo (8.9). Mientras tanto, el distractor lleva el sesgo más cercano de la lista y su justificación explica el falso cognado.

## Cómo se revisa

- Es el mismo flujo del banco. El autor y el revisor son médicos distintos, y el revisor etiqueta a ciegas el sesgo de cada distractor antes de ver los del autor
- Aprobar pide una versión completa, y en inglés eso incluye una fuente del texto con una licencia aceptada
- Studiare revisa solo lo siguiente al leer el Sheet y al guardar en la app
  - Se rechaza el renglón si está en inglés fuera de Inglés médico o en español dentro de Inglés médico, o si un caso mezcla idiomas o trae fuentes distintas
  - Queda incompleto, sin poder aprobarse, si falta la fuente, la licencia o el enlace, o si la licencia no es de la lista
  - Solo se avisa si el Idioma estaba vacío en Inglés médico, que se toma como inglés, si un caso trae una sola pregunta o más de tres, o si el texto largo de una pregunta que quedó como español parece estar en inglés
  - Este último aviso mira el Caso clínico cuando pasa de 200 caracteres y compara sus palabras más comunes en inglés (the, of, and, is, with, was, for, that) contra las del español. Es una pista y no una regla, porque Studiare nunca decide el idioma por el texto (D-080). No cambia el idioma, no rechaza nada y no pide la fuente. Si el texto es de lectura, pásalo a Inglés médico con Idioma Inglés y llena su fuente
- El detalle de cada caso, con la frase del reporte, está en docs/SHEET_DEL_BANCO.md

## Scripts

Los dos scripts dejan archivos locales y nunca suben nada. No usan IA, no resumen y no traducen. Los archivos que escriben son para subir a mano al Sheet o al catálogo de mazos y no se guardan en el repo.

### Textos con licencia

`npm run english:passages` prepara los textos para que los médicos solo escriban las preguntas. Lee una lista que eligen los médicos, baja o lee cada texto, lee su licencia de los metadatos y escribe Studiare-ingles-textos.xlsx con un renglón por pregunta por escribir.

La lista va en content-drafts/ingles/textos.json.

```json
{
  "texts": [
    { "source": "medlineplus", "id": "2846", "subtopic": "english_pediatrics", "questions": 3 },
    { "source": "pmc", "id": "PMC1234567", "subtopic": "english_internal_medicine", "questions": 2 }
  ]
}
```

- source es medlineplus o pmc. id es el número del tema de MedlinePlus o el PMCID del artículo. subtopic es la clave de un subtema de Comprensión de lectura y questions va de 1 a 5, con 3 por omisión
- Opciones. `--list` la ruta de la lista, `--medlineplus` el XML de temas de salud, `--pmc-dir` una carpeta con un archivo PMC y el número por artículo, `--out` el Excel que se escribe, `--first-case` el número del primer caso y `--case-prefix` el prefijo de la clave del caso
- Los renglones salen con Rama troncal, Subespecialidad, Subtema, Idioma, Caso y Orden, el texto en el Orden 1 y su fuente, licencia y enlace ya llenos. Quedan vacíos el ID, la dificultad, la pregunta, las opciones, los sesgos, las justificaciones y la explicación. Un texto con una sola pregunta sale suelto, sin Caso
- Del artículo de PubMed Central toma el resumen principal y nunca el cuerpo. De MedlinePlus toma el resumen del tema
- No entra, y el script dice por qué, un texto sin licencia en sus metadatos, con una licencia que no permite el uso comercial, sin resumen o de más de 8,000 caracteres, porque no se recorta. Los demás textos de la lista siguen
- Si falta la lista, el script termina con un aviso y enseña la forma que debe tener
- Sin carpeta con --pmc-dir pide cada artículo al servicio E-utilities de NLM, uno de los que PubMed Central aprueba para el acceso automático. Si la red no abre, dice qué dominios agregar y cómo bajar el archivo a mano
- Cada pedido a E-utilities se presenta con tool=studiare-english-passages y espera 350 ms después del anterior, porque NCBI permite hasta 3 pedidos por segundo sin clave de API
- NCBI también pide un correo de contacto. El script lo manda como email solo si existe la variable de entorno NCBI_EMAIL, que se define en la terminal antes de correrlo y nunca se escribe en el código ni en un archivo del repo. Si falta, el script lo avisa por pantalla y sigue sin él. Con --pmc-dir no hay pedidos y no avisa

### Mazo de vocabulario

`npm run english:vocabulary -- ruta/al/archivo.xml` arma el mazo de vocabulario médico en inglés con los temas de salud de MedlinePlus, de dominio público.

- Una nota por tema, solo de inglés a español, con el nombre en inglés al frente y atrás el nombre en español, los otros nombres y Fuente MedlinePlus.gov (NLM). El par en español es el que publica NLM
- Cada nota tiene un id estable, así una versión nueva del archivo conserva los repasos. Un tema sin par en español no entra
- El submazo es el grupo de MedlinePlus en español, por ejemplo Corazón y circulación, Infecciones o Embarazo y reproducción. Así el alumno baja el mazo por partes
- Escribe el mazo de la demo, src/demo/content/decks/vocabulario-ingles.json, y el paquete content-drafts/ingles/Vocabulario-ingles.apkg para subir en Administración, Catálogo de mazos, con la nota Dominio público, MedlinePlus.gov
- La app dice Fuente MedlinePlus.gov (NLM) y Dominio público en lugar del autor solo en el mazo con la clave vocabulario-ingles o con MedlinePlus.gov (NLM) como autor. La rama y el tema no bastan, y el mazo de otra persona que también es de Inglés médico conserva el crédito de su autor

### Cómo bajar los archivos a mano

La red de las sesiones no abre medlineplus.gov ni los servicios de NCBI hasta que Ricardo agregue sus dominios (docs/PENDIENTES_DE_RICARDO.md, paso B13.1). Mientras tanto se bajan a mano.

- Temas de MedlinePlus. Abre https://medlineplus.gov/xml.html, baja el XML de temas de salud, descomprímelo si viene en un .zip y pásalo con `--medlineplus` o como argumento del vocabulario. Para el vocabulario el archivo tiene que traer los temas en inglés y en español, o se pasan los dos archivos
- Artículos de PubMed Central. Abre en el navegador `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=PMC1234567&retmode=xml` con el PMCID del artículo, guarda el resultado como PMC1234567.xml en una carpeta y pásala con `--pmc-dir`
- Dominios que agregar a la red de la sesión. medlineplus.gov, www.ncbi.nlm.nih.gov, pmc.ncbi.nlm.nih.gov y eutils.ncbi.nlm.nih.gov

## Qué se probó y qué falta

- Los dos scripts se probaron con archivos de muestra con la marca [Prueba], en tests/fixtures/medlineplus y tests/fixtures/pmc, que imitan la estructura documentada de los XML de MedlinePlus y de PubMed Central. No son contenido médico y no se usan como contenido
- La primera corrida con los archivos reales se revisa a mano. Hay que confirmar la estructura de los XML (los temas con su par en español y su resumen, y los metadatos de licencia de los artículos) y contar los temas con par, que se espera que sean alrededor de mil
- El mazo de vocabulario todavía no está generado en el repo, porque no hay XML real en las sesiones sin red
- Una propuesta de preguntas con IA, ancladas a un texto del equipo, queda en IDEAS.md y no está en B13 (8.11)
