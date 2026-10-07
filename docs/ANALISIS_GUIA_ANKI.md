# Guía de Anki, análisis y plan (Fase C2)

Registro de la conversación del 2026-10-07 entre Ricardo y Claude. Nace de una guía de Anki que Ricardo compartió y pidió integrar a Studiare. Se trabajó en cuatro fases con una regla, no escribir código hasta que Ricardo aprobara el plan.

Las decisiones que salen de aquí viven en DECISIONES.md (D-085 y D-086), el plan por etapas en PLAN.md (Fase C2) y el avance en PROGRESS.md. Este documento guarda el razonamiento completo para que quien lea el código entienda por qué la app se organiza así.

## 1. Qué pidió Ricardo

- Revisar la guía de Anki contra el código de Studiare, entrevistarlo, mostrar las controversias con su solución y recién entonces implementar.
- La guía cubre complementos de Anki (Heatmap, fondo propio, refuerzos con mascotas, FSRS Helper), jerarquía de mazos, etiquetas por tema, importación por CSV y .apkg, ajustes de carga diaria, manejo de atrasos, calidad de tarjetas y generar tarjetas desde PDF con IA.
- Reglas de la conversación. Responder en español, no suponer datos, ser honesto con lo que depende de la versión de Anki, una fase a la vez y sin código antes de la aprobación.

## 2. Fase 1. Diagnóstico del código

Resumen de lo que había el 2026-10-07, antes de empezar la Fase C2.

- Plataforma web (PWA) en español de México con repaso de tarjetas, simulador, examen completo, planificador, tutor sin IA y Party.
- Vite, React y TypeScript estricto, IndexedDB con Dexie y zod, FSRS con ts-fsrs 5.4, pruebas con Vitest y Playwright.
- Motores puros en src/engines, datos y casos de uso en src/data, pantallas en src/features. Cada repaso es un evento que solo se agrega.
- Dos tipos de nota (básica y cloze con campo extra), 3,771 notas demo de Paco con sus etiquetas, el mazo privado Mis errores y mazos hechos a mano.
- Ya cubría bien. FSRS con retención de 90%, pasos de 1 y 10 minutos, sanguijuela a los 8 olvidos que solo marca, tope de intervalos al día del examen, mapa de calor, fondo personalizado y celebraciones. Son los equivalentes nativos de Heatmap, Custom Background y Puppy Reinforcement.
- Cubría en parte. Jerarquía (solo etiquetas planas), etiquetas por tema (solo la subespecialidad), límites diarios (20 nuevas y 200 repasos), intervalo máximo (21 días suave, no 365) y categorías (dos contadores, sin Aprendizaje aparte).
- No cubría. Exportar o importar tarjetas, temporizador por tarjeta, días fáciles, herramientas para atrasos, tarjetas desde un PDF y sincronizar con Anki.
- Decisión previa que pesa. El producto busca reemplazar a Anki y no complementarlo, y la interfaz no lo menciona (D-059).

### Hipótesis revisadas contra el código

