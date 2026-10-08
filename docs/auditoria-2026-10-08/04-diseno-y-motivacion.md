# Auditoría de diseño y motivación de Studiare

## Alcance y límites
- Abrí 107 de las 284 capturas. Fase C casi completa (72 de 76) y muestras de C2, compactación, fase A y fase B. Leí tokens, i18n, layout y las funciones de alumno
- Las capturas de fase-a y fase-b son esqueletos de la Fase A con otra identidad. No las usé para juzgar el diseño actual
- No existen capturas de portada, onboarding real, final de repaso, tarjeta revelada con sus cuatro botones, Pomodoro, Apariencia, avatar, tabla de niveles, edición del tablero ni de un alumno nuevo en Inicio. Eso lo juzgué solo por código y lo marco
- Las capturas de fase C y C2 son de página completa y sin movimiento reducido (tests/screenshots, fullPage). Por eso la barra fija y el encabezado salen a media página y varias tarjetas salen a medio desvanecer. Lo traté como artefacto de captura

## Resumen
- La identidad es seria y cálida. Marfil, azul petróleo y oro, color por rama y títulos en Bricolage. Se distingue del frío de Anki y de lo clínico de AMBOSS y UWorld
- El texto de marca sigue diciendo Prototipo ENARM y casi todo es la misma tarjeta blanca con el mismo peso
- La motivación existe en piezas (XP, racha, títulos de R0 a Eminencia, Party) pero sin hilo. No hay festejo de nivel ni de meta, sí hay confeti con 20% de aciertos y el avance se pinta en rojo
- El teléfono está bien resuelto dentro de las sesiones y flojo fuera de ellas. Botones de 36 px, páginas de 3,400 a 3,800 px y lo social a dos toques
- Los momentos que deciden si vuelve mañana son la primera sesión y el fin de sesión, y son los más pobres
- Mayor retorno. Primera sesión guiada, Inicio con una acción del día, festejos por mérito y curva de progreso

## Calificaciones
- Atractivo visual 7 de 10. Paleta, tipografía y modo oscuro coherentes. Resta el vacío en escritorio, tablas planas, selects del sistema y cero ilustración o mascota
- Consistencia 6 de 10. Hay tokens y componentes, pero se improvisan etiquetas entre paréntesis, tamaños de botón, selects nativos y colores de la llama
- Motivación 5 de 10. Tono amable y piezas de juego correctas, pero sin celebración por mérito, sin curva de mejora y con rojo por defecto
- Móvil 7 de 10. Barra de acciones fija, modo enfoque y navegación inferior bien. Resta el tamaño táctil, las páginas larguísimas y las funciones escondidas

## Hallazgos

**DV-01 · Alto · M. Sin primera experiencia guiada.** Evidencia. OnboardingScreen.tsx pide alias, correo, meta y privacidad. La especificación 10.1 pedía fecha del ENARM, minutos y ramas. Al terminar cae en Inicio. No hay captura del alumno nuevo. Siente. Un formulario y luego un tablero vacío con tres ceros. Recomendación. Tres pasos (rama, fecha, minutos), seguir un mazo por defecto y una primera sesión de 5 preguntas con su primer XP festejado.

**DV-02 · Alto · S. La marca textual sigue siendo provisional.** Evidencia. brand.ts línea 3 y index.html línea 11 dicen Prototipo ENARM. La tarjeta de logro dice Prototipo ENARM (18-party-duelo-pendiente--escritorio-claro.jpg). themeColor 1f5f73 no coincide con el primario 0e5a6b. Siente. El logo dice Studiare y la pestaña, la app instalada y lo que comparte dicen otra cosa. Recomendación. Cambiar BRAND y revisar manifest, título y tarjeta.

**DV-03 · Alto · M. Los festejos premian lo incorrecto y faltan los correctos.** Evidencia. SessionSummaryScreen.tsx línea 62 lanza confeti siempre, también con 1 de 5 (13-resumen--telefono-claro.jpg) o sesión abandonada, y cubre el texto. En Party sale junto a Perdiste por exactitud (19-party-duelo-resultado--telefono-claro.jpg). Los tipos level y goal de celebrate.ts solo se usan en la vista previa de Apariencia (AppearanceSettings.tsx línea 353). animate-pop y animate-glow casi no se usan. Siente. Confeti que suena a burla y silencio cuando sube de nivel. Recomendación. Festejo por mérito (nivel, meta del día, hito de racha, mejor semana) y mensaje de esfuerzo sin confeti cuando la sesión sale mal.

