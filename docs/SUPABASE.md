# Guía para conectar Supabase

Para Ricardo. Toma unos 15 minutos. No necesitas programar.

## Qué es y por qué

- Supabase es el servidor de Studiare. Guarda las cuentas, la base de datos y las fotos, y aplica los permisos de cada rol
- Hoy la app guarda todo en el navegador. Con Supabase tus alumnos entran desde cualquier dispositivo y tú administras roles de verdad
- El plan gratis alcanza para empezar (hasta 50,000 usuarios activos al mes y 500 MB de base de datos)

## Paso 1. Crear el proyecto

1. Entra a supabase.com y crea una cuenta con tu correo o con GitHub
2. Da clic en New project
3. Nombre del proyecto, Studiare
4. Contraseña de la base de datos. Genera una segura y guárdala en tu gestor de contraseñas. No me la compartas
5. Región, la más cercana a México que aparezca (por ejemplo East US)
6. Espera unos 2 minutos a que se cree

## Paso 2. Crear las tablas y los permisos

1. En el menú de la izquierda abre SQL Editor
2. Da clic en New query
3. Abre en GitHub el archivo supabase/migrations/20261002000001_platform.sql, copia todo su contenido y pégalo
4. Da clic en Run. Debe decir Success
5. Ese archivo ya pasó 12 pruebas de permisos en un Postgres igual al de Supabase (npm run test:sql)

## Paso 3. Hacerte dueño

1. Crea tu cuenta en la app ya conectada (paso 5) o en Authentication, Users, Add user, con tu correo
2. Vuelve a SQL Editor y corre esto, cambiando el correo por el tuyo

```sql
update public.user_roles set role = 'owner'
where user_id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
```

3. Solo puede haber un dueño. Nadie puede quitarte el rol desde la app. Desde ahí tú nombras administradores y médicos

## Paso 4. Pasarme las llaves públicas

1. Abre Project Settings, API
2. Copia Project URL y la llave anon public
3. Esas dos son públicas por diseño. Viajan al navegador y la seguridad la dan los permisos por fila que ya creamos
4. Nunca me compartas ni pegues en ningún lado la llave service_role ni la contraseña de la base de datos. Esas son secretas

## Paso 5. Conectar la página publicada

1. En GitHub abre el repositorio, Settings, Secrets and variables, Actions, pestaña Variables
2. Crea la variable VITE_SUPABASE_URL con el Project URL
3. Crea la variable VITE_SUPABASE_ANON_KEY con la llave anon public
4. Listo desde el 2026-10-02. La app ya usa estas variables (D-075)

## Paso 6. Dirección de regreso de los correos

1. En Supabase abre Authentication, URL Configuration
2. En Site URL pon https://rickymm2001-dev.github.io/Studiare-ENARM/
3. En Redirect URLs agrega esa misma dirección y http://localhost:5173/**

## Paso 7. Probar tu cuenta y hacerte dueño

1. Abre la página, Crear cuenta, con el mismo correo con el que entraste a Supabase
2. Abre el enlace que te llega al correo
3. En Perfil debe decir Cuenta en la nube, Conectada como tu correo
4. Corre el SQL del paso 3 con tu correo y vuelve a cargar la página. Debe aparecer Usuarios en el menú

## Dispositivo único por cuenta

El equipo acordó que cada cuenta tenga un solo dispositivo activo, para evitar que se comparta.

### Cómo funciona

