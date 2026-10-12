# Hallazgos de la auditoría inicial (B1, plan del cambio V3)

Escrito el 2026-10-12 en el bloque B1 (D-119) y puesto al día al cerrar el bloque. El inventario de procesos está en procesos.md. Cada hallazgo lleva su gravedad, el proceso del inventario, dónde está y qué se hizo. Lo crítico y lo alto se corrige en B1 o queda asignado con su motivo al bloque que toca esa pantalla, como pide el plan.

Gravedad. Crítico es pérdida de datos, dinero o seguridad sin salida. Alto es una regla del proyecto o una promesa al alumno que no se cumple, o un dato que se puede perder o duplicar. Medio es una función incompleta o sin prueba que no rompe las demás. Bajo es cosmética, un texto o una limpieza.

## Cómo se auditó

- Inventario de los 17 procesos de la lista mínima de B1, más 5 fuera de ella, leyendo el código con un subagente de exploración (procesos.md)
- Recorrido automático de las 32 pantallas con cuatro roles (alumno con base vacía y alumno, médico, admin y dueño con la demo), en teléfono y computadora, con npm run audit:ui y AUDIT_OUT=docs/auditoria-v3/recorrido. Revisa consola, excepciones, peticiones fallidas, pantalla de error, h1, desborde lateral, axe (wcag2a, 2aa, 21aa, 22aa y best-practice), imágenes y textos rotos y el teclado, y da hasta 25 clics por pantalla. Sus cinco flujos con interrupciones también corrieron. El resultado está en la sección Recorrido automático
- Las e2e existentes (29 specs) y las nuevas de B1 corren en teléfono y computadora contra el build de producción. Las de nube corren contra un Supabase simulado dentro de Playwright (tests/e2e/cloud)
- Lo que no se puede correr desde la sesión queda dicho en la sección Qué no se auditó

## Hallazgos