| Hipótesis | Aplica | Hallazgo |
|---|---|---|
| Etiquetas con espacios | Sí, ya había datos afectados | 42 etiquetas distintas con espacio en los mazos de Paco, como Medicina Interna o Mieloma Múltiple (3,106 usos). Al llevarlas a Anki cada una se partiría en dos. El archivo original conserva la etiqueta con guiones y con el separador de niveles de Anki, así que se pueden recuperar |
| Formato CSV | No había código de CSV | Los textos son HTML saneado, o texto escapado con saltos de línea en los mazos manuales. Habría que citar campos, usar UTF-8, activar HTML y fijar columnas. Anki desde la 2.1.54 acepta encabezados dentro del archivo para tipo de nota, mazo, etiquetas y GUID |
| Sintaxis cloze | Aplica poco | El editor ya exigía al menos un hueco, número de 1 a 100, hueco cerrado y respuesta no vacía, y acepta pista. No soportaba un hueco dentro de otro |
| Importación contra configuración | Sí | Un CSV no lleva opciones de mazo. En Studiare esas opciones son del alumno y no de cada mazo |
| Complementos | Sí, no se integran | Los de Anki se instalan en Anki. Heatmap, fondo y celebraciones ya existían dentro de Studiare. FSRS Helper no hace falta porque FSRS va integrado, pero sus utilidades (posponer, días fáciles) serían funciones nuevas |
| Riesgos de configuración | Sí | 9999 nuevas al día saturaría y el 20 es deliberado. El tope de 21 días contradice los 365 de la guía. La sanguijuela marca, pero no había flujo para corregirla. No había temporizador y el tiempo por tarjeta se cortaba a 24 horas |
| Calidad médica | Sí, y choca con reglas del proyecto | Todo texto médico de IA va anclado al banco, con cita literal y en borrador. El esquema de nota generada exigía la pregunta del banco que la respalda |
| Cantidad de tarjetas | Sí | No había manejo de PDF. El generador planeado trabajaba pregunta por pregunta del banco |
| Sincronización y duplicados | En parte | Aún no sincroniza. Los IDs son únicos y estables, lo que ayuda |
| Progreso actual | Sí, la principal | Si el alumno estudiara en Anki, el tutor, el planificador, Conócete, la racha y el XP no verían esos repasos |

### Datos que dependen de la versión de Anki

- Confirmados por resultados de búsqueda del manual y de los foros. Los encabezados de importación existen desde la 2.1.54, los días fáciles se configuran en las opciones del mazo y AnkiConnect tiene addNotes, createDeck, saveDeckConfig e importPackage en su API versión 6. El manual oficial estaba bloqueado desde el entorno, así que no se leyó directo.
- No confirmados. Los nombres exactos de las opciones de sanguijuela y de segundos máximos de respuesta, desde qué versión existen los días fáciles, si saveDeckConfig acepta los campos de FSRS, y que Delay Overdue exista con ese nombre o haga lo que dice la guía. Se trata como dudoso.
- Leído del código instalado. ts-fsrs usa por defecto pasos de 1 y 10 minutos, 10 minutos al reaprender, 90% de retención y sin variación aleatoria, igual que la guía.

## 3. Fase 2. Entrevista y respuestas de Ricardo

| # | Pregunta | Respuesta de Ricardo |
|---|---|---|
| 1 | Dónde estudiará las tarjetas | Dentro de Studiare |
| 2 | Qué hacer con la guía | Adoptar las prácticas dentro de la app (jerarquía, etiquetas por tema, ajustes por defecto, ayuda con atrasos) |
| 3 | Colección de Anki con historial | No |
| 4 | Repasos reales en Studiare | No |
| 5 | Qué le ha estorbado | Es una aplicación muy compleja y hay que estar configurando mil complementos para que quede bien. Quiere crear una app que ya los tenga todos, con mazos precargados para estudiar y facilidad para crear mazos propios. Quiere fusionarla con la tecnología que usa RemNote |
| 6 | Sistema y versión de Anki | La última |
| 7 | Cómo importa hoy | A mano |
| 8 | Fecha del examen y minutos al día | Se está programando un producto comercial, así que los ajustes deben servir a muchos alumnos y no solo a él |
| 9 | Fuentes de las tarjetas | Todas (guías clínicas en PDF, apuntes propios, libros y resúmenes, preguntas falladas) |
| 10 | Nivel de automatización | La mayor versatilidad para el usuario, sin importar el costo de programarla |
| 11 | IA con textos que pega el alumno | No la entendió, se le explicó y eligió la opción B (ver sección 5) |
| 12 | Comodidad con complementos y terminal | Se pueden instalar complementos y cargar paquetes de GitHub, pero no sabe usar la terminal ni programar. Su prioridad es la organización y la carga diaria, una plataforma como un Anki con esteroides que suma lo que hace RemNote y además simuladores, un todo en uno |

Lo que Claude entendió de las respuestas.

