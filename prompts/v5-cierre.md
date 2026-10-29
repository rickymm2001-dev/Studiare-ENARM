# Prompt para la sesión del plan V5, el cierre al 100 por ciento

Pégalo tal cual como primer mensaje de una sesión nueva de Claude Code en la nube sobre el repositorio Studiare-ENARM, desde main. Antes de abrirla, pon en el entorno de la sesión los secretos y los dominios permitidos que pide la sección Entorno de docs/PENDIENTES_DE_RICARDO.md, porque solo se leen al arrancar.

---

Vas a ejecutar el plan V5, que lleva la app del estado actual al lanzamiento abierto con cobro. Lee, en este orden y nada más, CLAUDE.md, docs/PLAN_V5.md completo, docs/DIAGNOSTICO_BETA.md, D-150 y D-151 en DECISIONES.md, la sección D-150 de PROGRESS.md y las secciones Esta semana, Entorno de la sesión y Cuentas que solo tú puedes crear de docs/PENDIENTES_DE_RICARDO.md. No releas V3, V4 ni la especificación completa. Abre docs/DESPLIEGUE.md, docs/SUPABASE.md, docs/STRIPE.md, docs/CORREOS.md y docs/PUBLICACION.md solo cuando el bloque que los necesita empiece.

## Contexto que no está en los archivos

- El rediseño D-150 ya está fusionado en main y congelado. No cambies la interfaz salvo para corregir defectos. La escala de letra corta del bloque 4 se queda.
- Lo operativo lo haces tú con los conectores. Supabase (migraciones, funciones, ajustes de Auth, secretos), Cloudflare (Pages y DNS si el token lo permite), Stripe (precios, portal, webhook, con la llave que haya) y GitHub (PRs, secretos, variables). Solo me pides lo que no puedes hacer, y me lo pides el día 1 en una sola lista, la de la sección 4 del plan, con lo que desbloquea cada cosa.
- Mientras una cuenta no exista, deja el bloque listo y apagado con su bandera y sigue con el siguiente. No esperes.
- Las decisiones de diseño abiertas las tomas tú con el criterio de la sección 2 del plan, las anotas en DECISIONES.md y me las resumes. Yo puedo revertir cualquiera.
- El contenido médico lo validan médicos pagados por pregunta. Tú preparas el flujo, el Sheet y la cola de revisión. Nada que escriba la IA se aprueba solo ni pierde su etiqueta hasta que un médico lo apruebe.
- El proyecto real de Supabase hoy tiene el esquema de B10 y 7 de 13 funciones. La cadena de despliegue b11 a b18 y f2 nunca corrió contra él. Ensáyala primero en un proyecto de prueba y aplícala con dry-run.
- El CI tiene pruebas de tiempo que fallan bajo carga (cardSearch.performance, post-deploy, PrivacySection, CalendarScreen). Arréglalas en B0 antes que nada, porque un rojo falso tapa los rojos de verdad.

## Pausas

Solo te detienes a pedirme confirmación en una línea en estos puntos. En todo lo demás sigues sin esperar.

- Antes de aplicar la cadena de migraciones al proyecto real de Supabase, con el resumen de lo que va a cambiar.
- Antes de cualquier cobro real en Stripe o Mercado Pago, aunque sea de prueba chica.
- Antes de borrar algo fuera del repositorio que no se pueda recuperar.
- Antes de abrir el registro al público.

## Reglas de trabajo

- Un bloque es un PR a main con el CI en verde. Rama estable con etiqueta beta-5 desde B0, y los defectos de las betas se publican desde ahí sin esperar al siguiente bloque.
- Al cerrar cada bloque escribe 5 a 10 líneas en PROGRESS.md, registra decisiones nuevas en DECISIONES.md con número, actualiza docs/DESPLIEGUE.md si tocaste el proyecto real, y dame una lista corta de lo que puedo probar.
- En cada bloque corre npm run check y las e2e de lo que tocaste en teléfono y computadora. La suite e2e completa en los cuatro proyectos va al cerrar B0, B5 y B9. Playwright nunca en paralelo con otra corrida de Playwright.
- Motores nuevos en src/engines como funciones puras con pruebas. Lecturas de la nube validadas con zod. Eventos solo se agregan.
- Antes de usar la API de una librería o de un servicio revisa su documentación vigente. No instales nada global. Si hace falta una dependencia nueva, dime cuál, cuánto pesa y para qué, antes de instalarla.
- Todo dato de demostración y todo texto médico sin validar lleva su etiqueta visible. Nada de predicción del puntaje ENARM ni chat libre con IA.
- Microcopy en español de México con trato de tú. Código y nombres en inglés.
- Si algo del plan contradice CLAUDE.md o una decisión anterior y D-151 no lo cubre, pregúntame antes de suponer.
- Si fallas dos veces en corregir lo mismo, detente, documenta en PROGRESS.md y pregunta.
- Ideas fuera del alcance van a IDEAS.md.
- En mensajes y documentos para mí no uses el signo de dos puntos.

Empieza por V5-B0 y, en tu primer mensaje, dame la lista de la sección 4 del plan con lo que necesito entregar y qué desbloquea cada cosa.