- Gana el último dispositivo en entrar. Al abrir el enlace del correo, ese navegador reclama la cuenta
- El dispositivo anterior se entera la siguiente vez que la app revisa, que es al volver a la pestaña o, con la pestaña a la vista, a más tardar al minuto. Ahí ve un aviso que dice que su cuenta se abrió en otro dispositivo, se cierra su sesión y puede volver a entrar. Al hacerlo reclama la cuenta y cierra la otra sesión
- Si la red falla al revisar, la app no saca a nadie. Solo sale quien ve con claridad que otro dispositivo ganó
- Dos pestañas del mismo navegador cuentan como el mismo dispositivo. Una ventana de incógnito u otro navegador cuentan como otro dispositivo
- Cerrar sesión en un dispositivo ya no cierra las sesiones de los demás. Si lo hiciera, el dispositivo que ganó la cuenta perdería la suya
- La tabla device_sessions guarda una fila por cuenta con un id aleatorio del navegador, una etiqueta corta como Chrome en Windows y la hora. No guarda IP, modelo, ubicación ni nada que identifique a la persona
- Cada alumno lee solo su fila. Nadie la escribe directo, solo la función claim_device. Ni el administrador ni el dueño la ven

### Cómo aplicar la migración

No necesitas terminal. El orden no importa. Mientras no apliques el SQL, la app funciona igual y simplemente no limita dispositivos.

1. En supabase.com abre el proyecto Studiare y entra a SQL Editor
2. Da clic en New query
3. Abre en GitHub el archivo supabase/migrations/20261007000001_single_device.sql, copia todo su contenido y pégalo
4. Da clic en Run. Debe decir Success
5. Si dice que la tabla ya existe, la migración ya estaba aplicada y no hay nada más que hacer
6. Para confirmar, abre otra New query, pega esto y da clic en Run

```sql
select to_regclass('public.device_sessions') as tabla,
       has_function_privilege('anon', 'public.claim_device(text, text)', 'execute') as anon_puede,
       has_function_privilege('authenticated', 'public.claim_device(text, text)', 'execute') as alumno_puede;
```

7. Debe salir tabla con el valor device_sessions, anon_puede en false y alumno_puede en true. Si anon_puede sale en true, avísame antes de abrir a alumnos

### Cómo probarlo con dos navegadores

Necesitas dos navegadores distintos, por ejemplo Chrome y Edge, o una ventana normal y una de incógnito. Dos pestañas del mismo navegador no sirven, porque comparten dispositivo.

1. En el navegador A abre la página y entra con tu correo usando el enlace
2. En el navegador B abre la página y entra con el mismo correo. Pide un enlace nuevo y ábrelo ahí
3. Regresa al navegador A, cambia a su pestaña o da clic en su ventana. Debe aparecer el aviso Tu cuenta se abrió en otro dispositivo y la página debe quedar sin sesión. Si no cambias de pestaña, el aviso sale en cuanto pase un minuto con la pestaña a la vista
4. En el navegador B sigues dentro. Si recargas B, no debe pasar nada
5. En A da clic en Entendido y vuelve a entrar con un enlace nuevo. Ahora el aviso le sale a B
6. Para ver quién tiene hoy cada cuenta, corre esto en SQL Editor

```sql
select u.email, d.label, d.claimed_at
from public.device_sessions d
join auth.users u on u.id = d.user_id
order by d.claimed_at desc;
```

### Si un alumno queda atorado

Libera su cuenta con esto, cambiando el correo. El primer dispositivo que revise después se queda con ella.

```sql
delete from public.device_sessions
where user_id = (select id from auth.users where email = 'alumno@ejemplo.com');
```

Si ya aplicaste la segunda migración, usa mejor la función de la sección siguiente. Deja constancia de quién liberó la cuenta y además reinicia el conteo de cambios, que borrar la fila a mano no hace.

### Qué no hace

- Por sí solo es un freno para el uso normal y no una barrera. La revisión corre en el navegador, así que alguien con conocimientos técnicos podría saltársela. La versión estricta, que la base de datos revise el dispositivo en cada consulta, es la segunda migración y se explica en la sección siguiente
- Los alumnos que ya tenían sesión antes de aplicar esto entran sin avisos. El primer navegador que abra la nueva versión reclama la cuenta y, de ahí en adelante, gana el último

## Barrera del dispositivo único en el servidor

El freno de la sección anterior vive en el navegador. La barrera hace que la propia base de datos cumpla la regla, aunque alguien manipule su navegador. Va en una segunda migración, que se aplica después de la primera.

