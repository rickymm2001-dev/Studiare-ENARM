# Prototipo ENARM

Prototipo funcional de una plataforma integral para preparar el ENARM, en español de México. Es una página web (PWA) con Vite, React y TypeScript, datos locales en el navegador y un proxy pequeño hacia la API de Claude.

Este repositorio es público desde D-055. Todo el contenido clínico de demostración está escrito por IA, lleva etiqueta visible de demo y espera revisión médica.

## Por dónde empezar

- CLAUDE.md tiene las reglas del proyecto. Claude Code lo lee al iniciar cada sesión
- PLAN.md es el plan vigente por fases
- PROGRESS.md dice en qué bloque vamos y cuál es el siguiente paso
- DECISIONES.md guarda cada decisión con su motivo
- docs/PROMPT_PROTOTIPO.md es la especificación completa
- docs/contenido-demo.md explica cómo escribir, validar y revisar las preguntas demo
- DEMO.md es el guion de 10 minutos que recorre cada motor y cada gadget
- docs/real-vs-simulado.md dice, función por función, qué es real, qué es de demostración y qué falta para producción
- docs/mapa-plan-maestro.md compara el prototipo con las rebanadas del plan maestro
- docs/informe-de-pruebas.md reúne los conteos de pruebas, la cobertura, la recuperación de parámetros y las evaluaciones de IA
- docs/asvs.md es la revisión contra OWASP ASVS 5.0
- docs/SUPABASE.md guía a Ricardo para conectar la nube, paso a paso y sin terminal

Para continuar el trabajo en una sesión nueva basta con pedir a Claude Code que lea CLAUDE.md, PLAN.md y PROGRESS.md y siga donde se quedó.

## Requisitos

- Node 22.22 o más reciente. El CI usa Node 24
- npm, que viene con Node

## Instalar y correr

```bash
npm ci
```

```bash
npm run dev
```

El comando levanta la app y el proxy juntos. Sin clave de API el proxy corre en modo simulado, y así funciona todo el prototipo.

## Cambiar entre IA real y simulada

- Simulada es lo que corre por omisión. Sin clave, el proxy contesta con respuestas fijas que cumplen los mismos contratos que la IA real, y todo lo que muestra va marcado como borrador no validado por un médico
- Real se activa creando server/.env.local con la clave. Reinicia npm run dev y la insignia de IA, en Configuración, Cuenta, cambia a IA real
- Para volver a la simulada, borra o vacía la clave y reinicia. La demo publicada nunca tiene clave
- npm run eval-ai corre 60 casos dorados con respuestas fijas. Con la bandera real y la clave mide el costo y la latencia verdaderos

## Clave de la API

La clave se llama ENARM_ANTHROPIC_KEY y vive solo en server/.env.local, que no se sube al repositorio. Para crearla copia server/.env.example como server/.env.local y pega la clave después del signo igual. En una computadora o sesión nueva hay que crearla otra vez.

## Generar datos de demostración

1. Abre Configuración, sección Cuenta, y elige Demostración en Cuenta activa
2. En Datos de demostración da clic en Generar datos de demostración. Crea al alumno de demostración con 60 días de historial, 300 alumnos simulados y los mazos de Paco
3. Regenerar desde cero borra solo la base de demostración. Tu cuenta real vive en otra base y no se toca
4. El administrador puede ajustar la cantidad de alumnos y la semilla en Datos de demostración, dentro de /admin/demo

## Probar en el teléfono

- Con la demo publicada, abre la dirección en el navegador del teléfono. Para instalarla como app, usa Agregar a la pantalla de inicio. En iPhone es la única forma
- Con tu computadora, corre npm run dev:app -- --host y abre en el teléfono la dirección de red que imprime Vite, con los dos en el mismo wifi. El proxy de IA solo acepta peticiones del propio equipo, así que en el teléfono la IA queda simulada. La instalación como app y el modo sin conexión piden HTTPS, así que para probarlos usa la demo publicada
- La app funciona sin conexión después de la primera carga. Abre una vez con red para que el teléfono guarde todo

## Comandos

- npm run check corre typecheck, lint y pruebas unitarias con cobertura. Es lo mismo que corre el CI
- npm run e2e corre Playwright. La primera vez instala Chromium con npm run e2e:install
- npm run budget mide el JavaScript inicial del build en dist contra el presupuesto de 300 KB comprimidos. El CI lo vigila en tests/security/build-policy.test.ts
- npm run audit:high busca vulnerabilidades altas o críticas en las dependencias
- npm run test:sql prueba el esquema de Supabase contra un Postgres local temporal. Necesita los binarios de PostgreSQL 15 o más reciente
- npm run eval-ai corre las evaluaciones de los motores de IA
- npm run screenshots genera las capturas de las pantallas
- npm run recovery-report corre la recuperación de parámetros con 3 semillas y escribe docs/recovery-report.md
- npm run demo-seed genera la siembra de la demo fuera del navegador y reporta conteos. La siembra real se hace en la app, en Perfil con Demostración activa
- npm run demo-reset explica cómo regenerar la demo desde la app
- node scripts/content/import-paco-decks.ts <archivos .apkg> vuelve a convertir los mazos de Paco (D-053)
- node scripts/content/check-draft.ts valida borradores de preguntas demo

## Trabajar desde GitHub

- Cada push a cualquier rama y cada pull request corre npm run check en GitHub Actions (.github/workflows/check.yml)
- Para editar desde otra computadora, clona el repositorio, corre npm ci y, si quieres el modo real de IA, crea server/.env.local
- Para usar Claude Code en la web o en sesiones en la nube, la cuenta de GitHub debe dar acceso a este repositorio a la app de Claude. El workflow de revisión de contenido está en .claude/workflows y viaja con el repositorio
