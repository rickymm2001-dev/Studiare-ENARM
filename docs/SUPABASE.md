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
4. Avísame y conecto el código para que la app use Supabase en lugar del navegador

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
