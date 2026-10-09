# Revisión contra OWASP ASVS 5.0

Fase F, sección 14.3 de la especificación. Revisa cada capítulo de OWASP ASVS 5.0 y dice si aplica al prototipo, cómo se cumple y qué queda para producción. La fecha de esta revisión es 2026-10-09.

## Cómo leer este documento

- Cumple. El control existe y tiene una prueba o un archivo que lo demuestra
- Parcial. Existe una parte y la otra queda para producción, con el motivo
- No aplica. El prototipo no tiene esa función
- Producción. Depende de decisiones o de servicios que todavía no existen, como el dominio propio o un proveedor de correo
- La revisión es por capítulo y no por cada requisito numerado. Antes de una auditoría externa hay que recorrer los requisitos uno por uno contra el texto oficial, porque su numeración cambió entre versiones y aquí no se copió de memoria
- Es una revisión propia, hecha por quien programó. No sustituye a una prueba de penetración

## Resumen

| Capítulo | Estado | En una línea |
|---|---|---|
| V1 Codificación y saneamiento | Cumple | React escapa, el HTML ajeno pasa por DOMPurify con lista corta |
| V2 Validación y lógica de negocio | Cumple | Todo entra por esquemas estrictos y las reglas de dinero viven en el servidor |
| V3 Seguridad del frontend | Cumple | Política de seguridad de contenido, sin scripts en línea ni eval |
| V4 API y servicios web | Cumple | El proxy valida todo y las pasarelas se verifican por firma |
| V5 Manejo de archivos | Cumple | Límites de tamaño, de archivos y de tipos, y saneado del contenido |
| V6 Autenticación | Parcial | Enlace al correo con Supabase. Falta un proveedor de correo propio |
| V7 Sesiones | Cumple | Un dispositivo por cuenta, aplicado en la base de datos |
| V8 Autorización | Cumple | Permisos por fila, roles y dueño fijo, con pruebas contra Postgres |
| V9 Tokens autocontenidos | Cumple | Solo los de Supabase. Ninguna llave de servicio en el navegador |
| V10 OAuth y OIDC | No aplica | No hay inicio de sesión con terceros |
| V11 Criptografía | Cumple | No hay criptografía propia. Todo lo hacen la plataforma y Supabase |
| V12 Comunicación segura | Cumple | HTTPS lo da el alojamiento. El archivo de encabezados lleva HSTS por un año, que vale en Cloudflare Pages |
| V13 Configuración | Cumple | Escaneo de secretos en el build, encabezados y auditoría de dependencias |
| V14 Protección de datos | Parcial | Consentimientos, exportar y borrar listos. Los datos locales no van cifrados |
| V15 Código y arquitectura seguros | Cumple | TypeScript estricto, lint, motores puros y dependencias bloqueadas |
| V16 Registro de eventos y errores | Parcial | Bitácora de solo agregar y registro de errores del navegador sin datos personales. Falta un registro de seguridad del lado del servidor |
| V17 WebRTC | No aplica | No se usa |

## V1. Codificación y saneamiento

Cumple.

- La interfaz se pinta con React, que escapa lo que muestra. No se usa dangerouslySetInnerHTML salvo en la tarjeta que trae HTML de un mazo importado
- Ese HTML pasa por DOMPurify con una lista corta de etiquetas, sin scripts, iframes ni manejadores de eventos (src/data/content/cardHtml.ts y src/features/shared/CardHtml.tsx)
- Las consultas a la base de datos de la nube las arma el cliente de Supabase con parámetros. No hay SQL armado con texto del usuario
- Las funciones de SQL del esquema reciben parámetros tipados y no construyen sentencias con texto del usuario

## V2. Validación y lógica de negocio

Cumple.

- Todo dato que entra o sale de IndexedDB pasa por un esquema de zod estricto, que rechaza campos que no conoce (src/data/schemas)
- Todo lo que entra al proxy se valida con zod, con tamaño máximo y con filtro de datos personales. Si queda un correo, un teléfono o una CURP, el proxy bloquea la petición completa
- Lo que contesta la IA se valida otra vez en el cliente y con guardas de anclaje antes de mostrarse
- Las reglas que mueven dinero o acceso viven en el servidor y no en el navegador. El plan lo activa la función que recibe el aviso de la pasarela, el cupo Fundador se verifica con un candado y el plan Gratis tiene su tope aplicado en la base de datos
- Un aviso de pago repetido no activa dos veces ni cuenta dos pagos
- Pruebas: supabase/tests/payments_test.sql, supabase/functions/_shared/payments.test.ts y los contratos de los motores de IA

