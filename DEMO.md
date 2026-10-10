# Guion de la demo, 10 minutos

Recorre cada motor y cada gadget del prototipo. No necesitas ayuda ni terminal si usas la demo publicada. Todo lo que ves en la demostración es simulado y lleva una etiqueta que lo dice.

## Antes de empezar

- Demo publicada. https://rickymm2001-dev.github.io/Studiare-ENARM/ , sin instalar nada
- En tu computadora. Corre npm ci una sola vez y luego npm run dev. Abre http://127.0.0.1:5173
- Mejor en Chrome o Edge. En el teléfono funciona igual, y en iPhone la instalación como app pide agregar la página a la pantalla de inicio
- La IA de la demo corre con respuestas fijas de demostración. Si pones tu clave en server/.env.local, el proxy local llama al modelo real y la insignia de IA cambia a IA real

## Preparación, 1 minuto

1. Abre Configuración y entra a la sección Cuenta
2. En Cuenta activa elige Demostración
3. En Datos de demostración da clic en Generar datos de demostración. Tarda unos segundos y crea al alumno de demostración con 60 días de historial, 300 alumnos simulados y los mazos de Paco
4. Cuando diga Listo, sigue. Arriba verás siempre el aviso de que estás en la demostración

## Minuto 1. Inicio

- Abre Inicio. Verás el tablero de widgets con el mapa de calor de estudio, la racha, el XP y el nivel, la cuenta regresiva al ENARM, Para hoy y la meta del día
- Da clic en Editar tablero. Agrega, quita y acomoda widgets, o prueba un acomodo predefinido como Esencial o Analítico
- Abre el Pomodoro y mira que se puede minimizar y que el sonido y el aviso se apagan

## Minuto 2. Repasar con FSRS

- Abre Repasar y elige un mazo. Verás los tres contadores, Nuevas, Aprendizaje y Programadas
- Muestra la respuesta con Espacio y califica con las teclas 1 a 4. Con 1, Otra vez, la app pregunta la causa del fallo
- Prueba el Pomodoro y la carga diaria. Más abajo, en Configuración, Estudio, ajustas retención, días fáciles y tarjetas nuevas por día

## Minutos 3 y 4. Simular

- Abre Simular y arma una práctica. Puedes filtrar por rama, dificultad, trampa o estructura
- En la pregunta, las negaciones salen resaltadas y puedes reportar un error de contenido, que le llega al médico. Si activas la pregunta de confianza en Configuración, Estudio, también te la hace
- Al final ves la retroalimentación: por qué atrae la opción que elegiste, la causa del error y un botón para generar tarjetas
- Abre Resumen de sesión y mira el XP, la exactitud, el tiempo y los hallazgos nuevos
- Entra al Examen completo con 20 preguntas. Puedes descartar opciones y marcar preguntas para revisar, y verás el reloj, el aviso de poco tiempo y el de ritmo. Al terminar, Resultados del examen separa por rama, tema, estructura y trampa, y manda tus errores al repaso

## Minuto 5. Progreso

- Abre Progreso. Verás la exactitud por rama y tema, el tiempo, la técnica de examen y la confianza
- Las funciones que aún no tienen suficientes datos muestran el estado calibrando, con lo que falta para salir de él. No son errores
- Las cifras salen de los motores de Rasch y Elo, que recuperan los parámetros de los alumnos simulados

## Minuto 6. Tutor

- Abre Tutor. Verás hipótesis sobre tus errores de los últimos 14 días, cada una con su evidencia y acciones de una lista cerrada. La IA nunca corrige por su cuenta lo que considera mal, solo lo señala
- Marca cada hipótesis con Me sirve o No me ayuda, mira su evidencia, aplica una de las acciones y revisa tu resumen y los consejos por trampa
- Fíjate en las etiquetas. Lo que redacta la IA lleva la marca de borrador, no validado por un médico, y la insignia de IA simulada. El análisis con IA se enciende con el botón Encender análisis con IA, que es el permiso de análisis con IA y se retira en Configuración, Privacidad

## Minuto 7. Mazos, Explorar y Apuntes

- Abre Mazos. Verás el árbol de mazos, y puedes seguir los mazos de Paco o importar un archivo de Anki, CSV, Excel o Word
- En Explorar buscas tarjetas por texto, etiqueta o estado, y las suspendes o reanudas
- En Apuntes escribes un esquema con marcas, por ejemplo hipertensión >> presión arterial alta, y se vuelve tarjeta
- En un mazo, la tarjeta con IA genera tarjetas desde un texto o un PDF. Cada una cita la frase literal que la respalda y queda en borrador

## Minuto 8. Planificador, Party y Logros

- Planificador. Con la fecha del ENARM y los minutos que tienes al día, arma el Plan de hoy con repasos, tarjetas nuevas y práctica
- Party. Los grupos con tabla semanal y retos, y los duelos. En la demo, los amigos son simulados y llevan la etiqueta
- Logros. Las misiones de la semana, la liga semanal por XP y las insignias, con la tarjeta de logro para compartir

## Minuto 9. Médico y administración

1. Abre Cambiar de rol y elige Médico. En Mi cuenta con la nube configurada el rol lo da el servidor, así que este paso es del prototipo
2. Banco de preguntas. Mira el banco con sus estados y abre una pregunta en el Editor de pregunta. Cada guardado crea una versión nueva en borrador
3. Acuerdo del etiquetado. Mira el doble etiquetado a ciegas y el acuerdo por etiqueta. Sin etiquetas mide nada y dice calibrando
4. Borradores de IA. Aprueba o rechaza una pregunta reestructurada, un consejo por sesgo o una tarjeta de un mazo público
5. Reportes de contenido e Importar banco, con la plantilla de Excel y el reporte de errores por fila
6. Vuelve a Cambiar de rol y elige Admin. Costos de IA, Datos de demostración, Configuración con los umbrales y pesos, y Usuarios

## Minuto 10. Privacidad y sin conexión

- Vuelve a Cambiar de rol y regresa a Alumno. Abre Configuración y entra a Privacidad. Da y retira cada permiso, y guarda un puntaje oficial de ejemplo, que se borra si retiras la mejora anónima
- En Cuenta, descarga tus datos en un archivo JSON. Borrar mis datos y Eliminar mi cuenta están ahí. En la demostración borrar no toca tu cuenta real
- Corta la conexión del navegador y recarga. La app abre y se navega sin red. La insignia de IA cambia a IA sin conexión, y lo demás sigue funcionando

## Si algo no sale

- La demo se ve vacía. Falta Generar datos de demostración, en Configuración, Cuenta, con Demostración activa
- No ves a un médico o administrador. En la demostración y en Mi cuenta sin nube el rol se cambia en Cambiar de rol. Con una cuenta en la nube, el rol lo da el servidor
- Quieres empezar de cero. En Datos de demostración da clic en Regenerar desde cero. Tu cuenta real no se toca
