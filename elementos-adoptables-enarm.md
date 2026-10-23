# Elementos adoptables para la página ENARM
Compilación de las 17 plantillas de Envato abiertas en Chrome (23-oct-2026). Capturas en `capturas/`.
Base principal: **Panel de administración médica** (Evlogy, "Medicial"). Las otras 2 pestañas eran búsquedas de Google, sin plantilla.

---

## A. Plantilla base: Panel de administración médica (Medicial)
Capturas: `01-medical-admin-dashboard-1.jpg`, `-1-detalle.jpg`, `-2.png`, `-3.png`

### A1. Barra superior (top bar)
1. Logo + nombre del producto a la izquierda.
2. Navegación en píldora con iconos y separador vertical (Features | Educations).
3. Buscador global centrado con placeholder contextual ("What type of scan...").
4. Botón "+" circular de acción rápida.
5. Campana de notificaciones en círculo de color.
6. Avatar + nombre + correo + chevron (menú de cuenta).

### A2. Encabezado de página
7. Título grande de la vista + indicador de contexto con punto ("• 78 test found").
8. Botón primario oscuro con icono ("Past Results").
9. Dropdowns de filtro en píldora (tipo "MRI", ubicación).
10. Botón circular de descarga/exportar.

### A3. Fila de tarjetas KPI (4 tarjetas)
11. Icono en círculo tenue + etiqueta + menú "⋮".
12. Número grande (10,536) + delta con flecha y porcentaje (+13,8 %).
13. Mini gráfica integrada: sparkline de área con punto final resaltado (Patient) y mini barras con barra activa resaltada (Doctors).
14. Tarjeta con dos sub-métricas lado a lado (150 Bed Private / 390 Bed General) con número en color.
15. Tarjeta con visual 3D y botón "expandir" en la esquina.

### A4. Widget "Results"
16. Cabecera de widget con botón secundario con icono ("Download Report") + botón expandir.
17. Chips/píldoras de categoría con punto de color y miniatura de imagen (X-Ray, CT Scan, MRI).
18. Sub-cuadrícula de resultados: etiqueta pequeña gris + valor grande + chevron ">" (CT Scan Brain → A² Normal).

### A5. Widget "Articles" (contenido)
19. Tarjeta con foto, título en negrita, extracto de 2 líneas, enlace "Learn More →" e indicadores de carrusel (dots).

### A6. Widget de chat/mensajería
20. Avatar + nombre + "⋮", burbujas de mensaje (propio/ajeno), input "Typing here..." con botón enviar.

### A7. Tabla "Patient Overview"
21. Cabecera con selector de periodo ("Monthly ▾") y expandir.
22. Columnas Name / Age / Date of Birth / Status / Phone.
23. Checkbox por fila, badge de estado en texto de color ("Active"), menú "⋮" por fila.

### A8. Panel "Condition Guides"
24. Visual 3D grande (corazón) con título + subtítulo con flecha ↗.
25. Stepper vertical de puntos (radio seleccionado) a la izquierda del visual.
26. Métrica grande en esquina (Pulse Rate 390,37).
27. Trío de métricas con punto de color: Average / Minimum / Maximum + unidad pequeña (BPM).
28. Gráfica de rangos tipo "velas" (Heart Rate) con eje de tiempo 10.10 – 11.10.
29. Botón CTA ancho con flecha ("Review Results →").

### A9. Responsive y estilo
30. Variantes apiladas para móvil/tablet (tarjetas superpuestas en mockup).
31. Paleta: fondo gris muy claro, tarjetas blancas, acento verde-azulado (teal/sage) para botones y datos, texto gris oscuro.
32. Esquinas muy redondeadas (16–20 px), sombras suaves, bordes casi invisibles.
33. Tipografía sans moderna; jerarquía número grande / etiqueta pequeña.
34. Iconografía lineal uniforme; chips con fondo gris tenue; badges con fondo claro del color.

