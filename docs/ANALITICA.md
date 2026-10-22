# Analítica de uso

Qué mide Studiare, por qué, qué nunca sale de la app, cómo funciona el permiso del alumno, cómo probar todo sin ninguna cuenta y cómo prender cada interruptor cuando PostHog esté listo. Es el bloque B15 del plan del cambio V3 (docs/PLAN_DEL_CAMBIO.md). Todo sale apagado. Sin la llave de PostHog, sin el permiso del alumno o con la bandera apagada no sale ni un evento. Los errores de la app y de las funciones van aparte, con Sentry, y están en docs/ALERTAS.md. Los correos, en docs/CORREOS.md.

## Qué se mide y por qué

Se mide para dos cosas.

- Saber qué partes de Studiare se usan y cuáles no, para decidir qué mejorar.
- Saber cuántas personas llegan del registro al pago y dónde se quedan, para el embudo de la sección Embudo del registro al pago, más abajo.

No se mide para predecir el puntaje del ENARM ni para saber cómo contesta cada alumno. Los puntajes, los aciertos por pregunta, los sesgos y la especialidad que busca el alumno nunca viajan.

Las reglas que no se rompen.

- Nada sale sin el permiso Medición de uso, que empieza apagado. Antes de conocer el permiso no se junta nada, ni siquiera en memoria.
- Sale con un identificador seudónimo aleatorio, nunca con el id de la cuenta, el correo, el alias ni un nombre.
- Solo eventos de una lista cerrada, con propiedades de listas cerradas, números en rangos o sí y no. Un texto libre no cabe en el tipo, y si llega por otro camino el evento completo se descarta.
- Sin cookies, sin localStorage, sin autocaptura, sin grabación de sesiones y sin mapas de calor. El cliente es propio, sin la biblioteca de PostHog (src/data/analytics), y una prueba de arquitectura lo vigila.
- La base de demostración, la demo publicada y el entorno de desarrollo nunca miden.
- Medir no rompe nada. Un error al mandar no se ve en la consola, no reintenta en bucle y no frena la app.

## Qué se mide, evento por evento

La lista cerrada vive en src/data/analytics/catalog.ts. Una prueba compara la de los eventos del servidor con la migración 20261029000002.

### Eventos de la app

| Evento | Cuándo sale | Propiedades |
|---|---|---|
| signup_completed | Se crea una cuenta con el permiso prendido | method (email o google), target_specialty_set (sí o no, nunca cuál) |
| review_session_completed | Termina un repaso con al menos una tarjeta | items (1-9, 10-49, 50-199, 200+), minutes (1-4, 5-14, 15-29, 30-59, 60+) |
| practice_session_completed | Termina una práctica con al menos una pregunta | section (es o en), items, feedback (each o end), targeted |
| exam_started | Empieza un examen | size (20, 50, 100 o 280), english_included |
| exam_completed | Termina un examen | size, english_included, reason (completed, time_up o abandoned) |
| question_card_created | Se crea una tarjeta desde una pregunta | origin (exam_review o practice_feedback), ai_suggested |
| outline_created | Se crea un apunte | template (blank, class, clinicalCase o topicSummary), class_mode |
| outline_line_to_card | Una línea de un apunte pasa a tarjeta | card_kind (forward, both, cloze o multiline) |
| outline_search_used | Se busca en Apuntes | results (0, 1-4, 5-19, 20+) |
| pomodoro_completed | Termina una fase de enfoque | focus_minutes (15, 25, 50 u other) |
| duel_started | Empieza un reto de Party | ninguna |
| duel_completed | Todavía no sale, ver la aclaración de abajo | result (won, lost o tie) |
| party_group_joined | El alumno entra a un grupo de Party | ninguna |
| official_score_captured | El alumno captura su puntaje oficial | ninguna, nunca el puntaje ni el año |
| deck_imported | Se importa un mazo en apkg o csv | format (apkg o csv) |
| paywall_viewed | Se ve el candado de una función de Gratis | feature (outlines, party, import_decks, catalog, full_exam o ai) |
| checkout_started | Se toca el botón de pagar, aunque el pago no llegue a abrirse | plan, method (card, oxxo, spei o mercadopago), with_trial |
| reminder_prefs_saved | Se guardan los recordatorios por correo | enabled, frequency (daily, weekdays o custom), hour_band (morning, afternoon o night) |
| tour_started | Empieza el recorrido | trigger (auto o settings) |
| tour_step_viewed, tour_completed y tour_skipped | Se ve un paso, se termina o se salta | step (welcome, home, review, outlines, simulator, progress, party o settings) |

