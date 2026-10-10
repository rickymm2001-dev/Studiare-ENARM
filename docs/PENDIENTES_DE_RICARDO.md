# Lo que falta de Ricardo para que la plataforma funcione completa

Escrito el 2026-10-10 y puesto al día al conectar el proyecto real de Supabase (Fase J). Todo lo de programación que se podía hacer sin cuentas externas ya está hecho y probado con servidores falsos. Lo que sigue depende de cuentas, llaves, decisiones y personas. Está en el orden en que conviene hacerlo.

Regla que no cambia. Nunca me pases la llave de servicio de Supabase (service_role o secret), la contraseña de la base de datos ni claves secretas de Stripe, Mercado Pago o Anthropic por el chat. Esas viven solo en los secretos de cada servicio. A mí me sirven la dirección del proyecto y la llave pública (anon o publishable).

## 1. Mazos de Drive

- Mazos de Paco. Ya están en la demo Medicina interna, Ginecología y obstetricia y Urgencias (D-053). Ricardo dijo que tiene la aprobación escrita de Paco para subir todos sus mazos, así que faltan Pediatría y Cirugía (D-111)
- Qué hace falta para subirlos. Esta sesión no puede bajar archivos de más de 10 MB de Drive y la red del entorno bloquea drive.google.com. Hay que permitir drive.google.com y drive.usercontent.google.com en el acceso a la red del entorno, y compartir Pedia.apkg y Cirugia.apkg con cualquier persona con el enlace. Al terminar se revoca el enlace
- Confirma si el documento de Paco también cubre el uso dentro del plan de pago, porque D-053 solo cubría la demostración
- El mazo de Fer sigue fuera del repositorio (D-008) y pesa 328 MB. Mi recomendación es que cada alumno importe sus mazos en su navegador desde Mazos, Importar. Ya funciona con .apkg
- Un catálogo compartido para todos los alumnos con mazos de terceros pide autorización escrita de sus autores. No lo hago sin eso

## 2. Supabase

- El proyecto Studiare ya existe y Claude lo tiene conectado desde el 2026-10-10 (D-113). Las migraciones 1 a 11 están aplicadas, salvo seis piezas que tienen delete o drop
- Pegar supabase/manual/ejecutar-en-sql-editor.sql en el SQL Editor y ejecutarlo una vez. Es lo único de la base que falta. Sin esto no se puede activar el plan Fundador y no funcionan borrar datos, borrar cuenta, liberar un dispositivo ni el reporte de errores. Después corre la consulta de comprobación de docs/SUPABASE.md, sección Proyecto real conectado
- Decidir cuándo conectar la demo pública a este proyecto. Ya tengo la dirección y la llave pública, y poner VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en las variables de GitHub es un minuto. Recomiendo esperar a tener correo propio, textos legales revisados y dominio, porque desde ese momento cualquiera puede crear una cuenta real
- Activar la protección contra contraseñas filtradas en Authentication. Puede requerir el plan de pago de Supabase
- Conectar un proveedor de correo propio en Authentication, SMTP Settings. El correo de fábrica de Supabase solo envía al equipo del proyecto y pocas veces por hora. Resend, Brevo o Amazon SES sirven
- Para producción conviene el plan de pago de Supabase, que da respaldos y no pausa el proyecto por inactividad. Al escribir esto cuesta unos 25 dólares al mes. Verifícalo en su página de precios

## 3. IA en producción

- Elegir dónde corre el proxy de IA. Cualquier servicio que ejecute Docker o Node sirve, como Fly.io, Render, Railway o Google Cloud Run. Recomiendo el que ya conozcas. Cuesta unos pocos dólares al mes
- Poner en ese servicio las variables SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ENARM_ANTHROPIC_KEY y APP_ORIGINS. La tabla completa está en docs/IA_ALOJADA.md. Las dos llaves secretas se pegan directo en los secretos del servicio
- Poner VITE_AI_URL en las variables de GitHub con la dirección del proxy y volver a publicar
- Crear la clave de Anthropic y cargar saldo en console.anthropic.com. Es pago por uso. Con la clave puesta, corro npm run eval-ai y te digo el costo real por alumno, que hoy es una estimación
- Confirmar la desviación de D-103. CLAUDE.md dice que la clave vive solo en server/.env.local. En un servicio alojado vive como secreto del servicio, con el mismo nombre. Si te parece bien, ajusto esa línea de CLAUDE.md

## 4. Cobros

- La guía de Stripe con lo revisado, lo mejorado y lo que falta está en docs/STRIPE.md. Cambia la llave secreta de prueba que pegaste en el chat (Developers, API keys, Roll key) cuando termines de configurar

