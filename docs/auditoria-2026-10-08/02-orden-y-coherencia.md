# Auditoría de orden y coherencia del producto

## Resumen
- La base es sólida (barra de 5 secciones, modo enfoque, etiquetas de demo, tuteo limpio), pero el orden real se rompió al sumar funciones. Hay 9 secciones en escritorio y solo 5 en el teléfono.
- Plan, Tutor, Party y Configuración solo se alcanzan en el teléfono por Perfil. Nada en Inicio lleva al Plan, que es la pantalla que responde "qué hago hoy".
- Los ajustes viven en 6 lugares y las tarjetas nuevas por día se cambian desde 4 sitios. Progreso y Tutor repiten contenido.
- Hay 5 pantallas esqueleto en el menú de médico y admin, y promesas de Próximamente visibles al alumno.
- El vocabulario mezcla sesgo, trampa y distractor, tarjeta, nota y carta, y jerga de FSRS y Anki. El ciclo diario se corta tras cada actividad.

| Criterio | Nota | Justificación |
|---|---|---|
| Orden | 5 | Barra limpia, pero 4 de 9 secciones enterradas en el teléfono, ajustes dispersos y Progreso y Tutor duplicados |
| Facilidad | 6 | La acción principal es obvia en Inicio, Repasar, Pregunta y Examen. Fallan Simular (dos botones Empezar), Plan, Tutor y el primer uso (5 toques a la primera tarjeta) |
| Coherencia | 6 | Componentes y tokens consistentes y ortografía limpia. Fallan el glosario, los patrones de pestañas y guardado, y los textos obsoletos |

## Mapa de navegación real
- **Barra inferior en teléfono (5)** Inicio, Repasar, Simular, Progreso, Perfil (navigation.ts líneas 54-68)
- **Solo riel de escritorio (4)** Plan, Tutor, Party, Configuración (marcadas railOnly)
- **Inicio** (/) tablero de widgets (preset Esencial con Para hoy, Racha, Meta, Nivel y Heatmap) y Editar tablero
- **Repasar** (/repasar) con pestañas Repasar, Mazos (/mazos) y Explorar (/mazos/explorar)
  - Repasar trae aviso y herramientas de atrasos, Qué quieres repasar, Mazos y temas y Límites de hoy (Perfil guía, nuevas por día y enlace a Plan)
  - Mazos trae precargados, Tus mazos (Repasar, Editar, Organizar, Eliminar), Sube tu mazo (Pronto) y Crear mazo
- **Simular** (/simular) Práctica lleva a /simular/pregunta, luego /simular/retroalimentacion (solo si eliges feedback por pregunta) y /sesion/resumen. Examen lleva a /simular/examen y /simular/examen/resultados
- **Progreso** una sola página con cifras, focos, Conócete (19 lecturas), ramas, dificultad y carga futura
- **Perfil** nivel y racha, Accesos (Plan, Tutor, Party, Configuración, más Administración para admin), alias, datos y Suscripción (/suscripcion)
- **Configuración** pestañas Estudio, Apariencia, Pomodoro, y Cuenta y datos
- **Encabezado** racha, nivel (diálogo) y avatar hacia Perfil, salvo en Inicio, Perfil y Configuración
- **Sin entrada** /rol y los esqueletos /medico/editor, /medico/importar y /admin/demo
- **Médico** Banco (real), Acuerdo, Borradores y Reportes (esqueletos), Perfil, Configuración
- **Admin y dueño** todo lo del alumno más Usuarios y Banco (reales), Costos y Plataforma (esqueletos)

Pasos desde Inicio en teléfono. Progreso 1. Repasar, Simular, Examen, Mazos y Explorar 2. Plan, Tutor, Party, Configuración y Suscripción 2 (vía Perfil). Pomodoro 3. Retención 4 (Perfil, Configuración, Estudio, Opciones avanzadas).

## Carga mental por pantalla (estimada de código y capturas)
| Pantalla | Bloques | Controles visibles | Acción principal en 3 s |
|---|---|---|---|
| Inicio | 5 | 6 | Sí, Repasar en la primera tarjeta |
| Repasar | 3 a 4 | 10 (más de 25 con plegables) | Sí, pero con atrasos abiertos baja a unos 1,400 px en teléfono |
| Simular | 2 | 9 | No, dos botones Empezar iguales |
| Pregunta | 3 | 9 con 4 opciones (cada una con su botón de descartar) | Sí |
| Retroalimentación | 4 más causa (8 botones) | 12 | Sí, pero por defecto no se ve |
| Resumen | 3 | 6 | Parcial, falta siguiente paso |
| Examen | 3 | 8 más opciones | Sí |
| Progreso | 6 | más de 25 filas | Sí, los 3 focos van primero |
| Plan | 4 | 3 por tarea, guardar y 7 días | No hay Empezar |
| Tutor | 8 | más de 10 | No, cada hipótesis trae sus botones |

