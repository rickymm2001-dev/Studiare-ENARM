# Avance

## Estado actual

- Plan V4 escrito el 2026-10-22 en docs/PLAN_V4.md (D-140). Continúa V3 y manda sobre él donde no coincidan. Siete bloques nuevos (densidad y espacio, identidad visual, repaso completo al estilo Anki, métodos y plan de hoy, Bloom y estructura del examen, calendario, comunidad por etapas) más los pendientes de Paco, y los B15, B17 y B18 de V3 se reacomodan antes de la auditoría final V4-B10. La auditoría por bloque se mueve al final por decisión de Ricardo. Nueve decisiones esperan su respuesta en la sección 8 del plan. V4-B0, V4-B1 (densidad y espacio), V4-B3 (repaso completo), V4-B4 (métodos y plan de hoy), V4-B5 (Bloom, Cómo es el examen y hoja de respuestas), V4-B6 (calendario), V4-B7 (etapa 1 ya cubierta por B14) V4-B8 (Urgencias gratis en la interfaz) y V4-B2 (identidad visual, D-145) hechos, ver el estado de cada uno en el plan y D-144. Sigue V4-B10 auditoría final
- Plan del cambio V3 en ejecución desde el 2026-10-12 (D-119, docs/PLAN_DEL_CAMBIO.md). Manda sobre PLAN.md y sobre la especificación donde no coincidan. Ricardo dio por cerradas todas las fases que esperaban su aprobación (respuesta 98) y autorizó lo de la sección 0.1, así que los bloques van sin detenerse, un PR por bloque con el CI en verde
- Bloques. B0 a B15 y B16 hechos y fusionados en main, ver sus secciones. B17 publicación (PR 61) también. B18 primeros alumnos (D-139) fusionado. El B19 de V3 pasó a V4-B10, la auditoría final del plan V4
- Lo que falta de Ricardo vive en docs/PENDIENTES_DE_RICARDO.md. Las dudas que no frenan están en Preguntas para Ricardo, dentro de la sección del plan V3 de este archivo
- Marca Studiare en el manifest, la pestaña, la portada y el README (D-119). La demo publicada en GitHub Pages sigue en https://rickymm2001-dev.github.io/Studiare-ENARM/ hasta pasar a Cloudflare Pages (B17)
- Nube. El proyecto real de Supabase tiene el esquema hasta B10, verificado por huella antes de cada fusión, y las funciones de pago, de Mercado Pago, de restablecer el segundo factor y de cancelar la suscripción desplegadas, con los secretos de Stripe de prueba (D-113, D-118, D-130). El 2026-10-15 se aplicó el plan b10 completo (pagos-b10.sql y el archivo de Party). Las suscripciones de prueba de Ricardo ya están canceladas y reembolsadas en Stripe. Sus filas en la base se borran con su autorización
- Inicio con el diseño fijo de Ricardo (D-116) y la barra superior con el menú lateral que se oculta (D-117)
- Historia. Las fases 0 a L de abajo quedaron cerradas con la respuesta 98. Sus secciones se conservan como registro de lo hecho y de su evidencia, aunque digan que esperan aprobación

## Plan del cambio V3 (D-119)

Arrancó el 2026-10-12 con el mensaje de Ricardo que autoriza la sección 0.1 del plan. Cada bloque cierra con 0.3 del plan. Las e2e de cada bloque corren en teléfono y computadora, las capturas van a docs/screenshots/v3 con una carpeta por bloque y un subagente que no escribió el código revisa el diff.

### Bloques
- [x] B0. Arranque
- [x] B1. Auditoría inicial de procesos (PR 36 fusionado)
- [x] B2. Sistema de diseño y rediseño visual (PR 40 fusionado, que incluye el PR 37)
- [x] Paleta de color con más color por rama y acento cálido (D-128, PR 51 fusionado)
- [x] B3. Navegación, Configuración y Perfil (PR 42 fusionado)
- [x] B4. Repasar y Buscar tarjetas (PR 43 fusionado)
- [x] B5. Revisión del examen y motivos de error (PR 43 fusionado, junto con B4)
- [x] B6. Apuntes y mazos (PR 44 fusionado)
- [x] B7. Party real y lo que se queda o se va (PR 48 fusionado)
- [x] B8. Plan Gratis (PR 49 fusionado)
- [x] B9. Cuentas y acceso (PR 52 fusionado)
- [x] B10. Pagos completos (PR 53 fusionado)
- [x] Herramientas. Despliegue desde el repo y Playwright en paralelo (D-131, PR 54 fusionado)
- [x] B11. Banco en la nube y Google Sheets (D-133, PR 55 fusionado)
- [x] B12. IA real (D-134, PR en curso)
- [x] B13. Inglés médico (D-135, PR en curso)
- [x] B14. Datos y modelo del alumno (D-136, PR 59 fusionado)
- [x] B15. Analítica, errores, recordatorios y recorrido (D-137, PR 60 fusionado)
- [x] B16. Legal y privacidad (D-132, PR en curso)
- [x] B17. Publicación (D-138, PR 61 fusionado)
  - Imagen para compartir y capturas de instalación que hizo Gemini, integradas el 2026-10-15. En el build de GitHub Pages la imagen lleva la dirección completa (SITE_URL) para que WhatsApp y Facebook la muestren
- [x] B18. Primeros alumnos (D-139, PR en curso)
- [ ] B19. Auditoría final y lanzamiento

Plan V4 (docs/PLAN_V4.md, D-140 a D-146). El estado de cada bloque está en su propia sección del plan
- [x] V4-B0. Arranque (D-140)
- [x] V4-B1. Densidad y espacio (D-141)
- [x] V4-B2. Identidad visual con papel cálido y títulos en serif (D-145). Cristal y fondos esperan la decisión 2
- [x] V4-B3. Repaso completo al estilo Anki (D-142)
- [x] V4-B4. Métodos de estudio y plan de hoy (D-143)
- [x] V4-B5. Bloom, Cómo es el examen y hoja de respuestas (D-144). El nivel cognitivo en la nube queda pendiente
- [x] V4-B6. Calendario (D-144)
- [x] V4-B7. Comunidad, etapa 1 ya cubierta por la comparación de B14 (D-144)
- [x] V4-B8. Urgencias gratis solo en la interfaz con el catálogo de la app. La regla del servidor espera a Ricardo (D-144)
- [ ] V4-B9. Cuentas de Ricardo, ver docs/PENDIENTES_DE_RICARDO.md
- [~] V4-B10. Auditoría final, en curso. Revisión independiente por área hecha, arreglos y suite completa en marcha (D-146)

### B0. Arranque

Hecho
- La rama claude/lucid-noether-odfkau se unió con main sin conflictos. Trae D-118, un solo plan pagado a la vez, que ya estaba desplegado como create-checkout versión 15
- CLAUDE.md ajustado (respuestas 34, 35 y 38). La clave ENARM_ANTHROPIC_KEY vive en server/.env.local en desarrollo y como secreto de las Edge Functions en producción, el proxy de IA de producción corre como Edge Function, OpenAI solo compara calidad en las evaluaciones, el referido se concreta con el primer pago verificado y el plan del cambio manda sobre PLAN.md
- D-119 registrado con el resumen del plan, los 29 choques de la sección 4 y las explicaciones de la sección 5
- Marca Studiare (respuesta 54) en src/config/brand.ts, index.html, README.md y los textos de la interfaz que decían prototipo. BRAND.themeColor y backgroundColor coinciden ahora con los tokens, con src/config/brand.test.ts que lo vigila. index.html lleva una descripción neutra y etiquetas Open Graph para Google y WhatsApp (4.17). El identificador de exportación enarm-prototipo-export-v2 se queda
- Banderas de lanzamiento en src/config/featureFlags.ts, con un valor por entorno (VITE_APP_ENV, que el workflow de Pages fija en demo) y respaldo en platform_settings, clave feature_flags, que CloudBridge copia al navegador como los umbrales del admin. Primera bandera, demoTools. Pruebas unitarias en src/config/featureFlags.test.ts y src/data/cloud/featureFlags.test.ts
- IDEAS.md con el piloto universitario, WhatsApp, la prueba de penetración y FSRS por alumno
- docs/PENDIENTES_DE_RICARDO.md reescrito con la sección 9 del plan y lo que salió de este bloque
- Capturas en docs/screenshots/v3/b0 con npm run screenshots:v3, en 390, 1280 y 1920 px, claro y oscuro

No se pudo
- Limpiar la prueba de pagos (respuestas 1 y 2). La credencial de Stripe del entorno es la llave publicable (pk_test_) y Stripe no acepta con ella llamadas de servidor. El camino alterno, una función temporal en Supabase con la llave que ya vive en sus secretos, lo bloqueó el modo Auto. Quedan los pasos exactos en docs/PENDIENTES_DE_RICARDO.md y el SQL en supabase/manual/limpiar-pagos-de-prueba.sql
- Borrar stripe-config-check. El token de api.supabase.com del entorno no es válido (JWT could not be decoded) y el conector no borra funciones. Sigue en la lista de Ricardo

Evidencia
- npm run check. Typecheck y lint limpios. 2,725 pruebas unitarias en 275 archivos, 2,723 pasan y 2 se omiten a propósito. Una prueba del servidor (server/src/env.test.ts) dependía de que la variable de la clave no existiera en el entorno de la sesión y ahora compara sin imprimir valores
- e2e. pwa, smoke, labels y roles, 96 pruebas en teléfono y computadora, todas pasan. Capturas en docs/screenshots/v3/b0, 18 imágenes en tres anchos, claro y oscuro
- Revisión independiente. Un subagente que no escribió el código revisó el diff contra el plan y CLAUDE.md. Sin hallazgos críticos ni altos. Dos medios (la evidencia de este archivo estaba pendiente y una prueba no verificaba la clave de lectura) y ocho bajos, todos corregidos. Lo más útil, las banderas se copian también a quien no ha entrado y un valor inválido del servidor ya no borra la copia local
- PR 35 a main con check, e2e y audit del CI

### B1. Auditoría inicial de procesos (D-120)

Hecho
- Inventario de los 17 procesos de la lista mínima más 5 fuera de ella en docs/auditoria-v3/procesos.md, con pantallas, archivos, tablas, eventos, estados y las pruebas que cubren cada uno
- Recorrido automático de las 32 pantallas con cuatro roles, en teléfono y computadora (npm run audit:ui). 10 recorridos con 0 hallazgos y 10 flujos con interrupciones en verde. Resultados en docs/auditoria-v3/recorrido
- 27 hallazgos en docs/auditoria-v3/hallazgos.md, ninguno crítico. Los altos corregidos aquí o asignados con su motivo al bloque que toca esa pantalla
- Correcciones. Los consentimientos opcionales empiezan apagados (4.27). El examen completo ya no dice Próximamente en Suscripción ni en la portada. La retroalimentación ya no promete un botón que no existe. La prueba del SIGNED_IN rezagado ya no depende de un temporizador
- Supabase simulado dentro de Playwright (tests/e2e/support/fakeSupabase.ts, fakeGateway.ts, cloudFixtures.ts) y proyectos cloud-desktop y cloud-mobile con su propio build hacia un origen falso. Atiende auth, PostgREST, RPC, las Edge Functions de pago y una pasarela y un portal de mentira. Cinco specs en tests/e2e/cloud (cuenta con enlace y código, dispositivo único, pagos, borrar cuenta y referidos), 22 pruebas en teléfono y computadora. Encontraron un desborde real en Suscripción con el cupo Fundador lleno, corregido (H27). Qué simula y qué no está en tests/e2e/cloud/README.md
- E2E nuevas de los procesos que no tenían camino feliz. Nueve specs (pomodoro, review-tools, full-exam, practice-filters, retry-missed, export-data, tutor-ai, physician-labeling y admin-users), 30 pruebas en teléfono y computadora, cada una con su camino feliz y su falla o límite, más tests/e2e/support/b1.ts con los ayudantes. Encontraron un desborde real en el teléfono con la píldora del Pomodoro abierta, corregido (H24)
- Capturas en docs/screenshots/v3/b1

Evidencia
- npm run check. Typecheck y lint limpios. 2,725 pruebas unitarias en 275 archivos, 2,723 pasan y 2 se omiten a propósito
- e2e completo contra el build de producción. 272 pruebas en cuatro proyectos (teléfono, computadora y los dos de nube con el Supabase simulado), 271 pasan y 1 se omite a propósito, en 18 minutos. Después de los ajustes de la revisión se repitieron los dos proyectos de nube y las specs de legal y privacidad, en verde
- Auditoría de recorridos. 10 recorridos con 0 hallazgos, 10 flujos con interrupciones y la nube caída en verde
- Capturas en docs/screenshots/v3/b1, 18 imágenes en tres anchos, claro y oscuro. Portada y Suscripción sin Próximamente, y Privacidad con los permisos apagados
- Revisión independiente de un subagente que no escribió el código, con tsc, eslint y 79 pruebas unitarias corridas por él. Sin hallazgos críticos ni altos. Tres medios y siete bajos, todos atendidos. Lo más útil, el Supabase simulado invertía la regla de los reclamos refresh del dispositivo, el aviso de privacidad seguía diciendo que los permisos se daban al crear el perfil, y faltaban las capturas
- PR 36 a main con check, e2e y audit del CI

### B2. Sistema de diseño y rediseño visual (D-121)
- Hecho. Tokens nuevos con un solo color de acción #156082 y neutros, sin degradados, dorado ni brillos. Botones, tarjetas, StatPanel, etiquetas, campos, barra de progreso y navegación con el sistema sobrio. Título de pantalla de 20 y 24 px para el saludo y los títulos, y los grupos de Inicio del mismo tamaño (comentario 7). Etiqueta Demostración, no validado por médicos fuera de 17 archivos y un aviso global Versión de demostración con la bandera demoBank, que con la base de demostración sale junto a Datos simulados. Fondos con degradado, color y foto fuera de Apariencia. Portada, imagen de logro y vista previa lisas. Fotos de perfil con recorte circular y bucket privado en Storage
- Retomado el 2026-10-13 por otra sesión en la rama ccr-60b5d3a7-f40uky, que trae los commits del PR 37 y lo cierra con un PR propio
- Correcciones del informe de diseño (docs/auditoria-v3/revision-diseno-b2.md). SegmentedControl, FilterChip, Skeleton y FileChooser nuevos en src/ui/components. Estados alineados a la izquierda, Disclosure con superficie, Progreso e Inicio sin etiquetas de colores, selector de archivo en español y un solo componente, y la prueba de diseño que falla con píldoras y con utilidades de degradado
- Revisión independiente del diff completo. Cuatro altos corregidos. La foto de perfil ahora gana la elección más reciente entre dispositivos (columna avatar_changed_at). Eliminar la cuenta quita antes la foto con la API de Storage, porque el proyecto real bloquea el borrado de archivos por SQL. El aviso de privacidad pasa a la versión 2026-10-13 con la foto y los lugares nuevos de Configuración. Regresan las pruebas del código del correo (D-115). Medios corregidos. Los admins ya no ven fotos, un token indicator da más de 3 a 1 en oscuro a bordes, anillos, barras y gráficas, los bordes de los campos tienen contraste, el control segmentado marca bien la opción elegida, los íconos decorativos y las iniciales son neutros, y theme-dark.spec revisa axe con datos de verdad en todas las pantallas
- La e2e del Tutor que fallaba era real. Responder una hipótesis recalculaba toda la vista en cada escritura y la tarjeta tardaba unos 4.5 s, además de dejar responder dos veces. Ahora la respuesta se ve en el mismo toque y cada hipótesis guarda por su cuenta
- Migración 20261017000001_avatar_changed_at aplicada en el proyecto real con el conector, con la columna y la política comprobadas
- Hallazgo nuevo H29, un dispositivo nuevo puede sobrescribir en la nube datos opcionales de la cuenta con vacíos. Asignado a B9
- Evidencia. npm run check con typecheck y lint limpios y 2,798 pruebas que pasan; las 5 que fallaron fueron por tiempo con la máquina a carga 11 en 4 núcleos y pasan solas (102 de 102). Pruebas SQL en verde con el esqueleto de Storage que copia la protección del proyecto real. tutor.spec y theme-dark.spec en verde en teléfono y computadora. JavaScript inicial de 283 KB de 300
- Capturas de antes en docs/screenshots/v3/antes y de después en docs/screenshots/v3/b2, ya con las correcciones, en calidad 60 para que pesen menos

### B3. Navegación, Configuración y Perfil (D-122)
- Hecho. Menú por rol con riel en computadora y barra de cinco en el teléfono con Más, que abre Apuntes, Tutor, Party y Configuración (4.28). Rutas viejas de Perfil, Planificador y Logros redirigen sin dejar historial. Apuntes con lugar propio en el menú
- Configuración en una sola página con Perfil, Apariencia y Privacidad. Perfil con Tu plan, Tus datos de solo lectura, Editar perfil con Guardar y Cancelar y aviso de cambios sin guardar, y Tu sesión
- Ajustes del repaso en un panel de Repasar con todo lo que se guarda del repaso y el Pomodoro, con un solo lugar por ajuste. Atrás lo cierra y pregunta antes de perder cambios
- Progreso recibe la semana del planificador y el puntaje oficial. Logros, insignias y ligas se quitan sin tocar eventos, y quedan las tres misiones de hoy en Inicio (4.12)
- Lo de demostración que estaba en Cuenta pasa a Datos de demostración del admin detrás de demoTools
- Revisión independiente con 15 hallazgos, todos corregidos. La e2e de la cuenta encontró una carrera real, el puente con la nube reabría una sesión recién cerrada, y ya no pasa. El botón de borrar pasa el contraste al pasar el puntero
- Evidencia. npm run check con typecheck y lint limpios y 2,875 pruebas que pasan (2 omitidas que solo corren con su variable de entorno). E2e del bloque en teléfono y computadora, 194 pasan en la última corrida completa y la única falla, un selector ambiguo de práctica, quedó corregida y pasó 8 de 8 sola. Nube 22 de 22. perf.spec pasa con la máquina tranquila y su límite es justo con otros agentes corriendo (mediana de 123 a 155 ms, sin regresión contra la versión anterior)
- JavaScript inicial de 284.8 KB de 300
- Capturas en docs/screenshots/v3/b3, en teléfono, 1280 y 1920, en claro y en oscuro

