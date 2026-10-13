# Revisión de diseño del bloque B2, rediseño visual

Revisión independiente del bloque B2 del plan del cambio V3 (docs/PLAN_DEL_CAMBIO.md, sección B2, y D-121). Se compararon las 38 pantallas de docs/screenshots/v3/antes contra docs/screenshots/v3/b2 en 1280 claro y 390 claro, todas las de oscuro y todas las de 1920, y se revisaron src/ui/tokens.css, src/index.css, src/ui/components, src/ui/states, src/app/layout y las pantallas de src/features. No se corrió código ni se editó nada.

## Resumen

- Lo central del bloque está hecho y se nota. Ya no hay degradados, dorado, brillos ni sombras de color en ninguna captura, la prueba src/ui/design.test.ts lo vigila, y el único color de acción es #156082 en claro y en oscuro, con texto blanco a 6.9 a 1. Racha, nivel y XP van en gris, la etiqueta de demostración por pantalla desapareció y los avatares generados también.
- Los títulos de pantalla ya son de 20 y 24 px en todas partes gracias a la utilidad screen-title, los íconos son solo lucide-react con grosor 2, hay atajos de teclado en repaso, simulador y examen, el movimiento respeta reducir movimiento y los errores van junto al campo. No hay signos de exclamación, emojis ni mayúsculas sostenidas en la interfaz.
- El modo oscuro es legible en todas las pantallas. Todos los pares de texto que revisé pasan de 4.5 a 1 (muted 7.5, primary-ink 8.5, estados entre 6.9 y 8.3). Solo dos elementos sin texto quedan bajos, la barra neutra de XP y la línea clara de la gráfica de carga.
- Lo que más sigue delatando una página hecha en serie son dos cosas. Las píldoras, que siguen en 66 lugares de 40 archivos (pestañas, filtros, chips de rama y de dominio), y las etiquetas de colores por todos lados en Progreso e Inicio (veinte chips rojos, ámbar y verdes en una sola pantalla). La prueba de diseño solo vigila el botón, así que nada impide que vuelvan.
- Detrás de eso quedan cosas medianas que sí tocan la lista del plan. Cargando como texto plano sin esqueleto en Inicio, cuatro títulos del mismo tamaño que el saludo, tarjetas dentro de tarjetas en Mazos y Resultados, el input de archivo en inglés y con píldora, XP en verde en Resultados del examen y el texto promocional en verde en Suscripción y Portada.

## Hallazgos

### H01. Píldoras por todos lados. Gravedad alta

