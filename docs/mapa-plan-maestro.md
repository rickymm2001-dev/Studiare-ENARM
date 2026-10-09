# Mapa de lo que falta contra las rebanadas del plan maestro

Fase F, sección 17 de la especificación. Compara cada rebanada del plan maestro de Ricardo con lo que deja listo el prototipo hoy y lo que falta para producción. Parte de la tabla de la especificación y la actualiza con lo que se construyó después. Fecha de esta versión, 2026-10-09.

Las funciones marcadas con la nube dependen de que Ricardo aplique las migraciones de Supabase y configure el proyecto con docs/SUPABASE.md.

| Rebanada del plan maestro | Qué deja listo el prototipo | Qué falta para producción |
|---|---|---|
| R1 Cuenta, consentimientos, exportar y borrar | Cuenta con enlace al correo en Supabase, consentimientos por finalidad que se dan y se retiran, exportar en JSON y borrar datos y cuenta, también en la nube (D-101) | Proveedor de correo propio, aviso de privacidad revisado por un abogado y plazos de conservación |
| R2 Banco y panel de médicos con versiones | Panel completo. Editor con versiones y estados, doble etiquetado a ciegas con acuerdo, reportes, cola de borradores e importador del banco. Roles y permisos por fila en Supabase | Aplicar las migraciones en el proyecto de Ricardo y subir el banco a Supabase. El campo de variantes aún no existe en el esquema de la nube |
| R3 Hasta 10 opciones con etiqueta de sesgo | Completo. El esquema acepta de 4 a 10 opciones y la interfaz habla de trampas hasta que el acuerdo permite hablar de sesgos | Etiquetas aprobadas por médicos |
| R4 Repaso con FSRS sin conexión y sincronización | Repaso sin conexión y sincronización entre dispositivos con un solo dispositivo activo por cuenta | Mezcla campo por campo cuando dos dispositivos editan lo mismo, y medios de las tarjetas |
| R5 Confianza, causa y señales de conducta | Completo. La pregunta de confianza viene apagada por defecto (D-087) | Nada en lo funcional |
| R6 Simulador por rama y examen completo | Completo. Práctica y examen con navegación, marcas, descarte de opciones y alarmas de tiempo y de ritmo | Contenido validado |
| R7 Simuladores por dificultad y por sesgo | Completo con datos simulados. El muestreo dirigido sube las opciones con las trampas a las que el alumno es propenso | Respuestas reales para calibrar |
| R8 Análisis por tema, sesgo y estructura | Completo con datos simulados, con las funciones en estado calibrando hasta su umbral | Datos reales y acuerdo medido entre médicos |
| R9 Racha, calendario y planificador | Completo | Nada en lo funcional |
| R10 Widgets con heatmap y Pomodoro | Completo, con tablero que el alumno acomoda | Nada en lo funcional |
| R11 XP y niveles | Completo, con misiones, ligas e insignias | Ajuste con alumnos reales y ligas con grupos de pares |
| R12 Puntaje y Party | Grupos con tabla semanal y retos. Sin la nube, con amigos simulados. Con ella, referidos con mes gratis | Tiempo real y términos legales |
| R13 Importador .apkg | Completo. También CSV, Excel y Word, con límites contra bombas zip | Términos para mazos subidos |
| R14 Resaltado de negaciones | Completo | Nada en lo funcional |
| R15 Reporte de errores de contenido | Completo. El alumno reporta y el médico resuelve, descarta o reabre | Aviso por correo al médico y que el médico asignado vea los reportes en Supabase |
| R16 Pagos | Stripe y Mercado Pago en modo prueba, con funciones del servidor que verifican la firma. Sin la nube, el checkout es simulado y lo dice | Desplegar las funciones, llaves de producción y renovación automática con Mercado Pago |
| R17 Puntaje oficial | Captura voluntaria con el permiso de mejora anónima, que se borra al retirarlo | Subirlo a la nube anonimizado, si se decide |
| R18 Motor de IA de olvidos | Completo en modo simulado y listo para la clave de Ricardo | Compuerta 1 del plan maestro, que audita con 2 médicos 300 textos generados por la IA, y medir el costo real con npm run eval-ai |
| R19 Generador de flashcards | Completo. Cada tarjeta cita la frase literal que la respalda y queda en borrador | Compuerta 1 del plan maestro |
| R20 Consejos por sesgo | Con textos borrador que el médico aprueba, edita o rechaza | Textos escritos por médicos |
| R21 Apps nativas | Descartada, todo vive como página web | Nada |
| R22 Calibración con Rasch y Elo | Completo con datos simulados. Recupera los parámetros verdaderos con correlación de 0.98 | Respuestas reales |

## Lo que se agregó y el plan maestro no pedía

- Organización de mazos en árbol, carga diaria, días fáciles y reprogramación (Fase C2)
- Apuntes en esquema que se vuelven tarjetas (D-092)
- Sincronización entre dispositivos (D-095)
- Plan Gratis aplicado en el servidor y referidos (D-096)
- Variantes de preguntas reestructuradas por la IA, que no llegan al examen hasta tener 200 exposiciones por distractor (D-099)
- Presupuesto de JavaScript inicial, política de seguridad de contenido y revisión contra ASVS (Fase F)

## Lo que decide Ricardo

- Aplicar las migraciones de Supabase y probar con una cuenta de prueba
- Poner la clave de IA en server/.env.local y correr npm run eval-ai con la clave
- Confirmar la lista de textos académicos, el segundo proveedor de IA y qué cuenta como referido concretado
- Aprobar la publicación en Cloudflare Pages (D-017)
- Comprar el dominio propio
- Que médicos revisen el banco y los textos de IA