## Hallazgos

**IA-01 Alto. Plan, Tutor, Party y Configuración fuera de la barra del teléfono.** Evidencia navigation.ts líneas 65-67, ProfileScreen.tsx líneas 95 y 108-113, captura fase-c/08-perfil telefono. Efecto, el alumno llega al Plan por Perfil y Accesos. El único enlace al Plan fuera del menú está dentro de Repasar, Límites de hoy (DailyLoadPanel.tsx línea 203). Recomendación, barra de 5 con "Más", o fusionar Plan en Inicio y Tutor en Progreso. Esfuerzo M.

**IA-02 Alto. Inicio no responde "qué hago hoy" con un botón.** Evidencia TodayWidget (SimpleWidgets.tsx) con dos botones que cuenta vencidas (snapshot.ts línea 104). Ningún preset incluye el plan (layouts.ts líneas 8-13). Hay tres cifras de hoy: vencidas en Inicio, vencidas más nuevas en Plan y cola con topes en Repasar. Recomendación, widget "Tu día" alimentado por el planificador, con lista y un botón Empezar, y una sola definición de hoy. Esfuerzo M.

**IA-03 Alto. El ciclo diario se corta.** Evidencia SessionSummaryScreen.tsx (solo "Otra práctica" e "Inicio") dice "4 errores pasaron a Mis errores" sin botón, mientras ExamResultsScreen sí ofrece "Repasar ahora". Al terminar el repaso solo hay "Repasar otros temas" e "Inicio" (ReviewScreen.tsx línea 635). Efecto, nadie sugiere el siguiente paso. Recomendación, CTA a la siguiente tarea del plan, a repasar errores y a Progreso. Esfuerzo S.

**IA-04 Alto. Ajustes repartidos.** Evidencia, alias y suscripción en Perfil, metas y opciones en Configuración, límites y Perfil guía en Repasar (ReviewSetup.tsx línea 206 admite "también están en Configuración"), minutos solo en Plan (PlannerScreen.tsx línea 357), Pomodoro en Repasar y en Configuración, ajustes del examen en Simular, widgets en Inicio. Las nuevas por día se escriben desde Configuración, Repasar, la sobrecarga del Plan y "Usar N". Recomendación, una Configuración única y en los demás sitios un resumen con enlace. Esfuerzo M.

**IA-05 Alto para médico. Esqueletos en el menú.** Evidencia navigation.ts líneas 72-90 y router.tsx líneas 31-53. Acuerdo, Borradores y Reportes (3 de 4 secciones del médico), Costos y Plataforma (2 de 4 del admin) muestran Próximamente. Su texto manda a "seguir estudiando con Repasar y Simular" (es-MX.ts línea 197), secciones que el médico no tiene. Editor, Importar y Demo no tienen entrada. Recomendación, ocultar lo no construido y dejar un aviso de hoja de ruta. Esfuerzo S.

**IA-06 Medio. Promesas visibles al alumno.** Evidencia "Pronto podrás subir tus mazos" (features.ts líneas 518-520). Suscripción marca Próximamente el examen completo aunque Simular ya lo ofrece (SubscriptionScreen.tsx línea 19, exam.ts línea 33). Tutor dice "llega con la IA en la siguiente fase" (tutor.ts líneas 145 y 172), fuga del plan de fases. La portada promete misiones y ligas (features.ts líneas 1004-1005), que PROGRESS.md línea 121 dice que faltan, y "todo texto médico pasa por revisión de médicos" (línea 998) choca con la etiqueta de no validado. Esfuerzo S.

**IA-07 Medio. Primer uso largo.** Evidencia followedDecks vacío por defecto (people.ts línea 89). El registro no pide ramas, minutos ni fecha (OnboardingScreen.tsx líneas 150-250, con textos muertos en features.ts líneas 51-56). Camino, Inicio dice "Nada vencido", Repasar dice "No sigues ningún mazo", luego Mazos, Seguir y Repasar. Son 5 toques a la primera tarjeta y el Plan nace calibrando sin minutos. Recomendación, preguntar ramas y minutos y seguir el mazo de su rama. Esfuerzo M.