| N. | Gravedad | Proceso | Qué pasa | Dónde | Qué se hizo |
|---|---|---|---|---|---|
| H01 | Alto | P01, P02, P13 | Al crear el perfil se otorgan solos los tres consentimientos opcionales (Party, análisis con IA y mejora anónima). Choca con 4.27 del plan. Efectos. Los errores del navegador se mandaban sin permiso y el tutor de pago arrancaba con la IA prendida | src/data/usecases/profile.ts, createProfile | Corregido en B1. Las finalidades opcionales empiezan apagadas y se prenden en Configuración, Privacidad. La pantalla de registro con cada permiso por separado llega en B9 y los textos legales en B16 |
| H02 | Alto | P12 | Suscripción y la portada marcan el examen completo como Próximamente aunque existe desde D-082 | src/features/billing/SubscriptionScreen.tsx (COMING_SOON) y src/features/landing/LandingScreen.tsx | Corregido en B1 |
| H03 | Medio | P07 | La descripción de la retroalimentación promete un botón para generar tarjetas que no existe | src/i18n/es-MX.ts, screens.feedback.description | Corregido en B1 el texto. El botón llega en B5 (comentario 1) |
| H04 | Medio | P01 | La prueba del SIGNED_IN rezagado dependía de un temporizador de 60 ms y fallaba con la máquina cargada | src/app/cloud.test.tsx y src/data/testing/fakeCloud.ts | Corregido en B1. El doble de prueba detiene el cierre de sesión hasta que la prueba lo suelta |
| H05 | Alto | P16, P04 | El mazo Mis errores y sus tarjetas se duplican entre dispositivos. Sus IDs salen del id local del perfil (errorIds en src/data/usecases/errorCards.ts), que es distinto en cada dispositivo, y la sincronización trae el mazo del otro dispositivo con su propio id | src/data/usecases/errorCards.ts, src/engines/sync.ts (toWire y fromWire) | Asignado a B14, que sincroniza ajustes, sesiones y hallazgos antes de lanzar (respuesta 93). Propuesta. Derivar los IDs estables por alumno de la cuenta (correo normalizado o id de la nube) y no del perfil local, con compatibilidad para los mazos que ya existen |
| H06 | Alto | P16 | Los ajustes del alumno y los mazos precargados que sigue no viajan entre dispositivos. users no está en SYNC_KINDS y nadie vuelve a aplicar los settings_changed | src/engines/sync.ts, src/data/usecases/cloudLink.ts | Asignado a B14 (respuesta 93) |
| H07 | Alto | P07 | El tope de 20 preguntas de Gratis solo se aplica en el navegador. Las funciones SQL free_daily_questions y grant_question_access no se usan. Regla de CLAUDE.md, límites de Gratis también en el servidor | src/features/shared/dailyLimit.ts, supabase/migrations/20261008000003_payments_referrals.sql | Asignado a B11, donde el banco pasa a la nube y la lectura va por función con el tope en el servidor (5.2). Hoy el banco es solo de demostración y vive en el navegador |
| H08 | Medio | P05, P10 | Los permisos importDecks y party de los planes no se revisan en ninguna pantalla | src/config/billing.ts, src/features/decks/ImportDeckCard.tsx, src/features/party/PartyScreen.tsx | Asignado a B8, que cierra Apuntes, Party e Importar mazos en Gratis |
| H09 | Medio | P10, P08 | Party no revisa el consentimiento party y las tarjetas con IA no revisan ai_analysis | src/features/party/PartyScreen.tsx, src/features/decks/AiCardsCard.tsx | Party a B7 y B8. Tarjetas con IA a B12, con la decisión de si generar desde un texto propio pide ese permiso |
| H10 | Medio | P01 | La foto de perfil no se sube a la nube, se convierte en iniciales | src/data/cloud/account.ts | Asignado a B2, que rehace las fotos de perfil y las sube a Supabase Storage |
| H11 | Bajo | P05 | Los submazos de Paco salen con nombres pegados, como AnticonceptivosyMPF y Hemorragias1T | src/demo/content/deckEntities.ts, subjectName | Asignado a B4, con una tabla de nombres legibles |
| H12 | Alto | P10 | Party corre completo en el navegador con seis compañeros simulados y el rival del duelo es simulado. Las tablas de grupos de Supabase no tienen cliente | src/data/usecases/party.ts, src/features/party/duels.ts | Asignado a B7, Party real |
| H13 | Alto | P15, P13 | Cualquier alumno puede pasarse a la base de demostración y generar datos desde Configuración, Cuenta. La bandera demoTools existe desde B0 y nadie la consulta | src/features/settings/SettingsScreen.tsx, src/app/layout/AppShell.tsx | Asignado a B3, que mueve eso al admin y lo esconde en producción con la bandera (5.4) |
| H14 | Medio | P14 | El banco, las etiquetas de sesgo, las asignaciones y los reportes viven solo en el navegador del médico. Un reporte no llega a un médico que use otro navegador | src/data/usecases/bank.ts, labeling.ts, contentReports.ts | Asignado a B11, banco en la nube, con el correo al médico asignado (respuesta 64) |
| H15 | Medio | P03, P04, P07, P10, P12 | Varias escrituras se lanzan sin manejo de error. Si IndexedDB falla al guardar una calificación, una respuesta, un reto o el pago simulado, no se avisa. ErrorState y OfflineState existen y ninguna pantalla los usa | src/features/review/ReviewScreen.tsx, simulator/QuestionScreen.tsx, SessionSummaryScreen.tsx, party/PartyScreen.tsx, billing/SubscriptionScreen.tsx, exam/ExamScreen.tsx | Asignado a B2, que define los estados de error junto al campo y los esqueletos de carga |
| H16 | Bajo | P05 | No hay exportación a .apkg, solo CSV | src/data/usecases/exportDecks.ts | Ya está en IDEAS.md (D-093). Fuera del plan |
| H17 | Medio | P15, P01 | El admin no puede liberar el dispositivo de un alumno ni editar las banderas desde la app. admin_release_device y saveRemoteFlags no tienen interfaz | src/features/admin | Liberar dispositivo a B9. Banderas a B3 |
| H18 | Medio | P08 | No hay Edge Function de IA. CLAUDE.md ya dice que el proxy de producción corre en Supabase, pero el alojado sigue siendo Node o Docker | server/src/hosted, supabase/functions | Asignado a B12 |
| H19 | Bajo | P07 | Practicar lo fallado solo existe desde los resultados del examen, no desde el resumen de la práctica | src/features/exam/ExamResultsScreen.tsx | Asignado a B5 |
| H20 | Bajo | P01, P14 | Las áreas de alumno y compartidas no tienen guarda de rol. Un médico puede abrir pantallas del alumno escribiendo la URL | src/app/router.tsx, src/app/layout/RoleGuard.tsx | No es un riesgo, el médico no ve datos de nadie. Se decide en B3 con la navegación por rol |
| H21 | Bajo | P01 | El comentario del enrutador dice que hay pantallas en esqueleto y ya no las hay | src/app/router.tsx | Corregido en B1 |
| H22 | Alto | P01, P12, P13, P16, P10 | Ningún proceso de nube tenía e2e. El build de e2e y el CI no tienen Supabase, así que entrada con enlace o código, dispositivo único, pagos, borrar la cuenta, referidos y sincronización corrían solo con pruebas unitarias y SQL | tests/e2e, playwright.config.ts | Corregido en B1 con un Supabase simulado dentro de Playwright y el proyecto cloud. Ver procesos.md y tests/e2e/cloud/README.md |
| H23 | Medio | P04, P07, P08, P11, P13, P14, P15 | Sin e2e de camino feliz. Pomodoro, días fáciles, sanguijuelas, posponer y adelantar, examen de 280, práctica por dificultad, practicar lo fallado, exportar mis datos, tutor con IA en un plan de pago, etiquetado con cola y kappa, usuarios y roles del admin | tests/e2e | Corregido en B1 con nueve specs nuevas (pomodoro, review-tools, full-exam, practice-filters, retry-missed, export-data, tutor-ai, physician-labeling y admin-users), 30 pruebas en teléfono y computadora, cada una con su camino feliz y su falla o límite |
| H24 | Medio | P04, P11 | En el teléfono, con la píldora del Pomodoro abierta, el encabezado de la sesión de repaso se salía de la pantalla (489 px en 390) y el botón Terminar sesión quedaba cortado. Lo encontró la e2e nueva del Pomodoro | src/app/layout/SessionHeader.tsx | Corregido en B1. El bloque de acciones del encabezado ya se encoge y se parte en dos renglones. La e2e del Pomodoro revisa que no haya desborde con la píldora abierta |
| H25 | Bajo | P14 | En el acuerdo del etiquetado el aviso Etiqueta guardada no cambia entre una etiqueta y la siguiente, así que no sirve como señal de que la última ya se guardó | src/features/physician/AgreementScreen.tsx | Asignado a B11, con el flujo editorial del médico |
| H26 | Bajo | P14 | El banco de demostración tiene 200 preguntas, así que el examen completo de 280 avisa del faltante y arma uno de 200. No es un defecto del examen, es el tamaño del banco | src/demo/content/questions | Se resuelve solo con el banco real de B11 |
| H27 | Medio | P12 | En el teléfono, cuando el cupo Fundador se llena, el botón Continuar con el precio regular no partía su texto (el botón base lleva whitespace-nowrap) y la pantalla se desbordaba a 458 px. Lo encontró la e2e de nube de pagos | src/features/billing/CloudBilling.tsx | Corregido en B1. Ese botón parte su texto, y la e2e revisa la accesibilidad con el botón a la vista |
| H28 | Bajo | P04, P07 | Las e2e review-tools y retry-missed dependen de la hora. El día de estudio corta a las 4 de la mañana de Mérida, así que una corrida entre las 3:40 y las 4:00 puede cambiar un conteo de tarjetas para hoy o reiniciar el tope de Gratis a medias. Los reintentos del CI lo tapan | tests/e2e/review-tools.spec.ts, tests/e2e/retry-missed.spec.ts | Asignado a B19. Fijar el reloj a una hora segura con page.clock, como ya hace pomodoro.spec |

