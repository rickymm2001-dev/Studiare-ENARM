# Diagnóstico de avance y de beta, 28 de octubre de 2026

Tres auditorías independientes sobre la rama de D-150 (commit 56894e5), hechas por agentes que no escribieron el código. Funcionalidad recorrida con Playwright en computadora y teléfono, estructura del código contra las reglas de CLAUDE.md, y avance contra los planes V3 y V4 con lectura del proyecto real de Supabase. Las capturas y bitácoras quedaron fuera del repo.

## Resumen en cinco líneas

- El código cubre entre 90 y 95 por ciento de lo planeado en V3 y V4. Lo que falta de código es la fase 3 de V4 (ficha de tema, índice de preparación, perla del día, demo de la portada) y fusionar el rediseño D-150.
- El producto listo para alumnos reales está entre 10 y 15 por ciento. De las 10 condiciones de lanzamiento de V3 ninguna se cumple y de los 141 pasos de docs/PENDIENTES_DE_RICARDO.md hay 8 hechos.
- Avance combinado, con peso 60 por ciento código y 40 por ciento operación y contenido, de 55 a 65 por ciento, con más menos 10 de incertidumbre.
- La app funciona. Cero errores de consola en todas las pantallas, 7,720 unitarias y 707 e2e en verde, dos defectos importantes y nueve menores, ninguno bloqueante.
- Recomendación. No lanzar todavía la beta de 20 a 50. Lanzar la beta de 5 de B18 en 2 a 3 semanas con la lista de abajo, la de 20 a 50 de 4 a 6 semanas después y la abierta con cobro no antes de 10 a 12 semanas.

## 1. Funcionalidad (recorrido real como alumno)

Qué funciona. Portada, registro con validación, recorrido guiado de 8 pasos, Inicio nuevo y con demo, Repasar con mazos, modos, ajustes y sesión con teclado y clic, Pomodoro, práctica, modo dirigido calibrando, examen completo con reloj y navegador, resultados y Mis errores, Progreso, Calendario con .ics, Apuntes, Party, Tutor, Configuración con perfil, tema oscuro, privacidad, descarga y borrado de datos, cerrar y volver a entrar, PWA instalable y sin conexión.

Defectos importantes
- Si el alumno sale de Resultados mientras dice Guardando tus respuestas, el examen queda sin cerrar. XP, Mis errores y Progreso no se registran hasta volver a abrir Resultados. Reproducido en teléfono con 20 respuestas. Arreglo. retomar el cierre pendiente desde cualquier pantalla al arrancar la app, no solo desde Resultados.
- Cancelar suscripción cancela con un solo clic, sin confirmación, y baja a Gratis de inmediato. Además el botón vive dentro de la tarjeta del plan Gratis. Arreglo. diálogo de confirmación con lo que se pierde y la fecha hasta la que sigue el plan.

Defectos menores
- Desborde horizontal en Configuración con el tamaño de texto Muy grande en computadora.
- Apariencia muestra Tienes cambios sin guardar pero al salir por el menú no avisa.
- En el examen, tras marcar con clic, Enter vuelve a alternar la marca en vez de avanzar.
- Textos cortados con puntos suspensivos en Tus datos de Configuración, en Estadísticas del mazo y en el placeholder del buscador con un alias largo.
- Pulso de estudio repite la misma frase dos veces en calibrando. Tarjetas por rama vacía deja un hueco grande.
- La tarjeta de Mis errores repite el mismo párrafo como explicación y como fuente.
- El buscador de la barra sin tarjetas ignora el término en el estado vacío. En teléfono no hay buscador en la barra.
- El contador 41 mazos que sigues cuenta submazos frente a 4 visibles.
- Dos unitarias intermitentes bajo carga, PrivacySection.test y CalendarScreen.test, que pasan solas.

No se probó a mano. Party real con grupos y duelos (lo cubre party.spec), Tutor con IA encendida, importar mazos .apkg y CSV, compartir la imagen de la semana, el prompt real de instalar la PWA.

## 2. Estructura del código

Calificación 8 de 10. Lo que protege al producto está cuidado por pruebas y no por disciplina. Eventos inmutables bloqueados en Dexie, motores puros vigilados por eslint y pruebas de arquitectura, secretos escaneados en el bundle, RLS en las 90 tablas y funciones con search_path fijo, plan Gratis aplicado en SQL, XSS saneado dos veces y CSP sin unsafe-inline en scripts. Typecheck y lint en verde, bundle en 249 KB de 300, cero ciclos de importación.

Lo que resta puntos
- Cinco pantallas con componentes de 300 a 700 líneas. ReviewSession tiene 721 líneas y 17 estados en un solo componente.
- Inicio, Progreso y Repasar recalculan el snapshot de todos los eventos en cada render, con new Date() dentro, sin memorizar. Es lo que más se sentirá con meses de eventos.
- No hay pantalla de recuperación cuando IndexedDB no abre o se queda sin cuota (Safari en privado, build viejo). Cae al error genérico.
- 83 archivos de prueba usan la hora real sin fijar el reloj y varias fechas fijas de 2026 caducan.
- 64 claves de i18n muertas y textos de interfaz sueltos fuera de src/i18n (portada, mensajes de IA, títulos de nivel en xp.ts).
- Duplicados. formatClock y remainingMs entre examen y Pomodoro, normalizeText y parseCloze con el mismo nombre y semántica distinta.

