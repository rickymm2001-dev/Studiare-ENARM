# Alertas de errores

Cómo se entera Ricardo cuando algo falla en Studiare, cómo probar las alertas sin ninguna cuenta y cómo prenderlas cuando Sentry esté listo. Es el bloque B15 del plan del cambio V3 (docs/PLAN_DEL_CAMBIO.md). Todo sale apagado. Sin la dirección de Sentry (el DSN), ni las funciones ni el navegador mandan nada.

## Qué se vigila

| Dónde | Qué se avisa | Con qué permiso |
|---|---|---|
| Las Edge Functions | Lo que lanza una función y toda respuesta 5xx | Ninguno, no lleva datos de nadie |
| El navegador | Errores y promesas rechazadas de la app, con el destino Sentry del reporte de errores | El permiso de mejora anónima, el mismo que ya cubre los reportes de fallas (D-107 y D-120) |

El destino del navegador y su regla viven en el paquete B de B15 (src/app/errorReporter.ts y sentrySink.ts). Aquí se explica lo de las funciones y la prueba, que es lo del servidor.

## Las funciones

Todas las Edge Functions están envueltas con withMonitoring (supabase/functions/_shared/monitoring.ts). Las que ya existían, create-checkout, create-portal-session, payment-webhook-stripe, payment-webhook-mercadopago, cancel-subscription, admin-reset-mfa, bank-sync, ai-proxy y ai-batch, y las nuevas, send-emails, email-unsubscribe, analytics-flush y monitoring-test.

- Si la función lanza un error o responde 5xx, manda a Sentry un evento con el nombre de la función, el método, la ruta sin consulta, el estado, el mensaje ya limpio, la región (SB_REGION) y la versión desplegada.
- La función responde exactamente igual que antes. Lo que lanza se vuelve a lanzar, y el aviso sale con EdgeRuntime.waitUntil para no retrasar la respuesta.
- Es un emisor propio, sin npm (D-096). El SDK de Deno de Sentry está en beta y Supabase advierte que comparte el contexto entre peticiones. Lo que se pierde son las trazas de rendimiento, que no se piden.
- Como mucho 20 avisos por minuto por instancia, para que un error repetido no agote la cuota gratis de 5,000 errores al mes.
- Cada evento es un sobre que va a la dirección del DSN con X-Sentry-Auth versión 7.

**Lo que nunca sale.** El cuerpo de la petición, los encabezados, las cookies, la consulta de la dirección (puede traer la ficha de baja), ids de usuario ni datos de pago. El mensaje y la traza pasan por la limpieza del navegador (src/data/telemetry/clientErrors.ts, copiada a supabase/functions/_shared/generated/scrub.ts con npm run functions:scrub, y una prueba falla si dejan de ser iguales) más una limpieza propia de las claves e ids de los servicios, como re_ de Resend, phc_ de PostHog, sntrys_ de Sentry y los ids de Stripe. Al final se revisa el evento entero, y si todavía trae un correo, un token o una clave, no sale.

**Sin SENTRY_DSN.** No manda nada y deja una sola línea en el registro de la función (Edge Functions, el nombre de la función, Logs) que dice el nombre, el tipo de falla y el estado, sin ningún dato.

## La prueba de alertas

En Plataforma, sección Correos y alertas, el botón Mandar error de prueba.

- **Desde el navegador.** Manda con el SDK el mensaje fijo Prueba de alertas de Studiare, navegador, sin datos, aunque el admin no haya dado el permiso, porque lo pidió a propósito y no lleva nada suyo. Eso lo conecta el paquete B de B15.
- **Desde las funciones.** Llama a la función monitoring-test, que solo atiende a un admin con su segundo factor, y manda el mensaje fijo Prueba de alertas de Studiare, funciones.
- La pantalla dice cómo le fue a cada lado. Si a las funciones les falta SENTRY_DSN, lo dice y no manda nada.
- Cada prueba abre su propio problema en Sentry, no se junta con la anterior. Así la regla de alerta, que avisa de los problemas nuevos, te manda un correo cada vez. Después de comprobar, resuelve o ignora esos problemas en Sentry para no dejar ruido.

Si todo está bien configurado te llegan dos correos de Sentry en unos minutos, uno por el navegador y otro por las funciones.

## Cómo probar sin ninguna cuenta

```bash
npx vitest run supabase/functions/_shared/monitoring.test.ts \
  supabase/functions/_shared/monitoringTest.test.ts \
  supabase/functions/_shared/generated.test.ts \
  supabase/functions/_shared/externalExits.test.ts
```

- Sentry se imita con un fetch en memoria que guarda lo que llega. Ninguna petición sale a la red.
- Las pruebas revisan la forma del sobre (tres líneas con su longitud en bytes), que una respuesta 5xx y una excepción manden el aviso, que una respuesta que no es 5xx no avise, que el cuerpo, los encabezados y la consulta nunca salgan, que un correo, un token o una clave en un mensaje se limpien, que la copia generada sea igual a la del navegador y que Sentry solo se toque desde monitoring.ts.
- Con una cuenta admin y sin SENTRY_DSN el botón debe decir que a las funciones les falta el DSN. Es lo esperado en el proyecto real recién desplegado.

## Cómo prenderlo

Cuando tengas cuenta de Sentry. Los pasos con las pantallas están en docs/PENDIENTES_DE_RICARDO.md, sección B15.

1. Crea la cuenta (plan Developer, gratis) y dos proyectos, studiare-web (Browser JavaScript) y studiare-funciones.
2. En cada proyecto prende Prevent Storing of IP Addresses y la limpieza de datos del servidor.
3. Pon el DSN de studiare-funciones en Supabase, Edge Functions, Secrets, como SENTRY_DSN. Es público por diseño, pero igual va como secreto.
4. En Alerts crea una regla por proyecto, que cuando se cree un problema nuevo o regrese uno resuelto mande un correo a tu cuenta.
5. Avisa a la sesión y toca Mandar error de prueba.

Solo se acepta un DSN de la nube de Sentry con la forma https, llave pública, host o{número}.ingest.sentry.io (con us o de en medio si lo trae) y número de proyecto. Un DSN de otro host cuenta como ausente.

## Los mapas de código

Los mapas del navegador se suben a Sentry en el CI y se borran de dist, porque el repo y la demo siguen públicos. Eso lo hace el paquete B de B15 con el token SENTRY_AUTH_TOKEN, que es un secreto de GitHub y nunca va al bundle.

## Qué hacer cuando llega un correo de Sentry

1. Abre el problema. El título dice la función o la pantalla.
2. En las funciones, mira Edge Functions, el nombre de la función, Logs, a la hora del evento. Los registros traen conteos y códigos, nunca datos de alumnos.
3. Si es un 5xx de una pasarela de pagos, revisa primero los secretos de esa función y el estado de Stripe o Mercado Pago.
4. Anótalo en PROGRESS.md si es algo que cambia lo que sigue.