### A10. Traducción directa a ENARM
| Elemento Medicial | En la página ENARM |
|---|---|
| KPI Patient / Doctors / Total Bed | Preguntas hoy · Precisión % · Racha de días · Tarjetas pendientes de repaso |
| Sparkline / mini barras | Tendencia de precisión 7 días · preguntas por día |
| Dos sub-métricas (Private/General) | Correctas / Incorrectas · Nuevas / Repasos |
| Chips Results (X-Ray, CT, MRI) | Especialidades: Medicina Interna, Pediatría, GyO, Cirugía, etc. |
| Sub-grid "CT Scan Brain → Normal" | Tema → nivel de dominio (Débil / Medio / Dominado) |
| Download Report | Exportar reporte de desempeño PDF |
| Past Results + filtros | Historial de simulacros, filtro por especialidad y periodo |
| Articles | "Perla del día" / resumen clínico recomendado |
| Chat | Tutor IA / notas por pregunta |
| Tabla Patient Overview | Historial de sesiones o banco de preguntas (tema, fecha, estado, % ) |
| Condition Guides + stepper | Plan de estudio por fases con progreso |
| Heart Rate rangos | Distribución de tiempo por pregunta / por sesión |
| Review Results → | Ir a revisión de respuestas |
| Notificaciones | Repasos vencidos hoy |
| Buscador global | Buscar tema, pregunta o guía |

---

## B. Elementos adicionales por plantilla

### B1. Panel de información médica y sanitaria (Visualabs, "Abyd Health") — modo oscuro
`02-medical-healthcare-dashboard-visualabs-1..4.png`
35. Sidebar vertical con icono + etiqueta y estado activo resaltado; footer "Help & Support".
36. Figura anatómica con pins/hotspots (Brain, Heart, Lungs, Liver...) → mapa de sistemas/especialidades con estado por color.
37. Tarjeta destacada en color "12 New insights" con dos botones (Start Health Scan / View all insights) → "12 temas nuevos sugeridos".
38. Gauge semicircular con score (82/100 "Good") → índice global de preparación ENARM.
39. Tarjeta comparativa (Biological Age 36 vs -5 años) → "tu nivel vs promedio de aspirantes".
40. Tarjeta "Health Insight" con texto y CTA.
41. Grid de biomarcadores: valor + unidad + badge Optimal/Near Optimal/Good + mini sparkline + barra de rango gradiente con marcador y escala → dominio por especialidad con rango esperado.
42. "Recommended Actions": icono + título + descripción + botón "Start" → acciones de estudio recomendadas.
43. "Upcoming Appointments": fecha en badge (MAY 24) + título + sub-línea + botón Detail → próximos repasos/simulacros.
44. "Care Team": avatar + nombre + rol + icono de chat → tutores/compañeros de estudio.
45. "Daily Habits": barras de progreso con meta (1,842/10,000) → metas diarias (preguntas, minutos, tarjetas).
46. Selector de fecha en cabecera ("May 20, 2026 ▾").
47. Tema oscuro completo con acentos azul/cian + versión clara equivalente.
48. Modal de confirmación centrado con check verde ("Thanks for your order") → modal "Sesión completada".

### B2. Carpenter – Panel de monitoreo IA (harukidesign)
`03-carpenter-ai-monitoring-dashboard.png`
49. Buscador con atajo de teclado visible ("Ctrl+K").
50. Saludo personalizado + fecha ("Welcome Justin! Today, 20 January 2029").
51. Selector de rango temporal ("Last 1 hour").
52. Donut de anillos anidados (nested rings) con leyenda y valores a la derecha + "32.1% from target".
53. Mini tabla de estados con punto de color + iconos check/x (Working / Not Working / Wearing).
54. Lista con badges Active/Off y duración ("Uptime Machine").
55. "Forecast Issues" generado por IA con icono de IA → "Predicción IA: temas en riesgo".
56. Sidebar solo-iconos (compacta).
57. Botonera por widget: expandir / editar / más (⋯).
58. Cinta de badges de ventajas (4 design page · Organised Layer · Clean UI).

### B3. MediFlow – Telemedicina (CreateBigSupply)
`04-mediflow-telemedicina-1..3.png`
59. Tarjeta de perfil en sidebar: avatar, nombre, rol, estado "Available", 3 mini-stats (12 Today · 4.9★ · 284).
60. Ítems de navegación con contadores/badges (8, 2 live, 284).
61. Saludo + resumen en prosa ("You have 8 consultations today · 2 calls active · 3 waiting · 4 completed") → "Tienes 40 repasos hoy · 12 nuevos · 3 vencidos".
62. Segmented control (Overview / Calls / Patients) + botón Export.
63. Cinco KPI con sparkline + chip de comparación ("+2 vs yesterday", "Active now").
64. Tarjetas de video con badge LIVE/WAITING, temporizador y controles → "Sesión en curso" / simulacro cronometrado.
65. Cola/lista lateral con tiempo relativo (-9m, -22m) y botón "Manage Queue".
66. Tabla de citas: columna de condición en chip de color, hora, duración, estado (In Call / Scheduled / Completed), "Showing 6 of 12" + paginación numérica.
67. Timeline vertical de paciente con puntos de color, fecha a la derecha y chips (Lab, Done) → historial cronológico de estudio.
68. "Active Prescriptions": lista con estado Active/Overdue → tareas/repasos vencidos.
69. "Health Metrics": tiles con icono, valor y tendencia ↑/Normal.
70. Línea comparativa semanal (Consults vs Follow-ups).
71. Botón primario "Start Call" + secundario "Schedule" en cabecera.
72. Encabezado de sección con etiqueta en mayúsculas pequeñas + punto de color ("• LIVE CONSULTATIONS").