### B4. Repasar y Buscar tarjetas (D-123)
- Hecho. Temas de cada mazo hasta tres niveles (rama, materia y tema), desde la ruta de las etiquetas de los mazos de Paco, con nombres legibles y plegados con su resumen. En Repasar se ven abiertos dentro de Mazos y temas
- Buscar tarjetas reemplaza a Explorar con su misma ruta. Búsqueda al teclear con la sintaxis de antes, chips con su conteo, tabla con panel desde 64rem y lista con hojas en el teléfono, de 60 en 60, y atajos de teclado. Reiniciar es un evento nuevo que solo se agrega
- Revisión independiente con sus hallazgos corregidos. La tabla de nombres de temas espera la revisión de un médico en docs/revisiones/b4-nombres-de-temas.md
- Capturas en docs/screenshots/v3/b4

### B5. Revisión del examen y motivos de error (D-124)
- Hecho. Crear tarjeta en cada pregunta de la revisión del examen y de la retroalimentación de la práctica, con el texto del banco y sin IA por omisión. En un precargado la tarjeta va a la capa Mis tarjetas del alumno (4.16) y no se duplica
- Siete motivos de error de un toque en las falladas, con tabla de equivalencias para los eventos viejos, que no se editan (4.23). Alimentan Progreso con el reparto por rama, Conócete, el tutor y los consejos por trampa
- Revisión independiente con sus hallazgos corregidos
- Evidencia de B4 y B5. Typecheck, lint y formato limpios y 2,977 pruebas unitarias que pasan; la única que falló con la máquina cargada fue la de rendimiento de ordenar en Buscar tarjetas, que pasa sola. E2e de ai-cards, deck-topics, exam-review, explore, import-export, review-tools y review en teléfono y computadora, 30 de 30
- Capturas en docs/screenshots/v3/b5

### B6. Apuntes y mazos (D-125)
- Hecho. Una línea se vuelve tarjeta con un botón, con menú de tipos y sin escribir marcas. Cada apunte elige su mazo y su tema del ENARM o una materia libre que no cuenta en las estadísticas. Modo clase con plantillas, búsqueda sin acentos y esquema de tres niveles. IA en los planes de pago con propuestas ancladas a su línea, en borrador y con descarte una por una. Candado en Gratis con vista previa
- Revisión independiente con sus 4 hallazgos corregidos. La unión con B4 y B5 resolvió 6 choques y 4 que git no marcó (tutor sin recalcular, motivos de materia libre en Progreso, colores del cierre de B2 y un renglón que se desbordaba en el teléfono)
- Evidencia. Typecheck, lint y formato limpios. Vitest completo con 3,062 pruebas que pasan. E2e de outlines-b6, outlines, ai-cards, deck-topics y explore 26 de 26 en teléfono y computadora, más exam-review, calibrating, navigation, offline y theme-dark 28 de 28
- Capturas en docs/screenshots/v3/b6

### B7. Party real y lo que se queda o se va (D-126)
- Hecho. Party en la nube con grupos por enlace o código, tabla de la semana, retos de 7 días y duelos reales de un solo intento. Modo enfoque, resumen semanal para compartir, Invita y gana un mes con el primer cobro y su reversión, y producción sin demo con la bandera demoTools
- Revisión independiente con sus 9 hallazgos corregidos. La unión con B4, B5 y B6 resolvió 10 choques y 6 que git no marcó, entre ellos una carrera de la pantalla de la pregunta que podía trabar un duelo
- Migraciones 20261018000001_party_cloud y 20261019000001_referral_first_charge aplicadas al proyecto el 2026-10-14 y comprobadas función por función. Falta que Ricardo pegue supabase/manual/party-dueno-al-borrar-cuenta.sql (en su lista de pendientes)
- El aviso de privacidad pasa a la versión 2026-10-14 porque cambió el texto de Party
- Evidencia. Typecheck, lint y formato limpios. Vitest con 3,200 pruebas que pasan. Pruebas SQL en 15 archivos con 608 comprobaciones. E2e de Party, etiquetas, Inicio y Configuración en teléfono y computadora, 27 pasan y 1 se salta por ser solo de computadora. Las 6 de la nube, 26 de 26. Suite completa con 142 en teléfono y 142 en computadora, más una de primera visita sin conexión que se pasó del tiempo con la máquina cargada y pasa sola
- Capturas en docs/screenshots/v3/b7

### B8. Plan Gratis (D-127)
- Hecho. En Gratis se cierran con vista previa Party, Subir tus mazos, seguir mazos nuevos del catálogo y Apuntes, y siguen abiertas las 20 preguntas al día con su explicación, los referidos, Comparte tu semana, exportar y borrar los datos propios y repasar lo que ya está en el dispositivo. El servidor aplica los mismos candados con la regla de user_plan
- Revisión independiente con sus 13 hallazgos corregidos, entre ellos uno alto (los apuntes escritos en Gratis ya no se pierden en la nube). La unión con B4 a B7 resolvió 9 choques y 5 que git no marcó
- Evidencia. Typecheck, lint y formato limpios. Vitest con 3,234 pruebas que pasan. Pruebas SQL en 17 archivos. E2e del plan Gratis y de lo que contrata plan antes de Party, subir mazos o seguir mazos, 30 de 30 en teléfono y 30 de 30 en computadora tras corregir la del selector de retroalimentación. La nube completa, 16 de 16 en cada proyecto. Más exam-review, pomodoro, review-tools, offline, decks y home
- Desde B8 el ayudante followSmallestDeck de las e2e deja la cuenta en plan de pago. Una prueba que espere algo de Gratis lo fija ella misma
- Capturas en docs/screenshots/v3/b8

### B9. Cuentas y acceso (D-129)
- Hecho. Registro solo por invitación con el gancho Before User Created, Continuar con Google tras la bandera googleSignIn, Completa tu registro para quien entra sin pasar por Crear cuenta, segundo factor TOTP para médicos, admins y dueño tras la bandera requireMfa, que el dueño restablece en Usuarios, Cómo nos conociste opcional con código de influencer, casilla de 18 años o más y datos opcionales que ganan por fecha entre dispositivos (H29)
- Usuarios del admin con Invitaciones, Cómo nos conocieron, Liberar dispositivo y Restablecer segundo factor, en tabla en computadora y en lista en el teléfono (H15)
- El aviso de privacidad pasa a la versión 2026-10-14b con lo que guarda B9 (entrar con Google, Cómo nos conociste y la fecha de la confirmación de edad). Sigue en borrador para B16
- Revisión independiente con sus hallazgos corregidos. La unión con B3 a B8 resolvió 9 choques y 3 que git no marcó (el canje del referido espera a que la cuenta complete su registro, el puente revisa la sesión cerrada en las esperas nuevas y el orden de las migraciones)
- La e2e encontró y corrigió tres fallas reales. Una cuenta que volvía de Google podía nacer sin lo que llenó en Crear cuenta si corrían dos revisiones a la vez, el puente borraba la marca de la salida a Google si el alumno la pulsaba antes de que cargara, y la pantalla del código empezaba con una línea suelta
- Evidencia. Typecheck, lint y formato limpios. SQL en 18 archivos. E2e completa en teléfono y computadora 291 de 291 (1 saltada que solo es de computadora), nube 50 de 50 y audit:ui 20 de 20 más nube caída 2 de 2
- Capturas en docs/screenshots/v3/b9 (41)
- Para B19. El recorrido de audit:ui anota dos detalles de accesibilidad que ya estaban en main. El enlace al aviso en Configuración, Privacidad, es chico en el teléfono, y un campo de Datos de demostración del admin no muestra el foco. También, en el riel del admin a 1280 por 800 el último ícono sale sin etiqueta y las pantallas del segundo factor se ven dentro del marco completo de la app

### B10. Pagos completos (D-130)
- Hecho. Prueba gratis de 7 días, pases con OXXO y SPEI, Fundador anual, cambio de plan en el portal, Mercado Pago tras su bandera, códigos de descuento, facturas a pedido y la pantalla Admin, Pagos. Correos de pagos en la cola para B15
- Revisión independiente con 12 hallazgos corregidos, entre ellos uno alto (lugares Fundador y prueba repetida al borrar la cuenta). Al borrar la cuenta ya no queda nada de la prueba ni del lugar Fundador que se ligue a la persona por Stripe
- Evidencia. Typecheck, lint y formato limpios. Vitest con 3,564 pruebas. SQL en 21 archivos. E2e de nube 68 de 68 en teléfono y computadora, e2e normal en verde (rendimiento y sin conexión pasan solas con la máquina cargada) y audit:ui 20 de 20. JS inicial de 297.0 KB de 300
- Capturas en docs/screenshots/v3/b10 (51)
- Desplegado en el proyecto real el 2026-10-15 con las llaves nuevas del entorno. Plan b10 en verde (pagos-b10.sql y el archivo de Party aplicados, 46 de 46 funciones iguales al repo, cancel-subscription v1). En Stripe de prueba los seis precios, el cupón y el código PRUEBA10, los dos portales, los ocho IDs en los secretos y el webhook nuevo de doce eventos con su secreto. Las tres suscripciones de prueba de Ricardo quedaron canceladas y reembolsadas, y sus avisos llegaron firmados
- Pendiente. Borrar las filas de prueba de la base (falta la autorización directa de Ricardo), los escenarios con su navegador y su teléfono, las banderas freeTrial y cashPasses, los medios de pago y la cuenta de Mercado Pago

### Herramientas (D-131)
- npm run deploy:supabase aplica el SQL, también las piezas con drop o delete, publica las funciones y pone los secretos desde el repo con el token de Supabase. Con el token, lo que falta de B10 son dos comandos (docs/DESPLIEGUE.md) y ya no pegas archivos en el SQL Editor
- PW_PORT_OFFSET deja correr Playwright en varias copias del repositorio a la vez. Se probó con dos corridas simultáneas, 80 de 80 cada una
- Revisión independiente con 13 hallazgos, ninguno alto, todos corregidos con su prueba
- Evidencia. Typecheck, lint y formato limpios. Vitest de scripts, servidor y la configuración de Stripe con 260 de 260. La herramienta se probó contra una API simulada y, el 2026-10-15, contra el proyecto real con el plan b10, todo en verde. setup-test de Stripe corre ahora con la llave que pone el proxy del entorno y se detiene si Stripe no responde en modo prueba

### B11. Banco en la nube y Google Sheets (D-133)
- Hecho. Banco en la nube con versiones y catálogo, tope de Gratis y freno de descargas en el servidor, sincronización con tu Sheet en una Edge Function, flujo editorial con revisión a ciegas, acuerdo y reporte de pagos por pregunta revisada, catálogo de mazos en Storage con la autorización del dueño, y la app del alumno con la fuente de la nube y estudio sin conexión con lo ya bajado
- Revisión independiente con 15 hallazgos, todos corregidos. El alto era que un admin podía publicar un mazo de terceros sin tu confirmación cambiando la licencia
- Decisiones tomadas con el plan. Una Tarea que no se detecta entra como pendiente para aprobar y no se rechaza (D-080), y el pago es por pregunta revisada (respuesta 58)
- Todo queda apagado hasta tus pasos de B11 en docs/PENDIENTES_DE_RICARDO.md. Con el token de Supabase, subirlo es npm run deploy:supabase -- --plan b11
- Capturas en docs/screenshots/v3/b11 (48)

### B16. Legal y privacidad (D-132)
- Hecho. Aviso de privacidad en la versión 2026-10-15b y términos en la 2026-10-15, como borrador para el abogado, con los encargados nuevos, la prueba gratis, los pases, el Fundador, la factura, los referidos y la comparación con otros alumnos. La lista de cambios con 18 preguntas para el abogado y 5 para ti está en docs/legal/CAMBIOS-B16.md
- El alumno nunca ve una marca de pendiente. Donde falta un dato lee un texto neutro. El abogado sí ve qué falta en docs/legal
- Los textos completos cargan solo con la página legal, para seguir debajo de 300 KB de JavaScript inicial
- Entra con lo de Gemini para B17, la imagen para compartir con dirección completa y tres capturas de instalación. Las capturas muestran la app antes de la paleta y se rehacen en B17
- Unión con main (afc5fc7), que trajo el primer borrador legal de Gemini con la versión 2026-10-15 del aviso. En legal.ts, legalDocs.ts, docs/legal, fillLegal y sus pruebas ganó este texto. De Gemini quedan las imágenes de marca, la imagen para compartir con SITE_URL y el workflow de Pages. El aviso pasa a la versión 2026-10-15b, para que quien aceptó el borrador de Gemini acepte este. Los términos siguen en 2026-10-15
- Revisión independiente con 13 hallazgos, 12 corregidos. Los dos altos eran que el archivo de Acceder no trae todos los datos, como decía el aviso, y que el correo de la invitación se quedaba al eliminar la cuenta. Ahora se borra
- Evidencia. Typecheck, lint y formato limpios. Con B11 ya en main, Vitest con 3,980 pruebas (3 de tiempo fallaron con la máquina a carga 9 y pasan solas) y JavaScript inicial en 289.4 KB de 300. SQL completo en verde, con la prueba nueva de la invitación. E2e antes de unir con B11, en teléfono, computadora y nube, 358 de 362. Las 3 que fallaron (sin conexión en la primera visita y rendimiento) fallan igual en la rama sin B16 con la máquina cargada por otros agentes, y esa rama pasó en el CI de GitHub. Después de unir, legal, privacidad, smoke, exportar datos, borrar cuenta y acceso en las cuatro configuraciones, y el CI completo de la PR
- Capturas en docs/screenshots/v3/b16 (16). Del aviso y de los términos va solo lo que se ve al abrir, porque el texto completo está en docs/legal
- Se fusiona después de B11, que ya está en main (PR 55), porque el aviso da por hechas las lecturas del banco en el servidor

### B12. IA real (D-134)
- Hecho. El proxy de IA pasó a las Edge Functions ai-proxy y ai-batch, con el mismo núcleo que el servidor de desarrollo. Los cinco motores están prendidos en el servidor y cerrados a los alumnos por la compuerta 1. Hipótesis por lotes a mitad de costo, tope en dólares por alumno con reserva del peor costo, bitácora sin texto, reporte de costos de la nube, pantalla Auditoría de la IA para los dos médicos y npm run eval-ai con matriz de modelos, juez y comparación con OpenAI
- Revisión independiente con 14 hallazgos (1 alto, 3 medios y 10 bajos), todos corregidos con su prueba. El alto era que las llamadas en paralelo se saltaban el tope en dólares por alumno. Ninguno tocaba secretos, permisos ni privacidad
- Evidencia. Typecheck de las cuatro configuraciones, lint y formato limpios. Vitest con 4,513 pruebas. SQL en 29 suites, con dos pruebas de varias conexiones. eval-ai simulado con 135 casos y sus cuatro metas cumplidas. E2e de IA, tutor, tarjetas, médico, menú y admin en teléfono, computadora y nube con 62 de 62 sobre la rama unida. JS inicial de 289.9 KB de 300
- Capturas en docs/screenshots/v3/b12 (36)
- No se corrió ninguna evaluación real ni se llamó a Anthropic. La corrida real y la elección de modelos esperan la clave de evaluaciones y tu aprobación del gasto. Nada de B12 se ha desplegado todavía. Los pasos tuyos están en docs/PENDIENTES_DE_RICARDO.md

### B13. Inglés médico (D-135)
- Hecho. Casos de lectura en inglés con su fuente y licencia a la vista, práctica aparte en Simular, parte en inglés del examen completo (30 de 280 y la misma proporción en los cortos), estados calibrando, convertidor y migración del Sheet con las columnas de fuente, editor del médico con la tarjeta Fuente del texto, contador de inglés en el Banco del admin, mazo de vocabulario con su fuente y scripts para armar el vocabulario de MedlinePlus y preparar textos con licencia. Sin contenido médico hecho por IA
- Revisión independiente con 13 hallazgos (1 alto, 5 medios y 7 bajos), todos corregidos con su prueba. El alto era que las tarjetas automáticas de Mis errores copiaban el texto completo de un caso de inglés sin su fuente
- Evidencia. Typecheck de las cuatro configuraciones, lint y formato limpios. Vitest con 5,062 pruebas. SQL en 30 suites, con la fuente del texto igual en TypeScript y en SQL sobre 89,035 referencias. Plan de despliegue b13 y orden b11, b12 y b13 probados contra la API falsa. E2e de inglés, banco, examen, Progreso, Repasar, mazos y médico en teléfono, computadora y nube (30 y 40 pasaron después de las correcciones, y 126 antes de ellas). JS inicial de 290.2 KB de 300
- Capturas en docs/screenshots/v3/b13 (86), tomadas antes de las correcciones de la revisión, que solo cambiaron textos de los estados sin casos
- Todo es contenido simulado con la marca [Prueba]. Faltan los casos de lectura, que escriben los médicos, y el mazo de vocabulario, que espera la red abierta a MedlinePlus. La bandera medicalEnglish queda apagada en producción. Los pasos tuyos están en docs/PENDIENTES_DE_RICARDO.md

### B14. Datos y modelo del alumno (D-136)
- Hecho. Calibración nocturna en GitHub Actions con los motores puros de la app (Rasch con enlace de escala, Elo de apoyo, distractores, variantes, validación de la fatiga, acuerdo de etiquetado y comparación), tres migraciones (20261028000001 a 20261028000003) con sus lecturas, workflow calibration.yml y autotest de 25 metas en cada push. Sincronización entre dispositivos de ajustes, permisos y Mis errores desde la bitácora. Catálogo calibrado con dificultad efectiva. Modo adaptativo en Simular. Un solo modelo del alumno (src/engines/studentModel.ts) que leen Progreso, Inicio, Simular y el Tutor. Tarjeta Cómo vas frente a otros, pantalla Calibración del admin, ajustes del modelo en Plataforma, historial de Acuerdo y marcas de la noche en Reportes. FSRS de fábrica vigilado por prueba. Nombre nuevo del permiso, Mejora con tus datos sin nombre
- Revisión independiente con 17 hallazgos (ninguno alto, 4 medios o medio-bajos y 13 bajos). 13 corregidos o aceptados por escrito con su prueba, 3 sin construir con el camino trazado y 1 que es tu decisión (el permiso dado con la pista corta)
- Evidencia. Typecheck de las cuatro configuraciones, lint y formato limpios. Vitest con 5,722 pruebas en 534 archivos. SQL en 32 suites más la prueba de concurrencia. Autotest de la calibración 25 de 25 metas (Rasch 0.981, Rasch con datos ralos 1.013 y Elo 0.962 contra la verdad). Plan de despliegue b14, y b11 lleva sus tres migraciones. Orden b11, b12, b13 y b14 probado contra la API falsa. E2e de modelo, comparación, calibración del admin, adaptativo y dos dispositivos en teléfono, computadora y nube (374 de 378 en la corrida amplia, la falla era de tiempo y pasa sola). JS inicial de 294.2 KB de 300
- Capturas en docs/screenshots/v3/b14 (84)
- Nada de B14 se ha desplegado ni corrido contra el Supabase real. La calibración queda apagada (enabled en false) y en solo reporte. Los pasos tuyos están en docs/PENDIENTES_DE_RICARDO.md, sobre todo el secreto SUPABASE_CALIBRATION_KEY de GitHub y la decisión del permiso antes de prender la calibración
- Arreglo de paso. Tres pruebas de Simular fallaban en main desde el 21 de octubre porque un doble de prueba (wireQuota) traía el día y su fin escritos a mano. Ahora salen del reloj