- Pantallas y capturas. Repasar (02-repasar--1280-claro y 390-claro, pestañas Repasar, Mazos, Explorar, Apuntes y los filtros Lo que toca hoy, Solo vencidas y Solo nuevas), Explorar (04-explorar--1280-claro, chips de estado), Progreso (07-progreso--1280-claro, 30 días y 60 días, porcentajes de dominio y Calibrando), Resultados del examen (20-examen-resultados--1280-claro, Todas, Falladas, En blanco y Marcadas), Configuración y Bienvenida (14-configuracion-appearance--390-claro, 32-bienvenida--1280-claro, pestañas), Pregunta y Examen (16 y 19, chip de rama), Mazos (03, chip de rama y etiquetas), Usuarios del admin (27, etiqueta de rol).
- Qué se ve. El contenedor de pestañas y cada pestaña son rounded-full, los filtros de selección son píldoras con borde de 2 px y cada etiqueta chica es una píldora. Son 66 usos de rounded-full en 40 archivos de src/features, src/app y src/ui. Una parte son avatares, barras de progreso y puntos de estado, que sí pueden ser redondos, pero más de 40 son pestañas, filtros y etiquetas.
- Qué rompe. "Píldoras y etiquetas de colores por todos lados" y "estilos distintos entre pantallas" de la lista 1, y "sin píldoras en todos lados" de la nota de botones del plan. La inconsistencia es visible porque el mismo filtro se resuelve de tres formas, píldoras en Resultados del examen, botones rounded-md primario y secundario en Resumen de sesión y pestañas rounded-md en Borradores del médico.
- Corrección. Crear en src/ui/components un SegmentedControl (pestañas y filtros excluyentes, rounded-md, fondo muted, activa en surface con borde) y un FilterChip (aria-pressed, rounded-md), y usarlos en src/features/review/StudyTabs.tsx, src/features/settings/SettingsScreen.tsx (líneas 76 a 82), src/features/onboarding/OnboardingScreen.tsx (84 a 96), src/features/review/ReviewSetup.tsx (110), src/features/explore/FilterPanel.tsx (91), src/features/progress/FutureLoadCard.tsx (85), src/features/exam/ExamReview.tsx (77) y src/features/decks/DeckEditorDialog.tsx (230). Para las etiquetas, usar el Badge que ya es rounded-sm en lugar de spans propios en src/features/exam/ExamQuestion.tsx (73 y 79), src/features/simulator/QuestionScreen.tsx (357), src/features/decks/DecksScreen.tsx (149 y 183), src/features/progress/ProgressScreen.tsx (217, 225 y 296), src/features/progress/InsightsPanel.tsx (209), src/features/explore/ResultList.tsx (99), src/features/admin/AdminUsersScreen.tsx (197), src/features/admin/CloudUsers.tsx (254), src/features/physician/ReportsScreen.tsx (200), src/features/physician/QuestionBankScreen.tsx (227) y src/features/decks/ImportDeckCard.tsx (252). Ampliar src/ui/design.test.ts para que falle con rounded-full fuera de una lista corta permitida (avatar, progress-bar, puntos de estado y el reloj del Pomodoro).

### H02. Etiquetas de colores por todos lados en Progreso e Inicio. Gravedad alta

- Pantallas y capturas. Progreso (07-progreso--1280-claro, 1280-oscuro, 390-claro y 1920-claro) e Inicio (01-inicio--1280-claro y 390-claro).
- Qué se ve. En Progreso, la sección Conócete lleva 16 chips de color (Enfócate en rojo seis veces, A vigilar en ámbar tres y Fortaleza en verde siete) y cada fila además trae su ícono del mismo color. Ramas y subespecialidades pone cuatro porcentajes en píldora roja. Tus 3 focos de la semana tiene borde izquierdo rojo de 4 px, ícono rojo y numerales en círculo rojo. En Inicio, Temas para reforzar muestra cinco porcentajes en píldora roja y Patrón en rojo. Es la misma estructura que antes del rediseño, solo con otros tonos.
- Qué rompe. "Píldoras y etiquetas de colores por todos lados" de la lista 1. También estira 4.7, porque los colores de estado se reservan para correcto e incorrecto, avisos y errores, y aquí clasifican hábitos de estudio y niveles de dominio en una pantalla que no es un error. En una pantalla de estudio sobria el rojo debería ser raro, y aquí es lo primero que se ve.
- Corrección. En src/features/progress/InsightsPanel.tsx (levelStyle, líneas 38 a 46, y el chip de la línea 209) dejar el color solo en el ícono o en un punto de 8 px y poner la palabra en Badge neutral. En src/features/progress/masteryChip.ts devolver clases de texto sin fondo (el porcentaje tabular ya dice si va mal) o un punto de color junto al número. En WeeklyFocus (InsightsPanel.tsx 66 y 85) usar borde normal, ícono en primary-ink y numerales en bg-muted. En src/features/home/widgets/AnalysisWidgets.tsx aplicar lo mismo a Temas para reforzar y a la etiqueta Patrón.

### H03. XP en verde en Resultados del examen. Gravedad media

- Pantallas y capturas. Resultados del examen (20-examen-resultados--1280-claro con +17 XP y 1280-oscuro con +4 XP).
- Qué se ve. La línea de tiempo del examen pinta el XP ganado en verde. En Retroalimentación y en Resumen de sesión el mismo dato ya va en gris.
- Qué rompe. "Lo dorado del nivel y del XP en neutro" y 4.7. También "estilos distintos entre pantallas".
- Corrección. En src/features/exam/ExamResultsScreen.tsx línea 226 cambiar text-success por text-fg-muted, como en FeedbackScreen.

