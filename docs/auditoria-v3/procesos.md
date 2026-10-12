# Inventario de procesos y subprocesos (B1, plan del cambio V3)

Escrito el 2026-10-12 al arrancar el bloque B1 (D-119). Sale de leer el código con un subagente de exploración y de correr la auditoría de recorridos y las e2e. Es la base de la auditoría inicial que pidió Ricardo (comentario 17) y se repite al final en B19. Los hallazgos con su gravedad están en hallazgos.md, en esta misma carpeta. Las rutas son relativas a la raíz del repo.


Rama claude/keen-hopper-4oj3c2 al cerrar B0. Las rutas son relativas a la raíz del repo.

## 0. Lo que vale para todos los procesos

- **Datos en el navegador.**
  - Dexie con dos bases, enarm_real y enarm_demo (src/data/databases.ts, src/data/db/tables.ts).
  - Son 33 tablas. simTruth solo existe en la demo.
  - La bitácora es la tabla `events`. La única caché derivada es xpCache (src/data/derive/derivations.ts).
  - Las preferencias viven en localStorage `enarm.preferences.v1` (src/app/preferences.ts): tema, rol, base, sessionUserId, apariencia y navCollapsed.
- **Nube opcional.**
  - Solo se activa con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY válidas (src/data/cloud/client.ts).
  - CloudBridge (src/app/cloud.tsx) se baja aparte. Si su archivo no baja, App.tsx pone la nube en `error`.
- **Qué se sincroniza.**
  - Viajan decks, notes, cards, outlines y widgetLayouts (en sync_records) y events (src/engines/sync.ts:34, src/data/sync/runSync.ts).
  - No viajan: users con sus ajustes, consents, officialScores, Party, aiArtifacts, aiCallLog, el banco, biasLabels, contentReports ni reviewAssignments.
  - subscriptions no se sincroniza; se refleja desde el servidor con my_plan.
- **Estados comunes.**
  - Cargando: useLiveData devuelve undefined y se muestra LoadingState.
  - Error al leer IndexedDB: se lanza al pintar y cae en RouteErrorScreen (src/app/layout/RouteFallbacks.tsx), que dice "Algo salió mal", ofrece recargar y llama a reportClientError('render').
  - ErrorState y OfflineState (src/ui/states/states.tsx) no los usa ninguna pantalla. Solo los usa ScreenPlaceholder, y ninguna ruta lo usa ya.
  - Sin conexión: hay un aviso global (src/app/layout/AppShell.tsx:158-163) y el estado de IA `offline` (src/ai/useAiStatus.ts).
  - Varias escrituras se lanzan con `void` y sin catch: ReviewScreen, QuestionScreen, SessionSummaryScreen, PartyScreen, el pago simulado de SubscriptionScreen y ExamScreen. Un fallo de IndexedDB ahí no se ve en pantalla.
- **Pruebas e2e.**
  - Configuración en playwright.config.ts. Proyectos mobile (390×844, táctil) y desktop (1280×800).
  - Corren contra el build de producción, con el proxy de IA en modo simulado (`node server/src/main.ts --mock --ephemeral`).
  - **Ese build no tiene Supabase.** Ni el CI (.github/workflows/check.yml, job e2e) ni el webServer ponen variables VITE_SUPABASE_*.
  - La fixture `consoleErrors` falla ante cualquier error de consola (tests/e2e/support/fixtures.ts).
  - Los roles se fijan por /rol o con presetPreferences; no hay cuentas Gratis, de pago, médico ni admin reales.
  - Solo un test se salta en teléfono: home.spec 'en computadora el saludo va en la barra…'. planner.spec y tutor.spec cambian de camino según el ancho.

## 1. Pantallas y enrutado

| N.º | Clave | Ruta | Área | Componente |
|---|---|---|---|---|
| 1 | onboarding | /bienvenida | student | features/onboarding/OnboardingScreen.tsx |
| 2 | home | / | student | features/home/HomeScreen.tsx (sin sesión, features/landing/LandingScreen.tsx) |
| 3 | review | /repasar | student | features/review/ReviewScreen.tsx |
| 4 | question | /simular/pregunta | student | features/simulator/QuestionScreen.tsx |
| 5 | feedback | /simular/retroalimentacion | student | features/simulator/FeedbackScreen.tsx |
| 6 | sessionSummary | /sesion/resumen | student | features/simulator/SessionSummaryScreen.tsx |
| 7 | simulatorSetup | /simular | student | features/simulator/SimulatorSetupScreen.tsx |
| 8 | exam | /simular/examen | student | features/exam/ExamScreen.tsx |
| 9 | examResults | /simular/examen/resultados | student | features/exam/ExamResultsScreen.tsx |
| 10 | progress | /progreso | student | features/progress/ProgressScreen.tsx |
| 11 | tutor | /tutor | student | features/tutor/TutorScreen.tsx |
| 12 | decks | /mazos | student | features/decks/DecksScreen.tsx |
| 13 | planner | /planificador | student | features/planner/PlannerScreen.tsx |
| 14 | party | /party | student | features/party/PartyScreen.tsx |
| 15 | profile | /perfil | shared | features/profile/ProfileScreen.tsx |
| 16 | subscription | /suscripcion | student | features/billing/SubscriptionScreen.tsx |
| 17 | questionBank | /medico/banco | physician | features/physician/QuestionBankScreen.tsx |
| 18 | questionEditor | /medico/editor | physician | features/physician/QuestionEditorScreen.tsx |
| 19 | agreement | /medico/acuerdo | physician | features/physician/AgreementScreen.tsx |
| 20 | aiDrafts | /medico/borradores | physician | features/physician/AiDraftsScreen.tsx |
| 21 | contentReports | /medico/reportes | physician | features/physician/ReportsScreen.tsx |
| 22 | bankImport | /medico/importar | physician | features/physician/BankImportScreen.tsx |
| 23 | aiCosts | /admin/costos | admin | features/admin/AiCostsScreen.tsx |
| 24 | demoData | /admin/demo | admin | features/admin/DemoDataScreen.tsx |
| 25 | adminSettings | /admin/configuracion | admin | features/admin/AdminSettingsScreen.tsx |
| 26 | roleSelector | /rol | shared | features/role/RoleSelectorScreen.tsx |
| 27 | settings | /configuracion | shared | features/settings/SettingsScreen.tsx |
| 28 | adminUsers | /admin/usuarios | admin | features/admin/AdminUsersScreen.tsx |
| 29 | explore | /mazos/explorar | student | features/explore/ExploreScreen.tsx |
| 30 | outlines | /apuntes | student | features/outlines/OutlinesScreen.tsx |
| 31 | rewards | /logros | student | features/rewards/RewardsScreen.tsx |
| 32 | privacyNotice | /privacidad | shared | features/legal/LegalScreen.tsx (PrivacyNoticeScreen) |
| 33 | terms | /terminos | shared | features/legal/LegalScreen.tsx (TermsScreen) |

Cómo enruta src/app/router.tsx:

- **Raíz.** createBrowserRouter con basename sacado de BASE_URL. La raíz es AppShell, con ErrorBoundary=RouteErrorScreen y HydrateFallback=InitialLoadingScreen. Cualquier otra ruta (`*`) va a NotFoundScreen.
- **Carga diferida.**
  - Cada pantalla de BUILT_SCREENS usa `lazy` con un import dinámico.
  - Las 33 tienen componente, así que ScreenPlaceholder ya no se usa. El comentario de la línea 1 del router está viejo.
  - /medico y /admin cargan en diferido su layout, PhysicianArea y AdminArea.
