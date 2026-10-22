# Cambios al aviso de privacidad en B17

Lista de lo que B17 (publicación en un dominio propio) cambió en el aviso de privacidad, para que el abogado y Ricardo la revisen junto con CAMBIOS-B16.md y CAMBIOS-B15.md. El texto sigue en borrador para revisión del abogado, en la app y en docs/legal. La marca se quita solo cuando Ricardo diga que el abogado lo aprobó (0.1 del plan del cambio). Los términos y condiciones no cambian en este bloque.

## Por qué cambia

El aviso decía que la página la aloja hoy GitHub Pages y después Cloudflare, en una sola frase, y nombraba a GitHub solo por la calibración nocturna. Al mudar la página a un dominio propio hay que decirlo con cada proveedor y con lo que ve. Además, si el alumno paga con Apple Pay o Google Pay dentro de la pantalla Suscripción, la página carga en su navegador el componente de Stripe, que antes no estaba en ninguna página de Studiare. El aviso no debe decir que no hay terceros en el sitio mientras Cloudflare esté en medio.

## Qué cambió en el texto

Todo está en Con quién compartimos tus datos y en Cookies y almacenamiento en tu navegador.

- **Cloudflare**, nuevo. Entra como encargado cuando la página se mude a su dominio propio. Aloja y entrega la página y administra el nombre del sitio (DNS). Ve datos técnicos de la conexión, como la dirección IP, y puede guardar registros técnicos de seguridad. Studiare no usa su analítica ni cookies de publicidad. Puede tratar datos fuera de México
- **Cloudflare Email Routing**, dentro del mismo punto. Si se usa su reenvío de correo para las direcciones de privacidad y de soporte, Cloudflare también lee los correos que el alumno escribe ahí al reenviarlos. Está redactado como condicional, porque es una decisión de Ricardo que depende de si su dominio ya tiene correo (11.8 del plan de B17)
- **GitHub**, reescrito. Antes decía solo cuando se active la calibración. Ahora dice que ahí vive el código de Studiare, que hoy aloja la página hasta que se mude a su dominio propio, que mientras la aloja ve datos técnicos de la conexión como la dirección IP, y conserva lo de la calibración nocturna
- **Stripe**, una frase más. Cuando esté disponible pagar con Apple Pay o Google Pay dentro de Suscripción, y solo si el alumno lo elige, la página carga en su navegador el componente de Stripe, y Stripe recibe señales del aparato para prevenir fraude. La página hospedada de Stripe donde ya se paga con billeteras no cambia
- **Cookies y almacenamiento**, una frase más. El componente de Stripe puede guardar en el navegador identificadores propios para prevenir fraude. Se dice con puede porque es lo que hace Stripe.js y no una decisión de Studiare. Sigue diciendo que Studiare no usa cookies de publicidad ni de rastreo
- Desaparece la frase El servicio que aloja la página, hoy GitHub Pages y después Cloudflare. Una prueba revisa que no vuelva

Nada de esto cambia lo que el alumno puede hacer ni lo que Studiare guarda de él. Cambia a quién se le dice que ve la conexión.

## La versión del aviso

PRIVACY_NOTICE_VERSION pasa de 2026-10-21 (B15) a 2026-10-22, con la fecha a la vista del 22 de octubre de 2026. Quien aceptó la anterior ve el aviso de que cambió y lo acepta de nuevo. Una prueba revisa que la nueva quede después de todas las anteriores al ordenarlas como texto.

Es una decisión de Ricardo y su abogado, y va en su propio commit (Sube la versión del aviso de privacidad a 2026-10-22).

- **Opción recomendada, subirla ya.** Razón en una línea. El texto cambió, la versión es lo que el alumno acepta y todavía no hay alumnos reales, así que pedir una aceptación más cuesta casi nada, y no subirla dejaría la aceptación de una versión apuntando a un texto que ya no existe
- **Otra opción, dejarla en 2026-10-21 y subirla el día de la mudanza.** Tiene sentido si el abogado prefiere aprobar un solo texto final. Se logra revirtiendo ese commit. El texto actual dice cuando la página se mude, así que es cierto antes y después

La versión también tendrá que subir otra vez a los 30 días de la mudanza, cuando GitHub deje de aparecer como quien aloja la página.

## Lo que el texto da por hecho de B17

Antes de quitar la marca de borrador tiene que ser cierto.

