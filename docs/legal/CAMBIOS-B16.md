# Cambios del bloque B16 en los textos legales

Lista de lo que cambió en el aviso de privacidad y en los términos y condiciones con el bloque B16 del plan del cambio (respuestas 42 a 49, 4.26 y 4.27), contra lo que había en main después de B9. Es para el abogado de Ricardo (respuesta 44) y para Ricardo.

- Los dos textos pasan a la versión 2026-10-15, con fecha a la vista del 15 de octubre de 2026
- Siguen marcados como borrador para revisión del abogado, en la app y en docs/legal. La marca se quita solo cuando Ricardo diga que el abogado los aprobó (0.1 del plan del cambio)
- Quien aceptó una versión anterior del aviso, como la 2026-10-14 de B7 o la 2026-10-14b de B9, ve al entrar el aviso de que cambió y lo acepta de nuevo. Eso ya existía, y una prueba revisa que la versión nueva quede después de las dos al ordenarlas como texto
- El texto vive en src/i18n/legal.ts y los archivos de esta carpeta salen de ahí con npm run legal:export

## Cómo se leyó cada cosa

- Cada frase se revisó contra el código de main, contra el plan del cambio y contra el código de los bloques que todavía no llegan a main (B10 en la rama b10ui y su plan, B11 en la rama b11int y su plan). Lo que depende de un bloque que no está en main se dice abajo, en Lo que el texto da por hecho
- Se usaron como material de partida el borrador de Gemini (rama gemini/legal-b16, con su propia lista de cambios) y la rama claude/keen-hopper-4oj3c2. De ahí se tomaron la factura, OpenAI, los proveedores nuevos y la estructura de los términos. Se dejó fuera lo que no coincide con el código o con el plan, que está al final de esta lista

## Aviso de privacidad

### Responsable y contacto

- La razón social sale de la variable VITE_LEGAL_NAME, que llevará Plexus Medica S. de R.L. de C.V. (respuestas 24 y 42, 4.26). No va escrita en el texto, así un cambio que pida el contador no obliga a tocar el código. Una prueba lo revisa
- El domicilio pasa a su propia frase, Su domicilio es, para poder omitirla en la app mientras falte
- Hay un correo de privacidad aparte del de soporte (pregunta 43). Sale de la variable nueva VITE_PRIVACY_EMAIL y, si falta, se usa el de soporte, VITE_SUPPORT_EMAIL. El aviso usa el de privacidad y los términos el de soporte
- Lo que falta ya no se le muestra al alumno como marca. Antes la página decía [pendiente de completar]. Ahora el alumno lee la empresa que opera Studiare donde falta la razón social, al equipo de Studiare por el medio donde te dieron acceso donde falta un correo, igual que el aviso del límite de dispositivos, y no ve la frase del domicilio. El abogado sí ve cada dato que falta entre corchetes, con quién lo pone

### Qué datos tratamos

- Se conservan tal cual Cuenta, Edad mínima, Entrar con Google y Cómo nos conociste (B9) y Foto de perfil (B2)
- Estudio. Causas de tus errores pasa a motivos de tus errores, por los siete motivos de B5 (D-124). Se agregan los reportes de error que el alumno manda sobre una pregunta, que ya existían y no se decían
- Nuevo, Lecturas del banco (B11). Qué preguntas abre cada día, con su plan y para qué, para contar en el servidor el tope de Gratis y frenar descargas masivas. Dice que el equipo ve un aviso con el alias y la cifra del día cuando el volumen es muy alto, porque así lo muestra la lista de avisos del admin en B11
- Nuevo, Uso de la IA. El conteo diario por función y el costo, sin texto. Ya existía desde la IA alojada (ai_usage_day y ai_call_log) y no se decía
- Pagos. Se agregan el estado de la prueba gratis, el plan o pase, la pasarela, el código de descuento y que la prueba se liga al correo para dar una por persona (trial_claims de B10). Se agrega la cuenta bancaria cuando se pide la garantía de un pago en OXXO, que B10 devuelve por transferencia
- Nuevo, Prueba gratis usada (B10, tabla trial_history de la rama b10fix). Quien empieza una prueba deja una huella de su correo, un hash SHA-256 sin sal de su correo normalizado, con la pasarela, el identificador de la suscripción en la pasarela y la fecha. No guarda el correo. Sobrevive al borrado de la cuenta, ya sin ligarse a ella, solo para que nadie repita la prueba con el mismo correo. El aviso dice qué se guarda, por qué, que solo sirve para comparar el mismo correo y que no tiene fecha de borrado
- Nuevo, Factura (B10). RFC, nombre o razón social, régimen fiscal, código postal fiscal, uso del CFDI y correo, solo si el alumno pide factura. Son los campos de invoice_requests
- Nuevo, Referidos (B7). Quién invitó a quién y si ya hubo primer cobro. Quien invitó solo ve conteos, como devuelve my_referrals
- Técnicos. Se agrega el registro de acceso de Supabase con la dirección IP