- **Guardas de rol.**
  - PhysicianArea deja pasar a physician, admin y owner. AdminArea deja pasar a admin y owner (src/app/layout/RoleGuard.tsx). Si no hay permiso, muestra un EmptyState de "sin acceso".
  - El rol sale de las preferencias. Sin nube se elige en /rol. Con nube lo pone CloudBridge leyendo user_roles, y /rol solo lo explica.
  - Las áreas student y shared no tienen guarda: un médico puede abrir pantallas del alumno escribiendo la URL.
- **Sesión.**
  - Cada pantalla la pide con RequireSession (src/features/shared/RequireSession.tsx). Sus estados son loading, signed-out (lleva a /bienvenida), demo-empty (lleva a Configuración) y ready.
  - Sin sesión, `/` muestra la portada. La bienvenida, y sin sesión también la portada y las páginas legales, se pintan sin navegación.
- **Navegación por rol** (src/app/navigation.ts).
  - NAV_BY_ROLE: el alumno tiene 5 secciones abajo y el resto en el riel; el médico tiene banco, acuerdo, borradores, reportes, perfil y configuración; admin y owner ven lo del alumno más el grupo admin.
  - HOME_BY_ROLE manda al médico a /medico/banco.
- **Avisos globales en AppShell:** demo (con botón para volver a Mi cuenta), sin conexión, OtherDeviceNotice, DeviceLimitNotice, ConfigUpdateNotice, NoticeUpdateNotice, OrganizationSync, BadgeToast (diferido) y PwaUpdatePrompt.

## 2. Fichas por proceso

### P01. Registro, entrada con enlace o código, Google, dispositivo único y salida

- **Pantallas:** / (portada), 1 /bienvenida (pestañas Crear cuenta y Entrar), 15 /perfil (Cerrar sesión, CloudStatus), 26 /rol, avisos OtherDeviceNotice y DeviceLimitNotice.
- **Archivos:**
  - Pantalla: src/features/onboarding/OnboardingScreen.tsx (CreateAccountForm, LoginForm, LinkSentCard), src/features/shared/EmailCodeForm.tsx, src/features/profile/AccountSettings.tsx (AccountCard, CloudStatus).
  - Usecases: src/data/usecases/account.ts (registerAccount, findAccountByEmail), profile.ts (createProfile), cloudLink.ts (linkCloudIdentity, pushLocalAccount).
  - Nube: src/data/cloud/account.ts (requestEmailLink, verifyEmailCode, readCloudIdentity, saveCloudAccount, recordPrivacyAcceptance, signOutCloud), src/data/cloud/device.ts.
  - App: src/app/cloud.tsx, cloudState.ts, deviceGuard.ts, preferences.ts (signIn, signOut), session.ts, layout/OtherDeviceNotice.tsx, layout/DeviceLimitNotice.tsx.
- **Dexie:** users, accounts, consents, events.
- **localStorage:** enarm.preferences.v1, enarm.device-id.v1, enarm.device-claim.v1, enarm.device-session.v1, sb-*-auth-token.
- **Nube:**
  - Auth: signInWithOtp (shouldCreateUser, alias), verifyOtp de tipo email, getSession, signOut con scope local.
  - Tablas: user_roles, profiles, private_accounts, privacy_acceptances, platform_settings (admin_overrides, feature_flags), device_sessions, device_claims.
  - RPC: claim_device, log_rejected_claim.
  - Trigger handle_new_user (20261002000001_platform.sql). Barrera del dispositivo en 20261008000001_device_barrier.sql.
- **Eventos:** 3 consent_changed, todos granted, al crear el perfil. Entrar, salir y el dispositivo no emiten nada.
- **Estados:**
  - Validación en línea: alias, correo, aviso y correo ya usado (t.account.emailTaken). Botón ocupado mientras se crea.
  - Enlace enviado, fallido o rate_limited. Código inválido, limitado o fallido.
  - Con la nube caída, "seguir en este navegador". Errores de nube con reintento de 15 s a 5 min.
  - Avisos de otro dispositivo y de límite diario con hora de reintento. Teléfono y computadora iguales.
- **e2e y auditoría:**
  - tests/e2e/onboarding.spec.ts 'de la portada a una cuenta con sesión, con validación, y vuelve a entrar con el correo'. Cubre el camino feliz local, la falla de validación, salir y volver a entrar con el correo local.
  - tests/audit/flows.spec.ts 'dos perfiles en el mismo dispositivo no se ven los datos'.
  - tests/audit/cloud-down.spec.ts 'nube caída. Se crea la cuenta en el navegador y todas las pantallas abren' (solo con AUDIT_CLOUD=down).
  - tests/e2e/roles.spec.ts.
- **Otra cobertura:**
  - Unitarias: src/app/cloud.test.tsx (dispositivo único, rol, aviso y configuración del admin), src/app/deviceGuard.test.ts, src/data/cloud/account.test.ts y device.test.ts, src/data/usecases/account.test.ts, cloudLink.test.ts y acceptedNotice.test.ts, OnboardingScreen.test.tsx, OtherDeviceNotice.test.tsx, DeviceLimitNotice.test.tsx.
  - SQL: supabase/tests/device_barrier_test.sql y rls_test.sql.
- **Huecos:**
  - Sin e2e del enlace, del código, de la unión en un segundo dispositivo, del dispositivo único ni del límite diario.
  - Sin e2e de "correo ya registrado" ni de "no hay cuenta".
  - Google no existe: no hay signInWithOAuth.
  - El admin no puede liberar un dispositivo: admin_release_device y admin_device_claims no tienen interfaz.

### P02. Bienvenida y primer uso

- **Pantallas:**
  - / (portada), 1 /bienvenida (meta diaria, datos opcionales, un solo aviso), /privacidad y /terminos en otra pestaña.
  - Inicio, Progreso y Tutor calibrando.
  - Repasar sin mazos, que manda a Mazos.
  - Simular, que siembra el banco demo al entrar (ensureDemoBank).
- **Archivos:** LandingScreen.tsx, OnboardingScreen.tsx, src/features/profile/AccountDetailsFields.tsx, src/data/usecases/bank.ts, src/app/layout/OrganizationSync.tsx (ensurePreloadedTree), src/app/layout/NoticeUpdateNotice.tsx.
- **Dexie:** users, accounts, consents, events. La primera visita a Simular escribe cases, questions y options.
- **Nube:** la misma que P01.
- **Eventos:** 3 consent_changed.
- **Estados:** calibrando (CalibratingNote) en análisis y widgets; Repasar vacío con t.review.noDecksTitle; demo-empty en la demo; en la demo, Bienvenida solo muestra una nota.
- **e2e:**
  - onboarding.spec.
  - tests/e2e/calibrating.spec.ts 'un alumno nuevo ve calibrando con cuánto falta en cada análisis y widget'.
  - rewards.spec 'un alumno nuevo ve sus misiones en cero y la liga de partida'.
  - tutor.spec 'sin datos el tutor calibra, no inventa hipótesis y se abre desde el menú'.
  - review.spec, en el paso de Repasar sin mazos.
  - legal.spec 'en la bienvenida el aviso se abre en otra pestaña y el formulario no se pierde'.
- **Huecos:** no hay recorrido guiado ni elección de mazos; los consentimientos no se piden (hallazgo 1); el aviso de versión nueva no tiene e2e.

### P03. Inicio

- **Pantalla:** 2 / (Dashboard).
- **Archivos:**
  - src/features/home/HomeScreen.tsx (DailyGoalCard, DueCard, PlanCard, MissionsSection), sections/ReviewLoadCard.tsx, widgets/AnalysisWidgets.tsx (BiasPatternWidget, WeakTopicsWidget), widgets/HeatmapWidget.tsx, snapshot.ts.
  - src/features/party/PartyWidget.tsx, src/features/rewards/useRewards.ts.
  - src/app/layout/HeaderStats.tsx, LevelLadderDialog.tsx, BadgeToast.tsx.
  - Motores: monthlyLoad, streak, studyDay, suspension, xp, rewards; además progress/analysis y focusItems.