### Cómo funciona

- Cuando un navegador reclama la cuenta, la base guarda también la sesión de Supabase con la que entró. Es un dato que viene firmado en el token de acceso y que el navegador no puede cambiar
- Las tablas con datos del alumno revisan en cada consulta que quien pregunta sea la sesión ganadora. Si no lo es, no ve nada y no puede guardar nada, aunque su sesión siga abierta y su token siga siendo válido
- Gana el último en entrar, igual que en el freno. El navegador desplazado ve el aviso y sale en cuanto la app lo revisa, a más tardar en un minuto con la pestaña a la vista. Mientras tanto la base ya lo tiene bloqueado
- Quedan protegidos los datos propios de perfil, cuenta, suscripción, reportes, mazos con sus notas y tarjetas, bitácora de estudio, grupos con sus retos y borradores de IA
- No se protegen el rol, el alias propio, quién tiene la cuenta, el aviso de privacidad, el historial de pagos, las preguntas aprobadas, la configuración pública ni los mazos públicos. Los primeros se necesitan para poder entrar y reclamar la cuenta, y el resto es contenido compartido o lo escribe el servidor
- Una cuenta que nadie ha reclamado todavía no se bloquea. Tampoco una cuenta que reclamó antes de esta migración, hasta que su navegador abra la versión nueva de la app, lo que ocurre solo y no gasta ningún cambio
- Los administradores y el dueño siempre pasan, para que puedan revisar cuentas desde cualquier navegador
- Límite de cambios, como máximo 3 veces en 24 horas un mismo usuario puede tomar la cuenta desde un dispositivo distinto. El primer reclamo y volver al mismo navegador no cuentan. Al pasarse, el servidor rechaza el cambio y el alumno ve un aviso con la hora en que podrá intentarlo otra vez
- El límite vive en la tabla platform_settings, en la clave device_limits, y lo cambia un administrador. Si esa fila falta o se daña, valen 3 cambios en 24 horas
- La tabla device_claims es la bitácora. Guarda un renglón por reclamo con la cuenta, el id del navegador, la etiqueta corta como Chrome en Windows, la hora, el tipo y si el cambio fue rechazado. No guarda IP, modelo ni ubicación. Solo se agrega. Nadie la edita ni la borra, ni siquiera un administrador, y la app tampoco la lee directo. Se consulta desde el editor de SQL o con la función admin_device_claims

### Cómo aplicar la segunda migración

No necesitas terminal. Aplica primero la del freno, que ya debe estar puesta. Mientras no apliques esta, la app sigue con el freno y no pasa nada.

1. En supabase.com abre el proyecto Studiare y entra a SQL Editor
2. Da clic en New query
3. Abre en GitHub el archivo supabase/migrations/20261008000001_device_barrier.sql, copia todo su contenido y pégalo
4. Da clic en Run. Debe decir Success
5. Si dice que la relación public.device_sessions no existe, falta aplicar la migración del freno. Aplícala y vuelve a correr esta
6. Es segura de repetir. Si la corres otra vez, no duplica ni cambia nada
7. Para confirmar que quedó, abre otra New query, pega esto y da clic en Run

```sql
select
  to_regclass('public.device_claims') as bitacora,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'device_sessions' and column_name = 'session_id') as columna_session_id,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') like '%is_active_device%') as politicas_con_barrera,
  has_function_privilege('anon', 'public.is_active_device()', 'execute') as anon_is_active,
  has_function_privilege('anon', 'public.admin_release_device(uuid)', 'execute') as anon_libera,
  has_function_privilege('authenticated', 'public.claim_device(text, text)', 'execute') as alumno_reclama,
  (select value from public.platform_settings where key = 'device_limits') as limite;
```

