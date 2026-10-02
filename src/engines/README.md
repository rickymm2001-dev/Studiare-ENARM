# Motores puros

Aquí viven los motores de la sección 7 de la especificación, a partir de la Fase B.

- Funciones puras. Sin React, sin Dexie, sin Zustand, sin router y sin red
- Reciben el reloj (`now`) y la semilla del azar como parámetros. No leen `Date.now()`, `new Date()` ni `Math.random()`
- Cada archivo documenta al inicio qué hace, entradas, salidas y umbrales
- ESLint y tests/architecture/engine-boundaries.test.ts hacen cumplir estas reglas