### Para qué los usamos

- Nuevo. El modelo del alumno con su propio estudio, dominio por rama y tema, sesgos, ritmo y constancia, para recomendarle qué reforzar, sin predecir el puntaje (respuesta 84). Es una finalidad del servicio porque usa solo los datos del propio alumno
- Nuevo. Aplicar los límites del plan en la app y en el servidor (B8 y B11)
- Cobrar ahora incluye pases, una prueba por persona, garantía, reembolsos y factura a pedido (B10)
- Nuevo. El mes gratis por referido (B7)
- Nuevo. Los correos que necesita la cuenta, como el acceso, el fin de la prueba y el vencimiento de un pase (B10 y B15)
- Prevenir abusos menciona la descarga masiva del banco (4.10). Obligaciones legales pasa a legales y fiscales

### Lo opcional y los permisos

- La frase de entrada dice ahora que cada permiso se pide por separado y empieza apagado (4.27), como ya hace la app desde B9
- Los tres permisos del aviso son exactamente los tres que guarda la app, Party, Análisis con IA y Mejora anónima. Una prueba lo revisa contra ConsentPurposeSchema y los textos de Configuración
- Party queda con el texto de B7, sin cambios
- Mejora anónima explica que usa un identificador seudónimo y qué se calcula con esos datos, la dificultad real de cada pregunta, los distractores que no funcionan, los temas que más cuestan y los motivos de error que más pesan, y que alimenta la comparación con otros alumnos (respuestas 84 a 87)
- Se avisa que la analítica del producto y los recordatorios de repaso por correo, cuando existan, también serán opcionales, aparte y apagados

### Comparación con otros alumnos

- Sección nueva (B14). Percentiles de lo que ya pasó, contra todos y contra quien busca la misma especialidad, solo con datos de quienes dieron el permiso de mejora anónima (respuesta 87), solo con grupos de 30 o más, con estado calibrando y nunca un puntaje estimado ni probabilidad de plaza (4.2). Dice Cuando esté disponible, porque B14 todavía no existe

### Inteligencia artificial

- Se corrige algo que ya no era cierto. El aviso decía que a la IA solo viajaba texto del banco y solo con el permiso de análisis con IA. Desde la Fase C2 (D-085), B5 y B6, en los planes de pago el alumno pide tarjetas con IA desde una pregunta, desde sus apuntes o desde un texto o PDF que sube, y ese texto viaja a la IA sin depender de ese permiso. Ahora se dice, con el filtro de datos personales que ya existe
- El permiso de análisis con IA queda descrito como lo que es en el código, el tutor con hipótesis e informe (useTutorAi)
- OpenAI no recibe datos del alumno. Se usa solo en las evaluaciones internas con texto del banco (respuesta 38)

### Con quién compartimos tus datos

- Se nombra a cada proveedor con lo que recibe. Supabase, Google (entrar y el Sheet del banco, que Studiare solo lee y donde no va nada del alumno), Stripe, Mercado Pago, Anthropic, el servicio del proxy de IA, Resend, PostHog, Sentry, GitHub y el alojamiento de la página
- Stripe y Mercado Pago reciben el correo y el identificador de la cuenta, porque así arman el cliente en B10. Antes decía solo lo necesario para cobrar
- Los que no están activos dicen cuando se active, para que el texto sea cierto hoy y después. Son Mercado Pago, Resend, PostHog, Sentry y GitHub
- PostHog solo con un permiso de analítica aparte y apagado (respuesta 78)
- Sentry recibe los reportes de fallas de la app solo con el permiso de mejora anónima, como hoy los recibe Supabase (src/app/errorReporter.ts), y los errores de las funciones del servidor, sin nombre ni correo (respuesta 79)
- GitHub aparece porque la calibración nocturna de B14 corre en GitHub Actions con los datos de quienes dieron el permiso (respuesta 85)
- Hoy los correos de acceso los manda Supabase y después Resend (B17)
- Se dice que algunos proveedores guardan los datos fuera de México