8. Debe salir bitacora con el valor device_claims, columna_session_id en true, politicas_con_barrera en 22 (23 si ya aplicaste la de sincronización), anon_is_active en false, anon_libera en false, alumno_reclama en true y limite con maxChanges 3 y windowHours 24. Si politicas_con_barrera sale en menos de 22 o cualquier valor de anon sale en true, avísame antes de abrir a alumnos
9. Para que el aviso del límite lleve un enlace de ayuda, crea en GitHub, Settings, Secrets and variables, Actions, pestaña Variables, la variable VITE_SUPPORT_EMAIL con el correo donde quieres recibir las dudas. Es público, lo verán los alumnos. Después corre de nuevo la publicación en Actions, con el flujo pages y Run workflow. Sin esa variable el aviso no muestra enlace y pide al alumno que consulte al equipo por el medio donde le dieron acceso

### Cómo probarlo con dos navegadores

Necesitas dos navegadores distintos, por ejemplo Chrome y Edge, y una cuenta de prueba. Dos pestañas del mismo navegador no sirven, porque comparten dispositivo.

1. En el navegador A entra con el correo de prueba usando el enlace
2. En el navegador B entra con el mismo correo. Pide un enlace nuevo y ábrelo ahí
3. Regresa al navegador A. Debe aparecer el aviso Tu cuenta se abrió en otro dispositivo y la página debe quedar sin sesión. Ese aviso es la parte del navegador
4. Para ver la parte del servidor, corre esto en SQL Editor cambiando el correo. Finge ser un navegador con otra sesión de la misma cuenta, como el que acaba de perder, y pregunta a la base si lo deja pasar. No cambia nada

```sql
select p.email, public.is_active_device() as el_dispositivo_anterior_pasa
from (
  select u.email,
         set_config('request.jwt.claims',
           json_build_object('sub', u.id, 'role', 'authenticated', 'session_id', gen_random_uuid()::text)::text, true) as ajuste
  from auth.users u
  join public.device_sessions d on d.user_id = u.id
  where u.email = 'tu-correo-de-prueba@ejemplo.com'
) p;
```

5. Debe salir el_dispositivo_anterior_pasa en false. Esa misma respuesta es la que usan las reglas de todas las tablas protegidas, así que con false no puede leer ni guardar sus datos
6. Para comparar, corre la versión del dispositivo ganador. Debe salir true

```sql
select p.email, public.is_active_device() as el_dispositivo_ganador_pasa
from (
  select u.email,
         set_config('request.jwt.claims',
           json_build_object('sub', u.id, 'role', 'authenticated', 'session_id', d.session_id)::text, true) as ajuste
  from auth.users u
  join public.device_sessions d on d.user_id = u.id
  where u.email = 'tu-correo-de-prueba@ejemplo.com'
) p;
```

7. Para ver los reclamos de la cuenta, corre esto. Deben aparecer un renglón first del navegador A y un renglón switch del navegador B

```sql
select c.claimed_at, c.kind, c.rejected, c.label, c.device_id
from public.device_claims c
join auth.users u on u.id = c.user_id
where u.email = 'tu-correo-de-prueba@ejemplo.com'
order by c.claimed_at desc, c.id desc
limit 50;
```

Las pruebas automáticas de la base, que yo corro en un Postgres local, comprueban lo mismo tabla por tabla, incluido que el navegador desplazado no lea ni escriba en cada tabla protegida. Lo que sí queda por confirmar en tu proyecto real es el paso 3 completo con dos navegadores, y avisarme si algo sale distinto.

### Qué ve el alumno al pasar el límite

Para verlo sin hacer cuatro cambios, baja el límite a 1 por un rato. Con el límite en 1, el primer cambio entre navegadores pasa y el segundo se rechaza.

```sql
update public.platform_settings
set value = '{"maxChanges":1,"windowHours":24}'
where key = 'device_limits';
```