- Activar tu cuenta de Stripe. Pide verificar tu negocio y tu cuenta bancaria en México. Puede tardar días
- Crear en Stripe los tres productos con su precio. Fundador 79, Mensual 150 y Anual 1,200 pesos
- Agregar el webhook de Stripe con los seis eventos de docs/SUPABASE.md, incluidos customer.subscription.updated y charge.refunded
- Guardar y activar el portal del cliente en Stripe, Settings, Billing, Customer portal, con Cancel subscriptions encendido. Sin esto el botón Administrar suscripción no abre
- Poner los secretos en Supabase, Edge Functions, Secrets. Son STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_FOUNDER, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL, APP_URL y FUNCTIONS_URL. Tres funciones ya están desplegadas en tu proyecto (create-checkout, create-portal-session y payment-webhook-stripe), así que ya no hace falta la CLI. La dirección del webhook de Stripe es https://bkjbcdwglyllizupokqm.supabase.co/functions/v1/payment-webhook-stripe y FUNCTIONS_URL vale https://bkjbcdwglyllizupokqm.supabase.co/functions/v1. La cuarta función, la de Mercado Pago, se despliega cuando exista esa cuenta
- Activar Mercado Pago de la misma forma, con su token y su clave de webhook
- Hacer un pago de prueba y un reembolso de prueba de punta a punta en cada pasarela. Es lo único que falta para confiar en los cobros, porque no pude abrir la documentación de Stripe desde mi entorno y la lectura de sus eventos no se ha visto con uno real
- Después pasar de llaves de prueba a llaves reales
- Stripe y Mercado Pago no cobran mensualidad. Cobran un porcentaje por cada pago, que sale de lo que paga el alumno. Revisa la tarifa vigente de cada una antes de fijar precios
- Un reembolso completo desde el panel de Stripe ya quita el plan solo. Uno parcial no, y lo atiendes tú. Devolver un cobro no cancela la suscripción en Stripe, así que cuando devuelvas el cobro de una suscripción que sigue viva, cancélala también ahí

## 5. Textos legales

- Decidir quién es el responsable. Su nombre o razón social, su domicilio y el correo de privacidad
- Ponerlos como variables de GitHub. VITE_LEGAL_NAME, VITE_LEGAL_ADDRESS y VITE_SUPPORT_EMAIL
- Pasar docs/legal a un abogado. Quedan para él la política de reembolsos, los tribunales competentes, la edad mínima de 18 años y los plazos de conservación
- Hasta que el abogado los revise, las páginas dicen arriba que son un borrador. No abras a alumnos de pago con ese aviso

## 6. Dominio y alojamiento de la app

- Comprar el dominio propio. Cuesta unos pocos dólares al año
- Aprobar la publicación en Cloudflare Pages (D-017). Allí valen los encabezados de seguridad, incluido HSTS. En GitHub Pages el HTTPS ya está, pero no leen mi archivo de encabezados
- Cuando todo el dominio esté en HTTPS, subir HSTS a subdominios y preload

## 7. Contenido y médicos

- Un banco real revisado por médicos. Hoy todo el contenido es de demostración y lo dice la etiqueta
- Compuerta 1 del plan maestro. Dos médicos auditan 300 textos que genera la IA antes de abrir a alumnos
- Confirmar con Paco que está bien que el repositorio sea público (D-053 y D-055)
- La lista cerrada de textos académicos fundamentales del ENARM en la que se apoya la señal de controversia
- Decidir sobre el banco en la nube. Las decisiones están en docs/BANCO_EN_LA_NUBE.md y pido tu respuesta a las número 2, 3 y 4

## 8. Decisiones abiertas de producto

- Un segundo proveedor de IA (OpenAI) y qué cuenta como referido concretado (D-080). Hoy rige que el referido se concreta con su primer pago verificado
- Adoptar la tendencia como método de fatiga y redefinir su meta sobre alumnos con efecto apreciable (D-054)
- Si quieres un servicio de alertas al celular cuando algo se rompe. Hoy los errores del navegador se ven en la pantalla 25 y los del servidor en sus registros
- Antes de abrir, una prueba de penetración externa y el segundo factor para médicos y administradores (docs/asvs.md)

## Qué hago yo cuando me des cada cosa

- Con la dirección y la llave pública de Supabase, las pongo en las variables y verifico la nube de punta a punta
- Con la dirección del proxy de IA, corro las evaluaciones con la clave y te doy el costo real
- Con los pagos de prueba hechos, reviso en los registros que los eventos se leyeron bien y corrijo lo que no
- Con el banco aprobado, construyo los pasos de docs/BANCO_EN_LA_NUBE.md

## Tu cuenta de dueño

- Después de aplicar las migraciones, entra una vez a la app con tu correo para que se cree tu cuenta
- Márcala como dueña con el SQL del paso 3 de docs/SUPABASE.md. La app no puede asignar ese rol, a propósito
- Desde ahí, en Usuarios, nombras médicos. Solo tú nombras admins. Cómo funcionan los roles está en docs/ROLES.md
- Decide si prefieres tres roles (alumno, médico y admin general) o los cuatro de hoy. Hoy el dueño y el admin son niveles distintos, para que puedas delegar tareas de admin sin darle a nadie tu cuenta

## Qué está publicado

- La Fase G (PR 26) y la Fase H (PR 27) están juntadas en main. Eso incluye el proxy alojado, los textos legales, la configuración del admin, el portal de Stripe, los reembolsos, HSTS, los errores del navegador, la lista real de usuarios, el rol sin conexión y la auditoría
- Tu proyecto de Supabase ya tiene el esquema aplicado y tres funciones de pago desplegadas (D-113). Falta tu parte del SQL y los secretos de Stripe, ver las secciones 2 y 4
- La demo pública sigue siendo la versión sin nube, y el proxy de IA, los pagos reales y los textos legales siguen esperando lo de arriba
- Lo que no está construido a propósito es el banco en la nube, que espera tu respuesta a las decisiones 2, 3 y 4 de docs/BANCO_EN_LA_NUBE.md y un banco aprobado por médicos
