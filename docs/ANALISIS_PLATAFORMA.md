# Análisis para convertir el prototipo en una plataforma vendible

Fecha 2026-10-02. Autor Claude, para Ricardo. Es una propuesta. Nada de esto cambia el código hasta que Ricardo lo apruebe en la entrevista.

## 1. Resumen en una página

- Hoy el prototipo es una página que funciona completa en el navegador, con datos solo en ese navegador, inicio de sesión simulado y pagos simulados. Sirve para enseñar la idea, no para vender
- Para venderlo hacen falta cuatro piezas que hoy no existen
  - Cuentas reales con correo, recuperación de acceso y roles que solo da un administrador
  - Una base de datos en servidor que guarde todo, sincronice entre teléfono y computadora y aplique permisos por rol
  - Cobro real con tarjeta, OXXO o transferencia, con recibos y factura
  - Un banco de preguntas revisado por médicos, que es el producto en sí
- El diferenciador que propongo no es tener más preguntas que la competencia. Es enseñarle a cada alumno **cómo lee y cómo contesta**, con estadísticas que ningún curso tradicional le da, y hacerlo con una capa de juego social que lo haga volver cada día
- Recomendación de arquitectura en una línea. Supabase como servidor (cuentas, base de datos Postgres, archivos y permisos por fila), la app actual como cliente, Dexie como copia local para estudiar sin conexión, y Stripe o Mercado Pago para cobrar

## 2. Perfiles de alumno del ENARM

Escrito desde la mirada de alguien que se está preparando. Cada perfil dice qué le duele, qué lo engancha y qué función de la plataforma le habla directo.

### 2.1 El maratonista
- Estudia 8 a 12 horas, tiene el CTO subrayado tres veces y aun así siente que no avanza
- Le duele no saber si su esfuerzo rinde. Repasa lo que ya sabe porque se siente bien
- Lo engancha ver datos duros de su avance y saber exactamente dónde está su punto débil
- Funciones clave. Mapa de dominio por tema, cola de repaso FSRS que le prohíbe sobrerrepasar, detector de fatiga que le dice cuándo su exactitud cae, planificador que reparte el día
- Riesgo. Se quema. La plataforma debe sugerir descansos y medir la fatiga, no premiar horas por premiar

### 2.2 El obligado
- Estudia porque su familia, su hospital o su plan de vida se lo exigen. Abre la app sin ganas
- Le duele empezar. Ve un temario gigante y lo cierra
- Lo engancha lo pequeño y lo inmediato. Una misión de 10 minutos, una racha que no quiere romper, ver a sus amigos arriba en la tabla
- Funciones clave. Meta diaria mínima, racha con protector, misiones del día, Pomodoro, notificación amable a su hora, grupos con sus compañeros de internado
- Riesgo. Abandona en la semana 2. El inicio debe darle una victoria en el primer minuto

### 2.3 El talentoso relajado
- Le vale, estudia poco, y aun así le va bien porque entiende rápido
- Le duele el aburrimiento. Las preguntas fáciles lo hacen sentir que pierde el tiempo
- Lo engancha el reto y la competencia. Quiere demostrar que es bueno sin esforzarse de más
- Funciones clave. Modo adaptativo que sube la dificultad, duelos uno a uno, ligas semanales, insignias raras, simulacro cronometrado
- Riesgo. Se confía. Las estadísticas de mala lectura y cambio de respuesta le enseñan que pierde puntos por leer rápido

### 2.4 El de guardia o servicio social
- Hace internado o servicio social. Estudia en ratos, cansado, desde el teléfono, con mala señal
- Le duele el tiempo y la conexión
- Lo engancha poder estudiar 5 minutos sin conexión y que la app recuerde dónde se quedó
- Funciones clave. Sesiones cortas de 5 a 10 tarjetas, modo sin conexión, estudio con una mano, planificador que entiende días de guardia
- Riesgo. Se siente culpable. La racha debe permitir días de descanso planeados