1. En el navegador A entra con el correo de prueba
2. En el navegador B entra con el mismo correo. Es el primer cambio y pasa. A sale con el aviso de otro dispositivo
3. En A vuelve a entrar con un enlace nuevo. Es el segundo cambio y el servidor lo rechaza
4. En A debe verse un aviso que dice Cambiaste de dispositivo demasiadas veces, explica que se cerró la sesión para proteger la cuenta, dice a partir de qué hora podrá volver a entrar desde ese dispositivo y que el otro sigue con la cuenta. Trae el enlace Pedir ayuda si configuraste VITE_SUPPORT_EMAIL, y el botón Entendido
5. B sigue dentro y sin avisos
6. Si el servidor no responde por la red, el alumno no ve este aviso ni sale. La app solo lo muestra cuando el servidor dice con claridad que se pasó del límite
7. Cuando termines, regresa el límite a su valor normal

```sql
update public.platform_settings
set value = '{"maxChanges":3,"windowHours":24}'
where key = 'device_limits';
```

El intento rechazado queda en device_claims con rejected en true. Lo asienta el navegador con una segunda llamada, porque cuando la base rechaza algo deshace también lo que había escrito.

### Cómo libera una cuenta el administrador

Con admin_release_device. Borra el dispositivo de la cuenta, deja constancia de quién lo hizo y reinicia el conteo de cambios, así que sirve también para quien llegó al límite y necesita entrar ya. El primer dispositivo que reclame después se queda con la cuenta.

En el editor de SQL no hay una sesión iniciada, así que la función necesita saber quién la llama. El truco es decirle que eres tú, el dueño. Cambia los dos correos y corre esto.

```sql
select public.admin_release_device(a.alumno) as tenia_dispositivo
from (
  select (select id from auth.users where email = 'alumno@ejemplo.com') as alumno,
         set_config('request.jwt.claims',
           json_build_object('sub', (select id from auth.users where email = 'tu-correo@ejemplo.com'))::text, true) as ajuste
) a;
```

- Sale true si la cuenta tenía un dispositivo y false si no tenía ninguno. En los dos casos queda el renglón release en device_claims con tu usuario
- Si el correo del alumno no existe, la función avisa que no existe esa cuenta
- Si el correo que pusiste como tuyo no es de un administrador o del dueño, la función se niega
- Nadie más puede usarla. Se le quitó el permiso a public y a anon, y la función misma pide ser administrador
- Todavía no hay botón en la app para esto. La función admin_device_claims, que devuelve los últimos 50 reclamos de una cuenta, queda lista para la pantalla de administración

### Cómo detectar cuentas compartidas

La bitácora sirve para ver patrones. Esta consulta lista las cuentas de la última semana con tres o más navegadores distintos o con algún cambio rechazado.

```sql
select u.email,
       count(*) filter (where c.kind = 'switch' and not c.rejected) as cambios,
       count(*) filter (where c.rejected) as rechazos,
       count(distinct c.device_id) as dispositivos_distintos
from public.device_claims c
join auth.users u on u.id = c.user_id
where c.claimed_at > now() - interval '7 days'
group by u.email
having count(distinct c.device_id) >= 3 or count(*) filter (where c.rejected) > 0
order by dispositivos_distintos desc, cambios desc;
```

- Es una señal y no una prueba. Alguien con un teléfono, una computadora y una tableta propios también aparece
- Los rechazos pesan más, porque indican que alguien intentó cambiar de dispositivo más veces de las permitidas
- La decisión de qué hacer con una cuenta la tomas tú. La app no bloquea ni sanciona por su cuenta

### Qué cubre y qué no cubre

Cubre

- Un navegador desplazado no lee ni guarda los datos protegidos, aunque conserve su sesión, aunque alguien manipule su navegador o edite el código de la página. La regla corre en la base de datos
- El número de cambios de dispositivo por cuenta queda limitado y registrado
- La bitácora de reclamos no se puede alterar, ni siquiera por un administrador
- Solo el administrador libera cuentas o ve los reclamos, y un usuario sin sesión no puede ejecutar ninguna de las funciones nuevas

No cubre