### B15. Analítica, errores, recordatorios y recorrido (D-137)
- Hecho. Permiso Medición de uso y analítica propia con PostHog (sin permiso no sale nada), errores con Sentry en el navegador y en las funciones (limpios de datos personales), correos con Resend y un interruptor general, recordatorio diario de repaso con baja de un clic y su página pública, ajustes del repaso con la hora y los días, y recorrido guiado de ocho pasos con Saltar introducción. Borrar mis datos y Exportar mis datos cubren lo nuevo. Plan de despliegue b15 (cuatro migraciones, trece funciones). Todo apagado hasta que pongas las llaves
- Revisión independiente con 10 hallazgos (ninguno alto), todos atendidos con su prueba. Los medios eran de privacidad (el permiso de una cuenta aplicado a la siguiente en un cambio directo, la limpieza de correos con acentos y una prueba de SQL que no habría detectado un filtro faltante)
- Evidencia. Typecheck de las cuatro configuraciones, lint y formato limpios, npm audit sin vulnerabilidades altas. Vitest completo, SQL en 35 bloques, autotest de la calibración 25 de 25. Playwright con más de 270 pruebas relacionadas en teléfono, computadora y nube, y 80 de 80 y 129 de 129 después de las correcciones. JS inicial de 290.4 KB sin nube y 291.7 KB con nube, de 300
- Capturas en docs/screenshots/v3/b15 (114)
- Nada de B15 se ha desplegado ni probado contra PostHog, Sentry o Resend reales. Los pasos tuyos (cuentas, llaves y DNS) están en docs/PENDIENTES_DE_RICARDO.md, B15.1 a B15.17

### B17. Publicación (D-138)
- Hecho y apagado. Despliegue a Cloudflare Pages desde GitHub Actions con carga directa (sin la variable CLOUDFLARE_DEPLOY termina en verde), cabeceras reales con la política de seguridad, robots, sitemap y security.txt, prueba de humo sin llaves, aviso de 14 días y sitio de mudanza para la demo de GitHub Pages, orígenes por secreto, llaves nuevas de Supabase con respaldo a las viejas, plan de despliegue b17 (13 funciones, 2 secretos), Apple Pay y Google Pay en Suscripción detrás de una bandera apagada, y portada lista para los textos de la agencia con reglas automáticas. Aviso de privacidad 2026-10-22 en borrador
- Revisión independiente con 11 hallazgos (ninguno alto), todos atendidos con su prueba
- Evidencia. Typecheck de las cuatro configuraciones, lint y formato limpios, npm audit sin vulnerabilidades altas. Vitest con 7,061 pruebas, prueba de humo 9 de 9, 58 mutaciones de la revisión con 51 atrapadas (las que no, eran equivalentes o ya tienen prueba). Playwright de portada, mudanza, billeteras, pagos, privacidad y recorrido en teléfono, computadora y nube. JS inicial de 291.4 KB sin nube y 291.8 KB en producción. Capturas en docs/screenshots/v3/b17 (60)
- Nada se ha desplegado ni probado con cuentas reales (Cloudflare, dominio, Resend, Supabase de pago, Stripe real, Apple y Google). Los pasos tuyos, B17.1 a B17.22, están en docs/PENDIENTES_DE_RICARDO.md. Por confirmar con cuentas reales, que wrangler suba la carpeta .well-known y que el proyecto se cree sin redirección a Workers, la política con el Stripe.js real y checkout.session.completed con ui_mode elements, la hoja de Apple Pay con prueba gratis (total de hoy en 0), que Auth admin acepte la llave secreta nueva solo en apikey y los menús de Email Routing

### B18. Primeros alumnos (D-139)
- Hecho y apagado. Encuesta de los primeros días dentro de la app (siete preguntas cerradas y un comentario opcional a los 7 días, con franja Contestar, Ahora no y No quiero contestarla, pantalla 41 en /encuesta, borrador en el dispositivo), tabla privada survey_responses que solo se agrega, cuatro funciones del alumno y dos del equipo sin correo, nombre, cuenta ni fecha, tarjeta Encuesta de los primeros días en Usuarios con interruptor, conteos, lista y CSV, botón Copiar mensaje de invitación, tres eventos de analítica solo con permiso, la encuesta dentro de Exportar mis datos, Borrar mi respuesta en Configuración, Privacidad, aviso de privacidad 2026-10-22b y el plan de despliegue b18 (dos migraciones). La guía para ti está en docs/PRIMEROS_ALUMNOS.md
- Revisión independiente con 10 hallazgos (ninguno alto, 3 medios y 7 bajos), todos atendidos con su prueba. El principal era que los días de la cuenta ligaban cada respuesta con quien se dio de alta ese día en Usuarios, así que el equipo ya no los ve
- Evidencia. Typecheck de las cuatro configuraciones, lint y formato limpios, npm audit sin vulnerabilidades altas. Vitest con 7,314 pruebas, SQL en 36 bloques con la encuesta de S0 a S7 y 48 casos de comentarios en SQL y en Vitest, 60 de 60 pruebas e2e de nube de la encuesta con axe en claro y oscuro y a 320 px, 26 mutaciones en total y todas atrapadas. JS inicial de 292.0 KB, de 300. Capturas en docs/screenshots/v3/b18 (48)
- Nada de B18 se ha aplicado a Supabase ni probado con personas reales. Tus pasos, B18.1 a B18.12 (aplicar el plan b18, probar con 0 días en una cuenta tuya, prender la encuesta justo antes de invitar, invitar a los 5 y mandar el aviso al abogado), están en docs/PENDIENTES_DE_RICARDO.md
- Regla que importa. Que la sesión no lea los comentarios es una regla de conducta y no un control técnico (D-139). A la sesión solo le pasas los conteos de la tarjeta y tu lista de hallazgos, nunca sus comentarios
- Resumen de grupo que se llena al terminar la prueba, sin nombres, correos, comentarios ni códigos. Invitados 5, con cuenta N, dieron Medición de uso N, contestaron N. Repasar y Simular según la encuesta y según la analítica. Medianas de claridad, facilidad y utilidad con 3 o más respuestas. Lo que frenó por conteo. Recomendarían sí N, tal vez N, no N. Hallazgos numerados que escribes tú, cada uno con su decisión (antes de abrir, después o descartar)

### Estado de las ramas en paralelo (2026-10-15, 05:40 UTC)
- Cada bloque se construye en un worktree fuera del repo (/home/user/wt) y se une a la rama de trabajo ccr-60b5d3a7-f40uky al cerrar, con un PR a main por bloque
- B3 a B6 fusionados en main (PR 42, 43 y 44)
- B7 fusionado en main (PR 48), con sus migraciones aplicadas al proyecto
- B8 fusionado en main (PR 49), con sus dos migraciones aplicadas al proyecto y verificadas por huella antes de fusionar
- La paleta con más color (PR 47 de otra herramienta, D-128) fusionada en main (PR 51), con los hallazgos de su revisión corregidos. El PR 50 de otra sesión se rehízo sin la paleta y se fusionó el 2026-10-15 por decisión de Ricardo, con las imágenes de marca de Gemini (B17) y sus borradores legales (B16), que B16 deja por debajo de su versión. Los PR 45 y 46 se cerraron y su contenido entró en B16 y B17
- B9 fusionado en main (PR 52). Su migración 20261020000001 se aplicó al proyecto y se verificó por huella antes de fusionar. La función admin-reset-mfa se publica con B10, porque ahí deja de depender del módulo grande de pagos, y nadie la usa hasta que prendas el segundo factor
- B10 fusionado en main (PR 53). Sus tres migraciones y cinco funciones se aplicaron al proyecto antes de fusionar y se verificaron por huella. Lo que falta subir espera el token de Supabase
- B16 unido con lo de Gemini para B17 y con B11 ya en main. Su PR sigue al de B11
- B11, B16 y la herramienta de despliegue ya están en main. B12 (IA real) ya está en main, B13 (inglés médico) también, y B14 (modelo del alumno) y B15 (analítica y recorrido) también y B17 (publicación) está en su PR. Siguen B18 y B19. Los despliegues de B11 a B15 y B17 a Supabase esperan la autorización escrita de Ricardo
- Los diseños de B10 a B15, B17 y B18 están en /home/user/wt/plans
- Los subagentes se detuvieron varias veces por el límite de uso de la cuenta y se reanudaron con su contexto

### Preguntas para Ricardo
- B4. Los temas de los mazos de Paco salen de la ruta de sus etiquetas (rama, materia y tema), porque las claves branch y topic de las notas solo llegan a la subespecialidad y no dan tu ejemplo de Reumatología con Artritis reumatoide. Se muestran tres niveles y no el cuarto ni el quinto (por ejemplo Diarrea, Agentes, Salmonella). Si quieres más niveles es un cambio chico
- B4. La tabla de nombres legibles de los mazos de Paco necesita la revisión de un médico. La lista completa, con las elecciones que piden ojo, está en docs/revisiones/b4-nombres-de-temas.md
- B5. Los eventos viejos con Otra razón quedan sin motivo, porque no dicen cuál de los siete aplica. Si prefieres que cuenten como Conocimiento es una línea. Las preguntas que quedaron en blanco en el examen no piden motivo por ahora (lo típico ahí sería Tiempo)
- B7. Decidí que si el referido recibe el reembolso completo de su primer cobro, quien lo invitó pierde el mes desde ese momento, porque un cobro devuelto no es un pago verificado. También se rechazan los referidos en círculo (dos alumnos que se invitan entre sí). Si prefieres esperar a que pase la garantía de 7 días antes de dar el mes, es un cambio chico
- B7. El resumen semanal cubre la semana en curso desde el lunes, como la tabla de Party, así que el lunes muestra un solo día. La otra opción son los últimos 7 días
- B2. Quedaron con color las fases del Pomodoro (enfoque en el color de acción y descanso en un tono de rama) y el contador de Nuevas en Repasar. Si los quieres neutros, solo cambian sus clases
- El PR 34 (rama claude/serene-lovelace-ckuetk, de otra sesión tuya del mismo 2026-10-12, antes de que se escribiera el plan) cambia Inicio. Carga de repaso de los próximos 7 días en lugar de la gráfica por mes, título Tu calendario y 0.8 cm de separación en lugar de los 1.25rem de D-117. No está en el plan y usa el número D-118, que el plan ya le dio al plan pagado único. Su CI está en verde. B2 arrancó sin él, porque el rediseño toca los mismos archivos de Inicio y fusionarlo sin tu respuesta habría mezclado dos criterios de separación. Sigue abierto. Si lo quieres, dilo y lo adapto a los tokens nuevos con el número de decisión que siga; si no, lo cierro
- El repo ya está conectado a Cloudflare Pages (proyecto enarm-prototipo) y publica una vista previa por PR. B17 lo aprovecha. Falta saber el dominio
- B8. ¿Dejamos abierto en Gratis un mazo de muestra del catálogo? ¿Comparte tu semana sigue abierta en Gratis (hoy sí)? ¿Ocultamos de la tabla de Party a quien baja a Gratis (hoy lo siguen viendo hasta que salga)? ¿Médicos y admins sin plan entran a Party (hoy no, el rol no cuenta)? ¿Apuntes en Gratis deja ver y borrar los apuntes viejos (hoy se guardan y sus tarjetas siguen en Repasar)?
- Paleta. En oscuro hay tres pares de ramas de tono parecido (Ginecología y Medicina familiar, Cirugía y Urgencias, Medicina interna y Pediatría). El nombre siempre va al lado, pero si quieres los separamos más. Se ven en docs/screenshots/v3/paleta
- B9. La lista de especialidades de Tus datos no se revisó contra una fuente oficial. Una lista pública trae 27, sin Urología y con Medicina de la Actividad Física y Deportiva en lugar de Medicina Deportiva. ¿La revisas tú o tomamos esa?
- B4 y B5. Revisé la versión que se revirtió. Todo lo que pide el plan ya estaba en la que se quedó y se rescataron tres detalles chicos (el aviso de tarjeta ya creada en la revisión del examen, el atajo X que dice seleccionar y dos pruebas que fallaban en Windows). Quedan a tu gusto, y cada uno es un cambio chico. Un número junto a cada tema de los mazos. Un total global de motivos de error en Progreso, además del reparto por rama. Una marca propia del alumno como la bandera de Anki, porque hoy Marcadas son las tarjetas con señal de la IA. Elegir temas dentro de cada mazo en Repasar (hoy se eligen mazo y subespecialidad). Pasar al documento de revisión médica las 22 diferencias de nombres de temas de la otra versión como alternativas
- B12. Decisiones con la opción recomendada ya tomada, que esperan tu visto bueno. Tope de 0.30 dólares por alumno al día (10.6), mínimos de textos para abrir un motor en la compuerta, 60 en hipótesis y tarjetas, 40 en consejos y 30 en informes y reestructuradas (cámbialos antes de ver resultados), compuerta atada al modelo y al prompt con una auditoría corta de 60 textos por cambio (10.12), dos espacios de trabajo en Anthropic, producción y evaluaciones (10.21), qué hacer si ningún modelo pasa en tarjetas (10.23), el pago de la auditoría a los médicos (10.24) y permitir api.openai.com en la red de la sesión (10.25)
- B13. Decisiones con la opción recomendada ya tomada, que esperan tu visto bueno. La pregunta y las opciones de la parte en inglés van en inglés y las explicaciones en español (8.2, confírmalo con la convocatoria vigente), 90 segundos por reactivo de inglés (8.3), el inglés mezclado por casos y no al final (8.4), las licencias aceptadas con tu abogado (8.8), si agregamos Falso cognado a tu lista de sesgos (8.9), el vocabulario en el catálogo de pago con vista previa en Gratis y no completo (8.16), la meta propia de 30 reactivos de inglés (8.17) y dar prioridad a resúmenes CC BY de PubMed Central (8.19)
- B14. Decisiones con la opción recomendada ya tomada, que esperan tu visto bueno. El nombre del permiso, Mejora con tus datos sin nombre, porque los datos son seudónimos y no anónimos (10.6, con tu abogado), pedir de nuevo el permiso a quien lo dio con el texto corto (10.5, con tu abogado), que quien no da el permiso también vea su percentil calculado en su navegador (10.7, con tu abogado), comparación y modo adaptativo abiertos también en Gratis (10.10 y 10.15), un examen en curso no pasa a otro dispositivo (10.18), los textos de la IA no se sincronizan entre dispositivos (10.19), la hora de la corrida a las 4 con 23 de la mañana en Mérida (10.24), no encolar de noche las reestructuradas de B12 (10.30), un correo al día de distractores por médico (10.31), el autotest de la calibración como trabajo requerido de fusión (cuesta 3 o 4 minutos por push) y la llave dedicada como secreto del repositorio y no de un environment (10.2)
- B14. Hoy un permiso de mejora dado con la pista corta cuenta igual que uno dado con el texto nuevo, porque no se subió la versión del aviso. La opción recomendada es pedir que se confirme otra vez y subir entonces PRIVACY_NOTICE_VERSION y minNoticeVersion. Prender la calibración espera tu respuesta y la de tu abogado
- B14. Hallazgo sin resolver. Progreso y el Tutor en un dispositivo nuevo con el banco en la nube dicen Exactitud sin dato hasta que se abren las preguntas, porque necesitan el cuerpo de cada una. Se propone que useAnsweredBank use la fila del catálogo (rama, tema y dificultad) como respaldo. Bajar los cuerpos en bloque gastaría el tope diario de Gratis. Queda sin hacer
- B14. Volver a entrar con el enlace del correo en un navegador que ya tenía sesión deja un segundo en que se ve el perfil de antes. Conviene que alguien revise src/app/cloud.tsx y device.ts antes de abrir a alumnos reales
- B15. Decisiones con la opción recomendada ya tomada, que esperan tu visto bueno. Resend empieza en el plan gratis (3,000 correos al mes, alcanza para unos 80 alumnos con recordatorio diario) y pasa a Pro (20 dólares al mes) antes de abrir el registro. Una sola versión del aviso de privacidad para B15 y B16, la 2026-10-21, que hace aceptarlo otra vez a quien ya lo aceptó (con tu abogado). Que los reportes de fallas sin el permiso de mejora sigan sin salir (mandarlos limpios sería un interés legítimo que decide el abogado). Que el aviso diga la ventana de quien retira Medición de uso sin conexión y no vuelve a abrir la app (recomendado que no, el efecto son solo eventos de dinero seudónimos). Que el recorrido no lo vean admin ni dueño. El texto de la bienvenida dice siete paradas y el contador Paso 1 de 8 (recomendado dejarlo)
- B15. Antes de prender cada cosa. Confirmar en sentry.io la retención de los reportes (el aviso dice 30 días), mandar un evento de prueba a PostHog con la cuenta real para confirmar que descarta la IP y acepta el envío por lotes, y poner SENTRY_AUTH_TOKEN, SENTRY_ORG y SENTRY_PROJECT en GitHub solo cuando exista el build de producción en Cloudflare (B17)
- B17. Decisiones con la opción recomendada ya tomada, que esperan tu visto bueno. Dos frases de la portada cambiadas por no tener respaldo, FSRS ya no es el algoritmo más preciso sino un algoritmo moderno de repaso espaciado, y el contenido médico generado por IA queda como borrador marcado hasta que un médico lo aprueba (con tu abogado). El título de esa tarjeta, Contenido con médicos detrás, sugiere más que su texto y conviene cambiarlo cuando llegue el texto de la agencia. Dominio sin www y proyecto nuevo studiare en Cloudflare Pages y no en Workers. Billeteras construidas y apagadas, y sin campo de código de descuento. Llaves nuevas de Supabase dentro de B17. Buzones de privacidad y soporte con reenvío de Cloudflare a tu Gmail al principio. Aviso de privacidad con Cloudflare, GitHub y Stripe.js como encargados (seis preguntas para el abogado en docs/legal/CAMBIOS-B17.md). Aviso de 14 días y sitio de mudanza por 30 días. Dejar /privacidad y /terminos fuera del sitemap. Las capturas de instalación con Versión de demostración quedan fuera de producción. La opción de Resend gratis al principio y Pro antes de abrir el registro
- B17. Supabase de pago antes de invitar a los 5 aspirantes es un gasto (11.16), lo decides tú. La consulta de solo lectura de cuántos alumnos hay antes de mudar el dominio toca producción, así que espera tu frase
- B17. La frase Gratis para empezar. Sin tarjeta. de la portada hay que revisarla cuando se prenda la prueba gratis, que sí pide tarjeta
- B18. Decisiones con la opción recomendada ya tomada, que esperan tu visto bueno. La encuesta no es anónima, es con un código, y los comentarios los lees solo tú (8.5, con tu abogado). Borrar mis datos no borra la respuesta de la encuesta y Eliminar mi cuenta sí (8.4, con tu abogado). Cerrar sesión borra la elección de No quiero contestarla y Ahora no en ese navegador, así que la franja puede volver a salir una vez más, y la alternativa es dejarla hasta Borrar mis datos o Eliminar mi cuenta, un cambio de una línea. Los 7 días de espera se prueban antes con 0 días en una cuenta tuya
- B18. El aviso de privacidad sube a la versión 2026-10-22b y hace aceptarlo otra vez a quien ya aceptó el de B17, con la pregunta para el abogado de quién tiene acceso de administración a la base y podría leer los comentarios (docs/legal/CAMBIOS-B18.md)
- B18. Supabase de pago con copias antes de invitar a los 5 es un gasto, lo decides tú. Con el correo de fábrica de Supabase los códigos de acceso no llegan a los aspirantes, así que primero deben estar Resend como SMTP o Entrar con Google (B17). Si solo 2 de los 5 dan el permiso de analítica no se insiste, y el resumen lo dice

