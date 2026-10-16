# Real contra simulado, función por función

Fase F, sección 17 de la especificación. Para cada función dice qué hace de verdad hoy, qué es de demostración y qué falta para producción. Fecha de esta versión, 2026-10-10. Incluye las Fases G y H. Las filas de IA, de la auditoría y de los costos de la nube están al día con el bloque B12 (2026-10-15).

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
| Proxy de IA local | En 127.0.0.1, solo para desarrollo. Límites por alumno y por motor, presupuesto diario, filtro de datos personales, cola de lotes en memoria y la compuerta siempre abierta, con la IA simulada y su etiqueta | Real | Nada, es la herramienta de desarrollo |
| Proxy de IA alojado | Dos Edge Functions de Supabase, ai-proxy y ai-batch, con el mismo núcleo que el local (B12). Piden la sesión de Supabase en cada llamada, un plan de pago o un rol de equipo, y aplican la compuerta, la pausa, los límites y la bitácora, que viven en Postgres. La app arma su dirección con la de Supabase, sin variables nuevas | Programado y probado con Supabase y Anthropic simulados, también en el navegador | Aplicar las migraciones, desplegar las funciones en modo simulado, que Ricardo ponga la clave y probar con ella como médico (docs/IA_ALOJADA.md) |
| Compuerta 1 y Auditoría de la IA | Cada motor nace cerrado para los alumnos. Dos médicos califican a ciegas una muestra de textos de la IA y la base calcula si cada motor pasa. El admin abre los que pasaron. Cambiar el modelo, el razonamiento o el prompt de un motor abierto lo cierra hasta una auditoría corta. Médicos y administradores usan todo para auditar | Real con la nube, probado con una nube simulada | Que dos médicos auditen la muestra de 300 textos que arma npm run ai:gate-sample |
| Hipótesis de olvidos | Sale de reglas sobre los errores y la IA solo redacta la explicación, por lote a mitad de costo. La app la pide, la hipótesis sigue con su plantilla y la explicación llega en una hora o hasta en un día, siempre en borrador | Simulado hasta que haya clave, y real con ella | Correr npm run eval-ai con la clave para elegir los modelos, y la compuerta 1 |
| Informe semanal y consejos por sesgo | Se piden una vez al momento y valen 7 días. Un consejo solo se redacta sobre un texto base que un médico ya revisó cuando la app corre en producción | Simulado hasta que haya clave, y real con ella | Lo mismo, y que un médico revise los textos base de los consejos |
| Tarjetas desde PDF y texto | Se generan por secciones, cada tarjeta cita la frase literal que la respalda y queda en borrador. Hay un tope de generaciones por día que aplica el servidor y, con la compuerta cerrada, el botón no aparece para alumnos | Simulado hasta que haya clave, y real con ella | Revisión médica y la compuerta 1 |
| Preguntas reestructuradas | Solo de preguntas marcadas, con un reporte de error abierto o un distractor que casi nadie elige. La propuesta llega a la cola del médico como borrador con la original al lado y nunca la reemplaza. Es solo del equipo | Simulado hasta que haya clave, y real con ella | La compuerta 1 y médicos que revisen la cola |
| Sin IA, o sin proxy | En producción la app usa sus plantillas y no habla de IA. Las respuestas fijas del propio cliente quedan solo en desarrollo y en la demo, con su etiqueta | Real | Nada en lo funcional |
| Textos académicos de las señales de controversia | Lista cerrada provisional | Pendiente de Ricardo | Que Ricardo o un médico confirmen la lista |
| Segundo proveedor de IA | OpenAI solo para comparar la calidad en las evaluaciones con npm run eval-ai. Nunca llega a producción ni al navegador | Pendiente de Ricardo | Su clave, que vive fuera del repositorio, y elegir los dos modelos de la comparación |
| Demo publicada | En la base de demostración no llama a la función. Usa respuestas fijas de IA con la etiqueta de IA simulada, así no gasta presupuesto ni choca con la compuerta | Simulado | Nada, es lo esperado de una demo |