## V3. Seguridad del frontend

Cumple, con una salvedad documentada.

- Política de seguridad de contenido en el build, definida en src/config/csp.ts y puesta por vite.config.ts de dos formas. Una etiqueta meta en index.html, que protege en cualquier alojamiento, y el archivo _headers para Cloudflare Pages, que además lleva frame-ancestors
- Los scripts solo pueden venir del propio sitio. No se permite eval ni scripts en línea. Se permite wasm-unsafe-eval únicamente para compilar WebAssembly, que usa el lector de mazos de Anki
- Las conexiones solo van al propio sitio y, si está configurado, al origen exacto del proyecto de Supabase. La política se arma con la variable de construcción y rechaza cualquier otro dominio
- object-src en none, base-uri y form-action en el propio sitio, y sin marcos
- Salvedad. style-src permite estilos en línea porque React pone atributos style. Un estilo no ejecuta código. Quitarlo exigiría reescribir los componentes que calculan estilos
- El HTML publicado no tiene scripts en línea ni manejadores de eventos en atributos
- Las fuentes son propias (paquetes de fontsource), sin pedir nada a un CDN, así que no hace falta integridad de subrecursos
- El navegador guarda en localStorage solo preferencias del dispositivo, como el tema. Nada de sesión ni de datos del estudio
- Encabezados X-Content-Type-Options, Referrer-Policy, Permissions-Policy y X-Frame-Options en _headers
- Pruebas: tests/security/build-policy.test.ts revisa la política en el build, con y sin Supabase, y que no haya scripts en línea. Toda la suite de punta a punta falla ante cualquier error de la consola, así que una violación de la política la detiene

## V4. API y servicios web

Cumple.

- El proxy de IA solo escucha en 127.0.0.1, rechaza un Host que no sea local (contra DNS rebinding) y rechaza un Origin que no sea la app. Las escrituras exigen JSON, lo que obliga al navegador a preguntar antes (server/src/app.ts)
- Tamaño máximo del cuerpo, esquemas estrictos y límites por alumno, por motor y por día, además de un presupuesto diario
- Nunca devuelve el detalle de un error, que podría traer datos de la petición
- Las funciones de pago verifican la firma de la pasarela antes de hacer nada (Stripe con marca de tiempo y tolerancia, y Mercado Pago con su encabezado propio), comparan en tiempo constante y guardan el aviso para auditarlo
- Pruebas: server/src/app.test.ts, server/src/server.test.ts y supabase/functions/_shared/payments.test.ts

## V5. Manejo de archivos

Cumple.

- El importador de mazos y de bancos limita el tamaño descomprimido (50 MB), el número de archivos y de filas (20,000) y los tipos de medios, para evitar bombas zip
- Rechaza rutas con .. dentro del zip y sanea el HTML de las tarjetas
- Los archivos se leen en un worker del propio sitio y nunca se ejecutan
- Los archivos descargados por el alumno, como la exportación, se arman en el navegador y no pasan por ningún servidor
- Pruebas: la prueba del worker de importación con bomba zip, ruta con .. y HTML con script, y src/data/content/bankConvert.ts con sus pruebas
- Producción. Si algún día se suben archivos al servidor, habrá que revisar tipo real, tamaño y almacenamiento aparte

## V6. Autenticación

Parcial.

- Con la nube configurada, la cuenta es de Supabase con enlace al correo, sin contraseña. Eso quita de la app las contraseñas, su almacenamiento y su recuperación
- El enlace de acceso usa el flujo implicit para poder abrirse en otro navegador o en el teléfono. Es una decisión consciente para el prototipo
- Sin la nube configurada, el inicio de sesión es simulado y local, y así se dice en la interfaz (3.2)
- Producción. Conectar un proveedor de correo propio, porque el de fábrica de Supabase solo envía al equipo del proyecto y pocas veces por hora (docs/SUPABASE.md). Valorar el flujo con código de un solo uso (PKCE) cuando el enlace deje de tener que abrirse en otro dispositivo, y agregar un segundo factor para médicos y administradores

