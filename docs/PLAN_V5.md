# Plan V5. El cierre al 100 por ciento, del repositorio al lanzamiento abierto con cobro

Decisión D-151. Este plan continúa a V3 y V4 y manda sobre ellos donde no coincidan. Parte del diagnóstico de docs/DIAGNOSTICO_BETA.md del 28 de octubre de 2026 y de cuatro decisiones de Ricardo tomadas ese día.

## 0. Las cuatro decisiones de Ricardo

- La meta es el lanzamiento abierto con cobro. Se llega en tres escalones, beta de 5, beta de 20 a 50 y apertura, y ninguno se salta.
- Lo operativo lo ejecuta la sesión con los conectores que ya tiene (Supabase, Cloudflare, Stripe, GitHub). Ricardo solo hace lo que la sesión no puede, que es crear cuentas, pagar, firmar, elegir dominio y tratar con personas.
- El contenido lo validan médicos revisores pagados por pregunta, con meta de 300 preguntas aprobadas de las cuatro troncales antes de la beta de 20 a 50.
- Las decisiones de diseño abiertas las toma la sesión con el criterio de D-150 y de este plan, las anota en DECISIONES.md y las resume. Ricardo puede revertir cualquiera.

## 1. Principios de trabajo

- Un bloque es un PR a main con el CI en verde. La sesión no se detiene entre bloques, salvo en los puntos marcados como Pausa, que son los que tocan dinero real, datos de personas reales o algo irreversible fuera del repositorio.
- Antes de tocar el proyecto real de Supabase, cada plan de despliegue corre primero con dry-run y, la primera vez, contra un proyecto de ensayo. Lo que se aplica queda registrado en docs/DESPLIEGUE.md con fecha y resultado.
- Lo que la sesión necesite de Ricardo se pide el día 1 en una sola lista (sección 4) y no gota a gota. Mientras una cuenta no exista, el bloque que la necesita queda listo y apagado con su bandera, y la sesión sigue con el siguiente.
- El rediseño D-150 queda congelado mientras duren las betas. Solo se corrigen defectos.
- Al cerrar cada bloque, 5 a 10 líneas en PROGRESS.md, decisiones nuevas en DECISIONES.md, y una lista corta para Ricardo de lo que puede probar.
- Nada de predicción del puntaje ENARM, nada de chat libre con IA, nada de contenido médico sin su etiqueta hasta que un médico lo apruebe.

## 2. Decisiones de diseño que la sesión toma por omisión

Se aplican en V5-B0 salvo que Ricardo diga otra cosa antes.

- Meta de la racha. Vuelve a Inicio como cuarta fila de Meta de hoy, con la métrica que el alumno eligió en la bienvenida (tarjetas, preguntas o minutos) y su cifra. Sigue en Ajustes del repaso y en el bono de XP.
- Modo oscuro. Se adapta al canvas de D-150 con una paleta propia, pizarra como fondo, marino claro como acción, tintes crema, panel y salvia atenuados, mismo contraste mínimo de 4.5 a 1. Se documenta en tokens.css y lo revisa axe.
- Urgencias gratis. La regla del servidor (migración free_access) se aplica en V5-B1 para que el plan Gratis sea el mismo en la app y en la nube.
- Permiso de calibración. La calibración nocturna queda apagada hasta la beta de 20 a 50 y se prende solo con el consentimiento explícito del alumno, con el texto corto ya escrito, y después de la respuesta del abogado.
- Portada de venta. Conserva sus tamaños de letra grandes. El resto de la app usa la escala corta del bloque 4 de D-150.

## 3. Bloques, en orden

Cada bloque dice qué hace la sesión, qué necesita de Ricardo, cómo se cierra y cuánto tarda. Las semanas son estimaciones de trabajo de sesión, no de calendario, porque dependen de cuándo lleguen las cuentas y los médicos.

### V5-B0. Arranque y deuda que no espera (1 semana)

Sesión
- Rama estable para la beta desde main, con etiqueta beta-5.
- Los dos defectos importantes del diagnóstico. El examen retoma su cierre pendiente al arrancar la app desde cualquier pantalla, y Cancelar suscripción pide confirmación con lo que se pierde y hasta cuándo sigue el plan, fuera de la tarjeta del plan Gratis.
- Las pruebas sensibles al reloj. Fijar la hora en los 83 archivos que usan la hora real, revisar las fechas fijas de 2026, dar su tiempo a post-deploy.test y cardSearch.performance.test o moverlas a una corrida aparte que no bloquee el CI.
- Las decisiones de la sección 2.
- Los defectos menores del diagnóstico que caben en el mismo bloque. Desborde con texto Muy grande, aviso al salir de Apariencia, Enter tras marcar en el examen, textos cortados, frase repetida del pulso, explicación repetida en Mis errores, buscador con término en el estado vacío, contador de mazos.
- Presupuesto de JavaScript medido y anotado tras D-150.