Dos aclaraciones.

- La mayoría sale de la bitácora de eventos que ya existía, traducida por src/data/analytics/fromAppEvents.ts. Solo cuenta lo que pasa en este dispositivo. Lo que la sincronización baja de otros dispositivos no se mide dos veces.
- duel_completed está en la lista, pero hoy no sale. Su resultado depende del rival, que la bitácora de la sesión no trae, y un evento a medias no se manda. Queda para cuando exista ese dato.

### Eventos de dinero, desde el servidor

La verdad del dinero vive en el webhook, no en el navegador. Disparadores en las tablas subscriptions y payments encolan el evento en la base, y la función analytics-flush los manda a PostHog con el mismo identificador seudónimo del alumno. Solo se encolan si el interruptor analytics está prendido en el servidor y el alumno dio el permiso.

| Cambio | Evento | Propiedades |
|---|---|---|
| La suscripción pasa a prueba | trial_started | plan |
| De prueba a activa con su primer cobro | trial_converted | plan |
| De prueba a cancelada | trial_canceled | plan |
| Se programa la cancelación al final del periodo | subscription_cancel_scheduled | plan |
| De activa o vencida a cancelada | subscription_canceled | plan |
| Cambia el plan de pago | plan_changed | from_plan, to_plan |
| Un pago pasa a pagado con monto mayor a cero | payment_succeeded | plan, purpose (subscription o pass), method, first |
| Se registra un reembolso | refund_issued | purpose |

La factura de 0 pesos de la prueba nunca cuenta como pago. Los planes posibles son founder, founder_annual, monthly y annual. Los disparadores nunca hacen fallar un pago ni una suscripción, porque todo va dentro de un bloque que atrapa cualquier excepción.

### Lo que viaja en todos los eventos

| Propiedad | Valores |
|---|---|
| app_version | La versión de la app (VITE_BUILD_ID, los primeros 7 caracteres del commit) |
| platform | phone o desktop, según el ancho de la ventana |
| installed | Si corre instalada como PWA |
| plan_kind | free, trial o paid |
| role | student, physician, admin u owner |
| $lib | studiare-web |
| $process_person_profile | false, así PostHog no arma perfiles de persona |
| $geoip_disable | true, así no resuelve la ubicación por la IP |

## Lo que nunca sale

- Alias, correo, nombre, foto ni el id de la cuenta. Tampoco los ids de preguntas, tarjetas, mazos, apuntes o grupos.
- Texto del alumno, de las preguntas, de las tarjetas, de los apuntes, de la IA ni lo que busca.
- Puntajes, aciertos por pregunta, sesgos del alumno y su especialidad.
- Cómo nos conociste y el código de influencer. El aviso de privacidad dice que no van a ninguna herramienta de analítica, por eso signup_completed no lleva heard_from ni has_code (D-132).
- Direcciones con consulta. La IP se descarta en el proyecto de PostHog (paso B15.3 de docs/PENDIENTES_DE_RICARDO.md) y además cada evento pide no resolver la ubicación.
- Nada de lo anterior aunque alguien lo pida por error en el código. Cada propiedad acepta solo valores de su lista, y un evento con una propiedad de más o de menos se descarta completo.

Cómo se vigila.