### H04. Cargando como texto plano y rueda que gira. Gravedad media

- Pantallas y capturas. Inicio (01-inicio--1920-claro y 1920-oscuro muestran la palabra Cargando sola dentro de Trampas que te hacen fallar y Temas para reforzar).
- Qué se ve. Los widgets de análisis, el plan actual y las misiones pintan un párrafo con el texto de carga y nada más (src/features/home/HomeScreen.tsx 259 y 286, src/features/home/widgets/AnalysisWidgets.tsx WidgetLoading). El LoadingState de src/ui/states/states.tsx sí trae tres líneas de esqueleto, pero conserva un LoaderCircle con animate-spin encima.
- Qué rompe. "Esqueletos de carga en lugar de ruedas que giran" de la lista 2.
- Corrección. Un componente Skeleton en src/ui/components (líneas animate-pulse con las alturas del contenido que va a llegar, por ejemplo tres filas de barra para Trampas y cinco filas para Temas) y usarlo en WidgetLoading, PlanCard y MissionsSection. En LoadingState quitar el LoaderCircle y dejar el texto solo para el lector de pantalla.

### H05. Varios títulos fuertes en Inicio. Gravedad media

- Pantallas y capturas. Inicio (01-inicio--1280-claro, 1920-claro y 390-claro).
- Qué se ve. Tus repasos, Tus simuladores, Misiones de hoy y Reto de Party usan la misma utilidad screen-title que el saludo (src/features/home/HomeScreen.tsx 156 y SideSection), así que la pantalla tiene cinco títulos de 24 px en negritas. Plan actual además pone Gratis en text-2xl extrabold azul (línea 286), que compite con todo lo demás.
- Qué rompe. "Un solo título fuerte por pantalla" de la lista 2. D-121 dice que screen-title aplica a "los grupos grandes", pero en pantalla el saludo deja de ser el título de la página.
- Corrección. Los h2 de grupo en text-lg font-semibold (un paso arriba de CardTitle) y Gratis en text-xl font-bold text-fg. Si Ricardo prefiere conservar los grupos grandes, entonces el saludo debería distinguirse por peso o posición, no quedar igual.

### H06. Tarjetas dentro de tarjetas. Gravedad media

- Pantallas y capturas. Mazos (03-mazos--1280-claro, tres tarjetas de mazo con borde y sombra dentro de Mazos precargados, src/features/decks/DecksScreen.tsx 131), Resultados del examen (20-examen-resultados--1280-claro, veinte cajas con borde dentro de Revisión pregunta por pregunta, src/features/exam/ExamReview.tsx 143), Progreso (07-progreso--1280-claro, cuatro cuadros bg-muted dentro de Carga futura), Configuración Pomodoro (14-configuracion-pomodoro--1280-claro, panel bg-muted con los campos dentro de la tarjeta) y Tutor (09-tutor--1280-claro, el Disclosure Ver evidencia dentro de cada hipótesis). Planificador y Logros también lo hacen, pero B3 los quita y no los cuento.
- Qué rompe. "Tarjetas dentro de tarjetas" de la lista 1 y la "densidad útil" de la lista 2, porque cada caja añade padding y borde sin aportar información.
- Corrección. En Mazos, filas separadas con divide-y sin sombra ni borde propio. En Resultados, lista con divide-y y la fila completa como botón. En Carga futura, un StatPanel de cuatro celdas, que ya existe. En Pomodoro, quitar el bg-muted del panel de campos. En Tutor, Ver evidencia como botón de texto que despliega debajo, sin marco.

### H07. Input de archivo nativo, en inglés y en píldora. Gravedad media