## V7. Sesiones

Cumple.

- La sesión la maneja Supabase y se renueva sola
- Una cuenta, un dispositivo. La barrera la aplica la propia base de datos, que rechaza al dispositivo desplazado aunque alguien manipule su navegador (supabase/tests/device_barrier_test.sql). Cambiar de dispositivo está limitado a 3 veces en 24 horas y cada reclamo queda en una bitácora que nadie edita
- Cerrar sesión cierra la de este navegador y de ningún otro (alcance local), para no sacar al dispositivo que acaba de ganar la cuenta
- Eliminar la cuenta o borrar los datos exige sesión y el dispositivo activo

## V8. Autorización

Cumple.

- Permisos por fila en todas las tablas de Supabase. Cada alumno ve solo lo suyo
- Los roles se asignan en el servidor. Toda cuenta nace como alumno, nadie se pone un rol a sí mismo y el dueño es fijo. Solo el dueño nombra o quita administradores y nadie puede quitarle el rol
- El médico ve y decide solo sobre las preguntas que un administrador le asignó
- Cada cambio de rol queda en una bitácora de auditoría con quién y cuándo
- Las funciones sensibles no se ejecutan por anon. Las pruebas confirman qué rol puede ejecutar cada función
- En el navegador, las pantallas del médico y del administrador se esconden por rol, pero eso es comodidad y no seguridad. La seguridad es la del servidor
- Pruebas: supabase/tests/rls_test.sql, device_barrier_test.sql, sync_test.sql, payments_test.sql y privacy_test.sql, que corren en el CI contra un Postgres local

## V9. Tokens autocontenidos

Cumple.

- Los únicos tokens son los JWT de Supabase. El navegador usa solo la llave pública, y el cliente rechaza una llave secreta aunque se ponga por error, tanto la nueva (sb_secret_) como la anterior con rol de servicio
- Una prueba busca en el build llaves con rol de servicio y llaves secretas, y falla si encuentra alguna (scripts/secrets.ts)
- La llave de servicio vive solo en los Secrets de las funciones de Supabase

## V10. OAuth y OIDC

No aplica. No hay inicio de sesión con Google ni con otro proveedor. Si se agrega, este capítulo pasa a aplicar.

## V11. Criptografía

Cumple.

- No hay criptografía propia. Las contraseñas no existen, los tokens son de Supabase y el transporte lo cifra HTTPS
- Los identificadores son ULID. Los IDs estables que se derivan de un texto usan un hash que sirve para no duplicar y no para proteger nada
- La verificación de firmas de pago usa HMAC con comparación en tiempo constante

## V12. Comunicación segura

Cumple, con una salvedad.

- El alojamiento da HTTPS. GitHub Pages lo obliga y Cloudflare Pages también
- La política de contenido impide que la app se conecte por http a otro lugar
- HSTS por un año (Strict-Transport-Security max-age=31536000) en el archivo _headers del build, sin includeSubDomains ni preload, que son difíciles de deshacer. Vale en Cloudflare Pages y en Netlify. GitHub Pages no lee _headers, pero ya impone HTTPS y manda su propio HSTS
- Producción. Revisar que el proyecto de Supabase solo acepte HTTPS (lo hace por defecto). Subir a includeSubDomains y preload solo cuando todo el dominio propio esté en HTTPS
- El proxy de IA es local y por http en 127.0.0.1. La demo publicada no lo usa y trabaja con respuestas fijas

## V13. Configuración

Cumple.

- Ningún secreto en el código, en el repositorio ni en el build. La clave de IA se llama ENARM_ANTHROPIC_KEY, vive solo en server/.env.local y no se sube
- tests/security/no-secrets.test.ts construye la app y busca la clave, el nombre de la variable, el nombre de variable prohibido, el prefijo sk-ant-, archivos .env y llaves de servicio. Además corre al final de npm run build
- Encabezados de seguridad en _headers y política de contenido en el HTML
- Dependencias bloqueadas por package-lock.json y versiones exactas
- npm audit sin vulnerabilidades altas ni críticas. Ver la sección de dependencias
- Las migraciones de Supabase son idempotentes y se prueban dos veces seguidas

## V14. Protección de datos

