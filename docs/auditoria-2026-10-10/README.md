# Auditoría funcional de la página

Fecha 2026-10-10, Fase H. Se pidió revisar todas las funcionalidades para que todo funcione bien. Esto resume cómo se hizo, qué cubre, qué se encontró, qué se corrigió y qué no puede cubrir una prueba automática.

## Cómo se hizo

La auditoría es código que se puede repetir, no una revisión a ojo. Vive en tests/audit y se corre con npm run audit:ui contra el build de producción. No corre en el CI porque tarda unos 25 minutos, pero cualquiera puede repetirla.

- **Recorrido por pantalla (crawl.spec.ts).** Entra con cada rol y abre las 32 pantallas. En cada una revisa que haya título, que no salga la pantalla de error, que nada se desborde a los lados, que no haya errores ni excepciones en la consola, que ninguna petición falle, que no haya imágenes rotas ni textos como undefined o NaN, y que axe no marque problemas serios ni moderados de accesibilidad (reglas WCAG 2.2 AA y buenas prácticas). Después le da clic a los controles que no destruyen nada, hasta 25 por pantalla, y vuelve a revisar si algo se rompió. También busca trampas de teclado, es decir lugares donde el foco entra y ya no puede salir con Tab.
- **Flujos con interrupciones (flows.spec.ts).** Lo que un alumno hace sin querer. Recargar a media práctica, volver con el navegador, perder la conexión, hacer doble clic al contestar y compartir el dispositivo con otro perfil.
- **Nube caída (cloud-down.spec.ts).** El build apunta a un proyecto de Supabase que no responde. Se crea la cuenta, se abren todas las pantallas y un médico con la sesión vencida abre la app sin red.
- **Con el servidor de desarrollo.** El recorrido también se corrió con AUDIT_DEV=1, que sí avisa de los problemas de React que el build oculta, y con AUDIT_WARN=1, que cuenta los avisos de la consola.

## Cobertura

| Qué | Cuánto |
|---|---|
| Roles recorridos | Alumno, médico, admin y dueño |
| Datos | Cuenta vacía del alumno y datos de demostración de los cuatro roles |
| Tamaños | Teléfono de 390 por 844 y escritorio de 1280 por 800 |
| Recorridos completos | 10, cinco por tamaño |
| Pantallas por recorrido | 32. Se omite solo el selector de rol, que en la nube no se usa |
| Flujos con interrupciones | 5 por tamaño |
| Nube caída | 1, en escritorio |

## Resultado del último recorrido completo

- Los 10 recorridos terminaron con 0 hallazgos
- Los 10 flujos con interrupciones pasan, ya con afirmaciones y no solo con registros
- La prueba de nube caída pasa con 0 hallazgos
- Los informes por recorrido están en la carpeta recorrido, un JSON por rol, tipo de datos y tamaño

## Qué se encontró y se corrigió en la Fase H

Son los problemas reales que salieron de la auditoría y de revisar cómo se define cada tipo de cuenta, en el orden en que aparecieron. Cada uno tiene una prueba que falla sin el arreglo.

1. **La sección Configuración no mostraba el foco con el teclado.** Se había quitado el contorno del contenido de las pestañas. Se devolvió.
2. **El aviso de modo demostración no era una región con nombre.** Un lector de pantalla no lo anunciaba. Ahora es una sección con etiqueta.
3. **Usuarios solo existía en el navegador.** Con la nube conectada, el admin no veía a las personas reales ni podía nombrar médicos. Se agregó la novena migración con la lista de usuarios y el cambio de rol que revisa el servidor, y la pantalla Usuarios cambia sola a esa lista cuando hay nube.
4. **Un médico sin conexión podía bajar a alumno.** Si el rol no se podía leer por falta de red, la app lo trataba como alumno. Ahora conserva el último rol verificado y reintenta con espera creciente y al volver la red.
5. **Un aviso de privacidad nuevo no se volvía a pedir.** El aviso ahora tiene versión. Quien aceptó una versión anterior ve un aviso para aceptar la nueva, y la nube registra la versión que de verdad se aceptó.
6. **Con el token vencido y sin red, la app daba la sesión por cerrada.** Supabase responde sin sesión y con un error de red cuando no puede renovar el token. La app lo leía como cierre de sesión y quitaba el área del médico. Ahora lo trata como una falla de red y conserva el rol. Lo encontró la prueba de nube caída.
7. **La primera visita no funcionaba sin red hasta recargar.** El service worker se instalaba pero no tomaba el control de la página abierta, así que una pantalla que aún no se había visitado fallaba con Algo salió mal si se perdía la red antes de recargar. Se activó clientsClaim y hay una prueba de punta a punta nueva. Lo encontró el flujo de práctica sin conexión.
8. **Recargar a media práctica la perdía.** Las respuestas ya contestadas no se perdían, porque quedan como eventos, pero la sesión sí. Ahora la práctica se guarda en la sesión de la pestaña, con solo identificadores, validada con zod al leerla y tolerante a que el navegador bloquee el almacenamiento. El examen ya hacía esto.
9. **Borrar la cuenta con una suscripción activa de Stripe no avisaba.** Ahora el servidor lo detiene y la pantalla explica que primero hay que cancelar la suscripción.

## Qué se corrigió de la propia auditoría

Una auditoría también falla. Estas fallas de las pruebas se corrigieron para no dar falsa seguridad.

- Los campos de fecha y hora se marcaban como trampa de teclado porque tienen varias paradas internas con Tab
- La prueba de nube caída usaba una dirección que la app descarta por no tener forma de proyecto de Supabase, así que nunca probaba la nube. Eso confirma que la validación de la configuración funciona
- Dos flujos solo registraban lo que veían. El de dos perfiles comparaba textos de 8 caracteres porque tomaba la pantalla antes de que cargara. Ahora esperan el contenido y afirman

## Lo que esta auditoría no cubre

- **Supabase real.** Las pruebas usan una nube simulada y un proxy de IA en modo simulado. Las políticas de la base se prueban aparte con las diez suites SQL contra Postgres local. Falta probar con tu proyecto real cuando lo conectes.
- **Pagos reales.** Stripe y Mercado Pago se probaron con respuestas simuladas, no con dinero ni con tus cuentas.
- **Otros navegadores.** Todo corrió en Chromium. Safari en iPhone y Firefox no se probaron.
- **Lector de pantalla.** axe detecta problemas técnicos, pero no sustituye escuchar la app con VoiceOver o TalkBack.
- **Dispositivos reales.** El teléfono es una emulación de pantalla y de toque, no un aparato con su red y su rendimiento.
- **Acciones destructivas.** El recorrido no toca eliminar, borrar, cerrar sesión, restablecer, descargar ni cambiar de rol. Esas acciones tienen sus propias pruebas de punta a punta.
- **Contenido médico.** Una prueba automática no puede decir si una pregunta es correcta. Eso lo revisa un médico.
- **Asignaciones de preguntas a médicos.** Siguen viviendo en el navegador hasta que el banco esté en la nube.

## Cómo repetirla

```
npm run audit:ui
AUDIT_DEV=1 npm run audit:ui -- --project=escritorio
AUDIT_CLOUD=down npm run audit:ui -- --project=escritorio -g "nube caída"
```

Los informes salen en docs/auditoria-2026-10-10/recorrido, o en la carpeta que indique AUDIT_OUT.