- Pantallas y capturas. Mazos (03-mazos--1280-claro y 390-claro, Sube tu mazo) e Importar banco del médico (26-medico-importar--1280-claro).
- Qué se ve. El control dice Choose File y No file chosen, textos del navegador, y el botón va con file:rounded-full y en Mazos con fondo primary (src/features/decks/ImportDeckCard.tsx 145, src/features/physician/BankImportScreen.tsx 158, src/features/decks/AiCardsCard.tsx 267). Está igual que antes.
- Qué rompe. "Estilos distintos entre pantallas" de la lista 1, la regla de píldoras y la interfaz en español.
- Corrección. Input con sr-only y un Button variant secondary asociado con label htmlFor que diga Elegir archivo, con el nombre del archivo elegido en texto al lado. src/features/profile/AvatarPicker.tsx ya oculta el input y sirve de modelo.

### H08. El Disclosure no tiene fondo propio. Gravedad media

- Pantallas y capturas. Repasar (02-repasar--1280-claro, 390-claro, 1920-claro y oscuro, Atrasos y fechas de repaso se ve gris mientras Mazos y temas y Límites de hoy se ven blancos) y Simular (06-simular--390-claro, Ramas y subespecialidades gris).
- Qué se ve. src/ui/components/disclosure.tsx pone borde y radio pero no bg-surface, así que el mismo componente se ve blanco dentro de una Card y gris cuando está directo sobre el lienzo.
- Qué rompe. "Estilos distintos entre pantallas" de la lista 1 y la consistencia de bordes y superficies que pide el plan.
- Corrección. Agregar bg-surface al details en disclosure.tsx.

### H09. Select cortado en Simular a 390. Gravedad media

- Pantallas y capturas. Simular (06-simular--390-claro).
- Qué se ve. Los cuatro SelectField van en grid-cols-2 desde el teléfono (src/features/simulator/SimulatorSetupScreen.tsx 185) y la opción Al final de la sesión se corta como "Al final de la se".
- Qué rompe. "Textos que no se amontonan" a 390 px.
- Corrección. grid-cols-1 en el teléfono, sm:grid-cols-2 y lg:grid-cols-4, o acortar las opciones del select.

### H10. Texto promocional en verde. Gravedad media

- Pantallas y capturas. Suscripción (13-suscripcion--1280-claro, 1280-oscuro y 390-claro) y Portada (31-portada--1280-claro, 1280-oscuro, 1920-claro y 390-claro).
- Qué se ve. "Precio Fundador para los primeros 100 usuarios..." y "Ahorras 16% contra 12 meses..." van en text-success negritas y las palomitas de cada plan en verde (src/features/billing/PlanPrice.tsx 31, src/features/billing/SubscriptionScreen.tsx 191 y 210, src/features/landing/LandingScreen.tsx 133, 139 y 146).
- Qué rompe. 4.7, porque el verde queda para correcto. Es marketing, no un estado.
- Corrección. Texto en text-fg font-semibold y palomitas en text-fg-muted. El borde primary del plan destacado ya da el énfasis.

### H11. Franja gris vacía en Perfil. Gravedad baja

- Pantallas y capturas. Perfil (12-perfil--1280-claro, 1920-claro y 390-claro).
- Qué se ve. src/features/profile/ProfileScreen.tsx 53 conserva un bloque de 80 px con bg-muted donde iba el héroe con degradado. A 1920 es una banda gris de borde a borde sin contenido, con el avatar montado encima.
- Qué rompe. Es decoración que sobrevivió al cambio, lo contrario de la sobriedad que busca el bloque.
- Corrección. Quitar la franja y poner el avatar en línea con el alias. B3 mueve Perfil a Configuración, así que conviene hacerlo ahí.

### H12. Barra de XP y línea de realizados con poco contraste. Gravedad baja