## Fase L. Primer pago real en modo prueba y un solo plan pagado (D-118)

Sesión del 2026-10-11. Este bloque quedó a medias porque se acababa el límite semanal de Ricardo. Lo de abajo dice qué está hecho y qué sigue.

### Hecho
- Diagnóstico con los registros de Supabase. STRIPE_PRICE_ANNUAL y STRIPE_PRICE_FOUNDER tenían el ID del producto (prod_) y no el del precio. Ricardo los cambió y create-checkout abrió el pago
- El webhook rechazaba los avisos por firma inválida. Ricardo volvió a copiar el secreto de firma del endpoint y reenvió los eventos. Desde las 19.03 UTC responde 200 y el pago quedó en la base (pago, suscripción y cliente de Stripe ligados)
- En la prueba, la misma cuenta pagó el Anual (1,499) y después el Fundador (79). Quedaron dos suscripciones en Stripe y una sola fila en la base, mezclada (plan founder con la fecha del anual)
- Corrección programada y desplegada (commit c5fc502). create-checkout responde 409 already_subscribed si ya hay un plan pagado vigente, con la regla de user_plan. La pantalla Suscripción no ofrece otro plan a quien paga. El mes por referido sí deja pagar. npm run check pasa con 2,689 pruebas
- create-checkout desplegada en el proyecto real como versión 15. El webhook y el portal no se volvieron a desplegar a propósito, porque su código no cambió desde la Fase J salvo los precios de Mercado Pago, que está oculto

### Dónde se quedó
- La versión 15 arranca. Un POST con la llave anónima respondió 401 unauthorized desde el propio código. Falta verla bloquear con una cuenta real, que Ricardo intente comprar otro plan con su cuenta de prueba antes de limpiarla y vea el aviso de plan vigente
- Falta limpiar la cuenta de prueba en Stripe. Ricardo debe cancelar las dos suscripciones de su cliente de prueba con Cancel subscription, Immediately y reembolso del último pago. Con los avisos de Stripe la base queda en Gratis sola, sin editar filas a mano. Después verificar en payment_webhook_events, payments y subscriptions
- Desde este entorno no se puede llamar a Stripe (api.stripe.com y mcp.stripe.com bloqueados por la red)

### Pendiente para antes de lanzar
- Borrar los datos de prueba de subscriptions, payments y billing_customers. El conteo del cupo Fundador cuenta toda fila con plan founder, también las canceladas, así que una prueba ocupa un lugar
- Decidir con Ricardo si un Fundador que cancela conserva su lugar
- Cambiar de plan desde el portal todavía no se refleja en la plataforma. Hoy el alumno cancela y contrata el otro plan al terminar su periodo

## Fase K. Entrar desde otro dispositivo y precios nuevos (D-114 y D-115)

Nace de que Ricardo no pudo abrir la página de pago ni en su teléfono ni en su computadora, de que confirmar el correo en un dispositivo dejaba al otro sin sesión y de su cambio de precios del 2026-10-11.

### Bloques
- [x] K1. create-checkout registra el motivo de todo pago que no abre, sin llaves. Con eso se encontró la causa del rechazo, un ID de producto en STRIPE_PRICE_FOUNDER. El servidor ahora lo detecta antes de llamar a Stripe. Versión 10 desplegada en el proyecto real
- [x] K2. Suscripción sin ningún pago, ni el simulado, cuando la nube está configurada y el navegador no está conectado. Explica qué falta y deja pedir otro correo
- [x] K3. Entrar con el código del correo (verifyOtp con tipo email) al crear cuenta, en Ya tengo cuenta y en Suscripción, con pruebas de punta a punta del puente
- [x] K4. Precios 149 y 1,499, Fundador de 79 como promoción del mensual con el regular tachado, ahorro del anual de 16% y salida al precio regular si el cupo se llenó. Migración 20261015000001 aplicada al proyecto real
- [x] K5. Mercado Pago oculto hasta que exista su cuenta
- [ ] K6. Que Ricardo cree los precios nuevos en Stripe, agregue {{ .Token }} a las plantillas y haga un pago de prueba. Si Stripe vuelve a rechazar, leo el motivo en los registros

### Cierre de 15.1
- Paso 1. npm run check pasa. test:sql pasa con la suite nueva de precios
- Paso 2. e2e corrido con la app compilada
- Paso 3. Se revisó a mano el camino real de cuenta y pago contra el proyecto de Supabase (registros de las funciones, precios en platform_settings, versión de create-checkout)
- Paso 4. Este archivo, DECISIONES.md (D-114 y D-115), docs/SUPABASE.md, docs/STRIPE.md y docs/PENDIENTES_DE_RICARDO.md al día
- Paso 5. Commit, push y PR a main

## Fase J. Proyecto real de Supabase (D-113)

Nace de que Ricardo conectó su proyecto Studiare como conector y autorizó aplicar las migraciones 2 a 10. Todo lo hecho contra el proyecto real se hizo con ese conector, sin leer ni escribir ninguna llave secreta.

### Bloques
- [x] J1. Lectura del estado real. Solo estaba la primera migración, con 23 tablas y 2 usuarios, y ninguna función
- [x] J2. Migraciones 2 a 10 aplicadas en orden y por trozos. Lo que tiene delete o drop quedó en supabase/manual/ejecutar-en-sql-editor.sql porque el conector pide una confirmación humana que una sesión en la nube no puede dar
- [x] J3. Migración 11 (function_grants) con su prueba SQL. Cierra permisos que el chequeo de seguridad de Supabase marcó. Aplicada al proyecto real
- [x] J4. Despliegue de create-checkout, create-portal-session y payment-webhook-stripe, con comprobación de que arrancan
- [x] J5. Ricardo pegó el archivo manual y la comprobación dio true en las tres columnas
- [x] J6. Secretos de Stripe puestos por Ricardo. La función de Mercado Pago espera su cuenta y la app no la ofrece mientras tanto (D-114)

### Cierre de 15.1
- Paso 1. Las 11 suites SQL pasan en Postgres local, con la última migración y el archivo manual corridos dos veces. No hubo cambios de TypeScript
- Paso 2. No aplica e2e, no cambió la app
- Paso 3. Toca permisos y dinero, así que se revisó a mano cada función contra su migración antes de subirla. Se comprobó contra el proyecto real que los permisos quedaron como en las pruebas locales y que las funciones arrancan
- Paso 4. Este archivo, DECISIONES.md (D-113), docs/SUPABASE.md y docs/PENDIENTES_DE_RICARDO.md al día
- Paso 5. Commit, push y PR a main

## Fase I. Pendientes de programación sin Ricardo (D-110)

Nace de la instrucción de Ricardo de seguir con lo que quede pendiente de programación. Se tomaron de IDEAS.md los que no dependen de sus cuentas ni de sus decisiones. El banco en la nube no se tocó porque espera su respuesta, ver docs/BANCO_EN_LA_NUBE.md.

### Bloques
- [x] I1. Practicar de nuevo lo fallado en un examen. Tarjeta en los resultados que abre una práctica con las preguntas falladas, respetando el límite diario del plan Gratis. startPracticeWithQuestions en src/features/simulator/practiceStart.ts, con pruebas unitarias y en el e2e del examen
- [x] I2. Aviso al ganar una insignia. Franja con celebración, enlace a Logros y cierre solo, que recuerda en el navegador qué niveles ya vio. La lógica de qué es nuevo es pura y vive en src/engines/rewards.ts con prueba de propiedades. El confeti ya no falla cuando el navegador no da lienzo
- [x] I3. Aviso de presupuesto de IA en la pantalla de costos del admin. Alerta si se llenó, aviso desde el 80%
- [x] I4. Prueba de punta a punta de apuntes sin el parpadeo que la hacía fallar una de cada cuatro veces, también en main

### Cierre de 15.1
- Paso 1. Typecheck, lint y 2,644 pruebas unitarias con cobertura de líneas de 86.8% pasan. Las 10 suites SQL no cambiaron. JavaScript inicial en 282.6 KB de 300, con el aviso de insignias cargado aparte
- Paso 2. e2e completo, 218 pruebas. En la última corrida completa pasaron 217 y falló la de apuntes por un parpadeo que ya existía en main, que se corrigió y pasa 14 de 14
- Paso 3. Los cambios son de cliente y no tocan permisos, dinero ni la base, así que no hubo revisión independiente
- Paso 4. Este archivo, docs/informe-de-pruebas.md, IDEAS.md y DECISIONES.md (D-110) al día
- Paso 5. Commit, push y PR a main

## Fase H. Usuarios reales, roles y auditoría funcional (D-108 y D-109)

Nace de dos peticiones de Ricardo del 2026-10-10. Preguntó cómo se define el tipo de cuenta de cada usuario, con los tres tipos que tiene en mente, y pidió una auditoría de todas las funcionalidades. La Fase G ya está en main (PR 26). Ricardo autorizó abrir y juntar los PR a main sin pedirle aprobación.

### Bloques
- [x] H1. Usuarios reales con la nube (D-108). Novena migración con admin_list_users, pantalla Usuarios que cambia sola entre la lista de la nube y la local, y cambio de rol con las reglas del servidor. Pruebas SQL (admin_users_test.sql), de cliente y de pantalla. docs/ROLES.md explica los cuatro roles y los planes
- [x] H2. Rol sin conexión y aviso de privacidad con versión (D-108). El rol no baja a alumno por perder la red, el puente reintenta con espera creciente y al volver la red, y una versión nueva del aviso se pide de nuevo y se registra la que de verdad se aceptó
- [x] H3. Auditoría por recorrido (D-109). tests/audit con el recorrido de 4 roles, 2 tamaños y 32 pantallas, los flujos con interrupciones y la prueba de nube caída. npm run audit:ui. Informe en docs/auditoria-2026-10-10
- [x] H4. Correcciones que salieron de la auditoría (D-109). Foco visible en Configuración, aviso de demostración como región con nombre, service worker que toma el control en la primera visita, práctica que se retoma al recargar y sesión que no se da por cerrada cuando el token vence sin red

### Cierre de 15.1
- Paso 1. Typecheck, lint y pruebas unitarias con cobertura pasan, 2,626 pruebas y 2 omitidas a propósito. Las 10 suites SQL pasan. Cobertura de líneas 86.7%
- Paso 2. Auditoría completa sin hallazgos, 10 recorridos y 10 flujos. e2e completo, ver docs/informe-de-pruebas.md
- Paso 3. La revisión independiente de la Fase G ya cubrió el proxy, los pagos y los errores. Los cambios de la Fase H son cliente y una migración con pruebas SQL propias
- Paso 4. Este archivo, docs/informe-de-pruebas.md, docs/real-vs-simulado.md, DECISIONES.md (D-108 y D-109) y docs/ROLES.md al día
- Paso 5. Commit, push y PR a main

### Pendiente con Ricardo
- Aplicar la novena migración de Supabase para que Usuarios muestre las cuentas reales
- Decidir si prefiere tres roles o cuatro. Hoy son cuatro porque el dueño y el admin son niveles distintos
- Lo demás sigue en docs/PENDIENTES_DE_RICARDO.md

## Fase G. Que la plataforma funcione de verdad (D-103 a D-107)

Nace de la petición de Ricardo del 2026-10-10, construir todo lo que haga falta y decirle qué necesito de él. Lo que depende de sus cuentas y llaves queda programado y probado con servidores falsos. Quedó en main con el PR 26.

### Bloques
- [x] G1. Proxy de IA alojado (D-103). Verifica la sesión de Supabase, exige plan de pago o rol médico o admin, y cuenta límites, presupuesto y bitácora en Postgres. Dockerfile, sexta migración y docs/IA_ALOJADA.md
- [x] G2. Aviso de privacidad y términos como páginas públicas (D-104). Un solo texto en src/i18n/legal.ts, exportable a docs/legal para el abogado
- [x] G3. Configuración del admin en el servidor (D-105). platform_settings, clave admin_overrides, guardada desde la pantalla 25, copiada al navegador al abrir y con aviso para recargar. Pruebas SQL (settings_test.sql), de cliente y del puente con la nube
- [x] G4. Portal de Stripe para cancelar y cambiar tarjeta, y reembolsos completos que quitan el plan (D-106). Séptima migración, función create-portal-session, pruebas SQL (billing_portal_test.sql), de las funciones y de la pantalla. Sin probar contra Stripe real
- [x] G5. HSTS en _headers y registro de errores del navegador sin datos personales y solo con el permiso de mejora anónima (D-107). Octava migración, pruebas SQL (client_errors_test.sql), del reporte, del permiso y de la tarjeta en la pantalla 25
- [x] G6. Diseño del banco en la nube (docs/BANCO_EN_LA_NUBE.md), conversión sin pérdida entre ULID y uuid (cloudIds) y lista de lo que falta de Ricardo (docs/PENDIENTES_DE_RICARDO.md)

### Cierre de 15.1
- Paso 1. Typecheck, lint y pruebas unitarias con cobertura pasan, 2,588 pruebas. Las 9 suites SQL pasan con la última migración corrida dos veces. npm audit sin vulnerabilidades y JavaScript inicial en 281.5 KB de 300
- Paso 2. e2e completo, 214 pasan, y capturas de aviso de privacidad, términos, configuración del admin y Suscripción en docs/screenshots/fase-g, en teléfono y escritorio, claro y oscuro
- Paso 3. Revisión independiente, abajo
- Paso 4. Este archivo, docs/informe-de-pruebas.md, docs/real-vs-simulado.md, docs/mapa-plan-maestro.md y DECISIONES.md (D-103 a D-107) al día
- Paso 5. Commit y push a main-y84jz2. No hay pull request porque no se pidió. Espera la aprobación de Ricardo

### Revisión independiente (15.1, paso 3)
- Un subagente que no escribió el código revisó G1 a G5 en solo lectura. Encontró 1 crítico, 4 importantes y 6 menores. Se verificó cada uno antes de actuar
- Crítico, corregido. /ai/%63onfig y /ai/%75sage se saltaban la regla de admin del proxy alojado y dejaban a un alumno de pago leer y cambiar la configuración y el presupuesto de IA. Ahora se decide con la ruta del enrutador y todo lo que no sea un POST a un motor pide ser admin. Hay pruebas que fallan con el código anterior
- Importantes, corregidos. Un aviso de pago tardío de un pago devuelto ya no reactiva el plan. Un reembolso de un cobro viejo ya no quita un mes vigente, y sin id de pago se elige el cobro por monto y hora. La base se niega a eliminar la cuenta con una suscripción de Stripe activa. La app ya no registra como aceptada una versión del aviso que el alumno no vio
- Menores, corregidos. Cancelar al final del periodo se avisa desde que se cancela. El alumno que vuelve a pagar usa su mismo cliente de Stripe. La lista de errores usa la huella como llave. La limpieza de datos personales de los errores ocurre también en la base. El aviso de privacidad lista el alojamiento del proxy de IA
- Menores, documentados y no corregidos. El presupuesto diario de IA es un tope blando bajo llamadas simultáneas y el proxy no limita peticiones con token falso, que se resuelve con un límite por IP en el alojamiento. Ver docs/IA_ALOJADA.md

## Fase F. Endurecer, documentar y dejar lista la demo (D-102)

Sigue la misma instrucción de Ricardo del 2026-10-08, ejecutar todos los pendientes sin preguntar. Cierra con la sección 15.1 y espera la aprobación de Ricardo.

### Bloques
- [x] F1. JavaScript inicial bajo 300 KB comprimidos. Pasó de 580 a unos 275 KB con las pantallas por ruta, el SDK de Supabase y la sincronización bajados aparte, y los textos del médico y de administración fuera del núcleo. scripts/bundle-budget.ts lo mide y tests/security/build-policy.test.ts lo vigila
- [x] F2. Política de seguridad de contenido en el build, en index.html y en _headers para Cloudflare Pages, con su prueba
- [x] F3. npm audit sin vulnerabilidades. concurrently 10.0.6, un override de uuid para exceljs y un trabajo aparte en el CI
- [x] F4. Pruebas de punta a punta de sin conexión (offline.spec.ts) y de rendimiento con 200 tarjetas y el procesador 4 veces más lento (perf.spec.ts)
- [x] F5. Revisión contra OWASP ASVS 5.0 en docs/asvs.md
- [x] F6. README.md con IA real y simulada, datos de demostración y prueba en el teléfono. DEMO.md con el guion de 10 minutos. docs/real-vs-simulado.md, docs/mapa-plan-maestro.md y docs/informe-de-pruebas.md
- [x] F7. Cierre según 15.1. check y e2e pasan, capturas en docs/screenshots/fase-e-f, revisión de un subagente independiente atendida y informe en docs/informe-de-pruebas.md
- [ ] F8. Aprobación de Ricardo. Publicar en Cloudflare Pages queda a su aprobación (D-017)

### Evidencia del cierre
- 2,400 pruebas unitarias y de integración pasan y 2 se omiten a propósito, en 242 archivos. 204 pruebas de punta a punta pasan, 102 en teléfono y 102 en escritorio. Las cinco suites de SQL pasan. npm audit sin vulnerabilidades. JavaScript inicial de 275.7 KB
- La revisión independiente no encontró nada crítico y sí seis puntos importantes, todos corregidos, ver D-101. Después de los arreglos corrieron otra vez las pruebas unitarias, las de SQL y 100 de punta a punta
- Desviación. Los textos del médico y de administración salieron del objeto t y cada pantalla los importa directo, para bajar el JavaScript inicial

