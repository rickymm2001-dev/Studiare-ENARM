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

## Clave de la API

La clave se llama ENARM_ANTHROPIC_KEY y vive solo en server/.env.local, que no se sube al repositorio. Para crearla copia server/.env.example como server/.env.local y pega la clave después del signo igual. En una computadora o sesión nueva hay que crearla otra vez.

## Comandos

- npm run check corre typecheck, lint y pruebas unitarias con cobertura. Es lo mismo que corre el CI
- npm run e2e corre Playwright. La primera vez instala Chromium con npm run e2e:install
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