- Pantallas y capturas. Barra de nivel arriba a la derecha en todas las pantallas con sesión (01-inicio--1280-claro y 1280-oscuro) y la gráfica Carga de repaso en Inicio.
- Qué se ve. El relleno neutro usa line-strong sobre muted, que da 2.25 a 1 en claro y 2.8 a 1 en oscuro (src/app/layout/HeaderStats.tsx y ProgressBar con tone neutral). La línea Realizados usa chart-done #8fb3c6 sobre blanco, 2.2 a 1, y se ve desvaída frente a la de Programados.
- Qué rompe. Contraste de 3 a 1 que WCAG pide para componentes y gráficas. El texto no se afecta.
- Corrección. En src/ui/tokens.css subir --enarm-line-strong a un gris más oscuro para el relleno (o usar bg-fg-muted en la barra neutra) y --enarm-chart-done a un azul medio como #6f9bb3 en claro.

### H13. Pestañas de Configuración desbordan a 390. Gravedad baja

- Pantallas y capturas. Configuración (14-configuracion-account--390-claro y las otras cuatro pestañas a 390).
- Qué se ve. Solo se ven cuatro de cinco pestañas. Cuenta queda fuera a la derecha con overflow-x-auto y sin ninguna pista de que hay más. Igual que antes.
- Qué rompe. "Nada desbordado" a 390 px.
- Corrección. B3 quita las pestañas de Configuración, así que basta con dejarlo registrado aquí y no gastar en arreglarlo.

### H14. Barra de acciones fija tapa opciones en el teléfono. Gravedad baja

- Pantallas y capturas. Pregunta (16-pregunta--390-claro), Retroalimentación (17-retroalimentacion--390-claro) y Examen (19-examen--390-claro).
- Qué se ve. El ActionDock más la navegación inferior cubren cerca de 180 px de los 844 de alto, y en el examen Marcar para revisar se parte en tres líneas dentro del botón. Es el diseño de D-078 y el contenido se desplaza debajo, así que no es un desbordamiento, pero el texto se amontona.
- Qué rompe. "Textos que no se amontonan" a 390 px.
- Corrección. En src/features/exam/ExamScreen.tsx mostrar el botón de marcar solo con ícono y aria-label en el teléfono, o cambiar el texto a Marcar.

### H15. Usuarios del admin como 300 tarjetas. Gravedad baja

- Pantallas y capturas. Usuarios (27-admin-usuarios--1280-claro y 390-claro).
- Qué se ve. Cada alumno es una caja con avatar, etiqueta de rol y un select, repetida 300 veces. A 390 "Alumno simulado 1" se parte en tres líneas junto al select. Está igual que antes salvo el color.
- Qué rompe. "Tablas y listas alineadas" de la lista 2.
- Corrección. En src/features/admin/AdminUsersScreen.tsx una tabla con alias, rol, plan y acción en computadora y una lista compacta en el teléfono con el select debajo del nombre. Solo lo ve el admin, por eso es baja.

### H16. Portada fuera de la escala de títulos. Gravedad baja

- Pantallas y capturas. Portada (31-portada--1280-claro, 1920-claro y 390-claro).
- Qué se ve. src/features/landing/LandingScreen.tsx 49 pone el h1 en text-3xl sm:text-4xl (30 y 36 px) y cinco h2 en screen-title. El héroe lleva py-14 y la mitad derecha vacía en 1280 y 1920.
- Qué rompe. "Mismos tamaños de título" entre pantallas. Es una página de venta y puede merecer la excepción, pero hoy no está escrita.
- Corrección. O bajar el h1 a 28 px y escribir la excepción en D-121, o aceptar la escala actual y documentarla. Reducir py-14 a py-10 y dar al héroe un ancho máximo de lectura.

### H17. Estados vacíos centrados con marco punteado. Gravedad baja

- Pantallas y capturas. Apuntes (05-apuntes--1280-claro), Banco del médico (21-medico-banco--1280-claro) y Editor (22-medico-editor--1280-claro).
- Qué se ve. StateFrame en src/ui/states/states.tsx centra ícono en círculo de 48 px, título y texto dentro de una caja con borde punteado. Es el patrón genérico de plantilla, y varios estados vacíos no traen acción (en Apuntes la acción está arriba en el formulario, en el Banco no hay acción posible).
- Qué rompe. "Todo centrado" e "ilustraciones genéricas" de la lista 1, y "estados vacíos con una frase y una acción" de la lista 2.
- Corrección. StateFrame alineado a la izquierda, sin borde punteado ni círculo, con el ícono de 20 px en línea con la frase y la acción debajo cuando exista.