**DV-04 · Alto · L. No hay hilo de progreso en el tiempo.** Evidencia. Progreso (04-progreso--escritorio-claro.jpg) es una foto fija. No hay curva semanal ni comparación con la semana pasada. La portada promete misiones, ligas y avance contra tu intento anterior (features.ts, landing) y PROGRESS.md dice que faltan misiones, ligas e insignias. Siente. No ve que mejora y descubre que lo prometido no existe. Recomendación. Curva de exactitud por semana, cambio contra hace 2 semanas y bajar de la portada lo que no existe.

**DV-05 · Alto · M. El rojo es el color por defecto del avance.** Evidencia. Las cuatro ramas salen rojas con 55, 40, 56 y 49% (04-progreso--escritorio-claro.jpg). Temas débiles en chips rojos (01-inicio-analitico--telefono-claro.jpg). Cinco Enfócate con diana roja. Resultados del examen con 20 renglones Fallada y la frase Un examen difícil no es un veredicto al final (16-examen-resultados--telefono-claro.jpg). Siente. Culpa, porque el umbral de 60% no tiene contra qué compararse. Recomendación. Tono azul o ámbar para en construcción, rojo solo para riesgo, mostrar el cambio, abrir con una fortaleza y subir la frase de contexto.

**DV-06 · Alto · M. Inicio no abre con una acción ni con un saludo.** Evidencia. El saludo vive detrás del ícono de información (HomeScreen.tsx, description) y el encabezado no muestra racha ni nivel (stats false). D-060 prometía Inicio con el plan del día y un botón grande (DECISIONES.md línea 501). El acomodo Analítico omite racha, nivel y meta (el Esencial sí los trae) (01-inicio-analitico--telefono-claro.jpg). Textos como Todavía no cumples la meta de hoy (features.ts línea 140). Siente. Un tablero de datos sin invitación. Recomendación. Tarjeta principal Tu sesión de hoy con tiempo estimado y un solo botón, semana de 7 puntos y saludo visible.

**DV-07 · Medio · S. El fin del repaso es mínimo.** Evidencia. ReviewScreen.tsx líneas 631 a 660. Una palomita, Terminaste por hoy, el conteo y dos botones. Sin captura. Siente. Cierra en seco el momento más repetido del producto. Recomendación. Mostrar la barra de nivel que avanzó, la racha del día, cuánto tocará mañana y una frase de cierre.

**DV-08 · Medio · S. Sin avance visible dentro de la sesión.** Evidencia. No hay ProgressBar en Repaso, Pregunta ni Examen. Solo Pregunta 1 de 5. Con la retroalimentación al final (D-087) tampoco hay respuesta inmediata. Siente. Avanza a ciegas y sin recompensa. Recomendación. Barra delgada arriba y un acuse neutro por respuesta.

**DV-09 · Medio · M. Party desanima al recién llegado.** Evidencia. Ana queda 7 de 7 con 0 XP, sin avatares ni medallas, tabla plana (18-party-duelo-pendiente--escritorio-claro.jpg). Duelo perdido solo dice Perdiste por exactitud. El párrafo de privacidad corre unos 170 caracteres por línea en escritorio. Siente. Último de siete antes de empezar. Recomendación. Ligas por división como propone ANALISIS_PLATAFORMA.md línea 117, comparar contra tu semana pasada y un cierre de duelo con lo aprendido.

**DV-10 · Medio · S. Lo motivador está a dos toques en el teléfono.** Evidencia. Plan, Tutor, Party y Configuración son railOnly (navigation.ts) y se llegan desde Accesos en Perfil (08-perfil--telefono-claro.jpg). Siente. Que Party y Tutor no existen. Recomendación. Atajos en Inicio y en el cierre de sesión.

**DV-11 · Medio · M. Escritorio con media pantalla vacía.** Evidencia. 02-repasar--escritorio-claro.jpg, 11-pregunta--escritorio-claro.jpg y la columna izquierda de 12-retroalimentacion--escritorio-claro.jpg. En Inicio Para hoy ocupa media anchura y Patrón de sesgo tiene un hueco grande (01-inicio-analitico--escritorio-claro.jpg). El heatmap queda chico y pegado a la izquierda. Siente. Una interfaz de teléfono estirada. Recomendación. Layout de dos columnas con la acción principal a la derecha y celdas del heatmap proporcionales al ancho.

