# Real contra simulado, función por función

Fase F, sección 17 de la especificación. Para cada función dice qué hace de verdad hoy, qué es de demostración y qué falta para producción. Fecha de esta versión, 2026-10-09.

## Cómo leer las etiquetas

- Real. Funciona con datos y reglas de verdad, aunque el contenido sea de demostración
- Real con la nube. Funciona de verdad cuando el proyecto de Supabase está configurado y sus migraciones aplicadas. Sin la nube la función cae a su versión local
- Modo prueba. Corre el flujo completo contra el entorno de pruebas de un tercero, sin cobrar dinero real
- Simulado. Es de demostración y la interfaz lo dice con una etiqueta visible
- Pendiente de Ricardo. Necesita una decisión, una llave o un proyecto que solo Ricardo puede poner

Todo contenido de demostración y todo dato simulado lleva una etiqueta visible en la app. Las respuestas de IA del modo simulado son fijas y están marcadas como borrador, no validadas por un médico.

## Cuenta, datos y privacidad

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Inicio de sesión | Con Supabase, enlace al correo sin contraseña. Sin Supabase, perfil local simulado | Real con la nube | Proveedor de correo propio, segundo factor para médicos y administradores (docs/asvs.md) |
| Roles y permisos | Permisos por fila en la base, roles asignados por el servidor, dueño fijo y bitácora de cambios de rol. En local, un selector de rol | Real con la nube | Aplicar las migraciones en el proyecto de Ricardo (docs/SUPABASE.md) |
| Un dispositivo por cuenta | La base rechaza al dispositivo desplazado y limita los cambios a 3 por día | Real con la nube | Nada en lo funcional |
| Sincronización entre dispositivos | Tarjetas, mazos, apuntes y bitácora viajan por Supabase, con la fecha más reciente como regla | Real con la nube | Mezcla campo por campo, medios de las tarjetas y sesiones de estudio |
| Consentimientos | Por finalidad, con su evento, y se pueden retirar cuando se quiera | Real | Aviso de privacidad revisado por un abogado |
| Exportar mis datos | Un archivo JSON con perfil, consentimientos, bitácora, tablero, contenido y puntaje oficial | Real | Nada en lo funcional |
| Borrar mis datos y eliminar la cuenta | Borra el dispositivo y, con la cuenta conectada, también la nube. Eliminar la cuenta quita el correo, el plan y los referidos | Real con la nube | Aplicar la quinta migración. Plazos de conservación |
| Puntaje oficial del ENARM | Voluntario, uno por alumno, solo con el permiso de mejora anónima. Vive en el navegador | Real | Subirlo a la nube anonimizado, si se decide medir con datos reales |

## Estudio

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Repaso de tarjetas con FSRS | Programación con ts-fsrs, tres contadores, días fáciles, carga diaria y reprogramación | Real | Nada en lo funcional |
| Mazos, árbol y etiquetas | Mazos en árbol, etiquetas, Explorar y organización | Real | Nada en lo funcional |
| Apuntes en esquema | Árbol de líneas con marcas que se vuelven tarjetas | Real | Nada en lo funcional |
| Importar mazos de Anki y archivos | Anki (.apkg), CSV, Excel y Word, con límites contra bombas zip | Real | Términos para mazos subidos |
| Mazos precargados | Tres mazos de Paco, compartidos con su autorización | Simulado, sin validar | Revisión médica de las tarjetas |
| Simulador por rama, dificultad, trampa y estructura | Práctica y examen completo con navegación, marcas, descarte de opciones y alarmas | Real | Contenido validado |
| Banco de preguntas | 200 preguntas escritas por IA, con etiqueta de demostración y pendientes de revisión médica | Simulado, sin validar | Banco real validado por médicos. El borrador de 1500 preguntas está en pausa |
| Resaltado de negaciones | Configurable en práctica y en examen | Real | Nada en lo funcional |
| Reporte de error de contenido | El alumno reporta y el médico resuelve, descarta o reabre | Real | Aviso por correo al médico |

