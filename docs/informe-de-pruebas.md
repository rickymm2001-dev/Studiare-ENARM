# Informe de pruebas

Fase F, sección 17 de la especificación, actualizado al cierre de la Fase G. Reúne los conteos de pruebas, la cobertura, la recuperación de parámetros y las evaluaciones de IA con su costo. Fecha de esta versión, 2026-10-10. Los números salieron de correr las pruebas en esta rama, no de memoria.

## Resumen

| Revisión | Resultado |
|---|---|
| Pruebas unitarias y de integración (Vitest) | 2,588 pasan y 2 se omiten a propósito, en 258 archivos |
| Pruebas de punta a punta (Playwright, teléfono y escritorio) | 214 pasan, 107 por cada tamaño de pantalla |
| Pruebas del esquema de Supabase contra Postgres local | Pasan las nueve suites, con la última migración corrida dos veces |
| Pruebas de seguridad del build | 18 pasan. Sin secretos, con política de contenido y HSTS, dentro del presupuesto y con una imagen de Docker sin llaves |
| Accesibilidad (axe) | Pasa en las pantallas que recorren las pruebas de punta a punta, en claro y oscuro |
| npm audit con nivel high | 0 vulnerabilidades |
| JavaScript inicial | 281.5 KB comprimidos contra un presupuesto de 300 KB. Subió unos 6 KB con la Fase G |
| Rendimiento con 200 tarjetas y el procesador 4 veces más lento | Mediana de 90 ms, p95 de 147 ms y peor de 301 ms |
| Evaluaciones de IA con respuestas fijas | 60 casos, 100% en esquema, anclaje y rechazos |

## Cobertura

Medida con npm run check, que corre las pruebas con cobertura de v8.

| Medida | Resultado |
|---|---|
| Líneas | 86.6% |
| Instrucciones | 86.0% |
| Funciones | 79.6% |
| Ramas | 78.8% |
| Motores (src/engines) | 90% o más en líneas, instrucciones, funciones y ramas. Es una meta que el CI hace cumplir |

Lo que queda con poca cobertura son los workers y el componente del avatar generado, que se prueban por la vía de punta a punta y no con pruebas unitarias.

## Pruebas de punta a punta

- 214 pruebas, 107 en teléfono y 107 en escritorio, contra el build de producción y con el proxy de IA en modo simulado
- Toda prueba falla ante cualquier error en la consola del navegador. Por eso la política de contenido, que reporta sus bloqueos como errores, queda vigilada por toda la suite
- Flujos de la sección 14.1 cubiertos, entre otros, cuenta y sesión, repaso con confianza y causa, práctica, examen completo, planificador, Party, importar y exportar, panel del médico, reportes, privacidad, administración y sin conexión
- Nuevas en la Fase F. offline.spec.ts abre sin red pantallas que nunca se habían visitado y confirma que la IA avisa que necesita conexión. perf.spec.ts repasa 200 tarjetas con el procesador 4 veces más lento
- Nueva en la Fase E. privacy.spec.ts guarda un puntaje oficial, lo recarga y lo ve borrarse al retirar el permiso
- Nueva en la Fase G. legal.spec.ts abre el aviso de privacidad y los términos sin sesión y confirma que dicen que son un borrador

## Esquema de Supabase

Corre con npm run test:sql contra un Postgres 16 temporal. Nueve suites.

- rls_test.sql. Permisos por fila, roles, dueño fijo y bitácora de cambios de rol
- device_barrier_test.sql. Un solo dispositivo por cuenta y límite de cambios
- sync_test.sql. Sincronización, regla de la fecha más reciente y bitácora que no se duplica
- payments_test.sql. Avisos de pago, cupo Fundador, plan Gratis y referidos
- privacy_test.sql. Borrar datos y cuenta, bitácora cerrada fuera de las funciones, y la baja de un administrador
- ai_hosted_test.sql. Límites por alumno y por motor, presupuesto del día, bitácora de IA y su borrado
- settings_test.sql. La configuración del admin la lee cualquiera y solo la escribe un admin
- billing_portal_test.sql. Clientes de Stripe, reembolsos por cliente y monto, pagos tardíos de un pago devuelto, plan que se conserva con un pago más reciente y la negativa a eliminar la cuenta con una suscripción activa
- client_errors_test.sql. Errores del navegador sin identidad, limpieza de datos personales, tope diario, 14 días de conservación y permisos

## Seguridad

- tests/security/no-secrets.test.ts. Ningún secreto, nombre de variable prohibido, prefijo de clave de Anthropic ni llave de servicio de Supabase en el build
- tests/security/build-policy.test.ts. Política de seguridad de contenido en el HTML y en _headers, sin scripts en línea, con el origen exacto de Supabase cuando está configurado, y sin el SDK de Supabase ni la sincronización en el JavaScript inicial
- npm run audit:high sin vulnerabilidades, con un trabajo propio en el CI
- Revisión contra OWASP ASVS 5.0 en docs/asvs.md
- Revisión independiente de un subagente que no escribió el código, sobre la privacidad y la Fase F. Encontró seis puntos importantes, todos corregidos, y ninguno crítico. Ver D-101

## Fase G

Pruebas nuevas de esta fase, además de las que ya había.