**DV-12 · Medio · M. Pantallas largas y repetitivas.** Evidencia. Tutor mide 3,795 px en teléfono con seis barras casi idénticas de Posibles patrones (06-tutor--telefono-claro.jpg). Progreso mide 3,420 px con 19 filas en Conócete. Siente. Cansancio antes de la acción. Recomendación. Agrupar patrones iguales en uno con lista, tres lecturas visibles y el resto plegado.

**DV-13 · Medio · S. Contraste y tamaño en detalles de juego.** Evidencia. Oro de R3 y Nivel sobre fondo claro a 3.3 y 3.6 a 1 con 12 px (tokens.css línea 32, HeaderStats.tsx línea 50). Textos de 10.4 px (HeaderStats.tsx línea 58, HeatmapWidget). Logo del riel sin versión oscura, la parte azul oscura queda cerca de 1.5 a 1 (BottomNav.tsx, 01-inicio-analitico--escritorio-oscuro.jpg). Celdas vacías del heatmap a 1.1 a 1 en oscuro. Siente. Que debe forzar la vista. Recomendación. Oro más oscuro para texto, mínimo 12 px, logo claro en oscuro y celdas con borde.

**DV-14 · Medio · M. Sistema de componentes a medias.** Evidencia. 44 usos de select nativo (03-simular--telefono-claro.jpg) y casillas sin interruptor. 99 usos de botón sm de 36 px bajo los 44 px del propio token. Eliminar mazo igual que Repasar (mazos-arbol--telefono-claro.jpg). Tu respuesta y Respuesta correcta como texto entre paréntesis (12-retroalimentacion--escritorio-claro.jpg). La llama es turquesa en el widget (SimpleWidgets.tsx, text-primary) y naranja en el encabezado. Siente. Piezas de productos distintos. Recomendación. Select y Switch propios, botones táctiles de 44, insignias para esos estados.

**DV-15 · Medio · S. La etiqueta de demostración estorba por repetición.** Evidencia. Aparece dos veces en Simular (03-simular--telefono-claro.jpg) y en cada pregunta, retroalimentación, resumen y editor. El ámbar pesa más que el contenido. El aviso Datos simulados en una sola línea es el buen modelo. Siente. Que la advertencia grita más que la pregunta. Recomendación. Una franja por pantalla de estudio y una insignia compacta Demo por pregunta. No quitarla.

**DV-16 · Medio · S. Ayuda que se repite y jerga.** Evidencia. Descartar lo que sabes que no es te acerca a la respuesta sale en cada pregunta y está mal redactada (11-pregunta--escritorio-claro.jpg). Repasar usa Aprendizaje y Programadas, y Hoy 23 · lun 12 22 no se entiende (atrasos-aviso-de-recuperacion--telefono-claro.jpg). Siente. Ruido y duda. Recomendación. Explicar una vez y plegar, y escribir las fechas completas.

**DV-17 · Medio · S. Repasar recibe con alarma.** Evidencia. Caja con borde ámbar Tienes 45 tarjetas atrasadas encima del botón principal y tres herramientas antes de empezar (atrasos-herramientas--telefono-claro.jpg). Repasar 95 tarjetas intimida. Otra vez es un botón rojo sólido (ReviewScreen.tsx línea 830). El texto es amable, el contenedor no. Siente. Que va tarde. Recomendación. Tarjeta informativa azul, botón de empezar primero, empezar con 20 y Otra vez en tono neutro.

**DV-18 · Medio · S. Las capturas no validan el móvil real.** Evidencia. fullPage sin reducir movimiento. En 11-pregunta--telefono-oscuro.jpg la barra de Responder cubre una opción y en las de claro el encabezado corta el caso. Dudé y Quitar marca se ven gris azulado como deshabilitados en las cuatro variantes. El código usa la variante primaria (QuestionScreen.tsx línea 427), así que probablemente es media transición. No pude confirmar el estado final. Recomendación. Capturar por ventana de 390 por 844 y esperar transiciones.

**DV-19 · Medio · S. Presión por racha sin salida.** Evidencia. El chip naranja con 0 aparece en cada pantalla del alumno nuevo (13-resumen--telefono-claro.jpg). Con 54 días no hay festejo de hito ni día de descanso planeado. La portada habla de guardias y ANALISIS_PLATAFORMA.md línea 125 prometía un modo enfoque que oculta ligas. No existe esa opción. Siente. Presión por no perder el número. Recomendación. Ocultar el chip con racha 0, descanso semanal elegible y Modo calma.