### B4. Tablero de atención médica "Healty" (hapsdesignspace)
`05-health-care-dashboard-healty.png`
73. Sidebar en color sólido (verde) con ítem activo en blanco e iconos.
74. "Quick Stats": una tarjeta destacada en color + tres claras (jerarquía de KPI principal).
75. Chip "Sort by: This Month ▾".
76. Line chart con leyenda de dos series (Appointment / Completed) + nota al pie + flecha de acción.
77. Tabla con avatar + nombre + sub-línea (condición) y badge Confirmed/Pending; paginación "< 1 2 3 > · 3 Pages".
78. Tarjeta "Messages" con botones Reply / Archive.
79. Usuario con rol ("Administrator") y botón de ajuste en círculo de color.

### B5. Clinically – Web UI Kit (illiyinstudio)
`06-clinically-healthcare-ui-kit.png`
80. Hero de landing con titular de 3 líneas (dos colores) y formas geométricas decorativas.
81. Buscador de 3 campos (Service · Location · Date) + botón CTA.
82. Fila de logos "Featured with" (prueba social) → "Basado en guías: GPC, CENETEC, etc.".
83. Lista de ventajas con check en círculo (Web & Mobile · Auto-layout · Fully customizable).
84. Vista móvil apilada del hero.

### B6. Medlink – Panel hospitalario, 13 pantallas (peterdraw) — el más completo
`07-medlink-hospital-1..7.png`
85. KPI con icono en caja, valor, delta en chip (+12 % vs yesterday).
86. Barras agrupadas "Patient by Age Stages" con tabs/leyenda (Children · Teens · Adults) y resumen "Total Patients 465" → "Preguntas por dificultad".
87. Donut "Patient by Departments" con total al centro y leyenda con % → "Distribución por especialidad".
88. Área chart "Revenue" con dos series (Income/Expense), tooltip flotante y selector de periodo.
89. Lista "Reports" con icono + título + fecha + chevron.
90. Mini calendario mensual con días resaltados + "Agenda" con fecha en badge y evento.
91. "Doctor's Schedule" lista con avatar + horario; "Recent Activity" feed.
92. Tabla de citas con filtros en cabecera (Gender · Age · Patient Type · Condition) y columnas ordenables.
93. Tabla de pacientes: avatar + ID + chip de condición + status (Discharged / In Treatment / Admitted) + "Showing X of Y".
94. "Appointment Trends" barras semanales + "Appointment Type" barras horizontales con % (Consultation 50 %, Follow-up 25 %...).
95. Página "Patient Details": header con avatar + datos clave; tiles de vitales (171 mg/dL, 62 kg, 37 °C); "Medical info" con alergias/crónicos; "Blood Pressure" chart con toggle; tabla de citas; "Health Reports" lista descargable; "Patient Note" → ficha de tema/pregunta con stats, notas y recursos.
96. Grid de tarjetas de doctores (foto, nombre, especialidad, 2 botones) → grid de especialidades o tutores.
97. "Doctor Details": gauge "Performance 88 %", barras de métricas (Patient Satisfaction 94 %...), "Patient Overview" chart, "Appointment Schedule" lista, "Feedback" con estrellas.
98. Formulario "Add New Doctor": inputs con etiqueta, radio, select, carga de archivo, secciones separadas, botón guardar → formulario de perfil/plan de estudio.
99. "Departments": KPI + barras apiladas por departamento (Staff breakdown con leyenda) + grid de tarjetas con foto, ubicación, avatares de equipo y "22 Staff".
100. "Department Details": foto grande + descripción + lista de tratamientos con punto; "Team" con tabs (All · Doctors · Nurses); "Performance" score 4.8/5 con barras; "Appointment Trends".
101. Calendario completo (Month/Week/Day) con eventos en bloques de color + panel lateral "Schedule Details" con chips y acciones → calendario de estudio.
102. "Inventory": 4 KPI de stock, "Usage Trend", "Category Breakdown" barras horizontales, tabla con botón "Reorder" y "Inventory Activities" feed.
103. "Messages": lista de conversaciones con hora y no leídos, chat con burbujas, panel derecho de info del contacto con pestañas y adjuntos.
104. Login / Register con mockup lateral, inputs, "Remember me", enlace "Forgot password".
105. Tarjeta "Upgrade to Pro" en sidebar con ilustración + botón → "Premium ENARM".
106. "Sign Out" al pie de sidebar; footer con © y enlaces (Privacy, Terms, Contact) + iconos de redes.
107. Versiones tablet y móvil de todas las pantallas (sidebar colapsable, tarjetas a una columna).
108. Botones de icono en cabecera (notificación, ajustes) y "Search anything" global.