Ricardo
- Nada. Solo la lista de la sección 4 para arrancar en paralelo.

Cierre
- CI en verde tres corridas seguidas sin flakes. Suite e2e completa en los cuatro proyectos. PROGRESS.md con el peso del bundle.

### V5-B0b. Correo y contraseña (1 semana)

Decisión de Ricardo del 29 de octubre. Entrar como en cualquier app, con correo y contraseña, y que el correo sirva solo para verificar la cuenta una vez.

Sesión
- Registro con contraseña, verificación del correo al crear la cuenta, inicio de sesión con contraseña, Olvidé mi contraseña, Cambiar contraseña en Configuración. El código por correo queda como alternativa y Entrar con Google como opción.
- Plantillas de correo de Supabase con la marca Studiare en español, aunque el remitente siga siendo el de fábrica hasta que exista un dominio.
- Para la beta de 5, cuentas creadas por el admin desde Usuarios con el correo confirmado y contraseña inicial, para no depender del correo de fábrica, que solo llega al equipo del proyecto.
- Pruebas unitarias y e2e del flujo completo en teléfono y computadora.

Ricardo
- Nada. Cuando quiera correos con su remitente, un dominio (comprado en Cloudflare es lo más simple) y Resend.

Cierre
- Una cuenta nueva se crea con contraseña, confirma su correo y entra. Recuperar y cambiar contraseña funcionan. Protección de contraseñas filtradas prendida al pasar a Pro.

### V5-B1. El servidor real al día (1 a 2 semanas)

Sesión
- Crear un proyecto de ensayo en Supabase y correr ahí la cadena completa b11, b12, b13, b14, b15, b17, b18 y f2 con npm run deploy:supabase. Corregir lo que falle. Registrar el resultado.
- Pausa. Antes de aplicar al proyecto real, resumen a Ricardo de lo que va a cambiar y confirmación en una línea.
- Aplicar la cadena al proyecto real con dry-run por plan y después en firme. Desplegar las 13 Edge Functions y borrar stripe-config-check si la API lo permite.
- Limpiar las filas de pago de prueba con supabase/manual/limpiar-pagos-de-prueba.sql. Dejar founder_seats sin filas de prueba.
- Prender la protección de contraseñas filtradas, el gancho Before User Created, el registro cerrado y las invitaciones desde Usuarios. Probar el gancho en incógnito.
- Segundo factor obligatorio para el dueño y los admins (requireMfa) con la pantalla ya hecha.
- Vista o lista blanca para platform_settings, para que nada futuro quede público por omisión.
- Prueba de humo contra el proyecto real con la suite de nube apuntando a él, solo lectura.

Ricardo
- Supabase plan Pro con copias diarias, antes de que entren personas reales. Es un pago.
- Marcar su cuenta de dueño con el SQL del paso 3 de docs/SUPABASE.md si no lo hizo.
- La clave de Anthropic en Edge Functions, Secrets, como ENARM_ANTHROPIC_KEY, con tope de gasto en su consola.

Cierre
- El proyecto real tiene el esquema completo, las 13 funciones y cero filas de prueba. docs/DESPLIEGUE.md con la bitácora.

### V5-B2. Publicación, acceso y monitoreo (1 semana)

Ajuste del 29 de octubre. Ricardo decidió no usar el domino propio por ahora. La app vive en la dirección gratuita de Cloudflare Pages, el acceso de los primeros alumnos es Entrar con Google y el correo propio con Resend espera a que exista un dominio. Lo que sigue se lee con ese ajuste.

Sesión
- Configurar Resend como SMTP de Supabase y como remitente de las funciones, con los registros SPF, DKIM y DMARC creados por la sesión si el token de Cloudflare tiene permiso de DNS, o entregados a Ricardo como lista si no.
- Publicar en Cloudflare Pages con CLOUDFLARE_DEPLOY, primero en pages.dev y luego en el dominio. Cabeceras, CSP, prueba de humo posterior al despliegue, sitio de mudanza en GitHub Pages.
- Sentry prendido con alerta al correo de Ricardo. PostHog preparado y apagado hasta la beta de 20 a 50.
- Probar cada tipo de correo (acceso, código, recordatorio, baja) contra servicios reales con cuentas del equipo.

Ricardo
- Cuentas de Resend, Sentry y PostHog, y sus llaves pegadas donde dice docs/PENDIENTES_DE_RICARDO.md.
- El dominio a nombre de la empresa, en Cloudflare, y los buzones de privacidad y soporte.
- Token de Cloudflare con permiso de Pages Edit en GitHub.