**IA-08 Medio. Repasar compite consigo misma.** Evidencia captura fase-c2-etapa2/atrasos-aviso. "Repasar" sale 4 veces (título, pestaña, tarjeta, botón). Antes del botón hay aviso de atrasos, herramientas (OverdueTools.tsx, 349 líneas) y la tarjeta de selección. Límites de hoy junta inputs, Perfil guía, sin límite, sugerencia y enlace al Plan (captura repasar-limites-carga-diaria). Recomendación, botón primero, atrasos en una sola acción y límites en Configuración. Esfuerzo M.

**IA-09 Medio. Simular tiene dos botones primarios.** Evidencia captura fase-c/03-simular. Tres selects, casilla y botón arriba, ramas plegadas debajo del botón y una segunda tarjeta con su propio Empezar y otra etiqueta de demo. Recomendación, selector Práctica o Examen con un botón y un bloque de filtros. Esfuerzo S.

**IA-10 Medio. Pregunta sin salida y con barra siempre visible.** Evidencia t.simulator.abandon sin uso (features.ts línea 840), SessionHeader sin acciones en QuestionScreen.tsx, BottomNav siempre montada (AppShell.tsx línea 124). session_ended de práctica solo se emite en el resumen (SessionSummaryScreen.tsx línea 65). Efecto, un toque accidental en Inicio abandona sin cerrar la sesión. Recomendación, "Terminar práctica" y ocultar la barra en Pregunta, Examen y Repaso. Esfuerzo M.

**IA-11 Medio. Progreso y Tutor se duplican.** Evidencia focusItems.ts líneas 1-3, "Tus 3 focos" (Progreso) es lo mismo que "Tus prioridades" (Tutor). "Tu resumen" titula además una parte de Conócete (insights.ts línea 271). Las trampas salen en 5 sitios (widget, Conócete, Tutor, Simular, Resultados). Tutor mide unos 3,800 px en teléfono (captura 06-tutor) y "Tarjetas en borrador" solo dice que llegará. Recomendación, un hub de Progreso con pestañas Resumen, Conócete y Tutor. Esfuerzo L.

**IA-12 Medio. Sesgo, trampa y distractor para lo mismo.** Evidencia "Patrón de sesgo" (features.ts línea 117), "Consejos por sesgo" (tutor.ts línea 163), "Trampas en las que caíste" (exam.ts línea 162), "Qué trampas te atrapan" (insights.ts línea 282), "tipos de distractor" (features.ts línea 185). Hay 18 apariciones de trampa y 9 de sesgo. Recomendación, "trampa" en toda la interfaz del alumno. Esfuerzo S.

**IA-13 Medio. Jerga de motor y de Anki.** Evidencia FSRS (features.ts líneas 265, 271, 277, 970, 982), sanguijuela (líneas 727 y 1270, aunque Conócete usa "Tarjetas que se te resisten", insights.ts línea 238), cloze (línea 560), Heatmap (línea 110), "Agregar widget" (línea 94), "tarjetas maduras" (insights.ts línea 229), contadores Aprendizaje y Programadas (líneas 717-718) y "R3" en el encabezado sin explicar a primera vista. Esfuerzo S.

**IA-14 Medio. Patrones de interfaz inconsistentes.** Evidencia, dos estilos de pestañas (StudyTabs.tsx línea 20 y SettingsScreen.tsx líneas 78-84) y un tercero en las fichas de modo (ReviewSetup.tsx línea 92). Tres formas de plegar (Disclosure, details en SessionSummaryScreen.tsx línea 224 y en el registro, Tabs). Seis confirmaciones de guardado distintas (features.ts líneas 245, 239, 913, 1063, 635, 1240). Guardado inmediato mezclado con barra de guardar. Esfuerzo M.

**IA-15 Medio. Herramientas de desarrollo y admin al alcance del alumno.** Evidencia, SettingsScreen.tsx muestra a todos "Base local enarm_real", el interruptor Mi cuenta o Demostración y el estado del proxy de IA. Al pasar a Demostración aparece el panel que genera 300 alumnos simulados, sin guarda de rol. /rol no tiene enlace, pero sin Supabase cualquiera lo abre y se nombra dueño (preferences.ts línea 81). Con nube el rol viene del servidor (RoleSelectorScreen.tsx línea 36). Esfuerzo M.

**IA-16 Bajo. Nombres cruzados.** Evidencia, "Plan" en la barra (es-MX.ts línea 186), "Planificador" en el título (línea 78), "Plan Gratis" en suscripción y "Poner mis minutos en Plan" (features.ts línea 1226). Dos pantallas se llaman "Configuración" (es-MX.ts líneas 94 y 138). "Resumen de sesión" y "Resumen de la sesión" en la misma pantalla (es-MX.ts línea 41, features.ts línea 843). "Tarjeta", "nota" y "carta" para lo mismo (features.ts líneas 491, 505, 562, 588). exam.ts línea 195 manda a "Cuenta" un ajuste que vive en Configuración, Estudio. Esfuerzo S.