- Todo se queda dentro de Studiare y no hay una colección de Anki que cuidar ni repasos reales que perder, solo la demo.
- Es un todo en uno, un Anki con esteroides con lo mejor de RemNote y los simuladores.
- Ricardo usa la plataforma pero la piensa para muchos alumnos.
- Ricardo no usa la terminal. Claude hace todo y él prueba en pantalla con una lista de verificación. Cada paquete nuevo de GitHub se le presenta con nombre, para qué sirve y cuánto pesa.

## 4. Fase 3. Tabla de controversias

Las filas con advertencia son las que pueden dañar algo si se hacen mal. La solución recomendada de las 14 filas fue aprobada completa por Ricardo, sin distinguir esfuerzo.

| # | Controversia | Por qué ocurre en este caso | Solución recomendada | Alternativa y compromiso | Esfuerzo |
|---|---|---|---|---|---|
| 1 | El alcance. Anki con esteroides, RemNote y simuladores a la vez | Studiare tiene repaso, simuladores, examen y planificador, pero no organiza las tarjetas como Anki ni tiene apuntes como RemNote | Trabajar en etapas con aprobación al cerrar cada una, empezando por la organización | Todo a la vez. Se ve más rápido, pero se rompe más y es difícil de probar | Alto |
| 2 | ⚠ La tecnología de RemNote es otro modelo de datos | En RemNote cada línea de un esquema es una pieza que puede volverse tarjeta. En Studiare los mazos son planos y las tarjetas viven aparte de los apuntes | Un módulo de Apuntes en esquema donde escribir una marca en la línea crea la tarjeta, guardada en el modelo actual de notas y tarjetas. Así FSRS, el tutor y la bitácora siguen funcionando. Con una librería de editor ya hecha | Rehacer todo con apuntes como base, como RemNote. Es más fiel, pero reescribe la app y arriesga lo hecho | Alto |
| 3 | ⚠ Jerarquía de mazos y etiquetas | Los mazos son planos y la jerarquía de Paco quedó en etiquetas. 42 tienen espacio y al exportar a Anki se partirían | Mazos en árbol (ENARM 2027, rama, materia) y etiquetas en ruta (tema, subtema, aspecto) con espacios sustituidos por guion bajo. Migrar las 42 etiquetas y los mazos de Paco | Un solo nivel de mazos y todo lo demás en etiquetas. Más simple, pero filtra peor | Medio |
| 4 | No existe Explorar | La guía filtra por tema y subtema en Explorar. Studiare solo tiene selectores de rama y tema al repasar | Pantalla Explorar con filtros por árbol de mazos, etiquetas, estado y sanguijuelas, búsqueda de texto y acciones por lote (mover, etiquetar, suspender) | Solo filtros en Repasar. Más barato, pero no sirve para ordenar un mazo grande | Alto |
| 5 | ⚠ Atrasos contra una bitácora que solo se agrega | Un repaso registrado no se edita. Repartir o posponer cambia fechas sin tocar el pasado | Eventos nuevos de cambio de fecha (repartir en 1 a 7 días, posponer, adelantar) y un aviso de recuperación cuando haya muchas vencidas. La estabilidad de FSRS no se toca | Editar la fecha directamente. Más rápido, pero rompe la regla de la bitácora y la reconstrucción | Medio |
| 6 | Valores por defecto contra la decisión previa y el producto comercial | Ricardo fijó 21 días de intervalo máximo (D-064 y D-067). La guía pide 365 y 9999 nuevas al día, que para muchos alumnos sería una avalancha | Mantener el 21 por defecto y ofrecer un perfil guía de un toque (retención 90%, tope hasta la fecha del examen). Las nuevas por día se calculan según la carga proyectada y los minutos de cada alumno | Poner los valores de la guía por defecto. Más fiel a ella, pero sube la deserción de quien se satura | Medio |
| 7 | Días fáciles | El FSRS propio es determinista y sin variación aleatoria. Mover vencimientos cambia el algoritmo, y la guía misma lo advierte de otras funciones | Implementarlo al final de la Etapa 2, dentro del cálculo y probado con la simulación de carga que ya existe | Solo días sin tarjetas nuevas. Barato y no toca el algoritmo | Alto |
| 8 | Disciplina diaria | Hay dos contadores y no tres. No hay temporizador y el tiempo por tarjeta se corta a 24 horas. La sanguijuela marca pero nadie la corrige | Contadores de Nuevas, Aprendizaje y Programadas, temporizador opcional de 30 segundos con tope al tiempo registrado, y flujo de sanguijuelas con sugerencia de dividir o reescribir. El temporizador va apagado por defecto para no subir la ansiedad | Temporizador obligatorio. Entrena velocidad, pero choca con el manejo de la frustración (D-080) | Bajo a medio |
| 9 | Calidad de las tarjetas | Riesgo de tarjetas largas, con varias ideas o duplicadas, sobre todo si las genera la IA | Revisar al crear o importar con reglas que ya existen (listas largas), límite de largo y aviso de duplicado por texto normalizado | Sin revisión previa. Más rápido, pero más tarjetas malas | Bajo a medio |
| 10 | ⚠ IA que lee PDF | Choca con la regla de anclaje al banco. Implica mandar texto del alumno al modelo, costo por uso y escaneos sin texto | Con la opción B de la pregunta 11, el PDF se divide en secciones, cada una da 5 a 7 tarjetas en tabla editable y todo pasa por el validador de cita literal, cifras y dosis. Es función de pago con cuota diaria | La opción A, sin PDF. Más segura, pero menos versátil | Alto |
| 11 | ⚠ Mazos de Paco en un producto comercial | Paco autorizó su uso en la demo (D-053). Venderlos es otra cosa y el mazo de Fer no puede usarse | Conseguir licencia escrita de Paco para uso comercial o sustituirlos por contenido propio antes de cobrar. No es asesoría legal | Mantenerlos solo como demostración | Bajo en código, decisión de Ricardo |
| 12 | ⚠ Editar en varios dispositivos | Las notas y los mazos solo guardan fecha de creación. Al sincronizar, dos ediciones se pisarían | Fecha de modificación y marca de borrado desde la Etapa 1, y resolver conflictos con la edición más reciente al sincronizar | Dejarlo para el final. Menos trabajo hoy y mucho más caro después | Medio |
| 13 | Importar y exportar para dar versatilidad | Ya estaba planeado el importador de .apkg y de CSV, Excel y Word. No había exportación | Importar .apkg y CSV, y exportar a CSV con encabezados y un identificador por tarjeta para no duplicar al reimportar | Solo importar. Menos trabajo, pero el alumno queda atrapado | Alto |
| 14 | Qué es gratis y qué es de pago | El producto tiene plan Gratis con límites y referidos que dan un mes gratis | Una bandera de acceso por función. Se propone gratis para mazos en árbol, etiquetas, Explorar, contadores y atrasos, y de pago para la IA con PDF, con límites también en el servidor | Todo gratis menos la IA. Más simple, pero menos razones para pagar | Bajo |