Cierre
- Un correo de acceso llega a una cuenta ajena al equipo. La app abre en el dominio con HTTPS y pasa la prueba de humo. Un error provocado en el navegador llega a Sentry.

### V5-B3. Beta de 5 personas de confianza (2 semanas de calendario)

Sesión
- Invitaciones desde Usuarios, guía de docs/PRIMEROS_ALUMNOS.md, encuesta de los 7 días prendida.
- Cada reporte o encuesta se convierte en defecto o en idea. Los defectos se corrigen en la rama estable y se publican sin esperar al siguiente bloque.
- Al día 7, informe corto a Ricardo con uso real, errores y lo que dijeron.

Ricardo
- Elegir e invitar a los 5. Avisarles que es beta, sin cobro, con preguntas de demostración etiquetadas, y que el aviso de privacidad sigue en borrador del abogado.
- Aviso de privacidad con los datos del responsable y la casilla de 18 años, aunque siga marcado como borrador.

Cierre
- Los 5 completaron al menos una semana. Cero errores sin atender en Sentry. Lista de cambios acordada para la beta de 20 a 50.

### V5-B4. Contenido médico validado (4 a 6 semanas de calendario, en paralelo desde B1)

Sesión
- Cuenta de servicio de Google y Sheet conectados, bank-sync corriendo, estructura del Sheet según la sección 7.4 de V3, con validación de columnas y reporte de errores por fila.
- Flujo de revisión para los médicos dentro de la app, con compuerta de dos médicos, revisor distinto del autor, cola por rama y tarifa por pregunta registrada para el pago.
- Importar los borradores de IA como propuestas, nunca como preguntas aprobadas. Etiqueta visible hasta la aprobación.
- Mazos de Paco y Fer al catálogo de Storage cuando llegue la autorización.
- Prender cloudBank cuando haya 300 aprobadas y la compuerta 1 esté aprobada por los dos médicos.

Ricardo
- Los dos médicos de la compuerta 1 y de 3 a 5 revisores con tarifa acordada.
- Proyecto de Google Cloud con la cuenta de servicio y el Sheet compartido como lector.
- Autorización escrita de Paco y Fer.

Cierre
- 300 preguntas aprobadas en la nube de las cuatro troncales, con explicación y referencias. Compuerta 1 aprobada. cloudBank prendido.

### V5-B5. Robustez para muchos alumnos (1 a 2 semanas)

Sesión
- Memorizar los snapshots de Inicio, Progreso y Repasar y sacar new Date() del render con un hook de día de estudio estable.
- Partir ReviewSession en hooks por responsabilidad (cola, registro de eventos, sanguijuelas, edición) con pruebas por parte.
- Pantalla de recuperación cuando IndexedDB no abre o se queda sin cuota, con exportar e intentar de nuevo.
- Barrera de un dispositivo por cuenta. Mensaje claro, cambio de dispositivo desde Configuración y sincronización al abrir la app, no solo cada 5 minutos.
- Limpiar las 64 claves de i18n muertas, mover los textos sueltos a src/i18n, unificar formatClock y remainingMs, meter knip a npm run check.
- Medir el tiempo por tarjeta en perf.spec con los datos de un alumno de 6 meses.

Ricardo
- Nada.

Cierre
- perf.spec bajo 100 ms de mediana en los dos tamaños con datos de 6 meses. Suite completa en verde. knip sin hallazgos.

### V5-B6. Beta de 20 a 50 (4 semanas de calendario)

Sesión
- PostHog prendido con el permiso de medición de uso. Embudo de la beta en Admin.
- Recordatorios por correo prendidos, probados por tipo.
- Calibración nocturna prendida con el consentimiento explícito, si el abogado ya respondió.
- Informe semanal a Ricardo con retención, uso por pantalla, errores y comentarios. Defectos a la rama estable.

Ricardo
- Invitar a los 20 a 50. Responder a la encuesta de los 7 días con los alumnos.
- Respuesta del abogado sobre el permiso de calibración.

Cierre
- Cuatro semanas con al menos 20 activos. Retención a 2 semanas medida. Lista de cambios para la apertura.

### V5-B7. Legal y cobro real (3 a 4 semanas de calendario, en paralelo desde B3)

Sesión
- Aplicar los cambios del abogado a docs/legal y a la app, con versión nueva y el aviso de cambio de términos.
- Stripe en modo real. Precios, cupón Fundador, portal, webhook con los nueve eventos, OXXO, SPEI, Apple Pay y Google Pay, compra chica con reembolso. Pausa. Cada paso que cobre dinero real se confirma con Ricardo.
- Mercado Pago en modo prueba y luego real si Ricardo lo quiere para el lanzamiento, o se deja detrás de bandera.
- Coherencia de la portada con el cobro. Gratis para empezar sin tarjeta, prueba gratis con tarjeta, precios con IVA incluido.
- Facturas a mano a quien las pida, según el contador.