### B7. Plantilla de panel de administración "ADMAX" (uicreativenet)
`08-admin-dashboard-template-admax.png`
109. Sidebar azul sólido + 3 KPI azules con icono.
110. Calendario completo con toggle Day / Week / Month.
111. "Subscriber list" tabla y "Total Visit" barras horizontales con porcentaje.
112. Módulo de bandeja de entrada (carpetas Inbox/Sent/Draft/Spam + lista de mensajes).
113. Área chart grande con relleno degradado.

### B8. EHR – Landing "Ehrity" (miraistoodio)
`09-ehr-urgent-patient-timeline-1..5.png`
114. Nav transparente sobre hero fotográfico con usuario logueado y buscador.
115. Hero con titular grande + gráfica interactiva con tooltips (Cardiac Arrest · ST Scan) + CTA píldora.
116. Grid de features: icono en círculo + título; una tarjeta resaltada en color.
117. Proceso numerado vertical 01–06 con acordeones (Efficient System Workflow Process) → "Cómo funciona el método de repetición espaciada".
118. Lista A–E con letras de color + mockup del producto → explicación de pantallas.
119. Stats "+40 % · 24/7 · +25 %" en línea + tarjetas de beneficio con % grande al pie.
120. Footer con logo, columnas de enlaces y chips (Monitor · Timeline · Records).
121. Paleta teal oscuro + crema/beige para una landing seria.

### B9. Interfaz de panel sanitario "Mediplus" (nanoagency)
`10-healthcare-dashboard-ui-mediplus.png`
122. 4 KPI con sparkline rojo/verde según tendencia y delta.
123. "Analytics" con dos líneas (Total Admitted / Total Discharged) y KPI incrustados.
124. "Working Status" line chart con selector de periodo.
125. Donut "Gender" con leyenda y totales.
126. "Top Doctor" lista con avatar + especialidad + rating en estrellas.
127. "Patient Data" tabla con estado en texto de color (Confirmed / Incoming / Cancelled).

### B10. Kit de panel de análisis médico (creativewithjoy)
`11-medical-analytics-dashboard-ui-kit.png`
128. Banner/hero dentro del dashboard con imagen y mensaje ("Your health is our priority") → banner motivacional / anuncio de simulacro.
129. Tiles Doctors / Patients / Report / Balance con badge contador (80) y % de reparto.
130. "Hospital Survey" line chart anual con dos series.
131. "Daily Read" tarjeta de lectura con imagen → lectura del día.
132. "Today's Tasks" checklist con icono, hora y enlace externo → tareas de estudio de hoy.
133. Mini calendario semanal con lista de eventos y "Add reminder".
134. Panel derecho "Next patient's details": avatar, 3 datos, pestañas Summary / Conditions / Notes, texto → panel "Siguiente tema".
135. "Upcoming Consultations" lista con hora y botón Details.

### B11. Plantilla de página de inicio médica (uicreativenet)
`12-medical-landing-page-template.png`
136. Estructura tipo email/landing: hero con CTA "Discovery", bloque Welcome, "Our Doctor Specialist", servicios en 3 columnas con foto, Facilities, banda de emergencia con teléfono, footer oscuro 3 columnas.

