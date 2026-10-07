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

### Qué no hace

- Es un freno para el uso normal y no una barrera. La revisión corre en el navegador, así que alguien con conocimientos técnicos podría saltársela. Una versión estricta, que el servidor revise el dispositivo en cada consulta, queda anotada como idea para más adelante
- Los alumnos que ya tenían sesión antes de aplicar esto entran sin avisos. El primer navegador que abra la nueva versión reclama la cuenta y, de ahí en adelante, gana el último

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
