# Correos

Cómo manda Studiare sus correos, cómo probarlos sin ninguna llave y cómo prenderlos cuando Resend esté listo. Es el bloque B15 del plan del cambio V3 (docs/PLAN_DEL_CAMBIO.md). Todo sale apagado. Mientras no pongas las llaves de Resend, la app no manda ni un correo y no pasa nada raro.

## Los seis tipos de correo

Todos salen por la misma cola (email_outbox) y el mismo envío. Los tipos viven en la tabla email_kinds.

| Tipo | A quién va | Cuándo se encola | Lleva baja |
|---|---|---|---|
| daily_review_reminder | Al alumno que lo prendió | Cada 15 minutos, a su hora local y en sus días | Sí |
| trial_ending | Al alumno | Tres días antes de que termine su prueba gratis | No |
| pass_expiring | Al alumno | Cuando su último pase vence en tres días o menos, una vez al día a las 8:07 de Mérida | No |
| invoice_requested | Al dueño y a los admins | Con cada solicitud de factura nueva | No |
| content_report | Al médico asignado | Cuando un alumno reporta un error en una pregunta | No |
| distractor_flags | Al médico asignado | Un resumen al día de opciones que casi nadie elige | No |

Los cinco últimos son correos de servicio. No llevan baja porque avisan de algo de tu cuenta o de tu trabajo, y su pie lo dice. Solo el recordatorio de repaso se puede dejar de recibir.

## Cómo viaja un correo

1. **La base decide.** Las funciones de la base (enqueue_review_reminders, enqueue_pass_expiry_reminders, las de pagos y las del banco) dejan una fila en la cola con su tipo y unos pocos datos, fechas, montos, plan o conteos. La cola nunca guarda una dirección de correo y una restricción de la tabla rechaza cualquier dato con arroba. Cada correo tiene una clave para no repetirlo, así un aviso repetido de Stripe no manda dos.
2. **Cron llama cada minuto.** El trabajo correos-enviar llama a la función send-emails con la ficha email_tick de Vault, y solo si el envío está prendido y hay correos listos. Con todo apagado Cron no hace ninguna llamada.
3. **send-emails toma hasta 20.** Con claim_email_batch aparta el lote diez minutos, así dos envíos a la vez no mandan el mismo. Pide a la base a quién va cada uno (email_recipients, que solo da correos de cuentas con el correo confirmado), arma el texto y lo manda con Resend.
4. **Cada correo se cierra.** Como sent si salió, skipped si no se debía mandar (la cuenta no tiene correo confirmado, el alumno apagó el recordatorio o se dio de baja) o failed con el motivo si no se pudo.
5. **Resend marca el ritmo.** La función espera 550 milisegundos entre una petición y otra, bajo el límite de 2 por segundo que trae Resend. Son unos 20 correos por minuto. Si muchos alumnos eligen la misma hora, el último sale a los pocos minutos.

Qué hace con cada respuesta de Resend.

| Respuesta | Qué pasa con el correo |
|---|---|
| Salió bien | sent |
| 429, se pasó del límite o de la cuota | Se detiene el lote y lo que falta vuelve a la cola sin gastar el intento (release_email) |
| 401, la llave no sirve | Igual que el 429, porque todos los demás fallarían igual |
| 409, una petición igual todavía en curso | Vuelve a la cola sin gastar el intento |
| Otro 4xx, como un dominio sin verificar | failed con el nombre del error, sin datos |
| 5xx o sin respuesta | failed para otro intento. Se intenta hasta 5 veces, con 15 minutos más de espera cada vez |

Resend recibe como Idempotency-Key la clave del correo, y la recuerda 24 horas. Si la función mandó un correo y se cayó antes de cerrarlo, el reintento no manda otro.

## El interruptor de envío

Hay un solo interruptor para todos los correos, la clave email_delivery de platform_settings, con la forma enabled y paused.

- Nace en false. billing_emails, el de B10, ya no manda nada y quedó sin uso.
- paused es la lista de tipos detenidos. Sirve para frenar uno, por ejemplo daily_review_reminder, sin frenar los demás.
- Lo prendes y pausas en Plataforma, sección Correos y alertas, que además te muestra cuántos correos salieron en los últimos 7 días por tipo y estado, sin destinatarios.
- Al prender el envío no sale lo viejo. Un recordatorio de más de 6 horas, un aviso de fin de prueba cuya fecha ya pasó y un aviso de pase ya vencido se marcan skipped con el motivo stale. Así no llega de golpe un recordatorio de ayer.
- Con el envío apagado o el tipo en pausa tampoco se encolan recordatorios nuevos.

## El recordatorio diario de repaso

Lo prende el alumno en Ajustes del repaso. Nace apagado.

- Hora en punto de las 5 a las 23 de su zona. Las horas de la madrugada se evitan porque el día de estudio corta a las 4.
- Frecuencia Diario, Lunes a viernes o Días que elijas.
- Casilla Solo si tengo pendientes, prendida de fábrica. Con cero tarjetas vencidas no se manda y el día queda marcado.
- La zona es la que tenía su dispositivo al guardar.

Cada 15 minutos la base revisa a quién le toca (su hora local, su día y sin recordatorio de hoy) y encola uno por alumno y día local.