Cinco arreglos que valen la pena antes de una beta. memorizar los snapshots y sacar new Date() del render, partir ReviewSession en hooks por responsabilidad, pantalla de recuperación de IndexedDB, fijar el reloj en las pruebas, limpiar i18n y meter knip a npm run check.

## 3. Avance contra el plan

Plan V3. B0 a B10 hechos en código y aplicados al Supabase real hasta B10. B11 a B18 hechos en código y sin aplicar al proyecto real (banco en la nube, IA, inglés, modelo del alumno, analítica, correos, publicación, primeros alumnos). B16 legal parcial, borradores listos y sin abogado. B19 pasó a V4-B10.

Plan V4. B0 a B7 hechos. B8 Urgencias gratis parcial (la regla del servidor está escrita y sin aplicar). B9 cuentas de Ricardo pendiente casi completo (133 de 141 pasos). B10 auditoría hecha sobre la interfaz anterior a D-149 y D-150. Fase 2 hecha en código. Fase 3 parcial, portada hecha y faltan ficha de tema, índice de preparación, mapa de especialidades, perla del día y demo interactiva. D-150 en PR con CI en verde, sin fusionar.

El hallazgo que cambia la lectura. El proyecto real de Supabase está en el esquema de B10. Siete Edge Functions desplegadas de trece, cero preguntas en la nube, registro cerrado, correos apagados, protección de contraseñas filtradas apagada. La cadena de despliegue de b11 a b18 nunca corrió contra el proyecto real, solo contra una API simulada y Postgres local.

## 4. Lo que falta para cada beta

Beta cerrada de 5 alumnos de confianza (B18), bloqueante
- Fusionar D-150, correr la suite completa en main y rehacer capturas y recorrido sobre la interfaz nueva. Congelar el rediseño mientras dure la beta.
- Aplicar al Supabase real la cadena b11, b12, b13, b14, b15, b17, b18 y f2 con npm run deploy:supabase, cada una con dry-run primero, y desplegar las 13 funciones. Antes, ensayar la cadena completa en un proyecto de Supabase de prueba.
- Correo propio con Resend como SMTP de Supabase (SPF, DKIM, DMARC). Con el correo de fábrica los códigos no llegan a quien no es del equipo.
- Una publicación de producción en Cloudflare Pages con CLOUDFLARE_DEPLOY, aunque sea en pages.dev. GitHub Pages es la demo.
- Gancho Before User Created activo y probado en incógnito, invitaciones desde Usuarios, registro cerrado.
- Supabase plan Pro con copias diarias, protección de contraseñas filtradas prendida, segundo factor del dueño y admins, limpieza de las filas de pago de prueba.
- Aviso de privacidad con los datos del responsable y casilla de 18 años. Puede seguir marcado como borrador si los invitados lo saben.
- Sentry prendido con alerta al correo.
- Sin cobro. Stripe de prueba apagado para alumnos y plan de pago otorgado por invitación.
- Los dos defectos importantes de la sección 1.

Beta cerrada de 20 a 50, además
- 300 preguntas aprobadas en la nube con revisor distinto del autor y cloudBank prendido. Pide la cuenta de servicio de Google, la estructura del Sheet y 3 a 5 médicos revisores con tarifa. Hoy los alumnos estudiarían con 200 preguntas demo escritas por IA y etiquetadas como no validadas.
- Autorización escrita de Paco y Fer para sus mazos.
- PostHog con el permiso de medición de uso y recordatorios por correo probados.
- Resolver la barrera de un dispositivo por cuenta y la sincronización cada 5 minutos, que será la primera queja.
- Los cinco arreglos de código de la sección 2 y los defectos menores.

Beta abierta con cobro, además
- Textos legales aprobados por el abogado con la empresa como responsable, reembolsos y tribunales.
- Stripe en modo real a nombre de la empresa, webhook con los nueve eventos, compra chica con reembolso, IVA y facturas con el contador.
- Compuerta 1 aprobada por los dos médicos antes de abrir la IA a alumnos, clave de Anthropic de producción con tope de gasto.
- Dominio propio con HTTPS, buzones de privacidad y soporte reales con tiempos de respuesta.
- Llaves nuevas de Supabase antes de fin de 2026, prueba de penetración ligera, revisión de las tres funciones abiertas a anon.

## 5. Riesgos principales

- Contenido. Es el mayor. Cero preguntas validadas y 1,500 en borrador de IA. Mitigar con revisión pagada por pregunta, empezando por 300 de las cuatro troncales, y sin prender cloudBank ni la IA antes de la compuerta.
- Despliegue. La cadena b11 a b18 nunca tocó el proyecto real. Mitigar con un proyecto de ensayo y dry-run por plan.
- Evidencia vieja. La auditoría V4-B10 describe la interfaz anterior. Mitigar con una pasada de e2e, axe y capturas tras fusionar D-150.
- Legal. Aviso y términos en borrador, foto de portada generada con IA, marca sin registro. Mitigar con el abogado antes de la beta abierta.
- Operativo. Casi todo lo que falta depende de Ricardo y no de código. Mitigar con una sesión dedicada a cuentas en el orden de Esta semana de PENDIENTES.
- Costo fijo antes de ingresos. Supabase Pro, Resend, Anthropic, abogado y médicos. Mitigar con una beta corta sin cobro y topes de gasto.