- catalog.ts descarta el evento completo si una propiedad no es de su lista (sanitizeEvent).
- Una prueba de propiedad (noConsent.property.test.ts) lanza secuencias al azar de eventos y cambios del permiso, la bandera, la llave, la base, el entorno y la nube, y revisa que ninguna petición lleve un evento que se midió sin el permiso prendido en ese momento.
- Una prueba de arquitectura (src/data/analytics/architecture.test.ts) revisa que solo transport.ts haga peticiones al host de PostHog, que solo config.ts lea VITE_POSTHOG_KEY y VITE_POSTHOG_HOST, que nadie importe posthog-js y que la analítica no toque cookies ni almacenamiento.
- En las funciones, analytics-flush vuelve a revisar cada evento contra la lista antes de mandarlo, aunque la base ya lo hizo, y externalExits.test.ts revisa que solo ese archivo hable con PostHog.
- La política de seguridad del navegador (CSP) permite solo us.i.posthog.com o eu.i.posthog.com, según el host que se configure, y solo en connect-src.

## Cómo funciona el permiso

El permiso se llama Medición de uso. Empieza apagado.

- Se pide en el registro y en Completa tu registro, y se cambia cuando el alumno quiera en Configuración, Privacidad.
- Cada decisión queda en la bitácora local como un evento consent_changed, como los otros tres permisos. Esa bitácora manda.
- AnalyticsGate (src/app/AnalyticsGate.tsx) lee la decisión más reciente y se la pasa al cliente de analítica. Solo se monta si la bandera, la llave y el entorno dejan medir alguna vez.
- Mientras se lee la decisión, no se hace nada. En un cambio directo de una cuenta a otra, el permiso de la anterior nunca se aplica a la nueva.
- Con el permiso prendido y la cuenta de la nube conectada, la app pide al servidor el identificador seudónimo (analytics_identity) y le avisa del permiso (set_analytics_consent), para los eventos de dinero. El identificador es un uuid aleatorio, igual en todos los dispositivos del alumno, que no se deriva de su cuenta. Vive en memoria durante la sesión de la pestaña y no se guarda en el navegador.
- Las cuentas solo locales, sin nube, no se miden, porque no tienen identificador.

Cuándo se puede juntar y mandar. Todo debe cumplirse a la vez (src/data/analytics/gate.ts).

| Condición | Qué pasa si falta |
|---|---|
| La bandera productAnalytics está prendida | No se junta nada |
| Hay llave de proyecto (phc_) y un host de PostHog Cloud válido | No se junta nada |
| El entorno no es desarrollo | No se junta nada |
| La base es Mi cuenta y no la de demostración | No se junta nada |
| La nube está configurada | No se junta nada |
| El permiso está prendido | No se junta nada, ni en memoria |
| Ya llegó el identificador del servidor | Se junta en memoria, con tope de 50, pero no se manda |

Retirar el permiso.

- El cliente apaga la medición al instante y tira lo que esperaba en la cola, sin mandarlo.
- El servidor marca como descartado lo pendiente de la cola de dinero, nunca borra, y cambia el identificador por uno nuevo. Lo que se mida si el alumno vuelve a dar el permiso no se une con lo de antes.
- Borrar mis datos en Configuración, Privacidad, o eliminar la cuenta, borra el identificador y la cola. Lo que PostHog ya recibió queda sin forma de ligarse a nadie. No se usa la API de borrado de PostHog, porque pide una llave personal con permisos amplios.

Ventanas que existen y por qué.

- El retiro llega al servidor cuando la app lo logra. Si falla, se reintenta cuatro veces cada 30 segundos, otra vez cuando vuelve la red mientras la app sigue abierta, y siempre al abrir la app, que revisa lo que el servidor cree.
- Si el alumno retira el permiso sin red y no vuelve a abrir la app, el servidor sigue creyendo que lo tiene. Mientras tanto puede encolar y mandar los eventos de dinero de sus renovaciones, siempre con su identificador seudónimo y nunca con datos suyos. Es la ventana más seria y no se cierra desde el servidor, porque la decisión nace en el dispositivo y solo llega con la app. En cuanto la app abre, avisa del retiro, el servidor descarta lo que no haya salido y cambia el identificador.
- Si retira el permiso en un dispositivo, otro dispositivo suyo con la app abierta sigue midiendo con el identificador viejo hasta que la sincronización le baje la decisión. Son unos minutos.
- La bandera productAnalytics apagada desde el servidor es el apagado de emergencia del navegador, pero se aplica al recargar. Una pestaña abierta sigue midiendo a quien dio el permiso hasta que se recargue. Para el lado del servidor, apaga analytics.