- Quien comparte el acceso a la cuenta, por ejemplo el correo con el que entra, y se turna sin pasar de 3 cambios al día sigue pasando. La barrera impide el uso a la vez, no el uso por turnos. La bitácora existe para detectar ese patrón, con la consulta de arriba
- Dos personas frente al mismo navegador comparten dispositivo
- Borrar los datos del navegador crea un id nuevo, así que cuenta como un cambio de dispositivo
- Las preguntas aprobadas, la configuración pública y los mazos públicos los puede leer cualquier sesión, incluida una desplazada. Es contenido compartido
- Una cuenta que nadie ha reclamado, o que reclamó antes de esta migración y todavía no abre la versión nueva de la app, no está bloqueada
- Los administradores y el dueño pasan siempre
- El flujo de revisión médica no está protegido, porque no son datos del alumno. Si más adelante se quiere un solo dispositivo también para médicos, se suma
- Un navegador manipulado puede saltarse la llamada que asienta un rechazo. El rechazo no quedaría en la bitácora, aunque sí seguiría bloqueado. Los cambios aceptados siempre quedan registrados porque los escribe la base misma
- El límite se puede leer desde la página, porque platform_settings es pública para la portada. No es un dato secreto

## Sincronización entre dispositivos

### Qué hace

Cuando el alumno entra con su correo, la app guarda en la nube una copia de lo que creó y la baja en cualquier dispositivo donde vuelva a entrar. Cubre sus mazos propios, notas, tarjetas, apuntes, la distribución de su Inicio y su historial de repaso. Lo precargado y lo de demostración no se sube, porque ya viene con la app. La apariencia es de cada dispositivo.

Como la regla es un solo dispositivo activo por cuenta, casi siempre es un relevo. El dispositivo que se va sube sus cambios al irse de la pestaña, y el que entra baja todo al abrir. Si dos dispositivos editaron lo mismo, gana la edición más reciente. Un borrado también es un cambio y se propaga.

### Cómo aplicar la tercera migración

No necesitas terminal. Aplica primero las dos anteriores, que ya deben estar puestas. Mientras no apliques esta, la app sigue funcionando completa en cada navegador, y la tarjeta de sincronización en Configuración, Cuenta, dice que no hay conexión con la nube.

1. En supabase.com abre el proyecto Studiare y entra a SQL Editor
2. Da clic en New query
3. Abre en GitHub el archivo supabase/migrations/20261008000002_sync.sql, copia todo su contenido y pégalo
4. Da clic en Run. Debe decir Success
5. Si dice que la función is_active_device no existe, falta aplicar la migración de la barrera. Aplícala y vuelve a correr esta
6. Es segura de repetir. Si la corres otra vez, no duplica ni cambia nada
7. La bitácora ya tiene filas, y esta migración le agrega una columna contador. Postgres la llena sin editar ninguna fila. Con muchas filas puede tardar unos segundos
8. Para confirmar que quedó, abre otra New query, pega esto y da clic en Run

```sql
select
  to_regclass('public.sync_records') as tabla,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'events' and column_name = 'seq') as events_seq,
  has_function_privilege('authenticated', 'public.sync_push_records(jsonb)', 'execute') as alumno_sube,
  has_function_privilege('anon', 'public.sync_push_records(jsonb)', 'execute') as anon_sube,
  has_table_privilege('authenticated', 'public.sync_records', 'insert') as alumno_inserta,
  has_table_privilege('authenticated', 'public.sync_records', 'select') as alumno_lee,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || coalesce(with_check, '') like '%is_active_device%') as politicas_con_barrera;
```

9. Debe salir tabla con el valor sync_records, events_seq en true, alumno_sube en true, anon_sube en false, alumno_inserta en false, alumno_lee en true y politicas_con_barrera en 23. Esa cuenta sube de 22 a 23 por la política de lectura de sync_records. Si anon_sube o alumno_inserta salen en true, avísame antes de abrir a alumnos

### Cómo probarlo con dos navegadores

