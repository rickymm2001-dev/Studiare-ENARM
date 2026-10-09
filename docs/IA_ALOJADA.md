# Proxy de IA alojado

Fase G, bloque G1 (D-103). Con esto la IA real funciona para los alumnos en la demo publicada y en producción, y no solo en tu computadora. Es el mismo proxy de siempre, con tres cosas más. Pide la sesión de Supabase en cada llamada, solo deja usar la IA a quien tiene un plan de pago (o es médico o admin), y cuenta los límites y el gasto en la base de datos, para que sobrevivan a un reinicio.

## Cómo funciona

- La app manda el token de la sesión de Supabase a la dirección del proxy alojado. El proxy lo verifica con Supabase, lee el plan con la función my_plan y el rol con la tabla user_roles, y decide
- Un alumno del plan Gratis recibe el aviso de que la IA es de los planes de pago. Un médico, un admin o el dueño la usan siempre
- Si la cuenta está activa en otro dispositivo, el proxy lo dice y no atiende. La barrera del dispositivo único también llega a la IA
- El alumno de cada llamada es la cuenta verificada. Lo que diga el cliente en su sobre no cuenta
- Los límites por alumno y por motor y el presupuesto diario viven en las tablas ai_usage_day y ai_spend_day. Cada llamada deja una fila en ai_call_log, sin texto ni respuestas, solo motor, modelo, tokens y costo
- Solo el administrador ve el gasto y cambia modelos, precios y límites desde las pantallas 23 y 25. Los cambios se guardan en la tabla ai_config
- A la IA siguen viajando solo IDs seudónimos y texto del banco. El filtro de datos personales es el mismo de antes

## Qué necesitas

1. La sexta migración de Supabase, con la guía de docs/SUPABASE.md
2. Un alojamiento que corra Docker o Node. Sirve cualquiera que arranque un servicio web desde un Dockerfile. Cuesta unos pocos dólares al mes y algunos tienen plan gratis con límites. Verifica el precio actual en su sitio
3. Tu clave de Anthropic, que se pone como secreto del alojamiento y nunca en GitHub ni en el repositorio

## Variables de entorno del alojamiento

Las pones en la sección de variables o secretos de tu alojamiento. Ninguna va al repositorio.

| Variable | Qué lleva |
|---|---|
| SUPABASE_URL | La dirección del proyecto, como https://abc.supabase.co |
| SUPABASE_ANON_KEY | La llave pública del proyecto, la misma que usa la app |
| SUPABASE_SERVICE_ROLE_KEY | La llave de servicio. Es secreta y solo vive en el alojamiento |
| ENARM_ANTHROPIC_KEY | Tu clave de Anthropic. Es secreta y solo vive en el alojamiento |
| APP_ORIGINS | Las direcciones de la app, separadas por comas, como https://rickymm2001-dev.github.io. Sin ruta y sin comodines |
| PORT | Opcional. Muchos alojamientos lo ponen solos. Por omisión es 8787 |
| ALLOW_MOCK | Opcional. Con 1 arranca sin clave de IA y contesta con respuestas fijas. Sirve para probar el despliegue antes de pagar créditos. Nunca para producción |

Si falta algo o está mal, el proxy no arranca y dice cuáles variables fallan, sin imprimir ningún valor.

## Pasos

1. Aplica la sexta migración en Supabase y confirma con la consulta de docs/SUPABASE.md
2. En tu alojamiento crea un servicio web a partir del repositorio, con el Dockerfile de la raíz. Pon las variables de arriba
3. Pon como comprobación de salud la ruta /health. Debe contestar con el modo, real o simulado
4. Anota la dirección pública del servicio, por ejemplo https://ia.studiare.mx
5. En GitHub, en Settings, Secrets and variables, Actions, pestaña Variables, crea VITE_AI_URL con esa dirección. Es pública por diseño, como la de Supabase. Vuelve a publicar la app
6. Entra a la app con una cuenta de pago y abre el Tutor. La insignia de IA en Configuración, Cuenta, debe decir IA real
7. Entra con una cuenta del plan Gratis. El Tutor debe decir que la IA es de los planes de pago

## Qué pasa en cada falla

- La insignia dice IA simulada o sin proxy. VITE_AI_URL no está puesta o la app no se volvió a publicar
- El alumno ve que la IA es de los planes de pago. Su plan es Gratis, o el pago aún no se confirma
- El alumno ve que su sesión venció. Tiene que entrar otra vez con su correo
- El alumno ve que su cuenta está activa en otro dispositivo. Tiene que entrar ahí otra vez para tomarla
- El alumno ve que no se pudo comprobar su cuenta. Supabase no contestó, y reintenta solo en unos minutos
- El proxy no arranca. Mira el registro del alojamiento. Dice cuáles variables faltan

## Seguridad

- La llave de servicio solo la usa el proxy, para el libro de IA. Nunca llega al navegador ni a GitHub. El escáner del build busca llaves con rol de servicio y falla si encuentra alguna
- La clave de IA solo vive como secreto del alojamiento. El proxy la quita del entorno al arrancar para que no la hereden procesos hijos
- El proxy solo contesta a los orígenes de APP_ORIGINS y exige sesión en todas las rutas de IA. /health es público y solo dice el modo
- La política de seguridad de contenido de la app permite conectarse a la dirección de VITE_AI_URL y a ninguna otra aparte de Supabase
- La imagen de Docker no lleva ninguna llave. Una prueba revisa el Dockerfile y que copie todo lo que el proxy importa

## Costos

- El presupuesto diario por omisión es de 5 dólares y solo cuenta el gasto real. Se cambia en la pantalla 25. Al llegar al tope, la IA se pausa hasta el día siguiente, en hora de México
- Los límites por alumno y por motor también se cambian ahí
- El gasto del día y la bitácora los ve el administrador en la pantalla 23
- Falta medir el costo real por alumno con npm run eval-ai y la clave. Hasta entonces los números son estimaciones