## El embudo del registro al pago

Es la vista que Ricardo arma en PostHog. Cuenta personas por su identificador seudónimo, y los eventos de la app y los del servidor comparten ese identificador, así que se pueden unir en un solo embudo.

| Paso | Evento | Qué significa |
|---|---|---|
| 1 | signup_completed | Creó su cuenta y dio el permiso en el registro |
| 2 | review_session_completed | Terminó su primer repaso |
| 3 | practice_session_completed o exam_completed, cualquiera de los dos | Practicó o hizo un examen por primera vez |
| 4 | paywall_viewed o checkout_started, cualquiera de los dos | Vio un candado de Gratis o tocó pagar |
| 5 | trial_started | Empezó la prueba gratis |
| 6 | payment_succeeded con first en true | Pagó por primera vez, que con la prueba es el primer cobro después de ella |

Cómo armarlo.

1. En PostHog, dentro de Product analytics, crea una visualización nueva de tipo Funnel (embudo). Los nombres de los menús de PostHog cambian, si no lo encuentras busca Funnel.
2. Agrega los pasos en ese orden. En los pasos 3 y 4 usa la opción de varios eventos por paso, para que cuente cualquiera de los dos.
3. En el paso 6 agrega el filtro de propiedad first igual a true.
4. Pon la ventana de conversión en 30 días y el orden secuencial.
5. Guárdalo en un tablero y mira primero dónde cae más gente entre un paso y el siguiente.

Cómo leerlo.

- Solo cuenta a quienes dieron el permiso. Quien no lo dio no aparece, ni siquiera en el paso 1. Las cifras son de ese grupo y no de todos los registros.
- Si alguien retira el permiso y lo da de nuevo, su identificador cambia y cuenta como otra persona.
- Los pasos 5 y 6 salen del servidor, y llegan unos minutos después, porque la función analytics-flush corre cada 5 minutos.
- El recorrido (tour_started, tour_step_viewed, tour_completed y tour_skipped) no es parte de este embudo. Se mide aparte, también solo entre quienes dieron el permiso.

## Cómo probar sin ninguna cuenta

Nada de esto necesita llaves ni sale a la red. PostHog se imita con un fetch en memoria o con un servidor falso.

```bash
# Pruebas unitarias de la analítica del navegador y de la compuerta del permiso
npx vitest run src/data/analytics src/app/AnalyticsGate.test.tsx

# Las funciones. El envío a PostHog, el límite de lo que puede salir y los puntos de salida
npx vitest run supabase/functions/_shared/analyticsFlush.test.ts \
  supabase/functions/_shared/externalExits.test.ts

# La base. Levanta un Postgres temporal. Usa el puerto que te toque
PG_TEST_PORT=54329 bash supabase/tests/run.sh

# De punta a punta, con una llave y un host simulados que pone playwright.config.ts
node scripts/playwright.ts test tests/e2e/cloud/analytics-consent.spec.ts --project=cloud-desktop
```

Qué revisan.

- Con el permiso apagado o sin saber, no se junta ni sale nada, y cada prueba que dice que no sale nada tiene al lado un caso que sí mide, para que no pase en vacío.
- Cada evento, con sus propiedades y rangos, y que uno con una propiedad de más o de menos se descarte.
- El orden de la compuerta, fila por fila, y que la cola se vacíe sin mandar al retirar el permiso.
- Los reintentos del identificador y del retiro, y que un cambio directo de cuenta no use el permiso de la anterior.
- En la base (analytics_test.sql) el identificador, el permiso, que sin permiso o con el interruptor apagado no se encole nada, cada evento de dinero, que un error del disparador no rompa el pago, y que cada alumno solo toque lo suyo.
- Las fichas de Cron y el reclamo y cierre de la cola.

En desarrollo la analítica nunca mide, aunque pongas llave. Para verla funcionar completa usa las pruebas de punta a punta de arriba, que construyen la app de nube con la llave simulada.

## Cómo prenderlo