- Proxy de IA alojado. Verificación de sesión con un Supabase falso, plan y rol, CORS, límite del cuerpo, errores sin detalle y la configuración y el gasto solo para admin, también con direcciones codificadas y con rodeos
- Libro de IA en Postgres. Admitir, soltar y asentar con límites por alumno y motor, presupuesto diario y borrado de datos
- Textos legales. La página y el archivo para el abogado salen del mismo texto y una prueba falla si el archivo se queda atrás
- Configuración del admin en el servidor. Leer, guardar, comparar, copiar al navegador y avisar de que hay que recargar
- Pagos. Firmas, eventos de Stripe y Mercado Pago, cliente de Stripe, reembolsos completos y parciales, cancelación al final del periodo, portal de facturación y reutilización del cliente en el cobro
- Errores del navegador. Limpieza de datos personales, reporte con permiso, tope por sesión, tarjeta del admin y conversión sin pérdida entre ULID y uuid con propiedades

### Revisión independiente de la Fase G

- Un subagente que no escribió el código revisó G1 a G5 en solo lectura. Encontró un hallazgo crítico, cuatro importantes y seis menores. Se verificó cada uno antes de actuar
- El crítico dejaba a un alumno de pago cambiar el presupuesto de IA con una dirección codificada. Quedó corregido y hay pruebas que fallan con el código anterior
- Los importantes y la mayoría de los menores quedaron corregidos con sus pruebas. Dos menores se documentaron y no se corrigieron, el presupuesto diario como tope blando bajo llamadas simultáneas y la falta de límite de peticiones con token falso. Ver PROGRESS.md y docs/IA_ALOJADA.md

## Recuperación de parámetros (14.2)

Los motores corren sobre alumnos simulados con parámetros verdaderos conocidos y deben recuperarlos. El detalle por semilla está en docs/recovery-report.md. Se reportan los números reales aunque no lleguen a la meta.

| Medida | Meta | Resultado |
|---|---|---|
| Rasch, correlación con la dificultad verdadera | 0.90 o más | 0.979 a 0.988 en 9 semillas. Cumple |
| Elo, correlación con la dificultad verdadera | 0.80 o más | 0.967 a 0.980. Cumple |
| Temas, error con encogimiento contra la proporción cruda | El encogido es menor | Baja el error entre 48% y 52%. Cumple |
| Sesgos, detectados entre los sembrados | 80% o más | 88% a 100%. Cumple con la variante propuesta en D-051 |
| Sesgos, marcados sin nada sembrado | 10% o menos | Con el método original de 7.4 sale 47% a 54% y no cumple. Con la variante de D-051 sale 3% a 6% y cumple |
| Mala lectura de negaciones, detectados | 80% o más | 89% a 100%. Cumple |
| Mala lectura de negaciones, marcados sin nada sembrado | 10% o menos | 0% a 1%. Cumple |
| Fatiga por tercios, detectados | 80% o más | 52% a 73%. No cumple |
| Fatiga por tendencia, detectados | 80% o más | 63% a 75%. No cumple |
| Fatiga con efecto apreciable (0.15 logits o más), detectados | 80% o más | 83% a 97%. Cumple |

Lectura honesta. La fatiga no llega al 80% con todos los sembrados porque una parte casi no la siente, con un efecto de unos 0.04 logits por respuesta que ningún método distingue del ruido, y sí llega entre quienes la sufren de verdad. Adoptar la tendencia como método por defecto y redefinir la meta sobre los alumnos con efecto apreciable (D-054) sigue pendiente de la aprobación de Ricardo. Elo sale muy alto porque cada alumno simulado ve cada pregunta varias veces, y con alumnos reales se espera más bajo. Todos estos números son de datos simulados y se vuelven a medir con respuestas reales.

## Evaluaciones de IA (8.7)

Corren con npm run eval-ai, con respuestas fijas y sin gasto.

| Motor | Casos | Esquema | Anclaje | Rechazos | Reintentos | Costo teórico (USD) |
|---|---|---|---|---|---|---|
| Olvidos | 12 | 100% | 100% | 100% | 0 | 0.0136 |
| Informe semanal | 10 | 100% | 100% | 100% | 0 | 0.0096 |
| Tarjetas | 14 | 100% | 100% | 100% | 0 | 0.0389 |
| Consejos por sesgo | 10 | 100% | 100% | 100% | 0 | 0.0063 |
| Preguntas reestructuradas | 14 | 100% | 100% | 100% | 2 | 0.0495 |
| Total | 60 | 100% | 100% | 100% | 2 | 0.1178 |

- Las tres metas de la sección 8.7 se cumplen. Una prueba confirma que un modelo que inventa evidencia o contesta donde no hay con qué sostenerlo hace fallar la meta
- El costo es teórico, calculado con los precios configurados y los tokens aproximados de las respuestas fijas. No hubo gasto real
- Falta correr npm run eval-ai con la clave de Ricardo para tener el costo y la latencia verdaderos. Hasta entonces el costo real por alumno es una estimación
- Falta la compuerta 1 del plan maestro, que audita con dos médicos 300 textos generados por la IA

## Lo que estas pruebas no demuestran

- Nada se probó con alumnos reales. Los motores se calibraron con datos simulados
- El contenido médico es de demostración y está pendiente de revisión por médicos
- Los pagos, el portal de Stripe y los reembolsos solo se probaron con avisos simulados y con las firmas de prueba. La documentación de Stripe no se pudo abrir desde el entorno y lo que se sabe de ella salió de una búsqueda. Falta un pago, una cancelación y un reembolso de prueba reales de punta a punta en Stripe y en Mercado Pago
- Las migraciones de Supabase se probaron contra un Postgres local. Falta aplicarlas en el proyecto de Ricardo
- El proxy de IA alojado se probó con un Supabase y un modelo falsos. No se ha corrido en un alojamiento real
- El rendimiento se midió con el procesador de Chromium limitado y no en un teléfono de gama media real
- La IA real no se ha llamado en este entorno, porque no hay clave