### Derechos, conservación y navegador

- Por correo pasa a Por escrito, porque sin correo configurado el alumno lee el texto neutro
- Cancelar dice qué deja Borrar mis datos. De su estudio solo quedan las preguntas del banco que abrió y su uso de la IA del día de estudio en curso, para no reiniciar los límites del día (B11 y la IA alojada). Eliminar la cuenta lo quita todo, con la foto y las solicitudes de factura, salvo la huella del correo de una prueba gratis usada
- Conservación se corrige. Decía que a Studiare le quedaba el registro de los cobros, y en realidad los pagos se borran con la cuenta en cascada. Ahora lo dice, junto con que el registro de costos de la IA queda sin identificador, que la huella del correo de una prueba usada se queda sin la cuenta y sin fecha de borrado, y que la pasarela y el sistema de facturación conservan lo que pide la ley fiscal
- Cookies dice que se guarda la sesión, que hoy no hay analítica de terceros y que PostHog solo funcionará con permiso

## Términos y condiciones

- El acuerdo es con la razón social de VITE_LEGAL_NAME. La propiedad de la plataforma también se le atribuye a ella y no a la marca Studiare
- Qué es Studiare. Se agrega que la comparación con otros alumnos es de percentiles y no un puntaje estimado
- Tu cuenta. Edad mínima de 18 años con la confirmación (pregunta 45). Registro con invitación hasta que se abra (respuesta 52, D-129). Cuidar también la cuenta de Google si se entra con ella
- Planes y precios, sección nueva. Gratis con 20 preguntas distintas al día y lo que es de pago (B8). Los planes de pago sin tope diario pero sin descarga masiva (4.10). Precios en pesos con IVA incluido (respuesta 13), Mensual 149, Anual 1,499, Fundador 79 o 749 y pases de 149 por 1 mes y 1,499 por 1 año, iguales a B10. Una prueba compara los que ya existen en main con src/config/billing.ts
- Formas de pago y prueba gratis, sección nueva. Tarjeta, Apple Pay o Google Pay con renovación, pases en OXXO o SPEI sin renovación (4.4), Mercado Pago cuando se active, sin prueba ni Fundador. Un solo plan pagado a la vez (D-118). Prueba de 7 días con tarjeta, una por persona, que no se repite al eliminar la cuenta y volver con el mismo correo ni en una cuenta que ya pagó (trial_history y trial_already_used de b10fix), con la fecha y el monto del primer cobro dichos antes de pedir la tarjeta (4.18). Cancelar en la prueba no cobra. Los pases se suman. Los códigos de descuento solo descuentan el primer cobro (respuesta 21)
- Cambio de plan, cancelación y garantía, sección nueva. Subir de mensual a anual cobra la diferencia con prorrateo y bajar se aplica al fin del periodo (respuesta 9). Con Mercado Pago se cancela y se contrata el otro. Cobro fallido. Garantía de 7 días naturales desde el primer cobro o desde cada pase, con reembolso completo y devolución por transferencia en OXXO (respuesta 10, 4.18). Antes la política de reembolsos estaba toda pendiente. Ahora solo queda pendiente qué pasa después de los 7 días
- Precio Fundador, sección nueva (4.5, 4.6 y respuesta 17). 100 lugares compartidos, solo con tarjeta y renovación, el lugar se aparta con la prueba y se libera si se cancela antes del primer cobro, se conserva al cambiar entre Fundador mensual y anual, se pierde para siempre al cancelar después de pagar, qué pasa si se llenan mientras se paga y que la promoción puede terminar antes
- Invita y gana un mes, sección nueva (B7). Primer cobro de más de 0 pesos, la prueba no cuenta, se revierte con un reembolso completo, el código se canjea en los primeros días y antes del primer pago, y no hay invitaciones en círculo
- Uso. Se agregan los mazos del catálogo a lo que no se puede copiar ni publicar, y los alias o nombres de grupo de Party que ofendan o suplanten
- Contenido. El catálogo incluye mazos de terceros con autorización escrita, que se estudian solo dentro de la plataforma (respuestas 46 y 49)
- Ley aplicable. Los tribunales quedan como pendiente del abogado en una frase propia que el alumno no ve

## Cambios en la app y en el código