Hay cuatro interruptores. Para que salgan los eventos de la app hacen falta la llave, la bandera y el permiso del alumno. Para los eventos de dinero hace falta además el interruptor del servidor. Ricardo hace los pasos con las pantallas en docs/PENDIENTES_DE_RICARDO.md, sección B15.

| Interruptor | Dónde | Quién |
|---|---|---|
| La llave y el host de PostHog | Variables VITE_POSTHOG_KEY y VITE_POSTHOG_HOST del build de producción (GitHub y Cloudflare) | Ricardo |
| La bandera productAnalytics | Nace prendida en producción. El servidor puede apagarla en platform_settings, clave feature_flags | La sesión, si hace falta |
| El interruptor de eventos de dinero | Plataforma, Correos y alertas, Eventos de dinero a PostHog. Es platform_settings, clave analytics | Ricardo o la sesión, con segundo factor |
| El permiso Medición de uso | Cada alumno, en el registro o en Configuración, Privacidad | El alumno |

Pasos, cuando tengas cuenta de PostHog.

1. Crea la cuenta y un proyecto llamado Studiare en la nube de EE. UU., que es lo recomendado por estar más cerca de México.
2. En Project settings prende Discard client IP data y deja apagadas la grabación de sesiones, las encuestas y la autocaptura. La app no usa ninguna.
3. Copia la llave del proyecto, la que empieza con phc_, y la dirección de captura, https://us.i.posthog.com. Nunca uses una llave personal, la que empieza con phx_. La app y las funciones la rechazan.
4. Ponlas como VITE_POSTHOG_KEY y VITE_POSTHOG_HOST en las variables de GitHub, y después en Cloudflare. Ponlas también en Supabase, Edge Functions, Secrets, como POSTHOG_PROJECT_KEY y POSTHOG_HOST. Una llave en el chat no se pega nunca.
5. Despliega la función analytics-flush sin verificación de JWT, que lo hace la sesión con el plan b15 (docs/SUPABASE.md). Cron la llama cada 5 minutos, solo si el interruptor está prendido y hay eventos pendientes.
6. Avisa a la sesión. Ella prende analytics, revisa que lleguen eventos de su cuenta de prueba con el permiso y te deja el embudo listo. Para apagar los eventos de dinero de golpe, apaga el mismo interruptor en Plataforma.

Mientras falte alguno de los que corresponden, el producto funciona completo y no sale nada de ese tipo.

Apagado de emergencia.

- Del lado de la app, pon productAnalytics en false.

```sql
insert into public.platform_settings (key, value) values ('feature_flags', '{"productAnalytics": false}')
on conflict (key) do update set value = public.platform_settings.value || '{"productAnalytics": false}', updated_at = now();
```

  Se aplica cuando cada alumno recarga la app.
- Del lado del servidor, apaga Eventos de dinero a PostHog en Plataforma, Correos y alertas, o pon analytics.enabled en false.

## Lo que falta confirmar con la cuenta real

Estas cosas no se pueden comprobar sin red ni cuenta, y están marcadas para revisarlas antes de prender productAnalytics.

- Que PostHog acepte la petición de preparación (preflight) de CORS para application/json desde el dominio de la app. Si no, el envío necesita ajustarse.
- Que la IP quede descartada por el proyecto, además del $geoip_disable de cada evento.
- Que los eventos lleguen al proyecto de EE. UU. con el host configurado.

## Dónde está cada cosa

- src/data/analytics. El cliente, el catálogo, la compuerta, la cola, el transporte y el puente de la bitácora.
- src/app/AnalyticsGate.tsx. Lo que sabe la sesión, el identificador y el aviso al servidor.
- supabase/migrations/20261029000002_product_analytics.sql. Las tablas analytics_subjects y analytics_outbox, los disparadores y las funciones, todo sin permisos de tabla para la API.
- supabase/functions/analytics-flush. El envío de los eventos de dinero a PostHog.
- supabase/migrations/20261029000003_engagement_cron.sql. El trabajo de Cron analitica-enviar.
- docs/legal. El aviso de privacidad con la finalidad Medición de uso y PostHog como encargado.