Parcial.

- Al modelo de lenguaje solo viajan IDs seudónimos y texto del banco, nunca nombres ni correos, y el proxy bloquea la petición si detecta un dato personal
- Consentimientos por finalidad, que el alumno da o retira cuando quiera, con su evento (Configuración, Privacidad)
- Exportar todos sus datos en un archivo JSON, borrar los datos del dispositivo y de la nube, y eliminar la cuenta completa. Ver D-101 y docs/SUPABASE.md
- El puntaje oficial del ENARM es voluntario, solo se guarda con el permiso de mejora anónima y se borra al retirarlo
- Los datos de pago que guarda la plataforma son el identificador y el estado. Nunca se piden ni se guardan datos de tarjeta, que viven en la pasarela
- Parcial. Los datos locales de IndexedDB no van cifrados. Quien tenga acceso al navegador desbloqueado del alumno los puede leer. Es lo normal en una página web, y para producción habría que valorar el cifrado con una clave derivada de la sesión
- Producción. El aviso de privacidad sigue siendo un ejemplo y debe revisarlo un abogado. Falta definir los plazos de conservación

## V15. Código y arquitectura seguros

Cumple.

- TypeScript estricto, con noUncheckedIndexedAccess, y ESLint con reglas tipadas que se corren en el CI
- Los motores de src/engines son funciones puras, sin React ni Dexie, y una prueba de arquitectura lo vigila (tests/architecture/engine-boundaries.test.ts)
- Antes de usar la API de una librería se revisa su documentación vigente
- Dependencias fijadas y revisadas con npm audit. El SDK de Supabase se baja aparte del JavaScript inicial y solo si la nube está configurada
- Sin instalaciones globales ni cambios a la configuración del sistema

## V16. Registro de eventos y errores

Parcial.

- La bitácora de estudio es de solo agregar, tanto en el navegador como en la nube, con un freno en la base que rechaza editar y borrar. La única excepción es que su dueño borre sus filas al eliminar sus datos o su cuenta
- Cada llamada a la IA deja su renglón con el modelo, los tokens y el costo, también las que fallan
- Los cambios de rol, los reclamos de dispositivo y los avisos de pago quedan guardados
- Los errores no muestran detalles al usuario ni guardan datos personales. El proxy solo registra el nombre del error
- Los errores del navegador se reportan a una tabla sin usuario, ni correo, ni IP, solo si el alumno dio el permiso de mejora anónima. Se limpian de correos, ids, claves y números largos antes de salir y otra vez en la base, tienen un tope de 500 distintos por día y se guardan 14 días. Solo los lee un admin
- Parcial. No hay un registro de seguridad del lado del servidor con alertas, por ejemplo de muchos intentos fallidos. Para producción se necesita un servicio de monitoreo

## V17. WebRTC

No aplica. La app no usa WebRTC.

## Dependencias

- npm run audit:high corre npm audit con el nivel high, y el CI lo corre en un trabajo aparte para que un aviso nuevo no tape el resultado de las pruebas. El 2026-10-09 salió sin vulnerabilidades
- Ese día había una vulnerabilidad crítica en shell-quote, que llegaba por concurrently, una herramienta de desarrollo que levanta la app y el proxy juntos. Se resolvió subiendo concurrently a la 10.0.6, que usa la versión corregida
- También había una moderada en uuid, que llegaba por exceljs, que solo se usa en un script de desarrollo que arma la plantilla de Excel del banco. Se resolvió con un override en package.json que le da a exceljs la versión corregida de uuid. Las pruebas de la plantilla y del importador pasan con ella
- Ninguna dependencia de ejecución tiene vulnerabilidades conocidas
- El override se puede quitar cuando exceljs publique una versión que ya use un uuid corregido

## Lo que queda para producción

- Proveedor de correo propio para los enlaces de acceso, y segundo factor para médicos y administradores
- Dominio propio, y subir HSTS a includeSubDomains y preload cuando todo el dominio esté en HTTPS
- Aviso de privacidad revisado por un abogado y plazos de conservación
- Monitoreo y alertas del lado del servidor
- Cifrado de los datos locales, si se decide que hace falta
- Una prueba de penetración externa antes de abrir a alumnos de pago
- Recorrer los requisitos numerados de ASVS 5.0 uno por uno