- src/features/legal/fillLegal.ts tiene dos lectores, el alumno y el abogado. Para el alumno, una línea que depende de un dato que falta sin texto neutro no se muestra. Para el abogado, cada falta va entre corchetes. Las marcas son {nombre}, {domicilio}, {contactoPrivacidad}, {contactoSoporte}, {reembolsos} y {jurisdiccion}. Las de contacto llevan su preposición para que el texto neutro se lea bien
- La página legal muestra como enlace el correo de privacidad y el de soporte
- src/config/legal.ts lee VITE_PRIVACY_EMAIL y sube PRIVACY_NOTICE_VERSION a 2026-10-15. .github/workflows/pages.yml pasa la variable nueva al build
- El aviso de borrador dice ahora Borrador para revisión del abogado, sin la palabra pendiente, para que ninguna marca de pendiente llegue al alumno
- El resumen del aviso en el registro dice que los permisos empiezan apagados y que a la IA también viaja el texto que el alumno elige
- Pruebas nuevas. Orden de las versiones con B7 y B9, la versión y fecha de B16, cada proveedor con lo que recibe, PostHog con permiso apagado, OpenAI solo con texto del banco, la comparación, la factura, la huella del correo de la prueba gratis, las lecturas del banco, los referidos y Borrar mis datos, los permisos iguales a los de la app, la razón social desde VITE_LEGAL_NAME, los precios contra la configuración de pagos, las condiciones de la prueba, la garantía, los pases y el Fundador, y que ninguna marca, corchete o la palabra pendiente llegue al alumno ni en la página ni en el texto

## Lo que el texto da por hecho de otros bloques

El aviso y los términos describen el producto como queda al lanzar. Antes de quitar la marca de borrador tienen que estar en main y en producción estos bloques, o hay que ajustar el texto.

- B10, con los arreglos del servidor de la rama b10fix. Precios con el Fundador anual, prueba gratis con trial_history, pases de OXXO y SPEI, garantía, cambio de plan en el portal, códigos de descuento, Mercado Pago y factura a pedido. Al unir B10 con B16 conviene que la prueba de precios compare también PLANS.founder_annual, PASS_PRICES_MXN, TRIAL_DAYS y GUARANTEE_DAYS en lugar de los números escritos
- B11. Lecturas del banco en el servidor y Borrar mis datos que conserva el día en curso
- B14. Comparación con otros alumnos y calibración nocturna en GitHub Actions. Sus textos dicen cuando esté disponible y cuando se active
- B15. PostHog, Sentry, Resend y recordatorios, con las condiciones de Huecos de consentimiento
- B17. Correo con Resend y la página en Cloudflare

## Huecos de consentimiento

- La app guarda tres permisos, party, ai_analysis y anonymized_improvement (ConsentPurposeSchema). Los tres nacen apagados al crear el perfil (INITIAL_CONSENT_STATUS en src/data/usecases/profile.ts) y en Completa tu registro, cada uno con su evento. 4.27 ya se cumple para ellos
- Falta el permiso de analítica para PostHog (respuesta 78). No existe en ConsentPurposeSchema ni en Configuración. B15 tiene que agregarlo como cuarto permiso, apagado, en el registro, en Privacidad y en la exportación, y no cargar PostHog sin él. El aviso ya lo dice como futuro y no lo presenta como un interruptor que hoy exista
- Los recordatorios de repaso por correo de B15 tienen que empezar apagados. El plan de B15 no lo dice y el aviso ya lo promete
- Sentry en el navegador tiene que seguir detrás del permiso de mejora anónima, como hoy hace errorReporter.ts con los reportes que van a Supabase. Si B15 decide otra cosa, cambia el aviso
- La comparación con otros alumnos no pide un permiso aparte, usa el de mejora anónima (respuesta 87). No se inventó uno nuevo
- La pista del permiso Mejora anónima en el registro y en Configuración dice solo Usar tus datos anonimizados para mejorar el banco. No menciona la calibración, la comparación ni los reportes de fallas. Se recomienda ampliarla cuando llegue B14, porque el permiso cubre más de lo que la pista dice
- Las tarjetas con IA desde el texto del alumno no dependen del permiso de análisis con IA, porque son una acción que el alumno pide cada vez. El aviso lo dice así. Queda como pregunta para el abogado

## Preguntas para el abogado