**IA-17 Bajo. Texto que explica la interfaz.** Evidencia, pista de descarte en cada pregunta (exam.ts línea 10), líneas de atajos (features.ts líneas 802-811), introducción larga del examen (exam.ts línea 21), días fáciles de unos 380 caracteres (features.ts línea 292), pista de cloze de unos 430 (línea 574) y "Hoy 23 · lun 12 22" sin sentido (captura atrasos). El saludo "Hola, alias" queda oculto tras el ícono de información (HomeScreen.tsx línea 94). Esfuerzo S.

**IA-18 Bajo. Textos muertos y capturas viejas.** Evidencia, más de 12 claves sin uso (onboarding.examDate, branches, consents, photoSoon, nav.more, roles.change). consentsDescription promete cambiarlos en Perfil y esa pantalla no existe. La descripción del registro lista fecha y ramas que no se piden (es-MX.ts línea 18). Las capturas de fase-c muestran Mazos en el riel, la pregunta de confianza y precios de 249, previos al D-087. Esfuerzo S.

**IA-19 Bajo. Género.** Evidencia "estaba cansado" (features.ts línea 694), "Seguro" (líneas 679 y 798). Recomendación, "con cansancio" y "Lo sé". Esfuerzo S.

## Referentes
- **Anki** lista de mazos con tres contadores y un solo Estudiar. Repasar se parece, pero carga atrasos y límites encima.
- **AMBOSS y UWorld** plan visible en la entrada, enlace de cada respuesta a su explicación y modo tutor o cronometrado como una sola elección al crear la prueba. Aquí Simular tiene dos tarjetas.
- **Quizlet y Duolingo** piden meta y tiempo al inicio, empiezan la primera sesión de inmediato y cierran cada sesión con el siguiente paso. La app tiene racha y congeladores, pero no el siguiente paso.
- **Ventajas propias** descarte de opciones, trampas por distractor, alarmas de ritmo, calibrando honesto sin predecir puntaje, FSRS acotado por la fecha del examen, planificador con aviso de sobrecarga, repartir y deshacer atrasos, y Mis errores que alimenta el repaso.

## Lo que ya está bien
- Barra y riel con alsoActive (Mazos y Explorar dentro de Repasar) y aria-current.
- Modo enfoque (SessionHeader sin racha) y ActionDock con el botón principal pegado a las opciones.
- Repasar con el botón arriba y su conteo, tres contadores con texto y filtros plegados con resumen de una línea.
- Estado calibrando con cuánto falta y sin promesa de puntaje.
- Una sola franja de Datos simulados y una etiqueta de demostración por contenido.
- Plan de hoy con enlace por tarea (tema precargado) y ajustes con su efecto en minutos.
- Resultados del examen con "Repasar ahora" en el segundo bloque.
- Tuteo consistente y sin errores de ortografía en unas 2,600 líneas de textos.
- Configuración con pestañas y una sola barra de guardar.
- Guarda de rol con carga diferida de las áreas de médico y admin.

## Propuesta de reorganización, por impacto
1. Inicio pasa a ser "Hoy". Un botón Empezar abre la siguiente tarea del plan y una lista muestra el avance, con una sola definición de hoy.
2. Barra del teléfono con Inicio, Repasar, Simular, Progreso y Más. Más lista Plan, Tutor, Party, Mazos, Perfil y Configuración.
3. Plan dentro de Hoy y Tutor dentro de Progreso, con pestañas Resumen, Conócete y Tutor. Sin focos duplicados.
4. Una sola Configuración. En Repasar y Plan queda un resumen con "Cambiar".
5. Cada sesión cierra con siguiente paso (errores, plan, Progreso) y Pregunta gana "Terminar práctica".
6. Registro con ramas, minutos y meta, que sigue el mazo de su rama y entra a la primera tarjeta.
7. Ocultar lo no construido y limpiar las promesas de Próximamente y de fases.
8. Simular con selector Práctica o Examen, un botón y un bloque de filtros.
9. Glosario único (trampa, tarjeta, "tarjeta que se te resiste", mapa de actividad) y barrido de claves muertas y de género.
10. Modo enfoque sin barra inferior en Pregunta, Examen y Repaso.
11. Un componente de pestañas, de plegado y de guardado, con un solo mensaje de "Guardado".
12. Roles. Demo y proxy solo para admin, /rol solo en desarrollo y un "ver como alumno" para médico y admin.