- Web Analytics de Cloudflare apagado y ninguna regla de caché, de Rocket Loader o de Auto Minify en el dominio (paso B17.11 de docs/PENDIENTES_DE_RICARDO.md). Si Ricardo prende la analítica de Cloudflare, el aviso dejaría de ser cierto en Studiare no usa su analítica
- La política de seguridad de la página (src/config/csp.ts) solo abre Stripe cuando la página trae la llave publicable de Stripe, y Stripe.js solo se carga dentro de Suscripción y detrás de la bandera expressWallets, apagada. Mientras esté apagada, ningún alumno carga Stripe.js
- El correo de acceso sale de Resend por el SMTP de Supabase. El punto de Resend del aviso, que dice cuando se active, ya lo cubre
- Si no se usa el reenvío de correo de Cloudflare, la frase condicional sobra y se puede quitar

## Preguntas para el abogado

Se suman a las de CAMBIOS-B16.md y CAMBIOS-B15.md. Las preguntas 3 y 18 de B16 se retoman aquí porque B17 las vuelve concretas.

1. **Retoma la 3 de B16.** Cloudflare, Stripe, GitHub, Resend, Supabase, Anthropic, Google, PostHog y Sentry tratan datos fuera de México. ¿Basta con nombrar a cada encargado, decir lo que ve y avisar que puede tratar datos fuera de México, o hace falta una cláusula de transferencia o un contrato aparte con alguno?
2. **Registros de Cloudflare.** El aviso dice que puede guardar registros técnicos de seguridad y no dice cuánto tiempo. El aviso no pone un plazo porque no se pudo confirmar en la documentación de Cloudflare al escribir esto, y no se inventó uno. ¿Hace falta ponerlo? Si sí, hay que revisar el plazo vigente de Cloudflare
3. **Stripe.js y sus identificadores.** El componente de Stripe puede guardar identificadores para prevenir fraude y recibe señales del aparato, y solo se carga si el alumno elige pagar con una billetera dentro de Suscripción. ¿Basta con decirlo en Con quién compartimos tus datos y en Cookies y almacenamiento, o conviene un aviso o una casilla antes de cargarlo? La página hospedada de Stripe, que ya se usa, no cambia
4. **Reenvío de correo de Cloudflare.** Quien escribe a privacidad puede mandar datos propios, incluso sus derechos ARCO. Si Cloudflare reenvía esos correos, ¿hay que decirlo con más detalle, o conviene que los dos buzones sean de un proveedor de correo con contrato (Google Workspace o Zoho) antes de abrir el registro? La recomendación del plan de B17 es empezar con el reenvío y pasar a un buzón real antes de abrir
5. **Cuándo suben la versión y se pide aceptar de nuevo.** ¿Cada cambio de proveedor pide una versión nueva del aviso y una aceptación nueva, o basta una nueva cuando el cambio afecta qué datos se tratan? Hoy el proyecto sube la versión con cada cambio de texto
6. **Retoma la 18 de B16.** Sigue pendiente el plazo de Sentry. B17 no la cambia, pero el aviso se manda junto

## Preguntas para Ricardo

1. **La versión.** ¿Subimos el aviso a 2026-10-22 ahora, como está, o la dejamos en 2026-10-21 hasta el día de la mudanza? Recomendado subirla ahora
2. **El correo de privacidad.** ¿Empiezas con el reenvío gratis de Cloudflare o ya tienes un correo de tu dominio con proveedor? De eso depende que la frase del reenvío se quede o se quite (docs/DOMINIO_Y_CORREO.md)
3. **Manda estos tres archivos a tu abogado** junto con CAMBIOS-B16.md y CAMBIOS-B15.md. Son docs/legal/aviso-de-privacidad.md, docs/legal/terminos-y-condiciones.md y este
4. **A los 30 días de la mudanza**, cuando GitHub Pages se despublique, avísame para quitar del aviso que GitHub aloja la página y subir la versión

## Cambios en la app y en el código

- src/i18n/legalDocs.ts tiene el texto nuevo. docs/legal/aviso-de-privacidad.md se generó con npm run legal:export, y una prueba falla si se queda atrás
- src/config/legal.ts sube PRIVACY_NOTICE_VERSION a 2026-10-22 y explica la historia de versiones
- src/features/legal/fillLegal.test.ts tiene una prueba nueva (Cloudflare, GitHub y el componente de Stripe están en el aviso con lo que ven, y la frase vieja ya no), la versión y la fecha nuevas, y el orden de las versiones con la de B17
- Las variables VITE_LEGAL_NAME, VITE_LEGAL_ADDRESS, VITE_PRIVACY_EMAIL y VITE_SUPPORT_EMAIL ya no se repiten en Cloudflare. B17 publica con carga directa desde GitHub Actions, que construye la página con las variables de GitHub, y por eso los textos de B15 y B16 que decían en GitHub y después en Cloudflare pasan a decir en GitHub (hallazgo H11 del plan de B17)