### 2.5 El recursador
- Ya presentó una o dos veces y no quedó en la especialidad que quería
- Le duele la ansiedad y la sensación de haber estudiado mal
- Lo engancha entender por qué falló, con evidencia, y ver progreso medible contra su intento anterior
- Funciones clave. Informe de técnica de examen, sesgos cognitivos que más lo atraen, comparación de su versión de hace un mes contra hoy, banco de errores propios
- Riesgo. Es el cliente que más paga y el más exigente. Necesita contenido revisado y explicaciones sólidas

### 2.6 El perfeccionista ansioso
- Estudia mucho, pero se bloquea en el examen y cambia respuestas por miedo
- Le duele dudar de sí mismo
- Lo engancha ver que su primera intuición suele ser correcta, si es que lo es, y entrenar la calma
- Funciones clave. Estadística de cambios de respuesta (de correcta a incorrecta contra al revés), calibración de confianza, simulacros con reloj para practicar el ritmo
- Riesgo. La gamificación agresiva lo estresa. Necesita poder apagar las tablas competitivas

### 2.7 El que va por plaza competida
- Quiere Dermatología, Radiología, Oftalmología u otra plaza difícil. Cada punto cuenta
- Le duele no saber si va al ritmo necesario
- Lo engancha compararse contra quienes van por la misma especialidad, sin que la app prometa un puntaje
- Funciones clave. Percentil dentro de la plataforma entre quienes eligen la misma especialidad, plan intensivo, simulacros completos
- Límite importante. La regla del proyecto prohíbe predecir el puntaje del ENARM. El percentil interno se presenta como lo que es, una comparación dentro de la plataforma

### 2.8 El estudiante de grupo
- Estudia con su generación o con su grupo de WhatsApp
- Le duele estudiar solo
- Lo engancha lo social. Retos de grupo, compartir logros, ver quién lleva más racha
- Funciones clave. Party con código, retos colectivos, tarjetas de logro para compartir en redes, resumen semanal tipo "tu semana en Studiare"
- Es el motor de crecimiento. Cada grupo trae alumnos nuevos sin pagar publicidad

### 2.9 Qué significa esto para el diseño
- Un solo producto con dos caras. Una cara seria (estadísticas, plan, contenido revisado) y una cara de juego (XP, ligas, retos). Cada alumno elige cuánto juego quiere ver con un ajuste "modo enfoque"
- El primer minuto decide. La bienvenida debe llevar a una primera victoria, por ejemplo 5 tarjetas o 3 preguntas, antes de pedir más datos
- Todo dato que se pide debe devolver algo visible al alumno

## 3. Propuesta de valor diferencial

- **Entrenador de técnica de examen**. No solo qué sabes, sino cómo lees, cuánto tardas, cuándo te cansas, qué trampa te atrapa y cuándo cambiar tu respuesta te cuesta puntos. Esto casi no existe en los cursos del mercado
- **Repaso con FSRS**. El algoritmo de repaso espaciado más preciso disponible hoy, abierto y probado, para recordar más con menos tiempo
- **Sesgos cognitivos en cada distractor**. Cada opción incorrecta lleva el sesgo que explota. La plataforma detecta qué sesgo te atrapa más y te entrena contra él
- **Juego social que no estorba**. Ligas, retos y duelos para quien los quiere, modo enfoque para quien no
- **Tus mazos también cuentan**. Subes tus tarjetas desde otras apps, Excel, Word o CSV, y entran al mismo sistema de repaso y estadísticas
- **Contenido con médicos detrás**. Todo texto médico pasa por revisión de médicos con un flujo visible de borrador a aprobado

## 4. Estadísticas para mejorar la lectura y la forma de contestar

Cada estadística debe llevar una acción concreta. Un número sin consejo no sirve.