1. Entra con tu correo en un navegador, crea un mazo con una nota y repasa una tarjeta
2. En Configuración, Cuenta, la tarjeta Sincronización entre dispositivos debe decir Todo al día. Si no, pulsa Sincronizar ahora
3. Abre un segundo navegador, entra con el mismo correo y abre el enlace del correo. El primero se cierra solo, porque la cuenta tiene un dispositivo activo
4. En el segundo, el mazo, la nota y el repaso deben aparecer en unos segundos. Si no, pulsa Sincronizar ahora
5. Edita la nota en el segundo, vuelve al primero y entra otra vez. Debe verse la edición del segundo

### Qué ve el alumno cuando algo falla

- Sin conexión, dice que sus cambios siguen en el navegador y se suben al volver la conexión. La app lo reintenta sola con esperas que crecen hasta 5 minutos
- Con otro dispositivo activo, dice que aquí no se sincroniza y no insiste
- Con la sesión vencida, pide entrar de nuevo con el correo
- Con el reloj del dispositivo desfasado más de 5 minutos respecto al servidor, no sube ni baja nada y pide activar la fecha y la hora automáticas. La regla de la edición más reciente solo vale si los relojes se parecen

### Qué cubre y qué no cubre

Cubre

- Solo el dispositivo activo sube o baja. Un navegador desplazado conserva su sesión pero la base lo rechaza
- Nadie escribe en la tabla de registros por fuera de la función, que aplica la regla de la fecha más reciente en el servidor y rechaza fechas del futuro lejano
- Cada alumno ve solo lo suyo
- La bitácora solo se agrega. Subir dos veces el mismo evento no lo duplica
- Lo que baja se valida de nuevo en el navegador, así un registro mal formado, con otro dueño o disfrazado de precargado se descarta

No cubre

- Borrar mis datos en Configuración borra solo lo del navegador. La copia en la nube se vuelve a bajar si el alumno entra otra vez. Borrar también la nube queda para la Fase E, junto con el borrado de cuenta
- Las sesiones de estudio, los hallazgos del tutor y los ajustes personales no se sincronizan todavía. Las cifras del tutor y de Progreso se reconstruyen con la bitácora, que sí viaja
- Dos dispositivos que editen lo mismo a la vez sin conexión conservan la edición más reciente completa. No se mezclan campo por campo
- Los medios de las tarjetas no existen todavía, así que tampoco viajan

## Antes de abrir a alumnos

- El correo de fábrica de Supabase solo envía a los correos del equipo del proyecto y pocas veces por hora
- Hay que conectar un proveedor de correo propio en Authentication, Emails, SMTP Settings. Opciones comunes son Resend, Brevo o Amazon SES

## Qué protege el esquema

| Regla | Cómo se cumple |
|---|---|
| Toda cuenta nace como alumno | Al registrarse, una regla de la base crea su perfil y su rol de alumno |
| El alumno no tiene poderes | No puede escribir roles, preguntas, configuración ni suscripciones |
| El médico revisa solo lo asignado | Ve y decide solo sobre las preguntas que un admin le asignó |
| El admin administra | Asigna preguntas, nombra médicos y ve métricas. No puede nombrar otros admins |
| El dueño es fijo | Solo el dueño nombra o quita admins y nadie puede quitarle el rol |
| Cada cambio de rol queda registrado | Bitácora de auditoría con quién y cuándo |
| Los datos personales no se comparten | El correo y los datos de cuenta los ven solo su dueño y el admin |
| La bitácora de estudio no se altera | Solo se agrega. Editar o borrar está bloqueado en la base |
| Los pagos no se falsean | Solo el servidor con la llave secreta activa suscripciones |
| Una cuenta, un dispositivo | Cada quien lee solo su fila de dispositivo y solo la función claim_device la escribe. Un anónimo no puede llamarla |
| El dispositivo desplazado queda bloqueado en el servidor | Las tablas con datos del alumno exigen que el token sea el de la sesión ganadora. Cambiar de dispositivo está limitado a 3 veces en 24 horas y cada reclamo queda en una bitácora que nadie edita |