### B12. Panel de salud (arthgoods) — acento verde lima
`13-health-dashboard-arthgoods.png`
137. Fecha grande en tarjeta (17 · Monday, October 2027) + botón "Add New Widgets" → dashboard personalizable.
138. Prompt de asistente IA ("Hello, Need Help? Please ask anything here!") con botón de micrófono → tutor IA.
139. Barra de progreso segmentada con etiquetas Poor / Good / Almost / Perfect y marcador flotante (765 ml) → nivel de dominio.
140. Tarjeta "Heart Rate" con rango (80–132) + promedio + área chart.
141. "Average Steps": barras por hora + comparación This week vs Previous week.
142. "Daily Intake": donut con % central y sub-barras Carb / Protein / Fat con % → reparto de estudio por especialidad.
143. "Sleep Tracker" con "Add Alarm"; "Meal Nutritions" con anillos pequeños por ítem.
144. "Target Weight": actual vs meta + lista de fechas con delta (+0.5 kg) → precisión actual vs meta con historial.
145. "Blood Pressure": barra de gradiente con marcador y 3 valores (SYS / DIA / Pulse).
146. Botón "Upgrade Plan" en cabecera, toggle claro/oscuro, botón Help.

### B13. Medicool – Landing de plataforma (sansdesign)
`14-medicool-healthcare-platform-1..2.png`
147. Hero con titular enorme en teal + visual 3D (hélice) + tarjetas flotantes con mini-stats (66–180 bpm chart, 50 % Year Savings, tarjeta de doctor).
148. Chip "New · Live Healthcare Analytics ↗" sobre el titular.
149. Fila de logos monocromos.
150. Sección "Designed for every healthcare professional" con tarjetas numeradas 01 / 02 / 03 → "Para primera vez · Para repetidores · Para residentes".
151. Sección oscura "Your Holistic Healthcare Journey" con bubble chart y chip de seguridad ("HIPAA compliant") → "Tus datos protegidos".
152. Lista de features con icono en círculo + título + descripción.
153. Chip de navegación: Case Studies · Resources · Pricing + botón "Contact Us" en outline.

### B14. Ama – Landing médica (C-Kav)
`15-ama-medical-landing-page.png`
154. Hero con formulario flotante "Book an appointment" (5 inputs + botón) → "Agenda tu simulacro / Empieza gratis".
155. Badge circular "24/7" con texto; teléfono de emergencia.
156. Lista lateral de departamentos (Nuclear Oncology, Cardiac Sciences...) con ítem activo → índice de especialidades.
157. Tarjetas de servicio con icono circular y título en 2 columnas.
158. Bloques foto + texto alternados; grid de equipo con fotos; testimonios; mapa + horarios; stats "70+"; footer oscuro.

### B15. Folleto tríptico médico (print)
`16-medical-trifold-brochure.png`
159. No es web, pero su estructura (Tabla de contenidos · Introducción · Overview · Servicios · Catálogo · Feedback · Thank you) sirve para el **PDF exportable de reporte/guía de estudio** y la paleta teal + blanco con bloques redondeados.

### B16. Página de resultados Envato "medical dashboard" (pg. 8)
`17-envato-busqueda-medical-dashboard-pg8.jpg`
160. Solo listado de búsqueda; patrones visibles: dashboards oscuros, apps móviles de clínica, infografía "KPI Dashboard" y flyers.

---

## C. Patrones transversales (aparecen en 3+ plantillas) — prioridad alta
- **Tarjeta KPI**: icono + etiqueta + número grande + delta + sparkline (A3, B1, B3, B6, B9).
- **Sidebar** con icono + etiqueta, ítem activo resaltado, perfil arriba y Settings/Sign out abajo (B1, B3, B4, B6, B7).
- **Cabecera de widget** con título, selector de periodo y menú ⋯/expandir (A4, B2, B6).
- **Tabla** con avatar, chips de estado de color, checkbox, filtros y paginación "Showing X of Y" (A7, B3, B4, B6, B9).
- **Donut / gauge** con valor central y leyenda con % (B1, B2, B6, B9, B12).
- **Lista "Próximos"** con fecha en badge + botón Detail (B1, B4, B6, B10).
- **Barras de progreso con meta** y rangos de color (B1, B12).
- **Saludo con fecha y resumen en prosa** (B2, B3).
- **Timeline vertical** con puntos de color (B3, B8).
- **Modo oscuro** opcional (B1, B12).
- **Formulario de login/registro** con mockup lateral (B6).
- **Landing**: hero con titular 2 colores + CTA + logos + features con icono + proceso numerado + stats + footer (B5, B8, B13, B14).
- **Paleta**: blanco + gris claro + un acento teal/verde-azulado; esquinas 16–20 px; sombras suaves.