## Recorrido automático

Corrido el 2026-10-12 sobre el build de B1 con npm run audit:ui, en 18 minutos.

| Qué | Resultado |
|---|---|
| Recorridos por pantalla | 10, cinco roles o estados por tamaño (alumno con base vacía, y alumno, médico, admin y dueño con la demo), 32 pantallas cada uno. Los 10 con 0 hallazgos. Los JSON están en recorrido/ |
| Flujos con interrupciones | 10 pasan, cinco por tamaño. Recargar a media práctica, volver con el navegador, sin conexión, doble clic al contestar y dos perfiles en el mismo dispositivo |
| Nube caída | 1 pasa en computadora, con 0 hallazgos. El build apunta a un proyecto de Supabase que no responde, se crea la cuenta en el navegador, abren las 32 pantallas y un médico con la sesión vencida entra sin red (AUDIT_CLOUD=down) |

Lo que el recorrido no distingue. Un alumno de pago, porque la demo no da planes de pago; eso lo cubren las e2e de tutor con IA y examen de 280. Cuentas reales de la nube, que cubren las e2e del proyecto cloud con el Supabase simulado.

## Qué no se auditó

- Pagos reales con Stripe y Mercado Pago, que piden las llaves del entorno (docs/PENDIENTES_DE_RICARDO.md) y se prueban en B10
- Otros navegadores que no sean Chromium, lectores de pantalla y teléfonos reales. Ricardo prueba en su iPhone y en un Android cuando B10 y B17 lo pidan
- Supabase real. Las e2e de nube corren contra el Supabase simulado. El esquema real se prueba con npm run test:sql
- Contenido médico. Fuera del alcance por la regla de no tocar el banco