| Estadística | Qué mide | Acción que sugiere |
|---|---|---|
| Ritmo por pregunta | Segundos por pregunta contra el ritmo que exige el examen real | Practicar con reloj si va lento, frenar si va demasiado rápido y falla |
| Exactitud en negativas | Aciertos en preguntas con "excepto", "no" o "falso" contra las afirmativas | Activar el resaltado de negaciones y practicar un bloque solo de negativas |
| Probable mala lectura | Respuestas rápidas y seguras a una negativa que eligen una afirmación verdadera | Regla de leer dos veces la frase final antes de ver opciones |
| Cambios de respuesta | De correcta a incorrecta contra de incorrecta a correcta | Si cambia más para mal, quedarse con la primera respuesta salvo dato nuevo |
| Calibración de confianza | Exactitud cuando dice "seguro", "dudé" o "adiviné" | Si "seguro" falla mucho, hay conceptos mal aprendidos que repasar |
| Adivinanza rápida | Respuestas en muy pocos segundos con baja exactitud | Bajar el ritmo en esas ramas |
| Fatiga en la sesión | Caída de exactitud ajustada por dificultad conforme avanza la sesión | Sesiones más cortas o descansos en el minuto en que empieza a caer |
| Mejor horario | Exactitud por franja del día | Estudiar lo difícil en su mejor hora |
| Viñetas largas | Exactitud y tiempo en casos clínicos largos contra preguntas directas | Técnica de leer primero la pregunta y luego la viñeta |
| Tipo de tarea | Diagnóstico, tratamiento, estudio inicial, etcétera | Repasar la tarea más débil, por ejemplo tratamiento de elección |
| Sesgo dominante | Qué sesgo cognitivo atrae más sus errores contra la línea base | Tarjeta de estrategia contra ese sesgo y preguntas que lo entrenan |
| Retención | Porcentaje que recuerda en el repaso según FSRS | Ajustar la retención deseada o la carga diaria |
| Dominio por tema | Exactitud por tema corregida por pocos datos | Prioridades del planificador |
| Constancia | Días estudiados y racha | Meta diaria realista |

Todas estas funciones muestran "calibrando" hasta tener datos suficientes, como ya exige el proyecto.

## 5. Juego serio que se pueda compartir

- **XP con motivo visible**. Ya existe. Cada punto dice de dónde viene
- **Niveles con títulos médicos**. De Estudiante a Interno, Pasante, R1 y así, con insignia visual
- **Ligas semanales** por divisiones. Suben los primeros, bajan los últimos, como Duolingo. Mucho más motivador que una tabla global donde siempre ganan los mismos
- **Misiones del día**. Tres misiones cortas y variadas, por ejemplo 10 tarjetas, 5 negativas sin fallar y un Pomodoro
- **Racha con protector**. Un día de descanso protegido por semana, para no castigar guardias
- **Insignias** por rama, por constancia, por técnica (por ejemplo 20 negativas seguidas sin error) y raras para el talentoso relajado
- **Duelos** uno a uno con las mismas 10 preguntas
- **Retos de grupo**. Ya existen
- **Tarjetas para compartir**. Imagen lista para Instagram o WhatsApp con su racha, su liga o su resumen semanal, con la marca Studiare. Es publicidad gratuita
- **Resumen semanal y anual** tipo "tu año en Studiare"
- **Modo enfoque**. Oculta ligas y tablas para quien se estresa
- Sin trampas de manipulación. Nada de comprar rachas ni castigos que generen culpa

## 6. Roles y permisos

### 6.1 Niveles
| Rol | Quién | Qué puede hacer |
|---|---|---|
| Alumno | Toda cuenta nueva | Estudiar, ver sus datos, unirse a grupos. No administra nada |
| Médico | Lo nombra un administrador | Revisar solo las preguntas que se le asignen, aprobar, editar o rechazar con comentario |
| Administrador | Lo nombra el dueño u otro administrador | Todo lo anterior, asignar preguntas a médicos, cambiar roles de alumnos y médicos, ver métricas, configurar la plataforma |
| Dueño | Ricardo | Todo. Es el único que puede nombrar o quitar administradores. Nadie puede quitarle el rol |

### 6.2 Cómo se hace bien
- Los roles viven en una tabla del servidor, nunca en el navegador. El navegador solo muestra lo que el servidor permite
- Permisos por fila en Postgres. Por ejemplo, un médico solo puede leer las preguntas de su tabla de asignaciones
- El rol de dueño se fija en la base y una regla impide que cualquier cuenta lo cambie desde la app
- Cada cambio de rol queda en una bitácora de auditoría con quién lo hizo y cuándo
- La pantalla de selector de rol de hoy se queda solo para pruebas del prototipo

