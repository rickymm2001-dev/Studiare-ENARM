# Prompt para la sesión de la fase 3 del plan V4

Pégalo tal cual como primer mensaje de una sesión nueva de Claude Code abierta en C:\Users\elchi\Proyectos\enarm-prototipo. Antes de abrirla corre npm install, porque la carpeta se sincronizó con 849 commits nuevos y las dependencias locales son viejas.

---

Vas a ejecutar la fase 3 del plan V4. Lee, en este orden y nada más, CLAUDE.md, la sección 11 de docs/PLAN_V4.md, D-148 en DECISIONES.md, la sección Estado actual de PROGRESS.md y las secciones 1 y 6 del mismo plan V4. Las plantillas de referencia están en compilacion-plantillas-enarm.html y elementos-adoptables-enarm.md en la raíz, con capturas en capturas/. Ábrelas en el navegador integrado solo cuando un bloque necesite ver un patrón concreto. No releas V3 ni la especificación completa.

## Contexto que no está en los archivos

- Me molesta que la app se vea genérica y generada por IA. La dirección editorial de D-145 va bien pero la portada y el Inicio siguen siendo rejillas de tarjetas con icono en caja. Esta fase arregla eso y agrega lo que falta de la sección 11
- Referente visual. La revista Nature. Serif con carácter en títulos y cifras grandes, sans en interfaz, números tabulares, líneas finas en vez de sombras, aire, etiquetas chicas en versalitas. Toma la sensación, no copies la marca. Las fuentes ya viajan con la app, no descargues ninguna
- Visuales permitidos. Capturas reales del producto hechas con Playwright y diagramas propios en SVG con la paleta de D-128. Nada de stock, 3D, degradados, mockups de laptops ni ilustraciones ajenas
- El color de acción #156082, la paleta por rama y el modo oscuro no cambian
- Inicio tiene diseño fijo mío (D-116, D-117). D-148 autoriza solo la franja nueva arriba y la perla en lugar de la frase. Lo demás no se mueve
- Presupuesto de JavaScript inicial bajo 300 KB. Hoy va en 245. La demo interactiva de la portada y el mapa se cargan en diferido

## Qué vas a hacer

Los cinco bloques de la sección 11.4, en el orden de 11.6

1. V4-F3-B0. Antes de tocar la app, una página HTML estática en el navegador integrado con la portada y el Inicio maquetados con el tratamiento editorial, usando los tokens reales y datos de demostración. Espera mi aprobación escrita en el chat
2. V4-F3-B1. Portada editorial con el método como proceso 01 a 06, demo interactiva con una pregunta del banco de demostración, perfiles como lista numerada, captura real en el hero y la curva de olvido en SVG. Lugares de texto nuevos con tope en slots.ts y docs/PORTADA.md
3. V4-F3-B2. Inicio con la franja nueva. Índice de preparación en src/engines/readiness.ts con calibrando y la leyenda obligatoria de que no predice el puntaje del ENARM, mapa de especialidades en SVG con tabla equivalente, cifras de la semana en una línea con sparkline, próximos con fecha en badge y botón, y perla del día desde el banco con la frase citada
4. V4-F3-B3. Ficha de tema como ruta bajo Progreso con sus entradas desde Ramas, Temas para reforzar, focos y el mapa
5. V4-F3-B4. Barrido editorial de Progreso, Repasar y Calendario sin mover nada de lugar, más el token de densidad y la unión de las etiquetas de demostración en teléfono

## Reglas de trabajo

- Un bloque es un PR a main con el CI en verde. Al cerrar cada bloque escribe 5 a 10 líneas en PROGRESS.md, registra decisiones nuevas en DECISIONES.md con número y espera mi aprobación antes del siguiente
- En cada bloque corre npm run check y solo las e2e de las pantallas tocadas, en teléfono y computadora. Capturas completas, revisión independiente y axe completo van una sola vez al final, como en V4-B10. Lo que sí revisas en cada bloque es axe en las pantallas nuevas, con cero violaciones serias
- Motores nuevos en src/engines como funciones puras con pruebas, sin React ni Dexie. Las pantallas leen por proveedores de instantáneas
- Antes de usar la API de una librería revisa su documentación vigente. No instales nada global. Si hace falta una dependencia nueva, dime cuál, cuánto pesa y para qué, antes de instalarla
- Cada gráfica lleva título, nota al pie con la fuente del dato y texto alternativo. Todo dato de demostración y todo texto médico sin validar llevan su etiqueta visible
- Nada de predicción del puntaje ENARM, nada de chat libre con IA, nada de testimonios ni logos sin respaldo
- Microcopy en español de México con trato de tú. Código y nombres en inglés
- Si algo de la sección 11 contradice CLAUDE.md o una decisión anterior y D-148 no lo cubre, pregúntame antes de suponer
- Si fallas dos veces en corregir lo mismo, detente, documenta en PROGRESS.md y pregunta
- Ideas fuera del alcance van a IDEAS.md
- En mensajes y documentos para mí no uses el signo de dos puntos

Empieza por V4-F3-B0.