Ricardo
- Activación de Stripe a nombre de la empresa, con el contador para IVA y facturas.
- Abogado. Aviso, términos, reembolsos, tribunales, encuesta y permiso de mejora.
- Decidir si Mercado Pago entra al lanzamiento.

Cierre
- Un cobro real de prueba chico con reembolso completo. Textos legales aprobados y publicados. Portal del cliente funcionando.

### V5-B8. Fase 3 restante, si cabe antes de abrir (2 semanas, opcional)

- Ficha de tema bajo Progreso, índice de preparación con la leyenda de que no predice el puntaje, mapa de especialidades en SVG con tabla equivalente, perla del día desde el banco aprobado, demo interactiva de la portada con una pregunta aprobada.
- Entra solo si B6 y B7 ya cerraron y no retrasa la apertura. Si no, pasa a después del lanzamiento.

### V5-B9. Lanzamiento abierto (1 semana)

Sesión
- Lista de lanzamiento de la sección 11 de V3, punto por punto, con evidencia.
- Auditoría final sobre la interfaz actual. Suite e2e completa, axe en todas las pantallas, capturas en docs/screenshots/v5, revisión independiente de código y de seguridad con las skills code-review y security-review, prueba de penetración ligera.
- Llaves nuevas de Supabase y revisión de las tres funciones abiertas a anon.
- Registro abierto, prueba gratis prendida, cash passes detrás de bandera hasta probarlos.
- Repo privado 30 días después de la mudanza.

Ricardo
- Responsable de soporte con tiempos de respuesta. Textos de venta e influencers si entran.
- La decisión de abrir.

Cierre
- Registro abierto y primer cobro real de un alumno ajeno al equipo.

## 4. Lo que Ricardo entrega el día 1 (o avisa cuándo)

En el orden en que desbloquean bloques. Los pasos para principiante, con los menús de cada servicio, están en docs/GUIA_DE_CUENTAS.md, y el detalle técnico en docs/PENDIENTES_DE_RICARDO.md.

1. Supabase plan Pro y su cuenta de dueño marcada. Desbloquea B1.
2. Clave de Anthropic en Secrets con tope de gasto. Desbloquea la IA en B1.
3. Resend, Sentry y PostHog creados, con sus llaves en su lugar. Desbloquea B2.
4. Dominio en Cloudflare, token con Pages Edit en GitHub, buzones de privacidad y soporte. Desbloquea B2.
5. Los 5 aspirantes y el aviso de privacidad con sus datos. Desbloquea B3.
6. Dos médicos de la compuerta y 3 a 5 revisores con tarifa. Google Cloud con la cuenta de servicio y el Sheet compartido. Autorización de Paco y Fer. Desbloquea B4.
7. Activación de Stripe a nombre de la empresa y la plática con el contador. Abogado con docs/legal. Desbloquea B7.
8. En el entorno de la sesión, los dominios de documentación permitidos y los secretos que faltan, según la sección Entorno de PENDIENTES. Sin eso la sesión consulta la documentación por GitHub y npm, que es más lento.

## 5. Calendario estimado

Con las cuentas del día 1 y los médicos en la semana 2.

- Semanas 1 a 3. B0, B1 y B2. Servidor real, correo, publicación.
- Semanas 3 a 5. B3, beta de 5. B4 y B7 en paralelo.
- Semanas 5 a 7. B5, robustez. B4 sigue.
- Semanas 7 a 11. B6, beta de 20 a 50. B7 cierra.
- Semanas 11 a 12. B8 si cabe, B9 y apertura.

Doce semanas de trabajo si nada se atora. Lo que más suele atorarse es el contenido y el abogado, y por eso van en paralelo desde el principio.

## 6. Riesgos y cómo los vigila la sesión

- Contenido. Si en la semana 6 hay menos de 150 aprobadas, la sesión avisa y propone reducir la beta de 20 a 50 a las ramas cubiertas.
- Despliegue real. Todo pasa por ensayo y dry-run. Si algo falla en el real, se documenta y se detiene, no se parcha a mano.
- Dinero. Ningún cobro real sin confirmación de Ricardo en ese momento.
- Flakes del CI. B0 los ataca primero porque un semáforo rojo falso tapa los rojos de verdad.
- Alcance. Ideas nuevas van a IDEAS.md. Nada entra a un bloque si no estaba en este plan, salvo defecto reportado por un alumno.