## Motores de análisis

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Calibración con Rasch y Elo | Estimaciones de dificultad y habilidad. Recuperan los parámetros verdaderos de alumnos simulados con correlación de 0.98 | Real sobre datos simulados | Respuestas reales de alumnos |
| Sesgos, mala lectura de negaciones y fatiga | Detección con las metas de la sección 14.2. Sesgos y mala lectura cumplen. La fatiga por tercios no llega a su meta y su informe lo dice | Real sobre datos simulados | Datos reales y acuerdo medido entre médicos |
| Etiquetas de sesgo y trampas | Los alumnos ven trampas hasta que haya 30 pares de etiquetas con acuerdo de 0.40 o más | Real | Etiquetas aprobadas por médicos |
| Tutor sin IA | Hipótesis por reglas sobre los errores de 14 días, con evidencia y acciones de una lista cerrada | Real | Nada en lo funcional |
| Planificador, racha, XP, niveles y widgets | Plan del día, racha, calendario, mapa de calor y Pomodoro | Real | Ajuste del XP con alumnos reales |
| Misiones, ligas e insignias | Escalera personal por XP semanal | Real | Ligas con grupos de pares, que piden servidor y alumnos |
| Funciones que dependen de datos | Muestran el estado calibrando hasta llegar a su umbral | Real | Nada en lo funcional |

## IA

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Proxy de IA | Local, en 127.0.0.1, con límites por alumno y por motor, presupuesto diario y filtro de datos personales | Real | Un proxy alojado, si la IA se ofrece fuera del equipo del desarrollador |
| Hipótesis de olvidos, informe semanal, tarjetas, consejos por sesgo y preguntas reestructuradas | Sin clave corren con respuestas fijas que cumplen los mismos contratos. Con la clave de Ricardo llaman al modelo | Simulado, y real con la clave | Correr npm run eval-ai con la clave para medir costo y latencia reales, y la compuerta 1 del plan maestro con dos médicos |
| Tarjetas desde PDF y texto | Cada tarjeta cita la frase literal que la respalda y queda en borrador | Simulado, y real con la clave | Revisión médica |
| Textos académicos de las señales de controversia | Lista cerrada provisional | Pendiente de Ricardo | Que Ricardo o un médico confirmen la lista |
| Segundo proveedor de IA | No está | Pendiente de Ricardo | Confirmar el proveedor |
| Demo publicada | Sin proxy, con respuestas fijas de IA | Simulado | Nada, es lo esperado de una demo |

## Dinero

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Suscripción y checkout | Sin nube, planes y recibo simulados, marcados como tal | Simulado | Conectar la nube |
| Pagos con Stripe y Mercado Pago | Funciones del servidor que crean el pago, verifican la firma del aviso y activan el plan | Modo prueba | Desplegar las funciones, llaves de producción y probar con un pago de prueba real |
| Plan Gratis | Tope de 20 preguntas distintas por día aplicado en la base de datos | Real con la nube | Conectar el banco a Supabase |
| Referidos y mes gratis | Código por alumno, mes gratis al primer pago verificado | Real con la nube | Confirmar con Ricardo qué cuenta como referido concretado |
| Renovación automática con Mercado Pago | No está. Cobra un pago único del periodo | Pendiente | Suscripciones de Mercado Pago |
| Reembolsos | Los de Mercado Pago quitan el plan. Los de Stripe se resuelven a mano | Pendiente | Reembolso automático de Stripe |

## Médicos y administración

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Editor de pregunta con versiones | Cada guardado crea una versión nueva en borrador y el médico edita solo lo asignado | Real | Roles reales ya existen con la nube |
| Doble etiquetado con acuerdo | A ciegas, con kappa por etiqueta y su intervalo | Real | Médicos reales etiquetando |
| Cola de borradores de IA | El médico aprueba o rechaza preguntas reestructuradas, consejos y tarjetas | Real | Nada en lo funcional |
| Importador del banco | CSV, Excel o JSON con reporte de errores por fila | Real | Importar casos seriados |
| Usuarios y asignaciones | El administrador nombra médicos y asigna preguntas | Real con la nube | Nada en lo funcional |
| Costos de IA, datos de demostración y configuración | Gasto real y teórico, siembra de alumnos simulados, umbrales y pesos | Real | Que la configuración viva en el servidor y no en el navegador de quien la cambia |

## Plataforma

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Página web e instalación como PWA | Funciona completa en el navegador. Instalarla es opcional | Real | Nada |
| Sin conexión | Abre y se navega sin red después de la primera carga. La IA avisa que necesita conexión | Real | Nada |
| Alumnos y amigos de Party | Grupos con tabla semanal y retos. Los amigos de la demo son simulados | Simulado en la demo, real con la nube | Tiempo real y términos legales |
| Demo en GitHub Pages | Publicada con cada push a main, con IA simulada | Simulado | Dominio propio |
| Demo en Cloudflare Pages | El build ya trae el archivo de encabezados. Falta publicar | Pendiente de Ricardo | Cuenta de Cloudflare y aprobación de Ricardo para publicar (D-017) |
| Apps nativas | Descartadas. Todo vive como página web | Descartada | Nada |