## 7. Base de datos que soporte todo

### 7.1 Datos útiles del alumno y para qué sirven
| Dato | Obligatorio | Para qué te sirve |
|---|---|---|
| Correo electrónico | Sí | Cuenta, recuperar acceso, recibos, avisos, marketing con permiso |
| Nombre para mostrar o alias | Sí | Lo que ven sus compañeros |
| Foto de perfil o avatar | No | Identidad visual en grupos y tarjetas para compartir |
| Año de nacimiento | No | Rango de edad para tu análisis de mercado. Mejor que la edad, que cambia sola |
| Sexo | No, con opción "prefiero no decir" | Estadística agregada de tu mercado |
| Estado de la República | No | Saber dónde vender y hacer alianzas con escuelas |
| Escuela de medicina | No | Alianzas, grupos por escuela, ventas institucionales |
| Año de egreso | No | Segmentar recién egresados contra recursadores |
| Situación actual | No | Internado, servicio social, egresado, trabajando. Ajusta el plan y las sesiones |
| Número de intento | No | Primera vez, segunda o más. Es tu cliente más valioso |
| Especialidad objetivo | No | Percentil interno por especialidad y contenido dirigido |
| Cómo nos conociste | No | Saber qué canal de marketing funciona |
| Teléfono o WhatsApp | No | Recordatorios por WhatsApp si lo aceptas, y soporte |

- Los datos de contacto (correo, teléfono) viven en una tabla aparte con permisos más estrictos que el perfil. Así nunca viajan a la IA, como ya exige el proyecto
- Ninguno de estos datos es sensible según la ley mexicana de datos personales. Datos de salud sí lo serían, y no se piden
- Sobre los minutos de estudio al día. Servían para que el planificador calcule cuánto cabe en el día. Tienes razón en que preguntarlo no aporta, porque el alumno no lo sabe con precisión. Se puede inferir de su conducta real en las primeras dos semanas

### 7.2 Modelo propuesto en Postgres
Agrupado por área. Cada tabla con permisos por fila.

- **Identidad**
  - auth.users, la maneja Supabase (correo, contraseña, inicio con Google)
  - profiles. Alias, avatar, año de nacimiento, sexo, estado, escuela, egreso, situación, intento, especialidad objetivo, zona horaria, ajustes
  - private_contacts. Correo de contacto y teléfono, solo para el dueño de la cuenta y administradores
  - user_roles y role_audit. Rol actual y bitácora de cambios
  - privacy_acceptances. Versión del aviso aceptada y fecha
- **Pagos**
  - plans, subscriptions, payments, invoices, coupons
  - payment_webhook_events. Cada aviso del procesador de pago guardado tal cual, para auditar y no cobrar dos veces
- **Contenido**
  - branches, topics, subtopics y la taxonomía de sesgos
  - clinical_cases, questions con sus versiones, options, gpc_references
  - review_assignments (qué pregunta revisa qué médico), review_decisions, content_reports
- **Mazos**
  - decks, notes, cards, media en el almacén de archivos
  - deck_imports. Archivo subido, formato, estado, errores por fila
- **Actividad**
  - events. La bitácora de solo agregar que ya existe, particionada por mes para que no se vuelva lenta
  - study_sessions
- **Datos derivados**, que se recalculan desde la bitácora
  - card_states, daily_activity, topic_mastery, behavior_metrics, bias_findings
  - weekly_leaderboards como vista materializada
- **Social y juego**
  - groups, memberships, challenges, duels, leagues, league_memberships
  - achievements, user_achievements, xp_ledger, streaks
  - share_cards. Imágenes generadas para compartir
- **IA**
  - ai_artifacts y ai_call_log, que ya existen en el esquema
- **Plataforma**
  - platform_settings. Fecha del ENARM, precios, textos legales, banderas de funciones

### 7.3 Local y servidor juntos
- Dexie se queda como copia local. El alumno estudia sin conexión y al volver la señal se sincroniza
- La bitácora de eventos es ideal para sincronizar porque solo se agregan registros, nunca se editan. Cada evento ya tiene un ID único que evita duplicados
- Las estadísticas pesadas se pueden calcular en el servidor por las noches y bajar listas al teléfono