## Dinero

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Suscripción y checkout | Sin nube, planes y recibo simulados, marcados como tal | Simulado | Conectar la nube |
| Pagos con Stripe y Mercado Pago | Funciones del servidor que crean el pago, verifican la firma del aviso y activan el plan | Modo prueba | Desplegar las funciones, llaves de producción y probar con un pago de prueba real |
| Cancelar y cambiar tarjeta | El botón Administrar suscripción abre el portal de Stripe del alumno (D-106) | Programado, sin probar contra Stripe | Activar el portal en el panel de Stripe, aplicar la séptima migración, publicar la función y probarlo con un pago de prueba |
| Plan Gratis | Tope de 20 preguntas distintas por día aplicado en la base de datos | Real con la nube | Conectar el banco a Supabase |
| Referidos y mes gratis | Código por alumno, mes gratis al primer pago verificado | Real con la nube | Confirmar con Ricardo qué cuenta como referido concretado |
| Renovación automática con Mercado Pago | No está. Cobra un pago único del periodo | Pendiente | Suscripciones de Mercado Pago |
| Reembolsos | Un reembolso completo de Stripe o de Mercado Pago marca el pago como devuelto y quita el plan. Uno parcial lo atiende una persona. La devolución misma se hace a mano en la pasarela | Programado, sin probar contra Stripe | Probar con un reembolso de prueba real. Decidir si se quiere devolver desde la app |

## Médicos y administración

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Editor de pregunta con versiones | Cada guardado crea una versión nueva en borrador y el médico edita solo lo asignado | Real | Roles reales ya existen con la nube |
| Doble etiquetado con acuerdo | A ciegas, con kappa por etiqueta y su intervalo | Real | Médicos reales etiquetando |
| Cola de borradores de IA | El médico aprueba o rechaza preguntas reestructuradas, consejos y tarjetas. Pedir una propuesta con IA solo se puede en una pregunta marcada | Real | Nada en lo funcional |
| Importador del banco | CSV, Excel o JSON con reporte de errores por fila | Real | Importar casos seriados |
| Usuarios y roles | Con la nube conectada lista las cuentas reales de Supabase, con su correo, plan y rol, y cambia el rol con las reglas del servidor (D-108). Sin la nube trabaja sobre los perfiles del navegador | Real con la nube | Aplicar la novena migración |
| Asignar preguntas a un médico | El admin elige subespecialidades y se le asignan sus preguntas. Hoy vive en el navegador donde se hace | Real sin la nube. No llega a la nube | Que el banco viva en Supabase (docs/BANCO_EN_LA_NUBE.md) |
| Aviso de privacidad nuevo | Cuando cambia la versión, una franja pide aceptarla de nuevo y deja constancia sin cambiar los permisos | Real | Nada en lo funcional |
| Costos de IA, datos de demostración y configuración | Gasto real y teórico del proxy local, y con la nube el costo de la IA alojada por motor, por modo (al momento o por lote) y por alumno al mes, sin el texto de nadie. Siembra de alumnos simulados, umbrales y pesos. Con la nube, la configuración vive en el servidor y vale para todos (D-105). Los modelos, los precios y los límites de la IA se cambian ahí y avisan cuándo cierran un motor para los alumnos | Real, y real con la nube | Nada en lo funcional |

## Textos legales y errores

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Aviso de privacidad y términos | Dos páginas públicas con un solo texto que también sale en docs/legal. Dicen arriba que son un borrador (D-104) | Borrador | Responsable, domicilio y correo de privacidad, y revisión de un abogado |
| HSTS | Va en el archivo de encabezados del build por un año (D-107) | Real en Cloudflare Pages | Publicar en Cloudflare Pages y dominio propio |
| Errores del navegador | Se reportan sin datos personales, solo con el permiso de mejora anónima, y los ve el admin en la pantalla 25 (D-107) | Real con la nube | Aplicar la octava migración. No sustituye un monitoreo con alertas |

## Plataforma

| Función | Hoy | Etiqueta | Qué falta para producción |
|---|---|---|---|
| Página web e instalación como PWA | Funciona completa en el navegador. Instalarla es opcional | Real | Nada |
| Sin conexión | Abre y se navega sin red después de la primera carga. La IA avisa que necesita conexión | Real | Nada |
| Alumnos y amigos de Party | Grupos con tabla semanal y retos. Los amigos de la demo son simulados | Simulado en la demo, real con la nube | Tiempo real y términos legales |
| Demo en GitHub Pages | Publicada con cada push a main, con IA simulada que no llama a la función | Simulado | Dominio propio |
| Demo en Cloudflare Pages | El build ya trae el archivo de encabezados. Falta publicar | Pendiente de Ricardo | Cuenta de Cloudflare y aprobación de Ricardo para publicar (D-017) |
| Apps nativas | Descartadas. Todo vive como página web | Descartada | Nada |
