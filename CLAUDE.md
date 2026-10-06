# Proyecto
Prototipo funcional de una plataforma integral para preparar el ENARM, en español de México.
La especificación completa vive en docs/PROMPT_PROTOTIPO.md. El plan vigente vive en PLAN.md, el avance en PROGRESS.md y las decisiones en DECISIONES.md.
Si algo es ambiguo o contradice la especificación, pregunta a Ricardo antes de suponer.

# Stack
Página web (PWA) con Vite, React y TypeScript estricto. FSRS con ts-fsrs. Datos locales en IndexedDB con Dexie y esquemas con zod.
Tailwind y componentes accesibles. Vitest para pruebas unitarias y Playwright para pruebas de punta a punta.
Un servidor local pequeño en la carpeta server hace de proxy hacia la API de Claude. La clave vive solo ahí.

# Comandos
- npm run dev levanta la app y el proxy juntos
- npm run check corre typecheck, lint y pruebas unitarias
- npm run e2e corre Playwright
- npm run eval-ai corre las evaluaciones de los motores de IA

# Reglas que no se rompen
- IMPORTANT. Ningún secreto en el código, en el repo ni en el bundle del cliente. La clave se llama ENARM_ANTHROPIC_KEY y vive en server/.env.local
- IMPORTANT. Nunca crees, leas ni sugieras la variable ANTHROPIC_API_KEY
- Los eventos de repaso y de respuesta solo se agregan, nunca se editan ni se borran
- Todo texto médico que genere la IA va anclado al banco, cita la frase que lo respalda y queda en borrador hasta que alguien lo apruebe
- Las funciones que dependen de datos muestran estado calibrando hasta llegar a su umbral
- Nada de chat libre con IA ni predicción del puntaje ENARM
- Todo vive como página web que funciona completa en el navegador. Instalarla como PWA es opcional. Nada de apps nativas ni de tienda
- Al LLM solo viajan IDs seudónimos y texto del banco, nunca nombres ni correos
- Todo contenido de demostración y todo dato simulado lleva una etiqueta visible
- Los motores en src/engines son funciones puras, sin React ni Dexie
- Interfaz en español de México con trato de tú. Código y nombres en inglés
- Antes de usar la API de una librería, revisa su documentación vigente
- No instales nada global ni cambies la configuración del sistema sin preguntar

# Filosofía del producto (V2, D-080)
- El objetivo es enseñar a contestar el ENARM y no solo medicina. Entrena el descarte de opciones y el manejo de la frustración ante preguntas que el alumno no sabe, para que use la lógica y no solo la memoria
- El simulador es imperfecto a propósito, como el examen real. El esquema y la ingesta aceptan reactivos patognomónicos y característicos, de resolución inversa, con incoherencias, de control, con datos oscuros y desde la perspectiva del paciente, y ningún validador los rechaza por no ser perfectos
- El muestreo dirigido sube las opciones con los sesgos a los que el alumno es propenso, y el simulador avisa según el tiempo restante para entrenar la presión del examen
- La IA opera detrás de la base de datos sobre datos que el médico ya etiquetó, incluidos los sesgos. Nunca clasifica datos en bruto en tiempo real
- El plan Gratis tiene límites estrictos al banco y se aplican también en el servidor. Los referidos viven en Party y dan un mes gratis automático desde el servidor
- Antes de proponer un bloque de código, un esquema o validar un lote, revisa en silencio que soporte la imperfección y los sesgos, que integre freemium y referidos, y que evite el código espagueti. Resume a Ricardo cómo se aplica al bloque
- Pendiente de confirmar con Ricardo en D-080 el LLM de OpenAI como segundo proveedor y qué cuenta como referido concretado. Mientras tanto rigen las reglas de arriba

# Flujo
- Trabaja por fases. Al cerrar cada fase sigue la sección 15.1 de la especificación y detente a esperar aprobación
- En fases grandes haz commit y actualiza PROGRESS.md al terminar cada bloque, para poder seguir después de un /clear, de una compactación o de un límite de uso
- Si fallas dos veces en corregir lo mismo, detente, documenta en PROGRESS.md y pregunta
- Ideas fuera del alcance van a IDEAS.md, no al código

# Cómo hablar con Ricardo
- Español, con términos técnicos en inglés explicados en pocas palabras
- Viñetas fáciles de escanear, tono profesional y cercano, sin exagerar resultados
- Si hay opciones, recomienda una y justifícala en una línea
- En mensajes y documentos para él no uses el signo de dos puntos. En el código sí