## 8. Pagos

### 8.1 Opciones para México
| Opción | A favor | En contra |
|---|---|---|
| Stripe | Suscripciones muy completas, tarjeta, OXXO y SPEI, excelente documentación | Comisión con tarjeta nacional alrededor de 3.6% más 3 pesos. OXXO no sirve para cobro recurrente automático |
| Mercado Pago | Muy conocido en México, suscripciones con su API de preaprobación, pago con saldo de Mercado Pago | Documentación menos clara y experiencia de pago menos fluida |
| Conekta | Mexicano, OXXO y SPEI | Menos herramientas para suscripciones |

- Mi recomendación. **Stripe** para mensual con tarjeta y anual con tarjeta, OXXO o SPEI. Es lo que menos código pide y lo que menos falla. Mercado Pago como segunda opción si tu público pide pagar con saldo de Mercado Pago
- Por qué todavía no ves nada para conectar pagos. Cobrar de verdad necesita un servidor que reciba los avisos del procesador y active la suscripción. Hoy la app no tiene servidor público, solo la página. Por eso el checkout es simulado
- Lo que necesitas tú. Cuenta de Stripe o Mercado Pago a tu nombre o de tu empresa, RFC, cuenta bancaria y decidir si emites factura
- Cómo se conecta. Botón de pago que abre el checkout del procesador, aviso del procesador al servidor, el servidor marca la suscripción activa. Ningún dato de tarjeta pasa por tu base
- Factura electrónica. Un servicio como Facturapi la genera sola con cada pago

## 9. Subir mazos

- Formatos. Paquetes de otras apps de tarjetas, CSV, Excel y Word. En la interfaz solo se dice "sube tu mazo"
- CSV y Excel. Columnas frente, reverso y etiquetas, con una plantilla descargable
- Word. Una tabla de dos columnas o el patrón "Pregunta" y "Respuesta" por párrafo
- Vista previa antes de importar, con errores por fila y la opción de corregir
- Los mazos subidos son privados por defecto

## 10. Fotos de perfil

- Subir foto con recorte cuadrado en el teléfono y compresión antes de subirla
- O elegir un avatar generado. Propongo una colección propia con temática médica (bata, estetoscopio, gorro quirúrgico) generada con DiceBear usando estilos con licencia libre para uso comercial
- Las fotos se guardan en el almacén de archivos con permisos por usuario

## 11. Dirección de diseño

La meta es que se vea como una marca propia, seria y a la vez divertida, y no como una plantilla.

- **Paleta con color por rama**. Azul petróleo profundo como base de marca, y un color fuerte por rama que se repite en tarjetas, gráficas e insignias. Por ejemplo coral para Medicina interna, turquesa para Pediatría, magenta para Ginecología y obstetricia, verde esmeralda para Cirugía, ámbar para Urgencias
- **Tipografía con personalidad**. Una tipografía de títulos expresiva y otra muy legible para el texto clínico
- **Superficies con vida**. Fondos con degradados suaves, tarjetas con sombras de color, esquinas más redondeadas, ilustraciones médicas sencillas
- **Movimiento con propósito**. Animación al subir de nivel, confeti al cumplir la meta, contador de XP que sube, transiciones suaves entre pantallas
- **Dos tonos de interfaz**. Las pantallas de estudio con calma visual para concentrarse. Inicio, Party y logros con más color y juego
- **Iconografía propia** en dos tonos para ramas e insignias
- Accesibilidad intacta. Contraste suficiente, todo usable con teclado y lector de pantalla

## 12. Librerías open source que aceleran el trabajo