### Bitácora
- Mover las pantallas a carga por ruta no rompió ninguna prueba unitaria. Lo que más pesaba en lo inicial era el SDK de Supabase, unos 55 KB comprimidos, y se bajó a un archivo aparte que solo se pide con la nube configurada
- La política de contenido encontró un hallazgo real en la primera corrida. Vite incrusta como data: las fuentes de menos de 4 KB y la política las bloqueaba. Ahora font-src las permite
- La prueba de sin conexión confirma que una pantalla que nunca se visitó abre sin red, porque el service worker guarda todos los archivos al instalarse
- Rendimiento con el procesador 4 veces más lento. Mediana de 90 ms por tarjeta, p95 de 147 ms y peor de 301 ms. Los umbrales de la prueba son 150, 350 y 800 ms para no fallar por carga del equipo

### Pendiente
- El margen del presupuesto es de unos 25 KB. Lo siguiente por ahorrar es partir el resto de los textos de la interfaz por área, quitar tailwind-merge y cargar zod solo donde hace falta
- Que Ricardo apruebe publicar en Cloudflare Pages y compre el dominio propio
- Una prueba de penetración externa antes de abrir a alumnos de pago

## Fase E. Panel del médico, reportes y privacidad (D-099)

Sigue la misma instrucción de Ricardo del 2026-10-08, ejecutar todos los pendientes sin preguntar. Las pantallas 18 a 22 del médico y la privacidad del alumno.

### Bloques
- [x] E1. Vocabulario sesgos o trampas y pantalla 19 de doble etiquetado con kappa. El alumno ve trampas hasta que haya 30 pares con dos etiquetas y kappa de 0.40 o más. El médico etiqueta a ciegas desde su cola y el admin ve el tablero
- [x] E2. Pantalla 18, editor de pregunta con versiones y estados. Cada guardado crea una versión nueva en borrador, las opciones conservan su ID estable, el médico edita solo lo asignado y primero etiqueta a ciegas si la pregunta está en la muestra
- [x] E3. Pantalla 21, reportes de contenido, del alumno al médico. Agrupados por pregunta con lo más grave primero, con versión anterior marcada y resolver, descartar o reabrir. El alumno no repite un reporte abierto
- [x] E4. Pantalla 20, cola de borradores de IA. Preguntas reestructuradas con el original al lado, que al aprobarse crean una variante fuera del examen hasta tener 200 exposiciones por distractor. Consejos por sesgo revisados por el médico, que el Tutor muestra sin la marca de borrador. Tarjetas de mazos públicos con aprobar y rechazar
- [x] E5. Pantalla 22, importador del banco desde CSV, Excel o JSON. Convertidor compartido con el script de Node, reporte de errores por fila, borradores sin duplicar con un ID por fila y guía en docs/bank-import.md
- [x] E6. Privacidad. Migración quinta que deja borrar datos y cuenta con la bitácora de solo agregar, borrado de la nube desde la app, sección Privacidad con los tres consentimientos y puntaje oficial voluntario (D-101)

## Fase D. Motores de IA y evaluaciones (D-098)

Ricardo pidió el 2026-10-08 ejecutar todos los pendientes del plan sin preguntar. No hay clave de IA en este entorno, así que todo corre en modo simulado y con un cliente falso del SDK. Con la clave de Ricardo se mide el costo y la latencia reales con npm run eval-ai y la bandera real.

### Bloques
- [x] B1. Núcleo de anclaje sin alias, contratos y guardas de los cinco motores, y respuestas fijas que las cumplen
- [x] B2. Ruta de IA del proxy con el SDK oficial, límites por alumno y por motor, presupuesto diario, filtro de datos, reintento con el motivo, bitácora de costo y prompts versionados
- [x] B3. Cliente de IA que vuelve a validar, tarjetas por la misma ruta con costo real, y análisis con IA en el Tutor con consentimiento, plan de pago, borrador y plantilla de respaldo
- [x] B4. 60 casos dorados y npm run eval-ai con la bandera de respuestas fijas o con el modelo real
- [x] B5. Pantallas de admin 23 costos de IA, 24 datos de demostración y 25 configuración
- [x] B6. Documentos y cierre (D-098)

### Bitácora
- Las metas de la sección 8.7 se cumplen en 100 % con las respuestas fijas. Esquema válido en el primer intento, anclaje y rechazo de lo que no se puede sostener
- La prueba entre el cliente y el proxy encontró un campo del costo de las fallas que el esquema del error no admitía. Los casos dorados encontraron un texto del que el generador simulado no sacaba tarjetas
- Los umbrales y los pesos del ENARM editados desde admin se guardan en el navegador y se aplican al recargar, con prueba de que un conjunto inválido no entra
- El tutor, que decía Próximamente en los planes, ya está. El examen completo sigue marcado

### Pendiente
- Que Ricardo agregue la clave en server/.env.local y corra npm run eval-ai con la bandera real, para el costo y la latencia verdaderos
- Revisar los prompts de server/prompts y pegar su prompt maestro de tarjetas
- Confirmar el segundo proveedor de IA y qué modelo prefiere por motor
- La cola de borradores del médico para las preguntas reestructuradas. Resuelta en la Fase E, pantalla 20 (D-099)

## Fase C2. Etapa 6, sincronización entre dispositivos (D-085 y D-095)

Ricardo pidió el 2026-10-08 ejecutar todos los pendientes del plan sin preguntar. No se aplicó ninguna migración en su proyecto de Supabase, queda la guía en docs/SUPABASE.md.

### Bloques
- [x] B1. Migración 20261008000002_sync.sql con la tabla de registros, las funciones de subida y el contador de la bitácora, y sus pruebas SQL contra Postgres local
- [x] B2. Motor puro de sincronización con la regla de la fecha más reciente, las marcas de agua y el control del reloj, con pruebas de propiedades de dos dispositivos
- [x] B3. Transporte con Supabase y en memoria, tabla syncState (base versión 7) y runSync por páginas con avance guardado
- [x] B4. Programador de la sincronización, puente con la nube, tarjeta de estado en Configuración y aviso de la copia en la nube al borrar
- [x] B5. Guía para aplicar la migración, D-095 y cierre

### Bitácora
- La simulación de dos dispositivos con operaciones al azar converge siempre, y rompiendo a propósito la regla de empate la prueba falla
- Las pruebas encontraron dos fallos de diseño que se corrigieron, un envío que no avanzaba cuando muchos registros comparten la misma hora y una bitácora que se reenviaba completa en cada sincronización
- Se agrega el uso de la tabla syncState en la base local y un caso de migración de la versión 6 a la 7 con datos
- El JavaScript inicial pasó de unos 495 a unos 500 KB comprimido, contra un presupuesto de 300 KB. Reducirlo con carga diferida por rutas sigue como pendiente de la Fase F
- La política de lectura de sync_records sube de 22 a 23 las políticas con la barrera del dispositivo único. La prueba SQL de cobertura y la guía ya lo dicen

### Pendiente
- Que Ricardo aplique la migración y la pruebe con dos navegadores, con la guía
- Borrar también la copia en la nube con Borrar mis datos. Resuelto en la Fase E, bloque E6 (D-101)
- Sincronizar sesiones de estudio, hallazgos y ajustes personales, en IDEAS.md

## Fase C2. Etapa 5, tarjetas con IA desde PDF y textos (D-085 y D-094)

Ricardo pidió el 2026-10-08 ejecutar todos los pendientes del plan sin preguntar. No hay clave de IA en este entorno, así que la etapa corre completa con el generador simulado y deja lista la entrada para el modelo real.

### Bloques
- [x] B1. Filtro de datos personales, lista cerrada de fuentes académicas y motor de generación con validador (puros)
- [x] B2. Lector de PDF con pdf.js en carga diferida y generador de IA con cuota por plan
- [x] B3. Guardado en borrador, señal de controversia con eventos de verificar o editar, y tarjeta en Mazos
- [x] B4. Señal en el repaso y en Explorar, pruebas unitarias, de pantalla y e2e con la app compilada

### Bitácora
- El validador descarta lo que no pasa y el alumno nunca lo ve. Se probó con propiedades que una cita inventada, una dosis que la cita no trae y una fuente fuera de la lista no llegan nunca a las propuestas
- La prueba e2e con la app compilada confirma que pdf.js y su worker funcionan en el build real, que un PDF sin texto muestra su mensaje y que el plan de pago genera, guarda, marca la controversia y la quita al verificar
- pdf.js y su worker (unos 1.7 MB) no entran al precache de la PWA. Tienen su propia caché al usarse
- El JavaScript inicial pasó de unos 480 a unos 495 KB comprimido por las pantallas nuevas, contra un presupuesto de 300 KB. Reducirlo con carga diferida por rutas sigue como pendiente de la Fase F
- Se agrega pdfjs-dist. El motor de simulación local no llama a ningún servicio
- Un cambio chico en la espera de las pruebas de pantalla (asyncUtilTimeout de 5 s) ya estaba desde la Etapa 3

### Pendiente
- La ruta /api/ai/flashcards del servidor y el modelo real, con la Fase D
- Reconocimiento de caracteres para PDF escaneados, en IDEAS.md
- Que Ricardo o un médico confirmen la lista de fuentes, la cuota diaria y el prompt maestro

## Fase C2. Etapa 4, importar y exportar (D-085 y D-093)

### Bloques
- [x] B1. Lectores con límites y rutas seguras. Paquetes .apkg de los dos formatos con sql.js y zstd, CSV, Excel y Word
- [x] B2. Guardar la importación como mazo privado con árbol de mazos, sin duplicar, y exportar a CSV con identificador por nota
- [x] B3. Worker del importador, tarjetas de Subir y Exportar en Mazos, caché propia del motor y la suscripción ya no dice Próximamente
- [x] B4. Fixtures generados por código, pruebas de lectores, de seguridad, de guardado y de pantalla, y e2e con la app compilada en teléfono y escritorio

### Bitácora
- Los fixtures se arman con código y no se guardan como binarios. Un .apkg viejo con sql.js, uno nuevo con un marco zstd de bloques sin comprimir, hojas de Excel, documentos de Word, y zips hechos para fallar con tamaños declarados falsos, rutas con .., bombas zstd con y sin tamaño declarado y un XML con entidad externa
- La prueba e2e con la app compilada confirma que el Worker y el motor de SQLite funcionan en el build real, con un .apkg viejo y uno nuevo
- El JavaScript inicial ya medía unos 464 KB comprimido antes de las Etapas 3 y 4 y ahora mide unos 480 KB, contra un presupuesto de 300 KB. El importador vive en su propio Worker y no suma al inicial, y lo que sumaron las dos etapas son sus pantallas. Reducirlo con carga diferida por rutas queda como pendiente de la Fase F
- Se agregan papaparse, read-excel-file, sql.js y fzstd, todas MIT y sin scripts de instalación. npm audit sin las dependencias de desarrollo da 0 vulnerabilidades

### Pendiente con Ricardo para seguir
- Aprobar las Etapas 2, 3 y 4 en la revisión
- Decidir si quiere imágenes y audios en las importaciones (IDEAS.md)

## Fase C2. Etapa 3, apuntes tipo RemNote (D-085 y D-092)

### Bloques
- [x] B1. Motor puro de apuntes (src/engines/outline.ts). Lee las marcas de una línea, arma el plan de tarjetas, convierte el árbol al documento del editor y de vuelta, y resuelve enlaces y vínculos de regreso
- [x] B2. Capa de datos. Apuntes con su tabla (la base sube a la versión 6), las notas guardan el apunte y la línea de donde salen y los casos de uso crean, guardan, renombran, mueven y borran apuntes sincronizando sus tarjetas sin perder el historial
- [x] B3. Editor con TipTap 3, pantalla de Apuntes como cuarta pestaña de Repasar, tarjetas del apunte al lado, enlaces y marcas rápidas, y autoguardado
- [x] B4. Cierre de la etapa según 15.1. Sin aprobación, por indicación de Ricardo del 2026-10-08 de seguir sin detenerse

### Bitácora
- Tres piezas en paralelo. El motor y la interfaz los escribí yo y la capa de datos la hizo un agente en su propia copia, que introdujo errores a propósito en su código para comprobar que sus pruebas los detectan (12 de 12 cazados)
- Las dos cartas de un mismo concepto no se repasan el mismo día, así que el apunte dice 4 tarjetas y Repasar muestra 3 hoy. El e2e lo verifica
- Las tarjetas que salen de un apunte ya no se pueden editar ni borrar desde el editor de mazos, solo desde el apunte, que las vuelve a escribir al sincronizar
- TipTap pesa bastante, así que el editor es una carga diferida y no entra al arranque
- El registro de pantallas pasa de 29 a 30

### Evidencia de cierre (15.1)
- npm run check limpio. Typecheck y lint sin errores y 1,588 pruebas unitarias pasan. En la corrida completa una prueba de seguridad que recorre dist se pasó de sus 5 segundos por la carga en paralelo, pasa sola en 8 segundos y ahora tiene un tope de 60
- e2e, 158 pasan en móvil y escritorio, con 3 flujos de apuntes nuevos. Escribir marcas y ver las tarjetas en Repasar, partir con Enter al inicio y volver a unir con Backspace comprobando en IndexedDB que la nota y su ID no cambian, y pegar varias líneas
- Capturas en docs/screenshots/fase-c2-etapa3, la lista de apuntes y un apunte con marcas, en teléfono y escritorio, claro y oscuro
- Revisión independiente con 14 hallazgos. Se corrigieron los 12 que afectan datos o uso, con pruebas nuevas, y los otros 2 quedaron documentados en D-092 (huecos sin número y un tiempo cuadrático que los topes del editor dejan en menos de 35 ms). Lo más grave era que Enter al inicio y Backspace en los bordes de una línea le quitaban el ID a la tarjeta y se perdía su historial, y que al pasar un tope el guardado rechazaba el apunte entero sin avisar
- Las pruebas en Playwright necesitan PW_CHROMIUM_PATH=/opt/pw-browsers/chromium en este entorno, porque el Playwright del proyecto espera otra versión del navegador

### Pendiente
- Siguen las etapas 4 a 6 sin pausas de aprobación, por indicación de Ricardo

## Fase C2. Etapa 2, carga diaria (D-085 y D-089)

### Bloques
- [x] B1. Base. Ajustes nuevos (sin límite de nuevas, temporizador, días fáciles), evento cards_rescheduled, umbrales de carga diaria en el PLAN y banderas de acceso por función
- [x] B2. Motores puros en paralelo. Atrasos (repartir, posponer, adelantar y deshacer), días fáciles dentro del programador, sugerencia de nuevas por día y perfil guía
- [x] B3. Repasar con tres contadores, temporizador opcional y flujo de sanguijuelas, con aviso en Repasar que lleva a Explorar
- [x] B4. Pantallas. Herramientas de atrasos con aviso de recuperación, panel de carga diaria dentro de los límites de hoy, ajustes de temporizador y días fáciles en Configuración y banderas de acceso con FeatureGate
- [x] B5. Cierre de la etapa según 15.1, con pruebas, capturas y revisión independiente. Falta la aprobación de Ricardo

### Bitácora
- Los días fáciles se fusionaron al programador y se corrigió su reparto. El domingo en mínimo mandaba todo al sábado y el pico subía hasta 1.7 veces. Con un desempate parejo por hash estable de la tarjeta se reparte entre sábado y lunes y el pico queda dentro de 1.4 veces en 8 semillas distintas
- Repartir, posponer y adelantar solo mueven la fecha de vencimiento y se guardan como eventos nuevos en lotes de 500 tarjetas. Deshacer es otro evento. Los resultados se ven aunque el bloque de herramientas esté plegado
- La sugerencia de nuevas por día se calcula con un botón porque en colecciones de 15,000 tarjetas tarda cerca de 0.8 segundos. Hasta tener 100 repasos medidos usa tiempos de referencia y lo dice con el aviso de calibrando
- Sin límite de nuevas conserva el número de antes. El planificador, al proponer bajar las nuevas, ahora apaga ese modo y recorta la propuesta al máximo que acepta el ajuste. Antes habría intentado guardar 50,000 y fallaba
- Las banderas de acceso quedan todas abiertas en todos los planes, a la espera de que Ricardo decida qué es de pago

### Evidencia de cierre (15.1)
- npm run check pasa. 1,453 pruebas de Vitest pasan y 2 se omiten, en 156 archivos. Typecheck, ESLint y Prettier limpios
- Playwright. 146 pruebas pasan, 73 en teléfono y 73 en escritorio, con las nuevas de carga diaria (contadores, temporizador que muestra la respuesta solo, atrasos repartidos y deshacer, perfil guía, sugerencia de nuevas y sin límite), todas con axe sin violaciones serias. Una prueba de práctica en escritorio falló una vez por carga de la máquina y pasó al repetirla, y dos esperas de la prueba nueva se arreglaron para que no dependan de la velocidad
- Capturas en docs/screenshots/fase-c2-etapa2, 24 imágenes. Ajustes de temporizador y días fáciles, límites de hoy con perfil guía y sugerencia, repaso con contadores y temporizador, aviso de recuperación con 45 atrasadas, herramientas de atrasos y el reparto ya hecho con su opción de deshacer, en teléfono y escritorio, claro y oscuro
- Revisión independiente por un subagente que no escribió el código. Sin hallazgos críticos ni altos y sin pérdida de datos en la bitácora. Reportó 4 medios y 9 bajos y se atendieron casi todos. Lo más importante. Las tarjetas aprendidas el mismo día tenían la misma semilla de días fáciles y se movían en bloque, así que ahora la semilla incluye el ID de la tarjeta. Con muchas nuevas sin límite la proyección tardaba segundos y ahora tarda milisegundos. Usar la sugerencia dejaba un borrador viejo en el campo de nuevas, el intervalo máximo del perfil guía se mostraba mal en Configuración, y repartir ponía atrasadas en un domingo marcado como casi sin repasos. El detalle está en D-089
- No se tocó SQL en esta etapa, así que test:sql no cambia

### Pendiente con Ricardo para seguir
- Aprobar la Etapa 2 para pasar a la Etapa 3, apuntes tipo RemNote
- Decidir qué funciones son gratis y cuáles de pago. Mientras tanto todo es gratis
- Dejar o poner el correo público que sale en el aviso de cambio de dispositivo (variable VITE_SUPPORT_EMAIL). Por ahora queda vacío y el aviso no muestra enlace
- Ejecutar en Supabase las dos migraciones del dispositivo único, 20261007000001_single_device.sql y 20261008000001_device_barrier.sql