**El número de tarjetas.** Las tarjetas de los mazos precargados no viajan a la nube, así que el servidor no las puede contar. La app sube una foto pequeña con solo fechas y conteos al terminar un repaso, al abrir y al guardar los recordatorios. Sin foto, o con una de más de 14 días, el correo va sin número y dice que el repaso espera. En ese caso Solo si tengo pendientes no lo detiene.

**Qué dice.** El asunto es Hoy te tocan N tarjetas en Studiare, con singular y con una variante sin número. El cuerpo trae un botón a Repasar, las tarjetas nuevas si hay, un enlace para cambiar los recordatorios y otro para darse de baja. No lleva seguimiento de aperturas ni de clics, porque mediría personas sin su permiso.

## La baja de un clic

El recordatorio lleva los encabezados List-Unsubscribe y List-Unsubscribe-Post (RFC 8058), que Gmail y Yahoo piden y recomiendan siempre.

- El encabezado apunta a la función email-unsubscribe con la ficha del alumno. La ficha son 144 bits al azar y cambia cada vez que el alumno vuelve a prender los recordatorios.
- Un POST de un clic apaga el recordatorio y la función responde 200 en blanco aunque la ficha no exista, para no revelar nada.
- El enlace Darme de baja del pie va a la página /correo/baja de la app, que pregunta y pide confirmar. Así los revisores de enlaces que abren los correos con GET no dan de baja a nadie. La función responde un GET con una redirección a esa página.
- Quien se da de baja queda con los recordatorios apagados. Para volver a recibirlos los prende en Ajustes del repaso.

## Cómo probar sin ninguna llave

Nada de esto toca Resend, Supabase ni Cron de verdad.

```bash
bash supabase/tests/run.sh          # pruebas SQL, con reminders_test.sql y engagement_cron_test.sql
npx vitest run supabase             # plantilla, Resend simulado, send-emails y email-unsubscribe
```

- La plantilla y el envío se prueban con un Resend simulado (supabase/functions/_shared/fakeResend.ts) que guarda lo que llega, repite una clave de repetición y responde 429 si pasan más de 2 peticiones por segundo.
- Sin la llave, la función responde que falta la configuración. Esto es lo que debe salir en el proyecto real recién desplegado, con todo apagado. El missing_dsn de monitoring-test solo lo ve un admin con segundo factor, porque la función revisa su sesión antes de decir nada de la configuración.

| Llamada | Respuesta que debe dar |
|---|---|
| send-emails sin ficha | 401 |
| send-emails con la ficha y sin RESEND_API_KEY | 503 con missing_configuration, sin mandar ni reclamar nada |
| email-unsubscribe con una ficha falsa | 200 en blanco |
| monitoring-test sin la sesión de un admin con segundo factor | 401 sin sesión y 403 con otra. Con la sesión del admin y sin SENTRY_DSN, missing_dsn |

## Cómo prenderlo

Cuando tengas cuenta de Resend. Los pasos con las pantallas están en docs/PENDIENTES_DE_RICARDO.md, sección B15.

1. Crea la cuenta, agrega tu dominio y pon en tu DNS los registros SPF, DKIM y DMARC que te da. Hasta que el dominio esté verificado, Resend solo deja mandar a tu propio correo.
2. Pon en Supabase, Edge Functions, Secrets, RESEND_API_KEY (una llave solo de envío y solo de tu dominio), EMAIL_FROM y SUPPORT_EMAIL.
3. Avisa a la sesión. Ella manda un correo de cada tipo a tu cuenta de prueba.
4. Prende Mandar los correos de la cola en Plataforma, Correos y alertas, y la bandera emailReminders para que aparezca la sección en Ajustes del repaso.

Resend gratis da 3,000 correos al mes y, según terceros, 100 al día. Con recordatorios diarios alcanza para unos 80 alumnos que los prendan. Pro cuesta 20 dólares al mes y da 50,000. Recomendado empezar en el gratis con los primeros aspirantes y pasar a Pro antes de abrir el registro. Es un gasto y lo decides tú.

## Si algo falla

| Qué ves | Qué significa |
|---|---|
| Muchos failed con Resend respondió 403 validation_error | El dominio de EMAIL_FROM no está verificado en Resend |
| El conteo de skipped crece con recordatorios | Los alumnos apagaron el recordatorio o no confirmaron su correo. Es normal |
| Hay correos stale | Se prendió el envío después de un rato. Es lo esperado y evita mandar lo viejo |
| En cola siempre sube y nada sale | El interruptor está apagado, el tipo está en pausa o send-emails no tiene sus llaves. Mira Edge Functions, send-emails, Logs |
| Resend respondió 429 | Se pasó del límite del plan. El lote se detiene y sigue al minuto siguiente |

Los registros de la función solo traen conteos y códigos. Nunca el contenido de un correo, una dirección, una ficha ni una llave.

## Qué nunca pasa

- Ninguna dirección de correo se guarda en la cola ni se registra. Se resuelve al enviar con la llave de servicio.
- Solo se manda a cuentas con el correo confirmado.
- Los recordatorios nunca salen sin que el alumno los prenda, ni a quien se dio de baja.
- Borrar mis datos quita los recordatorios, la foto de tarjetas vencidas y los recordatorios que seguían por mandarse. Los avisos de cobro pendientes se quedan, porque la cuenta y el plan se quedan. Borrar la cuenta lo quita todo.
