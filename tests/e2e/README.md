# Pruebas de punta a punta

`npm run e2e` (o `node scripts/playwright.ts test`) corre Playwright con `playwright.config.ts`. Playwright levanta tres servidores y los apaga al terminar

| Servidor | Puerto | Comando |
| --- | --- | --- |
| Vista previa del build | 4173 | `npm run build && npm run preview` |
| Vista previa del build con la nube simulada (`dist-cloud`, ver `cloud/README.md`) | 4174 | `npx vite build --outDir dist-cloud` y `npx vite preview` |
| Proxy de IA en modo simulado | 8787 | `node server/src/main.ts --mock --ephemeral` |

Las capturas (`playwright.screenshots*.config.ts`) y la auditoría de interfaz (`playwright.audit.config.ts`) usan los mismos puertos. En este entorno hace falta `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. En la computadora de Ricardo no se define.

## Varias copias del repositorio a la vez

Cada copia (por ejemplo un `git worktree`) que corre Playwright al mismo tiempo que otra necesita su propio juego de puertos. `PW_PORT_OFFSET` corre los tres juntos. Es un múltiplo de 10 entre 0 y 990 y sin ella quedan los de siempre, así que el CI y la computadora de Ricardo no cambian.

```sh
PW_PORT_OFFSET=10 PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/playwright.ts test tests/e2e/smoke.spec.ts
```

| PW_PORT_OFFSET | Vista previa | Nube | Proxy |
| --- | --- | --- | --- |
| sin definir o 0 | 4173 | 4174 | 8787 |
| 10 | 4183 | 4184 | 8797 |
| 20 | 4193 | 4194 | 8807 |

- Usa un número distinto en cada copia. Antes de correr revisa que nadie más use esos puertos
- La misma variable la leen las cuatro configuraciones de Playwright, `vite.config.ts` (puerto de `vite preview` y destino de `/api`) y `server/src/main.ts`. Todo vive en `server/src/testPorts.ts`
- El proxy solo cambia de puerto en modo simulado (`--mock`) y acepta como origen la vista previa corrida, siempre de 127.0.0.1 o localhost. Con la variable puesta, `npm run dev` y `npm run proxy` se niegan a arrancar, porque el proxy que puede tener clave siempre escucha en 8787 (D-040)
- Con los puertos de siempre y fuera del CI, Playwright reusa una vista previa que ya esté abierta, como antes. Con `PW_PORT_OFFSET` distinto de 0 nunca la reusa, porque podría ser el build de otra copia, y si el puerto está ocupado falla con `is already used` en lugar de probar código ajeno. `CI=1` también apaga el reuso con los puertos de siempre
- Con `PW_PORT_OFFSET` distinto de 0 cada servidor tiene el triple de tiempo para arrancar, porque el build compite por el procesador con el de la otra copia. Con los puertos de siempre los tiempos no cambian
- Cada copia escribe su build y sus resultados en sus propias carpetas (`dist`, `dist-cloud`, `test-results`, `playwright-report`)