## Fase C2. Etapa 1, organización (D-085)

### Bloques
- [x] B1. Modelo con mazo padre, fecha de modificación y marca de borrado. La base sube a la versión 5 y limpia las etiquetas con espacios. Los repositorios de mazos, notas y tarjetas ocultan lo borrado y dan listAll y getRaw para sincronizar
- [x] B2. Mazos de Paco en árbol (ENARM 2027, rama y materia) y etiquetas en ruta sin espacios, con migración para quien ya seguía mazos. Repasar elige por rama y no por cada materia
- [x] B3. Básica con tarjeta inversa y cloze anidado con analizador real de huecos, y editor de tres tipos que conserva lo escrito al cambiar de tipo
- [x] B4. Revisión de calidad y de duplicados dentro del editor, solo avisos y sugerencias
- [x] B5. Pantalla Explorar con filtros, búsqueda y acciones por lote, y árbol de mazos propios en Mazos
- [x] B6. Cierre de la etapa según 15.1, con pruebas, capturas y revisión independiente. Falta la aprobación de Ricardo

### Bitácora
- Etiquetas en ruta como motor puro en src/engines/tagPath.ts y árbol de mazos en src/engines/deckTree.ts, con sus pruebas. El tope de una etiqueta sube a 200 caracteres porque una ruta de cinco niveles de Paco pasaba de 80 y se cortaba
- Los mazos de Paco son 1 raíz, 3 ramas y 37 materias. Cada nota guarda su ruta original como una sola etiqueta y la materia es el segundo nivel. La prueba tests/content/preloaded-tree-migration.test.ts parte de la base plana de antes y comprueba que quedan las mismas 3,771 notas y las mismas tarjetas con sus IDs, que ninguna etiqueta tiene espacios y que cada nota cuelga de su rama
- Borrar un mazo, una nota o una tarjeta propia deja una marca con fecha. Una carta que se quita y se vuelve a poner conserva su ID y su historial
- Suspender y reanudar son eventos nuevos (cards_suspended y cards_unsuspended, hasta 500 tarjetas cada uno). Repasar, el Planeador y la carga futura no cuentan las suspendidas
- Explorar es la tercera pestaña de Repasar y Mazos, en /mazos/explorar. Búsqueda por palabras, frases y exclusiones, filtros por mazo, ruta de etiqueta, estado, tipo y origen con el conteo de cada opción, selección de página o de todas las que coinciden y acciones por lote. Lo precargado solo se suspende
- Los mazos propios se arman en árbol desde Mazos. Se crea un mazo dentro de otro y se reorganiza o renombra sin ciclos
- Tres agentes en paralelo hicieron los tipos de nota, el motor de calidad y la barrera del dispositivo único. Las ramas se integraron a mano y se resolvió el choque en manualDecks. Los dos motores de huecos (src/data/content/cloze.ts y src/engines/cardText.ts) son independientes porque un motor no puede importar de la capa de datos
- La prueba de migración de Paco tarda 90 segundos porque fake-indexeddb reordena sus índices al reemplazar 3,771 notas. En el navegador no pasa. Su límite sube a 300 segundos para que no falle cuando la máquina está ocupada

### Evidencia de cierre (15.1)
- npm run check pasa. 1,215 pruebas de Vitest pasan y 2 se omiten, en 138 archivos. Typecheck y ESLint limpios, y Prettier también
- Playwright. 142 pruebas pasan, 71 en teléfono y 71 en escritorio, con las nuevas de Explorar, del árbol de mazos y del editor con avisos, todas con axe sin violaciones serias
- test:sql pasa en Postgres local con las pruebas de permisos y las de la barrera del dispositivo único
- Capturas en docs/screenshots/fase-c2-etapa1, 16 imágenes. Explorar con la lista y con filtros, selección y una tarjeta abierta, el editor con avisos de calidad y los mazos propios en árbol, en teléfono y escritorio, claro y oscuro
- Revisión independiente por un subagente que no escribió el código. Sin hallazgos críticos ni pérdida de datos. Reportó 13 hallazgos y se corrigieron todos, con las pruebas que faltaban. El detalle está en D-088
- Dos pruebas flojas se arreglaron en el camino. La de migración de Paco tardaba 90 segundos en fake-indexeddb y su límite sube a 300. La del aviso de otro dispositivo sin sesión no esperaba a que cargara la portada

### Pendiente con Ricardo para seguir
- Aprobar la Etapa 1 para pasar a la Etapa 2, carga diaria
- Preguntas abiertas. Qué funciones son gratis y cuáles de pago (se propone gratis para mazos en árbol, etiquetas, Explorar y calidad). Si en Repasar prefiere que elegir un mazo propio traiga todos sus submazos, que es lo que hace ahora
- Bug anterior a esta etapa. Borrar una cuenta que ya tiene eventos falla en la base, porque el disparador de solo agregar de events bloquea el borrado en cascada. Afecta el derecho a cancelar la cuenta. Resuelto en la Fase E, bloque E6, con la quinta migración (D-101)

## Reunión del equipo del 2026-10-07 (D-087)

Cambios aplicables que salieron del acta de Gemini. Todo con pruebas unitarias y e2e.

### Bloques
- [x] 1. Repaso y simulador sin pregunta de confianza por defecto, con migración de la base a la versión 4
- [x] 2. Retroalimentación al final de la práctica, con la revisión de cada pregunta en el resumen y la opción de verla tras cada pregunta
- [x] 3. Teclado en práctica, examen y repaso, doble clic para responder y botón de responder pegado a las opciones
- [x] 4. Repasar y Mazos en una sola sección con dos pestañas
- [x] 5. Precios. Mensual 150, anual 1,200 y plan Fundador de 79 (confirmado) para los primeros 100 usuarios
- [x] 6. Banco de 4 a 10 opciones por pregunta y plantilla de Excel con npm run bank:template
- [x] 7. Un solo dispositivo activo por cuenta. El freno revisa desde el navegador y la barrera lo hace cumplir en la base de datos, con límite de 3 cambios en 24 horas. Son dos migraciones de SQL que Ricardo debe ejecutar

### Evidencia
- Vitest. 858 pruebas pasan y 2 se omiten antes de los últimos ajustes, más las de planes y pestañas. test:sql pasa con el bloque nuevo del dispositivo único
- Playwright. 136 pruebas, 68 por proyecto, con las de teclado y retroalimentación al final en teléfono y escritorio
- Dos fallas de las pruebas e2e se debieron a que la prueba seguía antes de que la siguiente pregunta cargara. Los ayudantes ahora esperan a la pregunta y a sus opciones

### Pendiente con Ricardo
- Confirmar el precio del anual, que sigue provisional en 1,200 pesos. El Fundador de 79 ya lo confirmó
- Ejecutar en el editor de SQL de Supabase, en este orden, supabase/migrations/20261007000001_single_device.sql y supabase/migrations/20261008000001_device_barrier.sql, con los pasos de docs/SUPABASE.md
- Poner en GitHub, en Variables, VITE_SUPPORT_EMAIL con el correo al que escribirá quien pase el límite de cambios, y volver a publicar. Sin ella el aviso no lleva enlace
- Abrir una vez en Excel la plantilla content-drafts/bank-plantilla/Studiare-banco-plantilla.xlsx, que se probó en LibreOffice

## Fase P. Plataforma real (D-060)

### Bloques
- [x] 1. Sistema de diseño premium (D-061 a D-067)
- [x] 2. Portada de venta, registro con correo, datos de cuenta y foto o avatar (D-068)
- [x] 3. Esquema de Supabase con permisos por fila y roles, probado en Postgres local (D-069)
- [x] 4. Usuarios con roles por nivel y asignaciones a médicos, banco del médico solo con lo asignado (D-070)
- [x] 5. Pagos con Stripe y Mercado Pago en modo prueba (D-096). Funciones, migración y pruebas listas. Falta un pago de prueba real con las llaves de Ricardo
- [x] 6. Plan del día (D-081), duelos y compartir logro (D-084), misiones, ligas e insignias en Logros (D-097)
- [x] 7. Progreso con estadísticas de técnica, Conócete (D-074), carga futura y dificultad (D-083)
- [x] 8. Subir mazos desde otras apps, CSV, Excel y Word (D-093)
- [x] 9. Sincronización con el servidor. Cuenta en la nube (D-075) y sincronización de mazos, apuntes, Inicio y bitácora (D-095). Falta subir el banco, que espera la revisión médica
- [x] 10. Plan Gratis aplicado en el servidor con permisos por fila (D-096)
- [x] 11. Referidos con mes gratis desde el servidor (D-096)

### Bitácora
- Bienvenida simple, un solo aviso de privacidad y sin cambio de rol (D-059). Análisis en docs/ANALISIS_PLATAFORMA.md y entrevista (D-060)
- Diseño premium, fuentes propias, apariencia personalizable y celebraciones (D-061)
- Encabezado con racha, nivel con barra y foto. Pomodoro en Repasar, opcional, con ajustes ahí mismo (D-062, D-063)
- Tiempo de estudio activo con aviso de estudio pausado tras 2.5 minutos (D-063)
- Tabla de niveles al tocar el nivel (D-063)
- Intervalo máximo del repaso de 30 días con compresión suave (D-064)
- Configuración aparte de Perfil, fondo personalizado con foto, sin cuenta regresiva y heatmap por meses (D-065). 318 pruebas pasan
- Seis ramas troncales con subespecialidades en Simular, Mazos y Progreso. Primera versión de Progreso. Títulos de nivel de R0 a Eminencia. Heatmap que crece mes con mes (D-066)
- Tope de 21 días sobre Bien con botones separados y multiplicador por botón (D-067)
- Portada de venta, cuenta con correo en tabla aparte, datos opcionales, 12 avatares médicos o foto propia (D-068). 322 pruebas pasan
- Esquema de Supabase con 12 pruebas de permisos en npm run test:sql y guía en docs/SUPABASE.md (D-069)
- Usuarios en /admin/usuarios con reglas de roles idénticas a Supabase y banco del médico (D-070). 326 pruebas pasan
- Marco compacto a todo lo ancho, nivel junto al título, Configuración en el riel y botones de guardar (D-071)
- Elegir qué repasar por modo, mazo, troncal y subespecialidad, y cambiar sin perder avance (D-072)
- Análisis docente del ENARM en docs/ANALISIS_DOCENTE_ENARM.md y protección del contenido al final (D-073)
- Conócete en Progreso con el motor de autoconocimiento, 19 lecturas en tres áreas más un foco por cada trampa detectada con acción concreta (D-074). 346 pruebas pasan
- Proyecto de Supabase creado por Ricardo. Cuenta en la nube con enlace al correo, rol desde el servidor y datos de cuenta sincronizados (D-075). 353 pruebas pasan
- Auditoría completa de la página con corrección de tarjetas nuevas por día (D-076)
- Banco grande de 1500 preguntas terminado en borrador (D-077). 250 por troncal con 10 opciones, todas validadas. Excel en content-drafts/bank1500/Studiare-banco-1500-borrador.xlsx y guía en content-drafts/bank1500/README.md. Falta la revisión médica y subirlo a Supabase con la segunda parte de la nube
- Compactación de pantallas terminada (D-078), en 6 bloques con capturas de antes y después en docs/screenshots/compactacion
  - [x] 1. Modo enfoque en pregunta, tarjeta y retroalimentación. Encabezado delgado y barra fija de acciones en el teléfono, dos columnas en computadora
  - [x] 2. Repasar y Simular con el botón de empezar arriba, ramas en acordeón y mazos, temas y límites plegados con resumen. En el teléfono Repasar pasó de 4613 a 844 px de alto y Simular de 4256 a 844
  - [x] 3. Progreso en una sola página. Cifras en una fila, tus 3 focos de la semana con atajo para practicar (el simulador abre con el tema o las negativas ya elegidos), lecturas de Conócete como filas que se abren y ramas que se abren a sus subespecialidades, con las que no tienen datos ocultas. En el teléfono pasó de 8362 a 2482 px de alto
  - [x] 4. Marco de pantallas. La explicación de cada pantalla pasa a un ícono de información, el aviso de demo queda en una línea delgada y es la única etiqueta de Datos simulados en los encabezados, Inicio y Perfil ya no repiten racha y nivel, Perfil sin el botón de Configuración duplicado y Agregar mazo dentro de la tarjeta de Repasar
  - [x] 5. Configuración en 4 secciones con pestañas, Estudio, Apariencia, Pomodoro y Cuenta y datos. Una sola barra de guardar por sección que aparece solo con cambios, el tema junto con la apariencia, retención, tope e intervalos por botón plegados en Opciones avanzadas, tamaño del texto como control segmentado y fuentes en cuadrícula de 2. En el teléfono pasó de 5283 px a secciones de 844 a 1244 px
  - [x] 6. Inicio y Mazos. En el teléfono racha y meta diaria van lado a lado y el heatmap ocupa todo el ancho, y Editar tablero pasa al encabezado. Cada mazo es una tarjeta compacta con sus temas plegados y Sube tu mazo y Crear mazo quedan en una sola tarjeta. Inicio pasó de 1422 a 1082 px de alto en el teléfono y Mazos de 1820 a 1376
- Pagos en modo prueba con Stripe y Mercado Pago, plan Gratis aplicado en el servidor y referidos con mes gratis (D-096). Tres funciones del servidor con firmas verificadas, migración 20261008000003 con 4 bloques de pruebas SQL y 51 pruebas de las funciones. La guía para Ricardo está en docs/SUPABASE.md
- Misiones, insignias y ligas en la pantalla Logros y tres widgets de Inicio (D-097). Motor puro con pruebas de propiedades y e2e con accesibilidad
- Siguiente. Orden acordado el 2026-10-06. 1) Poner al día las pruebas e2e y que el CI las corra. 2) Bloques 9 y 10 de la Fase C con planificador, examen completo con alarmas de tiempo, descarte de opciones y tipologías de reactivo (D-080), tutor sin IA, duelos, compartir logro, mazos a mano y los widgets de Inicio que faltan (hechos), y cerrar la fase con 15.1 (en curso, falta la aprobación de Ricardo). 3) Segunda parte de la nube con la bitácora, cuando Ricardo haya probado su cuenta y se haya hecho dueño. 4) Fase D con IA en modo simulado. 5) Pagos con Stripe y Mercado Pago cuando existan las cuentas. El banco y los mazos de Pediatría y Cirugía quedan en pausa

## Fase C. Pantallas del alumno (esqueleto funcionando)

Ricardo pidió ver tomar forma la interfaz completa antes de seguir con el banco. Inicio de sesión y pagos son simulados y locales según 3.2, sin contraseña, sin datos de tarjeta y sin cobro real.

### Bloques
- [x] 1. Bienvenida con perfil local, aviso de privacidad y consentimientos
- [x] 2. Inicio con widgets programables (heatmap, racha, nivel y XP, para hoy, cuenta regresiva, meta diaria, Party)
- [x] 3. Pomodoro configurable con sonido y notificaciones opcionales
- [x] 4. Perfil y ajustes completos, exportar y borrar datos
- [x] 5. Suscripción y checkout simulados con recibos marcados SIMULADO
- [x] 6. Mazos de Paco y repaso con FSRS, confianza y causa del error
- [x] 7. Simulador de práctica con pregunta, retroalimentación y resumen
- [x] 8. Party con grupos, código de invitación, tabla semanal y retos colectivos
- [x] 9. Progreso, planificador y examen completo. Planificador (D-081), examen con resultados y errores al repaso (D-082), carga futura y dificultad en Progreso (D-083)
- [x] 10. Tutor sin IA, widgets de análisis de Inicio, duelos y tarjeta de logro de Party, mazos a mano y pruebas e2e de las pantallas nuevas (D-083, D-084)

### Cierre de la fase (15.1)

#### Evidencia por criterio de aceptación
| Criterio | Prueba | Resultado |
|---|---|---|
| npm run check pasa | typecheck de 3 proyectos, ESLint y Vitest con cobertura | Pasa. 718 pruebas pasan y 2 se omiten, en 105 archivos |
| Los motores superan el 90% de cobertura | Cobertura de Vitest sobre src/engines | Pasa con 99.4% de sentencias |
| La app compila sin secretos | npm run build con scripts/secrets.ts sobre dist | Pasa. Sin secretos en dist |
| Los flujos 1, 2, 4, 5 y 6 de 14.1 funcionan | tests/e2e con un archivo por flujo, en teléfono y escritorio | Pasan |
| Estado calibrando en cada función que depende de datos | tests/e2e/calibrating.spec.ts con un alumno nuevo, más pruebas de pantalla del plan y los resultados | Pasa |
| Toda demostración y dato simulado lleva etiqueta | tests/e2e/labels.spec.ts, que incluye Party, duelos y tarjeta de logro | Pasa |
| Sin violaciones serias de accesibilidad y sin desbordes de lado en el teléfono | axe en cada prueba de pantalla, con la revisión de desbordamiento horizontal dentro del mismo ayudante | Pasa |
| El examen se puede retomar sin duplicar eventos | examSession.test.ts y recordEvent.test.ts, con IDs de evento fijos por respuesta | Pasa |
| El plan Gratis se respeta en práctica, examen, duelo y plan del día | Pruebas de dailyLimit, examSizes, planner y duelos | Pasa |

#### Conteo de pruebas al cierre
- Vitest. 718 pruebas pasan y 2 se omiten, en 105 archivos de 106. Cobertura de sentencias 72.1% en general y 99.4% en src/engines
- Playwright. 134 pruebas pasan, 67 por proyecto en teléfono (390 por 844) y escritorio (1280 por 800), en 8.6 minutos. Corren con movimiento reducido para que axe no mida tarjetas a medio aparecer
- Capturas. docs/screenshots/fase-c con las pantallas del alumno con la demostración y los flujos de práctica, examen, mazos propios y Party con duelo y tarjeta de logro, en teléfono y escritorio, claro y oscuro. Se regeneran con npm run screenshots

