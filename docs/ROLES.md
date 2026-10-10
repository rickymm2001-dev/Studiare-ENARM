# Tipos de cuenta y planes

Cómo se define hoy quién es cada persona en Studiare y qué puede hacer. Hay dos cosas distintas, el rol, que dice qué área de la plataforma ve, y el plan, que dice cuánto puede estudiar.

## Los roles

Son cuatro, y no tres, porque el dueño y el admin son niveles distintos.

- **Alumno.** Es el cliente. Repasa, practica, hace exámenes, usa el tutor y Party. Todas las cuentas nuevas nacen como alumno, sin excepción
- **Médico.** Revisa las preguntas. Ve el banco, edita y etiqueta preguntas, mide el acuerdo entre médicos, aprueba borradores de IA y resuelve reportes. Su pantalla de entrada es el banco
- **Admin.** Nombra médicos, ve las cuentas, cambia costos y configuración de IA, genera datos de demostración y cambia los umbrales. También ve el panel médico
- **Dueño.** Es el administrador general, es decir tú. Hace todo lo del admin y además es el único que nombra o quita admins. Nadie le puede quitar el rol, y solo puede haber uno

## Dónde vive el rol

- En Supabase, en la tabla user_roles, una fila por cuenta. Es la única fuente de verdad
- Al registrarse alguien, una regla de la base le crea el rol alumno. No hay forma de registrarse con otro rol
- Cambiarlo solo se puede con la función set_user_role, que revisa estas reglas en el servidor. Solo admins y el dueño la usan. Nadie cambia su propio rol. El rol de dueño no se asigna desde la app. Nadie puede quitar al dueño. Solo el dueño nombra o quita admins. Cada cambio queda en la bitácora role_audit
- Tu cuenta de dueño se marca una sola vez a mano, con el SQL del paso 3 de docs/SUPABASE.md, porque la app no puede asignar ese rol

## Cómo se aplica

- Al entrar, la app lee tu rol del servidor y lo aplica. Si no se puede leer, por ejemplo sin conexión, se queda con el último verificado y reintenta solo. Sin sesión, el rol es alumno
- Las áreas del médico y del admin se esconden según el rol. Eso es comodidad de la interfaz y no es la protección
- La protección real está en el servidor. Los permisos por fila de Supabase deciden qué filas puede leer y escribir cada rol, y el proxy de IA alojado revisa el rol de cada llamada con la sesión verificada. Aunque alguien cambie su rol en su navegador, el servidor no le da datos ni acciones de otro rol
- Sin la nube, como en la demostración, la pantalla Rol deja elegir cualquier rol para probar el prototipo. Con la nube conectada esa pantalla solo dice que el rol lo da el servidor

## Cómo nombrar a un médico

1. La persona crea su cuenta como cualquier alumno
2. Tú entras a Usuarios, buscas su alias o su correo y le cambias el rol a Médico
3. La próxima vez que ella abra la app, ya ve el área médica

Un admin también puede nombrar médicos. Solo tú nombras admins.

## Los planes

El plan es independiente del rol. Cada cuenta tiene uno.

- **Gratis.** 20 preguntas distintas por día de estudio, aplicado en el servidor
- **Fundador, Mensual y Anual.** Sin tope diario y con todas las funciones
- Un mes gratis por referido da el plan Mensual mientras dure
- Los médicos, los admins y el dueño no necesitan plan de pago. Entran a todo lo que su rol permite, también a la IA