1. Ley vigente. ¿El aviso cumple la ley federal de protección de datos personales en posesión de los particulares vigente, que se reformó en 2025, y su reglamento? ¿Ante qué autoridad puede acudir el alumno y hay que nombrarla en el aviso?
2. Plazo de respuesta. El aviso dice que se responde en un plazo razonable. ¿Hay que poner los plazos de la ley para las solicitudes de acceso, rectificación, cancelación y oposición?
3. Proveedores fuera de México. Supabase, Stripe, Anthropic, Google, Resend, PostHog, Sentry, GitHub y Cloudflare tratan datos fuera de México. ¿Basta con decir que son encargados y que algunos guardan datos en Estados Unidos, o hace falta algo más?
4. Party. Compartir alias, foto y cifras con los compañeros de grupo, ¿es una transferencia que pide algo más que el permiso aparte y apagado que ya existe?
5. Tarjetas con IA. El texto que el alumno elige va a Anthropic cada vez que pide tarjetas, sin un permiso aparte. ¿Basta con que sea una acción explícita del alumno?
6. Reembolsos fuera de la garantía. ¿Qué se hace después de los 7 días, por ejemplo con un cargo no reconocido, una falla de la plataforma o una cancelación tardía?
7. Tribunales competentes y si conviene mencionar a la Profeco
8. Contrato de adhesión. ¿Una suscripción con cobro automático a consumidores en México pide registrar el contrato ante la Profeco o algo más en la pantalla de pago?
9. Aceptación. La app guarda la versión aceptada y la fecha, sin dirección IP. ¿Es suficiente, también para los términos, que hoy no guardan su propia aceptación aparte del aviso?
10. Precio Fundador. ¿Son válidas la pérdida definitiva del precio al cancelar después de pagar y la posibilidad de terminar la promoción antes de que se llenen los lugares?
11. Prueba gratis con cobro automático. ¿Hace falta un aviso por correo antes del cobro? El sistema ya lo deja listo para 3 días antes, y se manda cuando exista Resend (B15)
12. Límite de responsabilidad a lo pagado en 12 meses y el aviso de que no es un servicio médico. ¿Son suficientes para una plataforma de estudio de medicina?
13. Mazos de terceros en el catálogo con autorización escrita. ¿Qué debe decir esa autorización y qué responsabilidad queda con el alumno que importa material ajeno?
14. Huella del correo de la prueba gratis. Se guarda un hash SHA-256 sin sal del correo normalizado, sin fecha de borrado y aunque se elimine la cuenta. Quien conozca un correo puede calcular su hash y ver si coincide, y junto a la huella queda el identificador de la suscripción en la pasarela, que la pasarela sí liga a un cliente. ¿Es un dato personal seudónimo que pide algo más, como un plazo de conservación, un hash con sal secreta o borrar el identificador de la suscripción al eliminar la cuenta? ¿Basta lo que dice el aviso para el derecho de cancelación?
15. Conservación de pagos. Studiare borra los pagos con la cuenta y deja el registro a Stripe y al sistema de facturación. ¿La empresa debe conservar algo más por obligación fiscal?
16. Datos opcionales del perfil, como año de nacimiento, sexo y estado. ¿Piden algo más que el aviso actual?

## Preguntas para Ricardo

1. El domicilio de Plexus Medica S. de R.L. de C.V. y los dos correos, privacidad y soporte (pregunta 43). Pueden ser el mismo buzón
2. Que el contador confirme la razón social como responsable y para facturar (4.26)
3. ¿Con qué sistema emitirás las facturas? Si es un proveedor de facturación, entra a la lista de encargados del aviso
4. Garantía de un pago en OXXO. ¿Cómo le pedirás al alumno la cuenta para devolverle por transferencia y dónde la guardarás? El aviso ya lo menciona
5. Comparación con otros alumnos. ¿Quien no dio el permiso de mejora anónima puede ver su percentil, o solo quien aporta sus datos? El aviso no lo dice todavía

## Lo que se dejó fuera de los borradores de partida

- La razón social escrita en el texto. Va por VITE_LEGAL_NAME
- Marcas como [PENDIENTE DE RICARDO] que el alumno veía en la página
- Party con XP, nivel y racha. Se queda el texto de B7, que es lo que comparte la Party real
- Comparación y modelo del alumno como un cuarto permiso. La app no lo tiene y el plan usa el permiso de mejora anónima (respuesta 87)
- Análisis con IA con los apuntes. Los apuntes con IA no dependen de ese permiso
- Stripe y Mercado Pago que facturan. Stripe no emite CFDI, la factura la emite Ricardo
- PostHog, Sentry y Resend como si ya estuvieran activos
- Cambio de plan con prorrateo de los días no usados en los dos sentidos. Bajar se aplica al fin del periodo, sin prorrateo
- La versión 2026-10-14.2 de la otra rama, que al compararse como texto quedaba antes de 2026-10-14b