#### Revisión independiente (15.1, paso 3)
- Revisaron el código de la fase agentes que no lo escribieron, contra la especificación, PLAN.md y DECISIONES.md. Se agruparon los hallazgos por área y todos se corrigieron o se documentaron, ver D-082 y D-084
- Seguridad y Party. El cliente de Supabase aceptaba la llave anterior de servicio por parecerse a la pública. El premio de los retos colectivos se podía cobrar una y otra vez con metas que cumplían solos los compañeros simulados. Volver atrás desde la retroalimentación dejaba contestar otra vez la misma pregunta
- Examen. El cierre no era idempotente, un examen terminado que no se registró se podía pisar con otro, seguían contando respuestas después del límite de tiempo, el último examen no decía cuántas acertó y el foco no se movía al cambiar de pregunta
- Práctica y simulador. El descarte de opciones y el muestreo dirigido a las trampas del alumno de D-080 no estaban conectados, y la opción correcta no se repartía parejo entre posiciones
- Plan Gratis y calibrando. Un examen abierto no apartaba las preguntas del día, el plan proponía más práctica de la permitida y faltaba el estado calibrando en el plan y en los resultados
- Tutor y Progreso. Los consejos por sesgo no decían su base ni que son borrador, el widget de temas débiles calibraba con todos los temas aunque se eligiera una rama, y el editor aceptaba huecos sin cerrar
- Pruebas. Faltaban pruebas de pantalla con Testing Library, de las reglas del borrador para reactivos raros y de la visibilidad de la pestaña
- Al correr el e2e completo con la revisión de desbordamiento apareció uno más, el informe del tutor se salía de lado en el teléfono por la etiqueta de borrador, que no podía pasar a dos renglones. Se corrigió junto con las cuadrículas de una columna de Progreso, Planificador, Configuración y Resultados

#### Desviaciones y notas
- Solo el heatmap, los temas débiles y la carga futura tienen ajustes en el tablero de Inicio. Los demás widgets no tienen nada que ajustar todavía (D-084)
- El informe del tutor se llama Tu resumen y no informe semanal, porque todavía no es semanal ni trae olvidos ni planificador (D-084)
- Los grupos, compañeros y retos simulados del Party local viven en la base activa y no en enarm_demo, marcados como simulados. Hay que dejarlos fuera cuando la bitácora se sincronice (D-084)
- Los mazos de Paco y el banco siguen en pausa por indicación de Ricardo del 2026-10-06. Esta fase solo programó
- Una corrida de e2e falló antes por no encontrar el Chromium de Playwright. Se arregla con la variable PW_CHROMIUM_PATH apuntando al Chromium instalado, sin descargar nada
- La corrida completa de e2e antes de este cierre tuvo 131 de 134. Las tres que fallaron eran de Party y del tutor en teléfono, y se corrigieron. La última corrida pasó las 134

#### Decisiones de la fase
- D-080 a D-084 con las directrices V2, el planificador, el examen, Progreso y el tutor. D-085 y D-086 con la guía de Anki y las bibliotecas, que son el plan de la Fase C2

#### Preguntas abiertas para Ricardo
1. Banco y mazos. La Fase B sigue sin cerrarse del todo. Recomiendo cerrarla con las 200 preguntas existentes, para no frenar las etapas de la Fase C2 mientras el banco está en pausa
2. Fatiga de decisión (D-054). Recomiendo adoptar la tendencia como método por defecto, porque es más estable y marca menos. Los tercios de 7.6 siguen siendo los que usa la app hasta que lo decidas
3. Referido concretado (D-080). Recomiendo que cuente cuando el aviso de la pasarela de pago verifica el primer pago del referido, porque no se puede fabricar desde el navegador
4. Segundo proveedor de LLM. Si se agrega el LLM de OpenAI y con qué alcance, porque CLAUDE.md dice proxy hacia la API de Claude y nada de chat libre. Mientras no lo confirmes, el proxy de la Fase D no se ata a un proveedor y la IA solo da explicaciones estructuradas (D-080)
5. Textos académicos fundamentales para las señales de la IA (D-085). Propondré una lista provisional que confirmas tú o un médico
6. Licencia de Paco para uso comercial y qué funciones son gratis y cuáles de pago (D-085)
7. Ritmo de trabajo. Si quieres que avance entre etapas de la Fase C2 sin detenerme, o que me detenga al cierre de cada una como pide 15.1. Recomiendo detenerme en cada una al principio y pasar a avanzar sin parar cuando hayas probado dos

### Bitácora por bloque
- Tutor, widgets de análisis, duelos y tarjeta de logro (D-084). Tutor sin IA con hipótesis por reglas sobre los errores de 14 días, evidencia, acciones de la lista cerrada, respuesta del alumno, informe semanal con plantilla y consejos por sesgo en borrador. Inicio con temas débiles, patrón de sesgo, carga futura y última hipótesis, con ajustes validados y estado calibrando. Un solo análisis de respuestas para Progreso y los widgets. Duelos de Party con las mismas 20 preguntas fijadas al crear el duelo, jugados con el simulador como sesión de tipo reto, con compañeros simulados marcados y el límite del plan Gratis. Tarjeta de logro con Web Share API y descarga de respaldo. Pruebas unitarias de cada pieza, de componentes del botón de compartir y de los widgets, y e2e del tutor con Inicio, del duelo completo y de compartir
- Progreso con carga futura y dificultad, y mazos a mano (D-083). Carga futura a 30 y 60 días con la proyección del planificador, exactitud por dificultad con estado calibrando y el editor de mazos y tarjetas propias con texto plano escapado. Pruebas unitarias del armado, de los casos de uso y del editor, y e2e de Progreso y de mazos a mano
- Examen completo y errores al repaso (D-082). Pantallas 8 y 9 con reloj de pared, navegación libre, marcar para revisar, descarte de opciones, alarmas de tiempo y de ritmo, y resultados por rama, tema, estructura, trampa, reactivos raros y descarte con la revisión de cada pregunta. Las respuestas se registran al terminar, fechadas cuando se eligieron, y retoman sin duplicar si se interrumpe. Cada pregunta fallada pasa a Mis errores como tarjeta de pregunta y Repasar las pone primero. El plan Gratis limita el examen a las preguntas que le quedan hoy. Prueba e2e del flujo 4 y correcciones de contraste en las etiquetas de rama
- Planificador, pantalla 13 (D-081). Plan de hoy y de la semana con la carga real de repaso, el tiempo disponible y los temas a reforzar, con aviso de sobrecarga y dos ajustes con su efecto. Los minutos calibran hasta tener 3 días de estudio. Lo declarado gana sobre el promedio real. 10 pruebas unitarias del armado del plan y una e2e. Entra al riel como Plan y a Accesos en Perfil
- Pruebas e2e al día (D-079). Flujos 1, 2, 5 y 6 de 14.1 con prueba propia en tests/e2e y el ayudante signUp. El flujo 4 llegó con el examen (D-082). Faltan la prueba de estado calibrando y la de etiquetas
- Bloques 1 a 6. Commits 55dc312, 1826448 y 40de8a4. Verificado en el navegador, de la bienvenida al repaso de una tarjeta de Urgencias con sus intervalos de FSRS
- Bloque 7. Práctica por rama, dificultad y estructura con el límite diario del plan Gratis. Opciones con el muestreo diverso, negaciones resaltadas en la frase de la pregunta, confianza antes de responder, cada cambio de respuesta registrado y XP con el motor xp. La retroalimentación muestra el sesgo probable del distractor elegido, la explicación, las GPC por verificar, la causa del error y el reporte para revisión médica. El banco demo se guarda en la base la primera vez que se abre el simulador
- Bloque 8. Grupos locales con código de 6 caracteres. Al crear un grupo se pueden sumar 6 compañeros simulados, marcados, con actividad determinista por día. Tabla semanal desde el lunes a las 4 a. m. y retos colectivos que cuentan desde su primer día. Reclamar un reto cumplido registra challenge_completed y 100 XP una sola vez. Solo se comparte alias, XP, nivel y racha (9.6). 311 pruebas pasan

## Fase B. Motores núcleo, alumnos simulados y contenido demo

### Respuestas de Ricardo al aprobar la Fase A (D-042)
- Sesgos de conducta como etiqueta y también medidos con señales de conducta
- Sin trampas de formato. La taxonomía son solo sus 24 sesgos
- Repo remoto pospuesto, el proyecto queda solo local. Resuelto después con D-048
- 300 preguntas demo, 75 por rama, en 6 lotes mezclados de 50
- Las preguntas abiertas 1 a 4 de la Fase A quedan contestadas, salvo la confirmación manual de la PWA, que sigue opcional

### Bloques
- [x] 1. Funciones estadísticas (Wilson, beta-binomial con empirical Bayes y kappa de Cohen con IC)
- [x] 2. fsrs y mcqGrade
- [x] 3. sampler, distractors y structure
- [x] 4. behavior, difficulty (Elo) y rasch en Web Worker
- [x] 5. topics, bias, forgetting y agreement
- [x] 6. session, planner, streak, xp y party
- [x] 7. Taxonomías y diccionarios en JSON
- [ ] 8. Contenido demo, 300 preguntas en 6 lotes y 4 mazos con 200 tarjetas
- [x] 9. Generador de 300 alumnos simulados y alumno de la demo
- [x] 10. Prueba de recuperación de parámetros e informe, con 2 metas por debajo y su ajuste propuesto

### Bitácora por bloque
- Bloque 1. Normal, Wilson, beta, beta-binomial con empirical Bayes y kappa de Cohen con IC en src/engines/stats, más azar con semilla (D-043). Umbrales en src/config/thresholds.ts. 26 pruebas contra valores de referencia, entre ellas la de encogimiento con menor error que la proporción cruda (7.3). Cobertura de src/engines de 100% en líneas y 99% en ramas. npm run check exige 90%. ts-fsrs 5.4.2, comlink 4.4.2 y fast-check 4.10.2 instalados en el proyecto
- Bloque 2. src/engines/fsrs.ts con ts-fsrs 5, modo examen, retención de 0.93 en los últimos 30 días, sanguijuelas, cola del día con límites y hermanas enterradas, y carga futura a 30 y 60 días (D-044). src/engines/mcqGrade.ts con la tabla de 7.1. src/engines/studyDay.ts con corte a las 4 a. m. de Mérida. Propiedades con fast-check. Otra vez nunca vence después que Bien, nada vence después del ENARM en modo examen, y la tabla de opción múltiple es determinista y completa contra un oráculo escrito desde 7.1. 50 pruebas de motores
- Bloque 3. src/engines/sampler.ts con los modos canónico, diverso, dirigido y estratificado, correcta en la posición menos usada y regla de 200 exposiciones para variantes en el examen. src/engines/distractors.ts con atracción, intervalo de Wilson y no funcional bajo 5% tras 100 exposiciones. src/engines/structure.ts con polaridad, tarea, formato, doble negación, rangos de resaltado sobre el texto original y probable mala lectura. El diccionario de negaciones y tareas se adelantó del bloque 7 a src/demo/content/structure-dict.json porque el motor lo necesita, marcado pendiente de revisión médica, con su esquema en src/data/schemas/content.ts. Propiedades del muestreo con fast-check. 85 pruebas de motores
- Bloque 4. src/engines/behavior.ts con ritmo personal, puntaje z, adivinanza rápida, percentil 25, dirección de cambios, fatiga entre sesiones largas, distracción, franjas horarias y calibración de la confianza. src/engines/difficulty.ts con Elo, estados de calibración, bandas y modo adaptativo. src/engines/rasch.ts con JML y corrección de Wright, en un Web Worker con Comlink (src/workers). Correlación de Pearson en stats. En pruebas de humo, Rasch recupera dificultades con r mayor a 0.95 con datos completos y mayor a 0.9 con 40% de cobertura, y Elo con r mayor a 0.8 (D-045). La recuperación formal de 14.2 llega en el bloque 10. 109 pruebas de motores y worker
- Bloque 5. src/engines/topics.ts con dominio por tema encogido hacia su rama, prioridades con porqué y acción, y análisis por estructura. src/engines/bias.ts con atracción por etiqueta contra la línea base y 7 indicadores de conducta (D-042, D-046). src/engines/forgetting.ts con las 9 reglas de 7.9, causa reportada contra señales y patrones de 5 hallazgos en 14 días. src/engines/agreement.ts con muestra de 20%, kappa global y por etiqueta, y vocabulario sesgos o trampas. Pruebas de humo de detección de sesgo sembrado sin falsos positivos y de encogimiento por tema. 135 pruebas de motores, 207 en total
- Bloque 6. src/engines/session.ts con selección por tiempo y proporciones, e intercalado sin más de 2 seguidos del mismo subtema ni confusables seguidos. src/engines/planner.ts con plan del día y la semana y aviso de sobrecarga con opciones y su efecto. src/engines/streak.ts con corte a las 4 a. m. y congeladores. src/engines/xp.ts con premios, tope diario, multiplicador y curva de niveles ajustada con un alumno constante simulado. src/engines/party.ts con tabla semanal, retos, duelos y códigos (D-047). Propiedades con fast-check para XP, racha e intercalado. 163 pruebas de motores, 235 en total
- Bloque 7. En src/demo/content, todo marcado pendiente de revisión médica. topic-taxonomy.json con las 4 ramas de peso igual, 40 temas (10 por rama), 118 subtemas con claves únicas y 13 relaciones de tema base. bias-taxonomy.json con los 24 sesgos de Ricardo, la definición de cada distractor para el médico, 21 usables como etiqueta y 8 con señales de conducta (D-042). bias-tips.json con un consejo base por sesgo. Cargador validado en src/demo/content/index.ts y 8 pruebas de conteos y referencias cruzadas
- Bloque 8, lote 1. src/demo/content/questions/batch-01.json con 50 preguntas (13 de Medicina interna, 12 de Pediatría, 13 de Ginecología y obstetricia y 12 de Cirugía general), 11 negativas o de excepción y un caso seriado de hiperplasia prostática con 3 preguntas. Cada pregunta con 10 opciones, una correcta, 9 distractores con sesgo de la lista de Ricardo y su justificación, set canónico de 4, explicación de 80 a 150 palabras y referencia GPC solo por título, por verificar. Esquema DemoQuestionBatchSchema y prueba que valida cada lote, incluida la polaridad contra el motor de estructura. Pendiente de revisión médica
- Bloque 8, lote 2. src/demo/content/questions/batch-02.json con 50 preguntas (12 de Medicina interna, 13 de Pediatría, 12 de Ginecología y obstetricia y 13 de Cirugía general), 11 negativas o de excepción y un caso seriado de oclusión intestinal por adherencias con 3 preguntas. Temas nuevos respecto al lote 1, como insuficiencia cardiaca, fibrilación auricular, reumatología, EPOC, cirrosis, VIH, anticoagulación, cardiopatías congénitas, leucemia, eclampsia, enfermedad trofoblástica, menopausia, hernias, colon y vascular. Primer uso de la falacia del apostador. Validado también contra el motor real de estructura (polaridad y tarea). Pendiente de revisión médica
- Bloque 8, lote 3. src/demo/content/questions/batch-03.json con 50 preguntas (13 de Medicina interna, 12 de Pediatría, 13 de Ginecología y obstetricia y 12 de Cirugía general), 11 negativas o de excepción y un caso seriado de control prenatal con 3 preguntas (ácido fólico, tamizaje y profilaxis anti D). Cubre los subtemas que faltaban, como dislipidemia, asma, lesión renal aguda, hepatitis B, Helicobacter, sepsis, leucemia promielocítica, cefalea, lupus, abstinencia alcohólica, sepsis neonatal, anemia ferropénica, criptorquidia, virus del papiloma, anticoncepción hormonal, cáncer de páncreas, hernia incisional, hemorroides, fisura, aneurisma de aorta, ayuno y líquidos posoperatorios y cáncer de próstata. Con esto los 118 subtemas tienen al menos una pregunta. Validado contra el motor real de estructura. Pendiente de revisión médica. Ricardo lo guardó en el commit f7f00e4
- Bloque 8, lote 4. src/demo/content/questions/batch-04.json con 50 preguntas (12 de Medicina interna, 13 de Pediatría, 12 de Ginecología y obstetricia y 13 de Cirugía general), 11 negativas o de excepción y un caso seriado de infarto inferior con afección del ventrículo derecho con 2 preguntas. Segunda mirada a subtemas con una sola pregunta, como edema agudo de pulmón, dímero D, antituberculosos, várices, dengue, síndrome serotoninérgico, estado hiperosmolar, profilaxis en VIH, meconio, realimentación, varicela, crup, conducto arterioso, corioamnionitis, placenta previa, ectópico roto, agenesia mülleriana, absceso mamario, apendicitis en el embarazo, seudoquiste, vólvulo, hernia femoral, vía aérea en trauma, bazo, diverticulitis complicada, isquemia aguda y litiasis infectada. Pendiente de revisión médica
- Revisión de IA de los lotes 1 a 4. Workflow con dos revisores por paquete de 10 preguntas, uno clínico y otro de calidad del reactivo, y un verificador escéptico por hallazgo medio o alto. Las 40 revisiones terminaron con 194 hallazgos, 3 altos, 43 medios y 148 bajos. Solo 2 alcanzaron verificador antes del límite de uso de la cuenta. Los 3 altos son b1-q35 opción g (exclusión de otras causas en Rotterdam), b2-q03 opción h (losartán en una lista de fármacos que reducen la mortalidad) y b3-q23 opción i (antecedente familiar en una lista de características de la crisis febril simple). Todo queda en docs/revisiones/revision-ia-lotes-1-a-4.json, con el paquete de cada hallazgo para retomarlo. No sustituye la revisión médica
- Correcciones bajas de la revisión de IA de los lotes 1 a 4. Se atendieron los 148 hallazgos bajos. 145 corregidos y 3 sin cambio con su razón en el campo resolution. Los de contenido clínico incluyen umbrales de potasio y pH en cetoacidosis con el consenso internacional reciente (b1-q04), osmolalidad de 349 y umbral de 300 (b4-q11), cortes de edad de 1 a menos de 10 años (b4-q23), TAES y dosis de la norma (b1-q10), angiotomografía y tenecteplasa en el infarto cerebral (b1-q12), meta de LDL menor de 55 (b3-q01), orquidopexia entre 6 y 12 meses (b3-q16), masaje uterino y compresión bimanual por separado (b1-q30 y b3-q38) y datos que faltaban en 7 viñetas. Los demás son etiquetas de sesgo que no coincidían con su justificación, opciones que delataban la clave por su forma, sets canónicos con pares opuestos y la doble negación de b3-q22. Sin cambio, b1-q30 y b2-q35 porque su tarea y polaridad siguen la regla del motor de estructura, y b4-q34 porque la taxonomía no tiene subtema de mama benigna
- Bloque 9. src/demo/content/bank.ts convierte los lotes en casos, preguntas y opciones con IDs estables (src/demo/stableId.ts). src/demo/generator con el modelo del alumno (habilidad general y por rama, propensión por sesgo, mala lectura de negaciones, velocidad de lectura, fatiga, constancia y calibración de la confianza), la simulación día por día con opciones del muestreador real y tarjetas con el FSRS real, la cohorte de 300 alumnos y el alumno de la demo con 60 días y sus patrones sembrados (anclaje, mala lectura, fatiga después de 40 minutos y Pediatría débil). Su bitácora sale con IDs estables, validada por el esquema de eventos y con XP del motor real. Siembra en enarm_demo con src/data/usecases/seedDemo.ts, generada en un Web Worker y disparada desde Perfil (D-052). Nueva señal negationSignal en el motor de conducta. Pruebas unitarias del banco, el generador, la siembra en Dexie y el worker, y una e2e que genera y regenera la demo en Chromium en teléfono y escritorio
- Bloque 10. tests/recovery/recovery.test.ts e informe en docs/recovery-report.md con 3 semillas (npm run recovery-report). Rasch de 0.985 a 0.987, Elo de 0.976 a 0.980, encogimiento por tema que baja el error 53 a 56%, mala lectura con 89 a 100% de detección y 0 a 0.8% de falsos positivos. No cumplen sesgos con el método de 7.4 (marca 47 a 54% sin propensión) ni fatiga (61 a 73% de detección). Ajuste de sesgos propuesto e implementado como opción (D-051) y dos opciones para fatiga en el informe
- Migración para trabajar desde GitHub (D-049). README.md, docs/contenido-demo.md, scripts/content (check-draft, merge-batch y review-chunks), content-drafts, .claude/workflows/enarm-demo-review.js y .github/workflows/check.yml. Se quitó .claude.zip porque .claude/launch.json ya está en el repositorio