### Lo que no se hace

- Instalar complementos de Anki, porque en Studiare esas funciones se construyen dentro.
- Poner 9999 nuevas al día por defecto.
- Delay Overdue, porque no se pudo confirmar que exista ni lo que hace, y la guía dice que altera el algoritmo.
- AnkiWeb, que lo reemplaza la sincronización propia con servidor.

### Respaldo antes de empezar

Como no hay datos reales, el riesgo está en el código y en la demo. Antes de cada etapa se deja una marca en el historial de código para poder volver atrás y se exportan los datos de la demo con el botón que ya existe. La demo se puede regenerar.

## 5. Pregunta 11 y su resolución

La regla vigente decía que la IA solo redacta tarjetas a partir del banco de preguntas, copia la frase exacta que las respalda y todo queda en borrador hasta que alguien lo apruebe. La guía propone darle PDF a la IA. Un PDF no pasa por el banco ni por un médico, así que podría colarse un error. Las opciones fueron.

- A. Dejar la regla como está.
- B. También con PDF y textos del alumno. Cada tarjeta copia la frase exacta del PDF, la app revisa que esa frase exista y que las cifras, dosis y fármacos coincidan, y la tarjeta queda siempre en borrador con la etiqueta de no validada por médico.
- C. Lo mismo que B, y además un médico de la plataforma puede validarlas para compartirlas.

