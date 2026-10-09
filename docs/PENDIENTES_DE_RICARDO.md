# Lo que falta de Ricardo para que la plataforma funcione completa

Escrito el 2026-10-10, al cerrar la Fase G. Todo lo de programación que se podía hacer sin cuentas externas ya está hecho y probado con servidores falsos. Lo que sigue depende de cuentas, llaves, decisiones y personas. Está en el orden en que conviene hacerlo.

Regla que no cambia. Nunca me pases la llave de servicio de Supabase (service_role o secret), la contraseña de la base de datos ni claves secretas de Stripe, Mercado Pago o Anthropic por el chat. Esas viven solo en los secretos de cada servicio. A mí me sirven la dirección del proyecto y la llave pública (anon o publishable).

## 1. Decisión sobre los mazos de Drive

- Los mazos de Fer y de Paco no se subieron al repositorio. El repositorio es público. Por D-008 el mazo de Fer no entra al repositorio, y Paco autorizó un repositorio privado y no uno público (D-053). Además el de Fer pesa 328 MB
- Mi recomendación es que cada alumno importe sus mazos en su navegador desde Mazos, Importar. Ya funciona con .apkg
- Si quieres que Pedia y Cirugía de Paco vengan precargados, necesito su visto bueno por escrito para publicarlos en un repositorio público, o pasar el repositorio a privado
- Un catálogo compartido para todos los alumnos pide autorización escrita de los autores y construirlo. No lo hago sin eso

## 2. Supabase

- Crear o confirmar el proyecto Studiare en supabase.com
- Aplicar en el editor de SQL las migraciones que falten, en este orden. 20261002000001_platform, 20261007000001_single_device, 20261008000001_device_barrier, 20261008000002_sync, 20261008000003_payments_referrals, 20261009000001_privacy, 20261010000001_ai_hosted, 20261011000001_billing_portal y 20261012000001_client_errors. Cada una trae su guía paso a paso y su consulta de comprobación en docs/SUPABASE.md
- Pasarme la dirección del proyecto y la llave pública. Con eso pongo VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en las variables de GitHub, o las pones tú siguiendo docs/SUPABASE.md
- Conectar un proveedor de correo propio en Authentication, SMTP Settings. El correo de fábrica de Supabase solo envía al equipo del proyecto y pocas veces por hora. Resend, Brevo o Amazon SES sirven
- Para producción conviene el plan de pago de Supabase, que da respaldos y no pausa el proyecto por inactividad. Al escribir esto cuesta unos 25 dólares al mes. Verifícalo en su página de precios

## 3. IA en producción

- Elegir dónde corre el proxy de IA. Cualquier servicio que ejecute Docker o Node sirve, como Fly.io, Render, Railway o Google Cloud Run. Recomiendo el que ya conozcas. Cuesta unos pocos dólares al mes
- Poner en ese servicio las variables SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ENARM_ANTHROPIC_KEY y APP_ORIGINS. La tabla completa está en docs/IA_ALOJADA.md. Las dos llaves secretas se pegan directo en los secretos del servicio
- Poner VITE_AI_URL en las variables de GitHub con la dirección del proxy y volver a publicar
- Crear la clave de Anthropic y cargar saldo en console.anthropic.com. Es pago por uso. Con la clave puesta, corro npm run eval-ai y te digo el costo real por alumno, que hoy es una estimación
- Confirmar la desviación de D-103. CLAUDE.md dice que la clave vive solo en server/.env.local. En un servicio alojado vive como secreto del servicio, con el mismo nombre. Si te parece bien, ajusto esa línea de CLAUDE.md

## 4. Cobros

- Activar tu cuenta de Stripe. Pide verificar tu negocio y tu cuenta bancaria en México. Puede tardar días
- Crear en Stripe los tres productos con su precio. Fundador 79, Mensual 150 y Anual 1,200 pesos
- Agregar el webhook de Stripe con los cinco eventos de docs/SUPABASE.md, incluido charge.refunded
- Guardar y activar el portal del cliente en Stripe, Settings, Billing, Customer portal, con Cancel subscriptions encendido. Sin esto el botón Administrar suscripción no abre
- Poner los secretos en Supabase, Edge Functions, Secrets, y publicar las cuatro funciones con la CLI de Supabase. Puedo guiarte paso a paso cuando quieras
- Activar Mercado Pago de la misma forma, con su token y su clave de webhook
- Hacer un pago de prueba y un reembolso de prueba de punta a punta en cada pasarela. Es lo único que falta para confiar en los cobros, porque no pude abrir la documentación de Stripe desde mi entorno y la lectura de sus eventos no se ha visto con uno real
- Después pasar de llaves de prueba a llaves reales
- Stripe y Mercado Pago no cobran mensualidad. Cobran un porcentaje por cada pago, que sale de lo que paga el alumno. Revisa la tarifa vigente de cada una antes de fijar precios
- Un reembolso completo desde el panel de Stripe ya quita el plan solo. Uno parcial no, y lo atiendes tú

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

## Qué no está publicado

- Todo lo de la Fase G (proxy alojado, textos legales, configuración del admin, portal de Stripe, reembolsos, HSTS y errores del navegador) está solo en la rama main-y84jz2. No está en main ni en la demo pública
- Para publicarlo hace falta abrir un pull request y juntarlo a main. No lo hice porque no lo pediste