| Para qué | Librería | Licencia | Nota |
|---|---|---|---|
| Cuentas, base de datos, archivos, permisos | Supabase (supabase-js y su CLI) | Apache 2.0 y MIT | Plan gratis amplio para empezar |
| Componentes con buen diseño | shadcn/ui sobre Radix | MIT | Se copian al repo y se personalizan, evita lo genérico |
| Animación | motion | MIT | Antes Framer Motion |
| Confeti | canvas-confetti | ISC | Celebraciones |
| Avisos emergentes | sonner | MIT | Notificaciones pequeñas |
| Formularios | react-hook-form con su adaptador de zod | MIT | Ya usamos zod |
| Datos del servidor | TanStack Query | MIT | Caché y sincronización |
| Tablas | TanStack Table | MIT | Panel de admin y banco |
| Gráficas | Recharts o visx | MIT | Estadísticas de técnica |
| Heatmap | react-activity-calendar | MIT | Calendario tipo GitHub |
| CSV | Papa Parse | MIT | Importar mazos |
| Excel | SheetJS edición comunitaria | Apache 2.0 | Se instala desde su CDN oficial, la versión de npm está vieja |
| Word | mammoth | BSD 2 | Convierte .docx a HTML limpio |
| Paquetes de otras apps de tarjetas | sql.js con fflate | MIT | Leen el paquete comprimido y su base interna |
| Avatares | DiceBear | MIT el código, cada estilo con su licencia | Usar estilos CC0 o de uso comercial libre |
| Recorte de foto | react-easy-crop | MIT | |
| Comprimir foto | browser-image-compression | MIT | |
| Imagen para compartir | html-to-image | MIT | Genera la tarjeta de logro |
| Fechas | date-fns | MIT | |
| Pagos | Stripe.js o el SDK de Mercado Pago | MIT o Apache | |
| Correos | React Email | MIT | Plantillas de bienvenida y recibos |
| Analítica del producto | PostHog | MIT en su versión abierta | Saber qué funciones usan los alumnos |
| Errores en producción | Sentry | Licencia propia con versión abierta | Ver fallas reales |
| Pruebas con servidor simulado | MSW | MIT | Probar sin depender del servidor |

Ya tenemos ts-fsrs, Dexie, zod, Tailwind, fflate, DOMPurify y Playwright, que siguen sirviendo.

## 13. Hoja de ruta propuesta

1. **Diseño nuevo**. Paleta, tipografía, componentes y las pantallas actuales rehechas con la nueva marca. Se puede ver de inmediato en la página publicada
2. **Cuentas reales y roles**. Supabase, registro con correo, inicio con Google, perfil con los datos útiles, foto o avatar, roles con dueño fijo, panel de administración de usuarios
3. **Sincronización**. La bitácora local sube al servidor y baja en otro dispositivo
4. **Pagos reales**. Stripe o Mercado Pago, suscripciones, recibos y factura
5. **Estadísticas de técnica de examen**. La pantalla de Progreso con las métricas de la sección 4
6. **Juego social completo**. Ligas, misiones, insignias, duelos y tarjetas para compartir
7. **Subir mazos** en todos los formatos
8. **Banco de preguntas revisado** con el flujo de médicos
9. **Lanzamiento** con aviso de privacidad y términos revisados por un abogado

## 14. Riesgos y límites

- **Los mazos de Paco están públicos**. El repositorio y la página ahora son públicos. Paco autorizó su uso cuando era privado. Hay que confirmarlo con él o dejar solo una muestra
- **Ley de datos personales**. El aviso de privacidad único es válido, pero la ley pide que el alumno pueda negarse a las finalidades secundarias, como el marketing. Basta con una casilla dentro del mismo aviso. Conviene que lo revise un abogado antes de lanzar
- **Sin predicción de puntaje**. Se mantiene. El percentil interno se presenta como comparación dentro de la plataforma
- **Costos**. Supabase y la página son gratis al inicio. Los pagos cobran comisión por venta. La IA cobra por uso
- **Contenido médico**. Sin revisión médica real no se puede vender como banco validado
- **Fuera de alcance de esta fase**. Apps nativas o de tienda, chat libre con IA

## 15. Fuentes consultadas
- Stripe en México, https://stripe.com/newsroom/news/stripe-launches-mexico
- Comisiones de Stripe México, https://www.photonpay.com/hk/blog/article/stripe-mexico
- Suscripciones de Mercado Pago, https://www.mercadopago.com.mx/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- Plan gratis de Supabase, https://cotera.co/articles/supabase-pricing-guide.md
- Licencias de estilos de DiceBear, https://npmjs.com/package/@dicebear/lorelei