**Ricardo eligió la B con una condición propia.** La IA nunca cambia por su cuenta lo que considera mal. Solo lo señala, con un texto que explica por qué se marca la controversia y que se apoya únicamente en textos académicos fundamentales del ENARM. El alumno puede marcar que ya lo verificó, y entonces la señal se va y queda registrada como evento, o editar esa misma tarjeta o pregunta.

## 6. Aprobación y alcance

Ricardo aprobó el plan con estas instrucciones.

- Pregunta 11 con la opción B y la regla de señalar sin corregir.
- Hacer todo lo que dice la columna de solución recomendada, los 14 elementos, sin distinción y sin importar el esfuerzo.
- Buscar en GitHub y npm bibliotecas o complementos que se puedan reutilizar, aunque haya que pagarlos. El resultado está en D-086.
- Subir todo al repositorio y dejar documentado lo conversado, que es este archivo.

### Etapas

Cada etapa termina con pruebas, capturas, revisión independiente según 15.1 y la aprobación de Ricardo antes de seguir.

| Etapa | Contenido | Filas |
|---|---|---|
| 0 | Cerrar la Fase C con los arreglos de la revisión, la corrida final y la aprobación | |
| 1 | Organización. Mazos en árbol, etiquetas en ruta, Explorar, tipos de nota nuevos (básica con inversa, cloze anidado), revisión de calidad y fecha de modificación | 3, 4, 9, 12 |
| 2 | Carga diaria. Tres contadores, perfil guía de un toque, temporizador opcional, flujo de sanguijuelas, herramientas para atrasos y al final los días fáciles | 5, 6, 7, 8 |
| 3 | Apuntes tipo RemNote. Editor en esquema con marcas rápidas para crear tarjetas, enlaces entre apuntes y etiquetas. Las marcas de RemNote se verificaron en su centro de ayuda. No se copia su código, solo las ideas | 2 |
| 4 | Importar y exportar. .apkg y CSV primero, Excel y Word después, y exportación a CSV | 13 |
| 5 | IA para tarjetas desde PDF y textos, con la señal de controversia sin corregir. Corre en modo simulado hasta que haya clave | 10 |
| 6 | Sincronización entre dispositivos, la nube parte 2, preparada desde la Etapa 1 | |

Transversales. La fila 11 (licencias) y la fila 14 (qué es gratis y qué es de pago) son decisiones de Ricardo que se necesitan antes de cobrar y antes de la Etapa 2.

## 7. Reglas V2 aplicadas al plan

- Las funciones de organización no tocan el simulador imperfecto ni el muestreo dirigido.
- Cada función tiene su bandera de acceso, con los límites del plan Gratis también en el servidor, y la IA con PDF es solo de pago.
- Para evitar código espagueti, los cálculos nuevos (cambio de fechas, carga, calidad de tarjetas) van como motores puros, con una pantalla por tarea y los eventos nuevos en un solo catálogo.
- La IA opera sobre lo que ya está etiquetado y nunca clasifica datos en bruto en tiempo real. El texto del alumno que viaja al modelo pasa por el filtro de datos personales y por una cuota por plan.

## 8. Pendientes con Ricardo

- La lista de textos académicos fundamentales para las señales de la IA. Se propone una lista provisional que confirma él o un médico.
- La licencia de Paco para uso comercial, porque D-053 solo cubre la demostración.
- Qué funciones son gratis y cuáles de pago.
- Qué cuenta como referido concretado y el segundo proveedor de LLM, como en D-080.