- Revisión independiente de los bloques 9 y 10. Un subagente que no escribió el código encontró 3 hallazgos medios, 1 de honestidad en el informe y 7 bajos, ninguno alto. Se corrigieron todos. Eventos en el futuro al sembrar (ahora se corta en el momento actual), excepción de Regenerar escrita en PLAN.md 2.2, siembra doble bloqueada, faltante de afirmativas en negationSignal, prueba de los patrones del alumno de la demo con los motores reales, pruebas de recuperación menos frágiles y atadas a la versión del generador, etiquetas vacías y verdad por tema en la recuperación. El informe ahora valida la variante de sesgos con semillas nuevas y con otro modelo de sesgo (D-051). La desviación de las tarjetas de la cohorte queda como pregunta

- Mazos de Paco (D-053). scripts/content/import-paco-decks.ts convierte los .apkg con fflate y node:sqlite, sanea el HTML con DOMPurify (src/data/content/cardHtml.ts, lista corta de etiquetas, sin estilos ni recursos externos) y ubica cada nota en la taxonomía por su etiqueta. Quedan en src/demo/content/decks (Medicina interna 2,122 notas, Ginecología y obstetricia 1,526, Urgencias 123) y sus 302 imágenes en public/demo-media. Solo se quitó una imagen externa de drugs.com. 96 notas quedan sin tema (72 de Urgencias, que no es rama todavía). La siembra de la demo usa estas 3,771 tarjetas en lugar de las sintéticas, que quedan solo como respaldo en pruebas. Las imágenes no entran a la precarga del service worker y se guardan al verlas. Pruebas del saneador, del contenido de los mazos y de sus entidades, y la e2e de la demo pasa con los mazos reales. Una revisión independiente corta no encontró nada alto. Se corrigieron sus 2 medios (rutas de imagen relativas y claves de nota por posición, ahora por guid) y sus bajos (prueba de que lo guardado ya está saneado, días locales al cortar con notAfter, worker fuera de la precarga y datos de D-053)

### Respuestas de Ricardo (Fase B)
- Sesgos. Aprobó el ajuste (D-051). Ya es el método por defecto del motor
- Fatiga. Pidió probar la tendencia. Hecho (D-054). Los dos métodos cumplen la meta con la fatiga que sí pesa en las respuestas. Falta que decida si la tendencia pasa a ser el método por defecto
- Mazos. Paco tiene los mazos de Pediatría y Cirugía general. Están en su computadora y desde la nube no se puede leer su disco, así que hay que traerlos de otra forma (ver la pregunta abierta)
- Mapeo de temas de Ginecología y obstetricia. Aprobado
- Tarjetas de la cohorte. Sin historial por ahora, con la estructura lista para guardarlo después (opción cohortCardHistory, D-052)

### Preguntas abiertas para Ricardo (Fase B)
1. Fatiga (D-054). ¿La tendencia pasa a ser el método por defecto y la meta de 14.2 se mide sobre la fatiga que pesa en las respuestas? Recomiendo que sí
2. Mazos de Pediatría y Cirugía general. Esta sesión corre en la nube y no ve tu computadora. Recomiendo subir la carpeta de Paco a Google Drive y pasarme el enlace, porque tengo acceso a Drive y los archivos pesan más de lo que acepta la carga web de GitHub (25 MB). Otra opción es correr tú el script de conversión en tu computadora y hacer push

## Fase A. Esqueleto, datos y proxy

### Respuestas de Ricardo al aprobar
- Aprueba el examen sin preguntas repetidas (D-012)
- Contenido demo de hasta 500 preguntas con opciones etiquetadas con su lista de 24 sesgos cognitivos (D-029 y D-030)
- Él es médico y tiene dos médicos más para revisar el contenido demo (D-031)

### Bloques
- [x] 1. git, Vite con React y TypeScript estricto, ESLint, Prettier, Vitest y Playwright, scripts de 5.2
- [x] 2. Tailwind con tokens, modo claro y oscuro, componentes base, navegación inferior y 26 rutas con sus estados
- [x] 3. Esquemas zod, Dexie para enarm_real y enarm_demo, repositorios, bitácora de solo agregar y derivación
- [x] 4. PWA instalable con modo sin conexión básico
- [x] 5. Proxy Hono con /health, modo simulado y lectura de server/.env.local
- [x] 6. Selector de rol sin login e interruptor de base real o demo
- [x] 7. npm run dev con app y proxy juntos

### Bitácora por bloque
- Bloque 1. Versiones verificadas con npm view, iguales a D-020. Dependencias nuevas en D-032. Chromium de Playwright dentro del proyecto (D-033). Tres proyectos de TypeScript (D-034). typecheck, lint, 1 prueba unitaria y 1 prueba e2e en teléfono y escritorio pasan. eval-ai, demo-seed y demo-reset existen como marcadores que fallan con un aviso de la fase en que llegan
- Bloque 2. Tokens en src/ui/tokens.css (D-037), claro, oscuro y según el sistema, con selector en Perfil que se recuerda. Componentes base al estilo shadcn sobre Radix (botón, tarjeta, etiqueta, opciones y barra de progreso), etiquetas Demostración y Datos simulados. Navegación inferior de 5 secciones que en escritorio pasa a riel lateral. Registro de las 26 pantallas con rutas en español (D-035). Estados vacío, cargando, error, sin conexión y calibrando con cuánto falta, visibles en cada esqueleto con ?estado=. Áreas de médico y admin con carga diferida. Foco al título al navegar y salto al contenido. 4 pruebas unitarias y 60 e2e (26 rutas, navegación, estados, tema y ruta desconocida, cada una en teléfono y escritorio, con axe sin violaciones serias)
- Bloque 3. Esquemas zod de las 25 entidades de 6.2 y de los 30 tipos de evento de 6.3 en src/data/schemas. Registro de tablas con sus índices de Dexie y prueba de que cada índice existe en su esquema. enarm_real y enarm_demo con Dexie versión 1, SimTruth solo en demo. Repositorios con interfaz y implementación Dexie. Bitácora de solo agregar protegida en el repositorio y en la base (D-038). recordEvent agrega y actualiza cachés en una transacción y rebuildDerivedState las reconstruye. Prueba de fronteras de src/engines. 34 pruebas unitarias. JavaScript inicial de 191 KB comprimido, bajo el presupuesto de 300 KB
- Bloque 4. vite-plugin-pwa con manifest en español, íconos provisionales y caché completa de la app (D-039). Aviso de versión nueva sin recarga automática. e2e de manifest, service worker activo, instalable según Chromium y apertura sin conexión con aviso, en teléfono y escritorio. 66 e2e en total
- Bloque 5. Proxy Hono en server/ con /health, modo real o simulado según server/.env.local, --mock para forzar simulado, Host solo localhost y tamaño máximo (D-040). server/.env.example sin valor. Cliente en src/ai/client.ts y etiqueta del modo de IA en encabezado y Perfil. 16 pruebas nuevas del proxy y del cliente, entre ellas la que revisa que escucha solo en 127.0.0.1. e2e que confirma IA simulada y cero peticiones fuera de localhost
- Bloque 6. Pantalla 26 con selector de rol sin login que lleva a la entrada de cada rol. Navegación propia de médico y admin. Guarda de rol en las áreas de médico (médico y admin) y admin (solo admin). Interruptor Mi cuenta o Demostración en Perfil, con franja Datos simulados en toda pantalla de la demo y botón para volver. Perfil abre la base activa y dice su nombre. 17 pruebas unitarias de app y 76 e2e
- Bloque 7. npm run dev usa concurrently para levantar la app en 127.0.0.1:5173 y el proxy en 127.0.0.1:8787. npm run check:dev lo comprueba de punta a punta (app, proxy y /api de la app hacia el proxy) y apaga todo al terminar. Pasó
- Criterio de secretos. scripts/secrets.ts busca en el build el nombre de la variable de la clave, el nombre prohibido, el prefijo sk-ant-, archivos .env y, si existe server/.env.local, el valor de la clave sin imprimirlo. Corre al final de npm run build y en tests/security/no-secrets.test.ts, que construye en una carpeta temporal y tiene un control que planta un secreto falso

### Evidencia por criterio de aceptación
| Criterio | Prueba | Resultado |
|---|---|---|
| npm run check pasa | npm run check (typecheck de 3 proyectos, ESLint y Vitest) | Pasa. 71 pruebas en 13 archivos |
| Navega entre todas las rutas sin instalar nada | tests/e2e/smoke.spec.ts abre las 26 rutas, revisa título, navegación y axe, recorre la barra inferior, los 5 estados, el tema y la ruta desconocida | Pasa en teléfono y escritorio |
| Se puede instalar como PWA en localhost | tests/e2e/pwa.spec.ts revisa manifest e íconos, service worker activo, instalable según Chromium (Page.getInstallabilityErrors vacío) y apertura sin conexión | Pasa. Falta la confirmación manual de Ricardo (ver preguntas) |
| Una prueba de humo de punta a punta pasa (15.3) | smoke.spec.ts | Pasa |
| Ningún secreto en dist | tests/security/no-secrets.test.ts con scripts/secrets.ts, que además corre al final de npm run build | Pasa, con control positivo |
| El proxy escucha solo en localhost | server/src/server.test.ts revisa la dirección real 127.0.0.1. app.test.ts cubre Host, Origin, JSON y tamaño máximo | Pasa |
| La bitácora no se edita ni se borra | src/data/repos/dexie/eventRepo.test.ts revisa la interfaz, el código y 8 caminos de Dexie que fallan | Pasa |
| Los motores no importan React ni Dexie | tests/architecture/engine-boundaries.test.ts revisa la regla real de ESLint (lista blanca) y sigue las importaciones de forma transitiva | Pasa |
| npm run dev levanta app y proxy | npm run check:dev | Pasa |

### Conteo de pruebas al cierre
- Vitest. 71 pruebas en 13 archivos. Cobertura de líneas 78% en general, de 93 a 100% en la capa de datos (src/data/db, derive y repos). La meta de 90% aplica a src/engines desde la Fase B
- Playwright. 76 pruebas, 38 por proyecto en teléfono (390 por 844) y escritorio (1280 por 800). Todas con revisión de errores de consola y las de pantallas con axe sin violaciones serias ni críticas
- Capturas. 120 en docs/screenshots/fase-a. Las 26 pantallas más calibrando, error, Perfil en demostración y acceso por rol, cada una en teléfono y escritorio, claro y oscuro. Se regeneran con npm run screenshots

### Revisión independiente (15.1, paso 3)
- Un subagente que no escribió el código revisó los commits de la Fase A contra la especificación, PLAN.md y DECISIONES.md. Corrió npm run check y leyó todas las pruebas
- Sin hallazgos altos. Confirmó secretos bien guardados, bitácora protegida en dos capas y etiquetas de datos simulados en toda la demo
- 4 hallazgos medios y 6 bajos. Se corrigieron todos menos el repo remoto, que depende de Ricardo (D-041)
  - M1. npm run check falló 1 de 4 veces por tiempo en la prueba que carga ESLint. Ahora ESLint se carga una vez con 60 segundos de margen
  - M2. La frontera de motores tenía huecos (por ejemplo @/data/hooks traía Dexie de forma indirecta). Ahora es lista blanca con revisión transitiva
  - M3. Las fechas aceptaban varios formatos y eso rompía el orden de la bitácora. Ahora hay un solo formato
  - M4. No hay repo remoto. Queda como pregunta para Ricardo
  - B1. El proxy ya rechaza otros sitios (Origin) y exige JSON en escrituras
  - B2. Las e2e ya no reusan un proxy abierto que podría estar en modo real
  - B3. IDs de eventos monotónicos dentro del mismo milisegundo
  - B4. Los esquemas hacen cumplir borrador primero y anclaje
  - B5. Los casos clínicos son de solo agregar
  - B6. El contexto de datos ya no expone la base de Dexie

### Desviaciones y notas
- La confirmación manual de la instalación como PWA queda para Ricardo. El navegador sin ventana de las pruebas no muestra el botón de instalar, así que la evidencia automática es la revisión de instalabilidad de Chromium (D-039)
- Una vez, en la primera corrida completa después de las correcciones, una prueba de humo falló con un JSON incompleto al analizar con axe. No se repitió en 8 repeticiones de esa prueba ni en 3 corridas completas. Se agregó una espera a que la red quede quieta antes de cada análisis de axe. Si vuelve a pasar se investiga a fondo
- En las capturas de página completa del teléfono, la barra inferior se dibuja al final de la página para que no salga a media imagen. Es solo para las capturas
- El JavaScript inicial mide 191 KB comprimido. Cabe en el presupuesto de 300 KB de 14.4, pero las Fases B a E deben seguir cargando de forma diferida lo pesado

### Decisiones de la fase
- D-029 a D-031 con las respuestas de Ricardo y D-032 a D-041 de Claude. Todas en DECISIONES.md

### Preguntas abiertas para Ricardo
1. Repositorio remoto (D-003, M4). Hoy el código solo vive en tu computadora. Opciones, crear un repo privado vacío en github.com y pasarme la URL, o autorizar que instale GitHub CLI. Recomiendo la primera porque no instala nada global
2. Instalación como PWA. Cuando puedas, corre npm run build y luego npm run preview, abre http://127.0.0.1:4173 en Chrome y confirma que aparece el ícono de instalar en la barra de direcciones
3. Para la Fase B (D-029). Varios sesgos de tu lista describen la conducta al responder más que el atractivo de un distractor (Zeigarnik, fatiga de decisión, posición serial, statu quo sobre la primera respuesta, sobreconfianza, costo hundido, apostador y agrupamiento). Recomiendo medirlos con las señales de conducta de 7.6 además de usarlos como etiqueta donde aplique
4. Para la Fase B (D-029). ¿Conservamos como etiquetas aparte las trampas de formato de 13.1 que no son sesgos cognitivos, Secuencia y Comisión? Recomiendo que sí, porque son frecuentes en el ENARM y se pueden entrenar

## Fase 0. Entrevista, entorno y plan

### Hecho
- Leídos completos CLAUDE.md, docs/PROMPT_PROTOTIPO.md y prompts/flashcards_maestro.md
- Entorno verificado. Node v26.10.0 (Current, LTS a finales de octubre), npm 11.19.1, Git 2.56 con nombre y correo configurados. GitHub CLI no está instalado
- Carpeta del proyecto dentro de OneDrive y anidada dos veces. Ricardo aprobó moverla
- prompts/flashcards_maestro.md está vacío debajo de la marca
- Revisada la carpeta Mazos que señaló Ricardo. Seis mazos de Anki de tarjetas, ningún banco de opción múltiple. Se inspeccionaron estructura, tipos de nota y conteos desde una copia temporal fuera del proyecto, que se borró al terminar. Nada de su contenido entró al proyecto
- Entrevista de la sección 16 completa en cinco rondas (entorno, producto, aclaraciones del banco, examen e IA, y presentación). Las 17 respuestas están en DECISIONES.md
- Versiones del stack verificadas con npm view y registradas en D-020
- Escritos PLAN.md, DECISIONES.md, IDEAS.md y este archivo

### Evidencia
- Criterio. Cada respuesta de Ricardo está en DECISIONES.md. Ver D-001, D-002 y D-004 a D-019
- Criterio. PLAN.md permite empezar la Fase A sin volver a preguntar. Arquitectura, carpetas, modelo de datos, contratos de motores, bloques por fase con su prueba, umbrales y riesgos
- Criterio. No hay código todavía. La carpeta solo tiene documentos Markdown

### Revisión independiente (15.1, paso 3)
- Un subagente que no escribió los documentos los revisó contra la especificación
- Confirmó que las 17 respuestas están registradas, que ninguna decisión rompe las reglas no negociables y que no hay código
- Encontró 8 huecos en PLAN.md y se corrigieron todos
  - Pantallas de admin 24 y 25 sin fase. Quedan en la Fase D, bloque 7
  - Creación manual de mazos y compartir logro de Party. Quedan en la Fase C
  - Análisis de distractores sin motor. Nuevo motor distractors en la Fase B y alerta en la Fase E
  - Reglas 4.3 (calibrando) y 4.4 (trampas con kappa bajo) sin prueba. Pruebas agregadas
  - Regla 4.6 (etiquetas) sin prueba y amigos de Party sin etiqueta en Mi cuenta. Prueba agregada y D-028
  - Controles de seguridad del proxy sin prueba. Pruebas agregadas en las Fases A y D
  - Metas de 14.3 y 14.4 sin prueba propia en la Fase F. Una fila con su prueba para cada una
  - Funciones estadísticas fuera de la tabla de criterios de la Fase B. Fila agregada

### Pasos de cierre de 15.1 que no aplican en la Fase 0
- npm run check y e2e no existen todavía
- No hay pantallas que capturar
- No hay commit porque git init es la primera tarea de la Fase A

### Desviaciones
- Node 26 en lugar de una LTS vigente, por decisión de Ricardo (D-001)
- TypeScript 6.0.3 en lugar de 7.0.2 por compatibilidad con typescript-eslint (D-021)
- El examen de 280 no repite preguntas con el banco demo y avisa cuántas hay (D-012). Esto ajusta lo que se dijo en la entrevista

### Preguntas abiertas para Ricardo
- Contestadas el 2026-10-01 al aprobar la Fase A. Aprueba D-012 y él y dos médicos más revisan el contenido demo (D-031)

## Pruebas
- Ver el conteo al cierre de cada fase. Al cerrar la Fase A, 71 unitarias y 76 e2e, todas pasan