**DV-20 · Bajo · S. Microinteracciones escasas.** Evidencia. index.css define tres animaciones. Todas las tarjetas hacen rise de 420 ms a la vez. Sin contador de XP que sube, sin transición entre rutas y LoadingState es genérico (states.tsx línea 90). Respeta reducir movimiento (index.css líneas 88 a 107), y eso está bien. Siente. Una app que no responde a sus logros. Recomendación. Contador de XP, barra que se llena al ganar y esqueletos con la forma de la tarjeta.

**DV-21 · Bajo · S. Suscripción promete lo que no hay.** Evidencia. Tres de cinco beneficios llevan palomita y Próximamente (10-suscripcion--telefono-claro.jpg). La captura muestra 249 y 1,990, anteriores a D-087, así que está desactualizada. Siente. Desconfianza. Recomendación. Mostrar solo lo existente y regenerar la captura.

**DV-22 · Bajo · M. Portada sin prueba visual.** Evidencia. LandingScreen.tsx no lleva imagen del producto. Dice Todo texto médico pasa por revisión mientras el banco es de demostración (features.ts, landing). No hay captura, lo juzgué por código. Siente. Promesa sin prueba. Recomendación. Una captura real en el héroe y la frase ajustada a lo cierto.

## Lo que ya luce bien (no romper)
- Paleta de tokens con color por rama (coral, turquesa, magenta, esmeralda, ámbar) y oro solo para juego
- Bricolage en títulos y cuatro fuentes de lectura, entre ellas Atkinson y Lexend
- Modo oscuro coherente con primario turquesa y acento cálido
- Modo enfoque en pregunta, examen y tarjeta, con barra de acciones al alcance del pulgar
- Enunciado en 19 px y descarte con tachado y deshacer
- Tono del tutor. Creo que, Dile si te sirve, con Me sirve y No me ayuda
- Estado calibrando con barra y cuánto falta (14-simular-examen--telefono-claro.jpg)
- Tarjeta de logro con número dorado y banner de Datos simulados en una línea
- Encabezado de Perfil con degradado y avatar. Tarjetas de mazo con color de rama y barra de avance
- Reducir movimiento y apagar confeti y sonido por separado, además de los avisos calmados del examen y de calidad de tarjeta

## Diez rediseños de mayor impacto, en orden
1. **Inicio, Tu día.** Tarjeta grande con saludo, minutos estimados y un botón Empezar. Debajo la semana de 7 puntos con la racha y la meta como anillo. Los demás widgets bajan y se pliegan (DV-06)
2. **Bienvenida y primera sesión.** Tres pasos cortos y 5 preguntas de práctica con un festejo y el primer nivel visible. Termina en Inicio con la racha ya en 1 (DV-01)
3. **Fin de sesión de repaso y práctica.** Barra de nivel que avanza, racha, XP por motivo, lo que tocará mañana y una frase de esfuerzo. Confeti solo si hay mérito (DV-03, DV-07)
4. **Progreso.** Arriba una curva semanal con el cambio contra hace 2 semanas y una fortaleza. Ramas en azul y ámbar con flecha de tendencia. Conócete reducido a tres lecturas (DV-04, DV-05, DV-12)
5. **Pregunta y examen.** Barra de avance fija arriba, acuse neutro por respuesta, una sola franja Demo y la ayuda de descarte plegada tras la primera vez (DV-08, DV-15, DV-16)
6. **Party.** Ligas por división con ascenso, avatares y medallas, comparar contra tu semana pasada y tarjeta de logro con la marca Studiare. Entrada desde Inicio y la barra inferior (DV-02, DV-09, DV-10)
7. **Repasar.** El botón de empezar primero con porción de 20, contadores con una leyenda, y atrasos como tarjeta informativa en azul con fechas completas (DV-16, DV-17)
8. **Resultados del examen.** Abrir con lo que sí salió bien, mostrar el cambio contra el examen anterior y mover Cómo leer este resultado arriba. Los 20 renglones, filtrados por Falladas, quedan abajo (DV-05)
9. **Perfil.** Vitrina de insignias (constancia, rama, técnica), título de nivel con su siguiente escalón y semana en cifras. El formulario de alias pasa a Configuración (DV-04, DV-19)
10. **Tutor.** Una hipótesis principal con su acción y botón. Patrones repetidos agrupados en una lista y el resto plegado (DV-12)

Victorias rápidas de 1 día. DV-02, DV-13, DV-15, DV-16, DV-21.