- **Dexie:** solo lee events, decks, cards, accounts, subscriptions, users y Party.
- **Nube:** ninguna directa.
- **Eventos:** ninguno.
- **Estados:** LoadingState; calibrando en widgets; sin conexión con el aviso global; error en la pantalla de error de ruta.
- **e2e:**
  - home.spec 'Inicio muestra cada parte del diseño y el plan lleva a Suscripción'.
  - home.spec 'Inicio en modo oscuro pasa la revisión de accesibilidad'.
  - home.spec 'en computadora el saludo va en la barra, el menú se oculta y el heatmap cabe completo' (solo computadora).
  - smoke 'con sesión la raíz es el tablero de Inicio con su navegación'.
  - review.spec (Inicio cuenta las 3 tarjetas), rewards.spec 'las misiones de hoy salen en Inicio sin agregarlas', tutor.spec (Inicio resume temas y sesgos).
- **Otra cobertura:** HomeScreen.test.tsx, snapshot.test.ts, AnalysisWidgets.test.tsx, chartScale.test.ts, analysisSettings.test.ts.
- **Huecos:** no hay e2e de falla.

### P04. Repaso con FSRS, carga diaria, días fáciles, temporizador, sanguijuelas y errores al repaso

- **Pantallas:** 3 /repasar (pestañas Repasar, Mazos, Explorar y Apuntes); 27 /configuracion?seccion=study.
- **Archivos:**
  - src/features/review/: ReviewScreen.tsx, ReviewSetup.tsx, ReviewCounters.tsx, DailyLoadPanel.tsx, OverdueTools.tsx, LeechPanel.tsx, CardTimerBar.tsx, useCardTimer.ts, study.ts, selection.ts, schedulerConfig.ts, sendErrors.ts, errorCardContent.ts.
  - src/features/profile/StudyDailyFields.tsx (CardTimerFields, EasyDaysFields) y AccountSettings.tsx (StudyForm).
  - Usecases: organize.ts (setSuspended), reschedule.ts, errorCards.ts (queueErrorCards), profile.ts (updateProfile), aiCards.ts (resolveControversy).
  - Motores: fsrs, counters, dailyLoad, guideProfile, easyDays, leech, reschedule, rescheduleLog, suspension, studyDay, xp, cardQuality, deckTree.
- **Dexie:**
  - events: el estado FSRS sale de card_reviewed.
  - cards, notes, decks, users, subscriptions (FeatureGate), xpCache.
  - Errores al repaso escribe decks, notes y cards con IDs estables.
- **Nube:** ninguna directa; viaja con P16.
- **Eventos:** session_started (review), card_reviewed, xp_awarded, cause_reported (card), session_ended, cards_suspended (manual o leech), cards_unsuspended, cards_rescheduled (spread, postpone, advance, undo), settings_changed, card_controversy_resolved, visibility_changed, pomodoro_*.
- **Estados:**
  - LoadingState. Vacío: sin mazos, nada pendiente y fin de sesión (doneTitle).
  - Calibrando en DailyLoadPanel.
  - FeatureGate overdueTools, guideProfile, newPerDaySuggestion, easyDays y cardTimer, hoy abiertos en todos los planes.
  - Sin conexión funciona local. No hay manejo de error al guardar una calificación.
- **e2e:**
  - review.spec 'repasa con confianza, califica, reporta la causa de un fallo y gana XP'.
  - daily-load.spec 'contadores, temporizador, atrasos repartidos y deshacer' y 'el perfil guía y la sugerencia de nuevas viven en los límites de hoy'.
  - perf.spec 'una sesión de 200 tarjetas con el procesador 4 veces más lento sigue fluida'.
  - exam.spec 'examen de 20 con descarte y marca, resultados y errores al repaso'.
  - explore.spec 'busca, filtra, suspende por lote y Repasar lo respeta'.
- **Otra cobertura:**
  - Pantallas: ReviewScreen.test.tsx, ReviewScreen.daily.test.tsx, ReviewScreen.load.test.tsx, ReviewCounters.test.tsx, StudyForm.daily.test.tsx, useCardTimer.test.ts, study.test.ts, selection.test.ts.
  - Motores: fsrs*.test.ts, easyDays.test.ts, leech.test.ts, reschedule*.test.ts.
  - Usecases: reschedule.test.ts, organize.test.ts, errorCards.test.ts.
- **Huecos:**
  - Sin e2e de días fáciles, sanguijuelas, posponer o adelantar.
  - Sin e2e de errores al repaso desde la práctica ni con errorsToReview apagado.
  - Sin e2e de Pomodoro en el repaso. Ninguna e2e de falla.

### P05. Mazos, importar y exportar .apkg y CSV, y catálogo (incluye Explorar)