### H18. Texto "Tu plan no incluye tarjetas con ia." Gravedad baja

- Pantallas y capturas. Mazos (03-mazos--1280-claro y 390-claro).
- Qué se ve. featureLocked en src/i18n/features.ts 553 pasa el nombre a minúsculas y la sigla IA queda como ia.
- Qué rompe. Es texto, no diseño, pero se ve en la pantalla rediseñada.
- Corrección. No bajar todo a minúsculas, o pasar el nombre ya en minúscula con la sigla respetada.

### H19. Nivel y título en 10 px en el teléfono. Gravedad baja

- Pantallas y capturas. Todas las pantallas con sesión a 390 (01-inicio--390-claro, 02-repasar--390-claro).
- Qué se ve. src/app/layout/HeaderStats.tsx pone R3 y Nivel 8 en text-[0.65rem], unos 10 px, y la línea de XP para el nivel igual.
- Qué rompe. "Textos que no se amontonan" y el mínimo cómodo de 12 px.
- Corrección. text-xs para esas dos líneas y la barra un poco más angosta si no cabe.

### H20. Tonos de rama sin diferencia. Gravedad baja

- Pantallas y capturas. Progreso (07-progreso--1280-claro) e Inicio (01-inicio--1280-claro).
- Qué se ve. Las seis ramas van en azules casi iguales (de #156082 a #5a98b8), así que la barra vertical junto a cada rama ya no distingue nada y queda como adorno. D-121 lo dejó así a propósito y es coherente con un solo color de acción.
- Qué rompe. "Ilustraciones genéricas" en sentido amplio, porque es decoración sin información.
- Corrección. Quitar la barrita en src/features/progress/ProgressScreen.tsx 203 y src/features/shared/BranchTopicPicker.tsx 151 y dejar que la rama se lea por texto, o conservar los tokens para un posible cambio de criterio y no pintarlos.

### H21. Separador que salta de línea en Cuenta a 390. Gravedad baja

- Pantallas y capturas. Configuración Cuenta (14-configuracion-account--390-claro).
- Qué se ve. La línea "Base local enarm_demo · 301 perfiles guardados" se parte y el segundo renglón empieza con el punto medio.
- Qué rompe. "Textos que no se amontonan".
- Corrección. En src/features/settings/SettingsScreen.tsx 159 envolver el separador y el conteo en un span con whitespace-nowrap, o ponerlos en dos líneas a propósito.

## Lo que sí cumple y conviene decir

- Sin degradados, dorado, brillos ni sombras de color en ninguna de las 38 pantallas, y la prueba de diseño lo vigila en CSS, TSX y canvas.
- Un solo color de acción, #156082, en botones primarios, enlaces, navegación activa, borde del plan destacado, anillo de foco y barras. Texto blanco encima en claro y en oscuro.
- Modo oscuro legible. Ningún texto desaparece sobre el fondo. Los pares de texto revisados van de 4.65 a 1 (success sobre success-soft en claro) a 9.2 a 1.
- Títulos de pantalla a 20 y 24 px en todas las pantallas por ScreenHeader y SessionHeader, siempre en negritas. El saludo de Inicio ya cabe en una línea a 1280 y en dos a 390.
- Un solo juego de íconos lucide-react con grosor 2, sin emojis ni SVG sueltos como ícono.
- Atajos de teclado visibles en repaso (1 a 4 y espacio), simulador (A a D, Mayús y Enter) y examen (A a D, Mayús, Enter, flecha y M), ocultos donde no hay teclado.
- Movimiento breve (180 y 320 ms) que respeta prefers-reduced-motion y el ajuste del alumno. Errores junto al campo con role alert en field.tsx.
- Nada desbordado a 390 en ninguna pantalla, botones de 44 px, textos legibles salvo lo anotado en H09, H14, H19 y H21.
- Las capturas de antes no tienen 1920 ni 390 oscuro, así que esas dos vistas solo se revisaron en el después. La de 19-examen del después muestra el aviso Versión de demostración en vez de Datos simulados porque se tomó en la base real, lo que es coherente con D-121.

## Tabla de pantallas

Lista 1 es lo que el rediseño evita. Lista 2 es lo que busca. Cumple, Parcial o No, con el hallazgo que lo explica.

| Pantalla | Lista 1 | Lista 2 | Nota |
| --- | --- | --- | --- |
| 01 Inicio | Parcial | Parcial | H02, H05, H04, H12, H19, H20 |
| 02 Repasar | Parcial | Cumple | H01, H08 |
| 03 Mazos | Parcial | Cumple | H01, H06, H07, H18 |
| 04 Explorar | Parcial | Parcial | H01. Paginación y panel largo de filtros, B4 lo rehace |
| 05 Apuntes | Parcial | Cumple | H01 (pestañas), H17 |
| 06 Simular | Cumple | Parcial | H08, H09 |
| 07 Progreso | No | Parcial | H01, H02, H06, H20 |
| 08 Planificador | Parcial | Cumple | Tarjetas dentro de tarjetas. B3 lo quita |
| 09 Tutor | Cumple | Cumple | H06 leve (Ver evidencia) |
| 10 Party | Cumple | Cumple | Imagen de logro lisa, sin dorado |
| 11 Logros | Parcial | Cumple | Tarjetas dentro de tarjeta. B3 lo quita |
| 12 Perfil | Parcial | Cumple | H11 |
| 13 Suscripción | Parcial | Cumple | H10 |
| 14 Configuración Cuenta | Parcial | Cumple | H01 (pestañas), H13, H21 |
| 14 Configuración Apariencia | Parcial | Cumple | H01 (pestañas). Fondos con degradado ya no están |
| 14 Configuración Pomodoro | Parcial | Cumple | H01 (pestañas), H06 |
| 14 Configuración Privacidad | Parcial | Cumple | H01 (pestañas) |
| 14 Configuración Estudio | Parcial | Cumple | H01 (pestañas) |
| 15 Cambiar de rol | Cumple | Cumple | Botón primario liso, RadioCards |
| 16 Pregunta | Cumple | Cumple | H14 a 390. Atajos visibles |
| 17 Retroalimentación | Cumple | Cumple | H14 a 390. XP en gris, correcto e incorrecto con ícono y color |
| 18 Resumen de sesión | Cumple | Cumple | Filtro con botones rounded-md, distinto de H01 |
| 19 Examen completo | Cumple | Parcial | H14 (Marcar para revisar en tres líneas) |
| 20 Resultados del examen | Parcial | Cumple | H01, H03, H06 |
| 21 Banco del médico | Cumple | Cumple | H17 |
| 22 Editor | Cumple | Cumple | H17 |
| 23 Acuerdo | Cumple | Cumple | StatPanel liso, Calibrando con barra |
| 24 Borradores | Cumple | Cumple | Pestañas rounded-md, el modelo para H01 |
| 25 Reportes | Cumple | Cumple | |
| 26 Importar banco | Parcial | Cumple | H07 |
| 27 Usuarios del admin | Cumple | Parcial | H15 |
| 28 Costos de IA | Cumple | Cumple | |
| 29 Configuración del admin | Cumple | Cumple | Letra mono solo en nombres de modelo, aceptable |
| 30 Datos de demostración | Cumple | Cumple | |
| 31 Portada | Parcial | Parcial | H10, H16 |
| 32 Bienvenida | Parcial | Cumple | H01 (pestañas) |
| 33 Aviso de privacidad | Cumple | Cumple | Aviso de borrador neutro, secciones legibles |
| 34 Términos y condiciones | Cumple | Cumple | |

Hallazgos por gravedad. 2 altos, 8 medios y 11 bajos, 21 en total.