- **Pantallas:** 12 /mazos y 29 /mazos/explorar.
- **Archivos:**
  - src/features/decks/: DecksScreen.tsx, useDeckCatalog.ts, followed.ts, OwnDecksCard.tsx, DeckEditorDialog.tsx, DeckOrganizer.tsx, ImportDeckCard.tsx, ExportDecksCard.tsx, AiCardsCard.tsx, CardQualityHints.tsx.
  - src/features/explore/: ExploreScreen.tsx, BulkActions.tsx, FilterPanel.tsx, ResultList.tsx, TagTree.tsx, useExploreData.ts, view.ts.
  - Usecases: decks.ts (followDeck, unfollowDeck, ensurePreloadedTree), manualDecks.ts, importDeck.ts, exportDecks.ts, organize.ts, aiCards.ts.
  - Importación: src/data/import/ (parseFile, apkg, csv, xlsx, docx, pdf, zip, zstd, protobuf, limits, exportCsv). Worker: src/workers/import.worker.ts e importClient.ts.
  - Contenido: src/demo/content/decks/*.json y deckEntities.ts.
- **Dexie:** decks, notes, cards, users (followedDecks), events, aiArtifacts, aiCallLog.
- **Nube:** sync_records con P16; el proxy de IA para las tarjetas con IA.
- **Eventos:** settings_changed (seguir o dejar), deck_imported, cards_suspended y cards_unsuspended, card_controversy_resolved, ai_artifact_created, ai_artifact_approved.
- **Estados:** LoadingState (t.decks.loading); errores en línea de ImportError e ImportBlockedError; EmptyState en Explorar; FeatureGate explore y aiCards (Gratis bloqueado); sin conexión, la IA usa el generador simulado.
- **e2e:**
  - decks.spec 'crea un mazo, escribe tarjetas, las repasa, las edita y borra el mazo' y 'arma un árbol de mazos, mueve un submazo y cambia el nombre'. Incluye falla de validación.
  - import-export.spec 'un CSV se previsualiza, exige confirmar derechos, se guarda y no se duplica'.
  - import-export.spec 'un paquete de Anki del formato viejo y otro del nuevo se leen con el motor de SQLite'.
  - import-export.spec 'una hoja de Excel se importa y un archivo que no se puede leer avisa con claridad'.
  - import-export.spec 'exportar descarga un CSV con encabezados y un identificador por nota'.
  - ai-cards.spec (2), explore.spec (1), labels.spec 'preguntas, examen y mazos de demostración dicen que no están validados por médicos'.
- **Otra cobertura:**
  - Pantallas: ImportExport.test.tsx, DeckEditorDialog.test.tsx, AiCards.test.tsx, ExploreScreen.test.tsx, Controversy.test.tsx.
  - Usecases: decks, importDeck, manualDecks, organize y aiCards.
  - Importación: apkg.test.ts, pdf.test.ts, tables.test.ts.
  - Contenido: tests/content/demo-decks.test.ts y preloaded-tree-migration.test.ts.
- **Huecos:**
  - Exportar .apkg no existe; solo hay CSV.
  - Sin e2e de importar DOCX, de dejar de seguir un mazo, ni de mover o etiquetar notas por lote.
  - Hallazgos 2 y 6.

### P06. Apuntes y sus tarjetas

- **Pantalla:** 30 /apuntes.
- **Archivos:**
  - src/features/outlines/: OutlinesScreen.tsx, OutlinesList.tsx, OutlinePage.tsx, OutlineEditor.tsx (TipTap), outlineExtensions.ts, OutlineLinks.tsx, CardPreview.tsx, CheatSheet.tsx, useOutlineAutosave.ts.
  - Usecase src/data/usecases/outlines.ts, con OutlineConflictError.
  - Motores: outline, cloze, deckTree.
- **Dexie:** outlines, notes (outlineId), cards, decks (raíz Apuntes).
- **Nube:** sync_records.
- **Eventos:** ninguno propio.
- **Estados:** LoadingState, EmptyState, estado del guardado automático, conflicto y error en línea (role="alert"), FeatureGate outlines.
- **e2e:**
  - outlines.spec 'un apunte con marcas da tarjetas, se actualiza al editar y se borra'.
  - outlines.spec 'partir una línea con Enter al inicio y volverla a unir conserva su nota y su historial'.
  - outlines.spec 'pegar varias líneas hace varias líneas con su tarjeta cada una'.
  - outlines.spec 'los enlaces entre apuntes se resuelven y se crean desde el que los cita'.
  - outlines.spec 'Esc saca el foco del editor y los botones de la barra sirven sin teclado'.
  - offline.spec abre /apuntes sin red.
- **Otra cobertura:** OutlineEditor.test.tsx, OutlinesScreen.test.tsx, useOutlineAutosave.test.tsx, outlines.test.ts (usecase y esquema), outline*.test.ts.
- **Huecos:** sin e2e de conflicto, de falla al guardar, ni de mover o renombrar un apunte.

### P07. Simulador: práctica, por dificultad, examen completo, revisión, practicar lo fallado y duelos

- **Pantallas:** 7 /simular, 4 /simular/pregunta, 5 /simular/retroalimentacion, 6 /sesion/resumen, 8 /simular/examen, 9 /simular/examen/resultados; los duelos desde 14 /party.
- **Archivos:**
  - src/features/simulator/: SimulatorSetupScreen.tsx (cantidad, rama, dificultad, muestreo dirigido, retro al final o por pregunta), TargetedSamplingField.tsx, QuestionScreen.tsx, OptionChoice.tsx, HighlightedPrompt.tsx, FeedbackScreen.tsx, AnswerReview.tsx, DiscardReviewCard.tsx, SessionSummaryScreen.tsx, practice.ts (sessionStorage), practiceStart.ts, pickQuestions.ts, answerXp.ts, useQuestion.ts.
  - src/features/exam/: ExamSetupCard.tsx, examSizes.ts, ExamScreen.tsx, ExamNavigator.tsx, ExamTimer.tsx, ExamFinishDialog.tsx, examSession.ts, examStorage.ts (localStorage enarm.exam.v1.<id>), examAlerts.ts, ExamResultsScreen.tsx (RetryCard en la línea 298), ExamReview.tsx.
  - src/features/shared/dailyLimit.ts y useVisibilityLog.ts; src/features/review/sendErrors.ts.
  - src/features/party/: duelActions.ts, duels.ts, DuelRow.tsx, NewDuelForm.tsx.
  - Usecases: bank, studentBank, contentReports, errorCards, recordEvent (recordEventOnce), party (createDuel).
  - Motores: sampler, random, structure, insights, xp, exam, timeAlerts.
- **Dexie:** cases, questions y options (banco local), events, contentReports, decks, notes y cards (errores al repaso), subscriptions, users, challenges, xpCache.
- **Nube:** ninguna. free_daily_questions y grant_question_access (20261008000003_payments_referrals.sql) no las llama el cliente.
- **Eventos:** session_started (practice, exam o challenge), question_shown, answer_changed, question_answered, xp_awarded, cause_reported, report_submitted, session_ended, visibility_changed.
- **Estados:**
  - LoadingState. Sin práctica activa o sin examen.
  - Límite diario (retryNoLeft, tamaños limitados).
  - Error al guardar el examen (saveError) y retoma después.
  - Reanuda tras recargar. Sin conexión funciona. Calibrando en el muestreo dirigido y en los resultados.
- **e2e:**
  - practice.spec 'descartar opciones en la práctica, con la explicación de qué se podía descartar'.
  - practice.spec 'la práctica se contesta con el teclado y la retroalimentación llega al final'.
  - practice.spec 'recargar a media práctica la retoma donde iba y no pierde lo contestado'.
  - exam.spec 'examen de 20 con descarte y marca, resultados y errores al repaso'.
  - exam.spec 'con poco tiempo avisa y al acabarse cierra solo'.
  - exam.spec 'con las alarmas apagadas el reloj sigue pero no avisa'.
  - exam.spec 'sin un examen guardado las pantallas lo dicen y llevan a configurarlo'.
  - exam.spec 'un examen terminado que no se guardó se retoma desde Simular y no se pisa con otro'.
  - exam.spec 'al borrar mis datos también se va el examen guardado en el navegador'.
  - exam.spec 'un examen sin terminar aparta las preguntas del día del plan Gratis'.
  - party.spec 'reta a un compañero a un duelo, lo juega y ve quién ganó'.
  - physician.spec 'reportes. El alumno reporta un error y desde la bandeja se resuelve'.
  - audit/flows.spec, sus 5 pruebas (sección 4).
- **Otra cobertura:**
  - Pantallas: QuestionScreen.test.tsx, ExamScreen.test.tsx, ExamSetupCard.test.tsx.
  - Lógica: tests de exam*, practice*, pickQuestions, optionSampling, discard, dailyLimit y duels.
  - Motores: sampler*, exam, mcqGrade, distractors, timeAlerts.
- **Huecos:**
  - El examen de 280 no tiene e2e; solo hay de 20.
  - La práctica por dificultad y el muestreo dirigido no tienen e2e.
  - Practicar lo fallado no tiene e2e y solo existe desde los resultados del examen, no desde el resumen de práctica.
  - El tope de Gratis solo se aplica en el navegador. Los duelos son solo contra simulados.

### P08. Tutor y los cinco motores de IA

Los motores están en src/engines/aiContracts.ts:18-24: forgetting (hipótesis), weekly_report, flashcards, bias_tips y restructure.

- **Pantallas:** 11 /tutor; 12 /mazos (flashcards); 20 /medico/borradores (restructure y revisión de bias_tips); 27 Configuración, cuenta (modo de IA); 23 /admin/costos.
- **Archivos:**
  - src/features/tutor/: TutorScreen.tsx, TutorSections.tsx, HypothesisCard.tsx, AiAnalysisCard.tsx, useTutorData.ts, useTutorAi.ts (acceso en la línea 81), aiPlan.ts (forgetting, weekly_report y bias_tips en 135, 156 y 175), hypothesisStore.ts, tutorActions.ts, contrastCards.ts, weeklyReport.ts.
  - src/ai/: engines.ts (callEngine), client.ts, endpoint.ts, flashcards.ts, useAiStatus.ts, admin.ts.
  - src/features/physician/restructureActions.ts.
  - Usecases: aiTutor.ts y aiCards.ts.
  - Motores: forgetting, insights, behavior, bias, topics, aiGuards, aiMock, aiCosts, piiFilter.
  - Servidor: server/src/ai/* (proxy local), server/src/hosted/* (alojado en Node o Docker) y prompts/.
- **Dexie:** events, aiArtifacts, aiCallLog, consents, subscriptions, decks, notes y cards (tarjetas de contraste), users.
- **Nube:**
  - El proxy en /api/ai o en VITE_AI_URL, con token Bearer.
  - En el servidor: ai_call_log, ai_config, ai_spend_day, ai_usage_day, ai_admit, ai_settle y ai_usage_summary (20261010000001_ai_hosted.sql).
  - No hay Edge Function de IA en supabase/functions.
- **Eventos:** ai_artifact_created, ai_artifact_approved, ai_artifact_rejected, ai_artifact_reopened, hypothesis_feedback, action_applied, consent_changed, settings_changed.
- **Estados:**
  - Acceso: loading, free-plan, off u on.
  - Calibrando. IA sin conexión.
  - Un límite o el presupuesto detienen los trabajos; si algo falla, queda la plantilla sin IA.
- **e2e:**
  - tutor.spec 'sin datos el tutor calibra, no inventa hipótesis y se abre desde el menú'.
  - tutor.spec 'con la demo salen hipótesis con evidencia, se responden, el informe trae prioridades e Inicio las resume'.
  - ai-cards.spec, con flashcards en modo simulado.
  - physician.spec 'borradores de IA. Se pide una propuesta, llega como borrador con el original y se rechaza'.
  - proxy.spec 'muestra IA simulada con el proxy en modo simulado y nunca llama a Anthropic'.
  - offline.spec, donde la IA avisa que necesita red.
- **Otra cobertura:**
  - Tutor: TutorAi.test.tsx, aiPlan.test.ts, hypothesisStore.test.ts.
  - Cliente de IA: src/ai/*.test.ts.
  - Integración: tests/integration/ai-client-server.test.ts (los cinco motores contra el proxy).
  - Servidor: server/src/ai/*.test.ts y hosted.test.ts.
  - SQL: ai_hosted_test.sql. Además npm run eval-ai.
- **Huecos:**
  - No hay e2e del análisis con IA del tutor con un plan de pago.
  - No hay e2e de aprobar una propuesta de restructure, de límites agotados ni de proxy caído.
  - AiCardsCard no revisa el consentimiento ai_analysis.

### P09. Progreso, Conócete y captura del puntaje oficial

- **Pantallas:** 10 /progreso (Conócete en InsightsPanel); 27 /configuracion?seccion=privacy (puntaje oficial).
- **Archivos:**
  - src/features/progress/: ProgressScreen.tsx, InsightsPanel.tsx, DifficultyCard.tsx, FutureLoadSection.tsx, useAnalysis.ts, analysis.ts, focusItems.ts, insightFacts.ts, difficultyView.ts, futureLoad.ts.
  - src/features/settings/PrivacySection.tsx.
  - Usecase privacy.ts (submitOfficialScore, changeConsent).
  - Motores: topics, insights, behavior, fsrs, structure, difficulty; worker rasch.
- **Dexie:** events, questions, options, decks, cards, users, officialScores, consents.
- **Nube:** ninguna; officialScores no se sincroniza.
- **Eventos:** official_score_submitted (solo el año) y consent_changed.
- **Estados:** LoadingState; calibrando con cuánto falta; carga futura vacía; validación del puntaje (invalid_year, invalid_score, no_consent).
- **e2e:**
  - progress.spec 'la dificultad calibra y la carga futura proyecta los mazos que sigues'.
  - calibrating.spec.
  - privacy.spec 'el puntaje oficial se guarda, sobrevive a recargar y se borra al retirar la mejora anónima' (camino feliz y falla de rango).
  - labels.spec 'la base de demostración marca Datos simulados en toda pantalla del alumno'.
- **Otra cobertura:** ProgressScreen.test.tsx, los tests de analysis, focusItems, futureLoad e insightFacts, insights.test.ts, privacy.test.ts.
- **Huecos:** sin e2e de Conócete con datos propios ni de los atajos para practicar un foco.

### P10. Party: grupos, tabla, retos y referidos

- **Pantalla:** 14 /party; también PartyWidget en Inicio.
- **Archivos:**
  - src/features/party/: PartyScreen.tsx (withFriends empieza en true, línea 119), ChallengeRow.tsx, DuelRow.tsx, PartyWidget.tsx, ReferralCard.tsx, AchievementShare.tsx, claims.ts, duels.ts, stats.ts, shareAchievement.ts.
  - Usecase party.ts; src/data/referrals/referrals.ts; motor engines/party.ts.
- **Dexie:** groups, memberships, challenges, events, users.
- **Nube:**
  - Solo los referidos: my_referral_code, my_referrals, redeem_referral_code y complete_referral; tablas referral_codes, referrals y subscription_grants.
  - Las tablas groups, memberships y challenges de Supabase (20261002000001_platform.sql:277-300) no las usa el cliente.
- **Eventos:** party_joined, party_left, challenge_completed, xp_awarded, y session_started (challenge) para los duelos.
- **Estados:** LoadingState; al unirse: joined, already, not_found, invalid o full; ReferralCard sin nube explica qué falta; errores de duelos en role="alert".
- **e2e:**
  - party.spec 'crea un grupo, ve la tabla, se une con su código y completa un reto'. Incluye already y not_found.
  - party.spec 'reta a un compañero a un duelo, lo juega y ve quién ganó'.
  - party.spec 'comparte la tarjeta de logro con el menú del sistema'.
  - party.spec 'sin menú de compartir descarga la tarjeta como imagen PNG cuadrada'.
  - labels.spec 'los compañeros y los duelos de Party van marcados como simulados'.
- **Otra cobertura:** party.test.ts, ReferralCard.test.tsx, referrals.test.ts, payments_test.sql.
- **Huecos:**
  - No hay grupos reales.
  - Nada revisa el consentimiento 'party' ni el permiso party del plan.
  - Los referidos no tienen e2e.
  - Grupo lleno y código con formato inválido no tienen e2e.

### P11. Pomodoro

- **Pantallas:** dentro de 3 /repasar (PomodoroPill, PomodoroNotice) y en 27 /configuracion?seccion=pomodoro.
- **Archivos:** src/features/pomodoro/Pomodoro.tsx, usePomodoro.ts (localStorage enarm.pomodoro.ui.v1, notificación, sonido, confeti), timer.ts; PomodoroSection en AccountSettings.tsx; tutorActions.ts (shortenPomodoro).
- **Dexie:** events y users.
- **Nube:** ninguna.
- **Eventos:** pomodoro_started, pomodoro_completed, pomodoro_interrupted, settings_changed.
- **Estados:** minimizado por defecto; los errores se tragan en silencio.
- **e2e:** ninguna.
- **Otra cobertura:** timer.test.ts.
- **Huecos:** ni camino feliz ni falla; no existe en Simular ni en Examen; el permiso de notificaciones negado no se prueba.

### P12. Suscripción, pago, portal, avisos de pago y reembolsos

- **Pantallas:** 16 /suscripcion, PlanCard en Inicio, planes en la portada; FeatureGate lleva aquí.
- **Archivos:**
  - src/features/billing/SubscriptionScreen.tsx (pago simulado sin nube), CloudBilling.tsx (CloudCheckoutCard, BillingPortalCard, CloudRequiredCard, PaymentReturnNotice), PlanPrice.tsx.
  - src/config/billing.ts; usecase subscription.ts (changePlan).
  - src/data/payments/: checkout.ts, portal.ts, cloudPlan.ts.
  - supabase/functions/: create-checkout, create-portal-session, payment-webhook-stripe, payment-webhook-mercadopago, _shared/payments.ts.
  - Avisos que se procesan: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted y updated, charge.refunded; en Mercado Pago, refunded y charged_back.
- **Dexie:** subscriptions y events.
- **Nube:**
  - Tablas: subscriptions, payments, payment_webhook_events, billing_customers, subscription_grants.
  - RPC: my_plan, apply_payment_notice, record_billing_customer, billing_customer_of_user y billing_user_of_customer, user_plan, complete_referral.
- **Eventos:** subscription_changed, solo en el pago simulado.
- **Estados:**
  - needsCloud.
  - Errores de checkout: founder_full, already_subscribed, not_configured, unsafe_url, failed.
  - Regreso de la pasarela: comprobando, confirmado, lento o cancelado.
  - Recibos vacíos. paidInForce impide un segundo pago (D-118).
- **e2e:** home.spec (plan, que lleva a Suscripción), ai-cards.spec (subscribeMonthly con pago simulado; Gratis bloqueado), exam.spec (tope de Gratis).
- **Otra cobertura:** CloudBilling.test.tsx, payments.test.ts (cliente y funciones), supabase.test.ts, tests/integration/stripe-setup.test.ts, billing.test.ts; SQL payments_test.sql, billing_portal_test.sql y plan_prices_test.sql.
- **Huecos:** ningún e2e del pago real, del portal, del regreso, de los avisos de pago ni de los reembolsos; cancelar el pago simulado tampoco tiene e2e; hallazgo 3.

### P13. Privacidad, consentimientos, exportar y borrar datos, y borrar cuenta

- **Pantallas:** 27 /configuracion?seccion=privacy y ?seccion=account; 32 /privacidad; 33 /terminos; NoticeUpdateNotice.
- **Archivos:**
  - Pantallas: src/features/settings/PrivacySection.tsx, src/features/profile/AccountSettings.tsx (DataSection), DeleteCards.tsx (eraseAll con pauseSync y resumeSync), src/features/legal/LegalScreen.tsx y fillLegal.ts, src/config/legal.ts.
  - Usecases: profile.ts, privacy.ts, exportData.ts.
  - Nube: src/data/cloud/privacy.ts.
  - App: src/app/ErrorReportingGate.tsx.
- **Dexie:**
  - consents, officialScores y events.
  - Exportar lee todo lo del alumno a un JSON.
  - deleteAllData borra enarm_real entera (src/data/DataProvider.tsx) y también el examen guardado en localStorage.
- **Nube:** RPC delete_my_data y delete_my_account; tabla privacy_acceptances.
- **Eventos:** consent_changed y official_score_submitted.
- **Estados:**
  - El modo de borrado depende de la nube: cloud, device o wait, cada uno con su nota.
  - Errores: not_active_device, owner, active_subscription, no_session, network, unknown, local.
  - Borrar la cuenta pide escribir una palabra y solo aparece con la nube conectada.
- **e2e:**
  - privacy.spec, sus 2 pruebas; la segunda es 'sin la nube conectada solo está Borrar mis datos y no la baja de la cuenta'.
  - legal.spec 'desde la portada se lee el aviso y los términos sin sesión, y dicen que son un borrador'.
  - legal.spec 'en la bienvenida el aviso se abre en otra pestaña y el formulario no se pierde'.
  - legal.spec 'con sesión el aviso se lee con la navegación de la app y desde Configuración, Privacidad'.
  - exam.spec 'al borrar mis datos también se va el examen guardado en el navegador'.
- **Otra cobertura:** PrivacySection.test.tsx, DeleteCards.test.tsx, LegalScreen.test.tsx, NoticeUpdateNotice.test.tsx, ErrorReportingGate.test.tsx, privacy.test.ts y exportData.test.ts, privacy_test.sql.
- **Huecos:**
  - Exportar mis datos (JSON) no tiene e2e.
  - Borrar con nube no tiene e2e, tampoco el bloqueo por suscripción activa.
  - Los consentimientos party y ai_analysis no tienen e2e; el aviso nuevo tampoco.
  - Hallazgo 1.

### P14. Médico: banco, importación, revisión, etiquetado de sesgos, kappa, borradores de IA y reportes

- **Pantallas:** 17 a 22 en /medico/*, detrás de la guarda PhysicianArea.
- **Archivos:**
  - src/features/physician/: QuestionBankScreen.tsx, QuestionEditorScreen.tsx, EditorSections.tsx, editorActions.ts, AgreementScreen.tsx, agreementView.ts, AiDraftsScreen.tsx, CardDrafts.tsx, QuestionDrafts.tsx, TipDrafts.tsx, draftActions.ts, restructureActions.ts, ReportsScreen.tsx, BankImportScreen.tsx, bankImport.ts.
  - src/data/content/bankFiles.ts, bankConvert.ts, bankColumns.ts.
  - Usecases: bank, labeling, contentReports, aiTutor.
  - Motores: agreement (kappa), structure, aiGuards, aiMock, difficulty, distractors, rasch.
- **Dexie:** cases, questions (addVersion, setEditorialStatus), options, biasLabels, reviewAssignments, contentReports, aiArtifacts, notes, events.
- **Nube:** ninguna. Las tablas questions, question_options, clinical_cases, content_reports, review_assignments, review_decisions y ai_artifacts no las usa el cliente.
- **Eventos:** ninguno.
- **Estados:** LoadingState; EmptyState; CalibratingState en el acuerdo; errores en línea en importación, editor y borradores; el admin ve el tablero pero no etiqueta.
- **e2e:**
  - physician.spec 'acuerdo del etiquetado. El médico sin asignaciones no tiene cola y el tablero calibra'.
  - physician.spec 'acuerdo del etiquetado. El admin ve el tablero y no etiqueta'.
  - physician.spec 'editor de pregunta. Se abre desde el banco, guarda una versión nueva y la lista en el historial'.
  - physician.spec 'reportes. El alumno reporta un error y desde la bandeja se resuelve'.
  - physician.spec 'borradores de IA. Se pide una propuesta, llega como borrador con el original y se rechaza'.
  - physician.spec 'importador. Revisa el archivo, reporta la fila con problema e importa solo lo bueno'.
  - smoke 'los estados vacío y calibrando se ven en sus pantallas y pasan axe'.
  - roles.spec 'elegir Médico lleva al banco con la navegación del médico y se recuerda'.
- **Otra cobertura:** los tests de pantalla de AgreementScreen, AiDraftsScreen, BankImportScreen, QuestionEditorScreen y ReportsScreen, más los de sus acciones; labeling.test.ts, contentReports.test.ts, agreement.test.ts, tests/content/bankExcel.test.ts.
- **Huecos:**
  - Etiquetar con cola asignada y kappa con datos no tienen e2e.
  - Aprobar propuestas, tarjetas públicas y consejos no tiene e2e; descartar un reporte tampoco.
  - Nunca se prueba un médico real de la nube. Todo es local.

### P15. Admin: usuarios y roles, costos de IA, plataforma, errores del navegador y datos de demostración

- **Pantallas:** 28 /admin/usuarios, 23 /admin/costos, 25 /admin/configuracion, 24 /admin/demo; DemoDataPanel en Configuración, cuenta.
- **Archivos:**
  - src/features/admin/: AdminUsersScreen.tsx (LocalUsers o CloudUsers según cloudState), CloudUsers.tsx, AiCostsScreen.tsx, AdminSettingsScreen.tsx (ThresholdsForm, WeightsForm, AiConfigForm, ClientErrorsCard), DemoDataScreen.tsx, useAiAdmin.ts, commitOverrides.ts.
  - Usecases: admin.ts y seedDemo.ts.
  - Nube: src/data/cloud/adminUsers.ts, adminSettings.ts, clientErrors.ts, featureFlags.ts.
  - Otros: src/app/errorReporter.ts, src/config/overridesStore.ts y featureFlags.ts, src/demo/generator/*, worker simulate.
- **Dexie:** users (rol local), reviewAssignments, aiCallLog, toda enarm_demo (incluida simTruth).
- **Nube:**
  - RPC admin_list_users, set_user_role (registra en role_audit) y report_client_error.
  - Tablas client_errors y platform_settings.
  - El proxy de IA para configuración y uso.
- **Eventos:** ninguno.
- **Estados:** CloudUsers loading, failed o ready, con páginas; costos con EmptyState y CalibratingState; ClientErrorsCard solo con nube; la demo pide cambiar de base; ConfigUpdateNotice pide recargar.
- **e2e:**
  - admin.spec 'costos de IA. Sin llamadas dice que no hay y con el proxy simulado lee el uso de hoy'.
  - admin.spec 'configuración. Un umbral y un peso se guardan, sobreviven al recargar y se restablecen'.
  - admin.spec 'configuración. El presupuesto diario de IA se cambia en el proxy y queda guardado'.
  - admin.spec 'datos de demostración. En Mi cuenta pide cambiar de base y en la demo genera pocos alumnos y borra todo'.
  - demo-data.spec 'genera la demo en un worker, la guarda en enarm_demo y la puede regenerar'.
  - roles.spec 'el alumno no entra al área de admin'.
- **Otra cobertura:** los tests de pantalla de AdminSettingsScreen, AiCostsScreen, ClientErrorsCard, CloudUsers y DemoDataScreen; los tests de cloud adminUsers, adminSettings, clientErrors y featureFlags; errorReporter.test.ts; SQL admin_users_test.sql y client_errors_test.sql.
- **Huecos:**
  - Usuarios y roles, local y en la nube, no tienen e2e; asignar temas a médicos y los errores del navegador tampoco.
  - No hay interfaz para las banderas: saveRemoteFlags no se usa.

### P16. Sincronización entre dispositivos

- **Pantallas:** no tiene propia; el estado aparece en 15 /perfil (CloudStatus, SyncStatus con "Sincronizar ahora").
- **Archivos:** src/app/cloud.tsx, syncScheduler.ts (cada 5 min, al volver la red, al ocultar la pestaña, con reintentos), syncState.ts, src/data/sync/runSync.ts, supabaseTransport.ts, src/engines/sync.ts, src/features/profile/SyncStatus.tsx.
- **Dexie:** syncState, decks, notes, cards, outlines, widgetLayouts, events, subscriptions.
- **Nube:** RPC sync_clock, sync_push_records y sync_push_events; tablas sync_records y events (solo agregar); my_plan.
- **Eventos:** no emite; replica los eventos de otros dispositivos con recordEventOnce.
- **Estados:** corriendo, ok, failed, clock_skew, other_device, no_session; sin conexión espera; se pausa durante un borrado.
- **e2e:** ninguna.
- **Otra cobertura:** cloud.sync.test.tsx, syncScheduler.test.ts, runSync.test.ts, supabaseTransport.test.ts, sync.test.ts y sync.property.test.ts, SyncStatus.test.tsx, sync_test.sql.
- **Huecos:** no hay e2e con dos navegadores; N1 y N2; hallazgo 5.

### P17. PWA: instalación, actualización y sin conexión

- **Archivos:** vite.config.ts (VitePWA con registerType prompt, manifest, workbox, navigateFallback, clientsClaim), src/app/layout/PwaUpdatePrompt.tsx, src/ui/hooks/use-online-status.ts, public/ (íconos), src/config/brand.ts.
- **Estados:** offlineReady (dura 8 s), needRefresh (botón Recargar), aviso sin conexión; un registro fallido solo deja un console.warn.
- **e2e:**
  - pwa.spec 'el manifest declara nombre, idioma, modo y los íconos que pide la instalación'.
  - pwa.spec 'el service worker se registra y Chromium la considera instalable'.
  - pwa.spec 'después de la primera carga abre sin conexión'.
  - offline.spec 'sin conexión abre pantallas que nunca se habían visitado y la IA avisa que necesita red'.
  - offline.spec 'en la primera visita, sin recargar, el service worker toma el control y las pantallas nuevas abren sin red'.
  - audit/flows.spec 'sin conexión se puede terminar una práctica y ver su resumen'.
- **Huecos:** la actualización no tiene e2e; no hay botón propio de instalar (no se usa beforeinstallprompt); solo se prueba Chromium.

### Fuera de la lista mínima

- **Planificador** (13). PlannerScreen.tsx y planView.ts; emite settings_changed (examDate, dailyMinutes). e2e: planner.spec 'calibra los minutos, avisa la sobrecarga y cada ajuste cambia el plan'.
- **Logros** (31). RewardsScreen.tsx, useRewards.ts, badgesSeen.ts (localStorage), BadgeToast. e2e: rewards.spec (2).
- **Apariencia** (27, sección appearance). AppearanceSettings.tsx. e2e: smoke 'el tema oscuro se aplica y se recuerda al recargar'.
- **Selector de rol** (26). e2e: roles.spec.
- **Portada y legales.** onboarding.spec, legal.spec y smoke.

## 3. Huecos

**Sin e2e de camino feliz:**

- Entrada con enlace o código, dispositivo único y límite de cambios. Google no existe.
- Sincronización.
- Pago real, portal, avisos de pago, reembolsos, regreso de la pasarela y referidos.
- Borrar la cuenta y borrar datos con nube. Exportar mis datos en JSON.
- Pomodoro.
- Días fáciles, sanguijuelas, posponer y adelantar.
- Examen de 280, práctica por dificultad y practicar lo fallado.
- Tutor con IA y plan de pago.
- Médico: etiquetado con cola, kappa con datos y aprobar borradores.
- Admin: usuarios y roles, asignaciones y errores del navegador.
- Actualización de la PWA.
- Exportar .apkg (no existe), importar DOCX y dejar de seguir un mazo.
- Consentimientos party y ai_analysis, y el aviso nuevo.

**Con camino feliz pero sin falla:** Inicio, repaso y carga diaria, Explorar, apuntes, tutor, progreso (solo hay calibrando), crear grupo y duelos, admin (costos, configuración, demo), la PWA y el editor del médico.

**Tienen e2e de falla:** onboarding (validación), privacy (rango del puntaje), decks (validación), import-export (archivo ilegible), ai-cards (PDF sin texto y bloqueo de Gratis), party (not_found y already), physician (fila mala), planner (minutesError), exam (noActive, examen sin guardar y tiempo agotado), roles (alumno bloqueado en admin), smoke (404), la nube caída en la auditoría y las interrupciones de flows.

**Tipos de cuenta:**

- Gratis: casi todas las e2e.
- De pago: solo el pago simulado de ai-cards.spec.
- Médico y admin: solo por /rol, sin nube.
- Owner: solo en el recorrido de la auditoría.
- No hay fixtures para cuentas reales de la nube.

**Escrituras sin manejo de error:** repaso, pregunta, resumen, Party, el pago simulado y el examen.

## 4. Hallazgos conocidos (los 9 de B1, todos vigentes)

1. **Consentimientos otorgados solos.**
   - src/data/usecases/profile.ts:30 define PURPOSES, y el bucle de las líneas 48-67 los guarda con status 'granted' (línea 49) y su consent_changed. La bienvenida solo tiene una casilla de aviso (OnboardingScreen.tsx:269-275).
   - Pasa también al entrar en un dispositivo nuevo. src/data/usecases/cloudLink.ts:20-28 llama a registerAccount y luego a createProfile. Después src/app/cloud.tsx:135-136 sube esa "aceptación" a privacy_acceptances.
   - Efectos: ErrorReportingGate.tsx:21 manda errores sin que el alumno lo haya pedido, y el tutor de pago arranca con la IA encendida (useTutorAi.ts:81-88).
   - VIGENTE.
2. **Permisos importDecks y party sin revisar.**
   - src/config/billing.ts:15-16 los define; las líneas 76, 84, 91 y 98 los ponen en true en todos los planes.
   - Solo se leen para pintar listas: SubscriptionScreen.tsx:44-45 y LandingScreen.tsx:154. ImportDeckCard.tsx y PartyScreen.tsx no los consultan.
   - VIGENTE, aunque hoy no cambia nada porque todos los planes los incluyen.
3. **Examen completo marcado como Próximamente.**
   - src/features/billing/SubscriptionScreen.tsx:37-38 define COMING_SOON = {'fullExam'} y la línea 213 lo pinta.
   - El examen de 280 ya existe: src/features/exam/examSizes.ts (allowedExamSizes) y ExamSetupCard.tsx:51 y 118.
   - La portada repite el error en LandingScreen.tsx:160-162.
   - VIGENTE.
4. **Botón prometido que no existe.**
   - src/i18n/es-MX.ts:40 (screens.feedback.description) promete un "botón para generar tarjetas". Ni FeedbackScreen.tsx ni AnswerReview.tsx lo tienen.
   - El texto se ve donde se pinta la descripción, en RequireSession.tsx:26.
   - VIGENTE.
5. **Fotos de perfil sin sincronizar.** src/data/cloud/account.ts:117 tiene el comentario "La foto propia no se sube aún" y la línea 126 convierte la foto en iniciales. VIGENTE.
6. **Nombres de submazos pegados.**
   - src/demo/content/deckEntities.ts:59: subjectName solo cambia guiones y guiones bajos por espacios. Las líneas 100-112 crean los submazos con ese nombre.
   - Las etiquetas de origen están en src/demo/content/decks/paco-gyo.json: AnticonceptivosyMPF, Hemorragias1T, Hemorragias3T y HigadoGraso.
   - VIGENTE.
7. **Party simulada en el navegador.**
   - src/data/usecases/party.ts: las líneas 1-2 lo dicen, la 14 define los seis alias simulados y las líneas 48-72 los crean junto con un reto simulado.
   - PartyScreen.tsx:119 marca los compañeros simulados por defecto.
   - Las tablas de grupos de Supabase (20261002000001_platform.sql:277-300) no tienen cliente.
   - VIGENTE.
8. **Cualquier alumno puede cambiar a la base demo.**
   - src/features/settings/SettingsScreen.tsx:24-37 y 112-124 tienen el selector y DemoDataPanel sin guarda de rol. AppShell.tsx:146-151 tiene el botón para volver.
   - La bandera demoTools de src/config/featureFlags.ts:31-35 nunca se consulta; isFeatureEnabled (línea 94) no tiene ningún uso.
   - VIGENTE.
9. **Prueba de tiempos frágil.**
   - src/app/cloud.test.tsx:134 es 'un SIGNED_IN rezagado mientras se cierra la sesión no reabre el perfil ni reclama de nuevo'.
   - Usa fake.signOutDelay = 60 en la línea 136 y esperas fijas de 30 ms en las líneas 148 y 155.
   - El mismo archivo tiene más esperas fijas de 50 y 100 ms en las líneas 84, 107, 168, 183, 195, 231, 242, 265, 328, 338 y 450.
   - VIGENTE.

**Hallazgos nuevos, sin correr nada:**

- **N1. Los ajustes no viajan entre dispositivos.**
  - users no está en SYNC_KINDS (src/engines/sync.ts:34) y nadie vuelve a aplicar los settings_changed.
  - En un dispositivo nuevo se crea un perfil con la meta por defecto y sin mazos seguidos (cloudLink.ts:23-28). Los mazos precargados no se sincronizan (sync.ts:129-146).
- **N2. Posible mazo de errores duplicado entre dispositivos.** errorIds usa el id local del perfil (src/data/usecases/errorCards.ts:12-17), que cambia en cada dispositivo. Por verificar.
- **N3. Consentimientos que nadie revisa.** Party no revisa 'party' y AiCardsCard no revisa 'ai_analysis'.
- **N4. Tope de Gratis solo en el navegador.** Vive en src/features/shared/dailyLimit.ts:33; las funciones SQL equivalentes no se usan.
- **N5. Banco, etiquetas, asignaciones y reportes solo locales.** Un reporte no llega a un médico que use otro navegador.
- **N6. ErrorState y OfflineState no se usan** en ninguna pantalla.
- **N7. No hay exportación a .apkg.**
- **N8. Sin interfaz para liberar un dispositivo ni para las banderas.**
- **N9. No hay Edge Function de IA.** CLAUDE.md:10 dice que el proxy de producción es una Edge Function, pero el alojado es Node o Docker (server/src/hosted, Dockerfile).
- **N10. Practicar lo fallado solo existe desde el examen** (ExamResultsScreen.tsx:298).

## 5. Cómo se corre la auditoría existente

- **Comandos.**
  - `npm run audit:ui` corre `node scripts/playwright.ts test --config playwright.audit.config.ts`, con PLAYWRIGHT_BROWSERS_PATH=0.
  - Variantes: `AUDIT_DEV=1 npm run audit:ui -- --project=escritorio` y `AUDIT_CLOUD=down npm run audit:ui -- --project=escritorio -g "nube caída"`.
  - No corre en el CI; el CI solo corre `npm run e2e`.
- **playwright.audit.config.ts.**
  - testDir tests/audit, 2 workers, tiempo límite de 15 min.
  - Proyectos telefono (390×844) y escritorio (1280×800).
  - Levanta el proxy de IA en modo simulado y el build con preview en el puerto 4173.
  - AUDIT_DEV=1 usa el servidor de vite dev. AUDIT_CLOUD=down construye con una URL de Supabase que no existe. AUDIT_OUT cambia la carpeta de informes (por defecto docs/auditoria-2026-10-10/recorrido). AUDIT_WARN=1 también cuenta los avisos de consola.
- **tests/audit/crawl.spec.ts, 'recorrido {rol} con datos {modo}'.**
  - Corre al alumno con la base vacía y a alumno, médico, admin y owner con la demo: 5 por proyecto, 10 en total. Los roles se ponen en localStorage; no hay cuentas.
  - En cada una de las 32 pantallas (salta /rol) revisa:
    - consola, excepciones y peticiones fallidas;
    - pantalla de error y que exista un h1;
    - desborde a los lados;
    - axe con wcag2a, 2aa, 21aa, 22aa y best-practice, nivel moderado o más;
    - imágenes rotas;
    - texto roto (undefined, NaN, null, Infinity, Invalid Date);
    - teclado: trampas, foco invisible y foco sin indicador.
  - Después da hasta 25 clics por pantalla en controles no destructivos (SKIP_NAME).
  - Escribe un JSON por recorrido y no falla por hallazgos.
- **tests/audit/flows.spec.ts.** Estas sí fallan:
  - 'recargar a la mitad de una práctica no rompe nada ni pierde lo contestado'
  - 'volver con el navegador desde otra pantalla a media práctica deja la sesión usable'
  - 'sin conexión se puede terminar una práctica y ver su resumen'
  - 'doble clic al contestar no salta una pregunta ni cuenta dos veces'
  - 'dos perfiles en el mismo dispositivo no se ven los datos'
- **tests/audit/cloud-down.spec.ts.** 'nube caída. Se crea la cuenta en el navegador y todas las pantallas abren'. Se salta salvo con AUDIT_CLOUD=down. Crea una cuenta, abre las 32 pantallas, simula un médico con el token vencido sin red y revisa /rol.
- **Último resultado** (docs/auditoria-2026-10-10/README.md): 10 recorridos con 0 hallazgos, los 10 flujos pasan y la nube caída da 0 hallazgos. Los JSON están en docs/auditoria-2026-10-10/recorrido/.
- **Lo que no cubre.**
  - Supabase real, pagos reales, otros navegadores, lector de pantalla y dispositivos reales.
  - Acciones destructivas y contenido médico.
  - No llena formularios ni recorre flujos de varios pasos.
  - No distingue Gratis de pago ni usa roles reales de la nube.
- **Contexto e2e.** `npm run e2e` usa playwright.config.ts: 29 specs con 78 `test()` (110 con el smoke expandido), en mobile y desktop.