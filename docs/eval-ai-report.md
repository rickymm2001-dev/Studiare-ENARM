# Evaluación de modelos de IA (B12)

Corrida del 2026-10-15 en modo simulado, con respuestas fijas y sin gasto real. Casos 60 sintéticos, 50 del banco de demostración, 25 adversarios, con 3 repeticiones. Juez simulado, sin valor de calidad. Costo teórico 1.4497 dólares, sin gasto real.

Este reporte es del modo simulado y solo prueba el camino. Falta la corrida real con la clave de evaluaciones, que lo reemplaza con --write (9.2).

## Resultado por motor

### forgetting

| Candidato | Modelo | Esfuerzo | Razonamiento | Costo por llamada (USD) | Esquema al 1er intento | Anclaje | Rechazos | Adversarios | Negativas | Cortes | p95 | Juez | Compuertas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku55-off | claude-haiku-5-5 | low | off | 0.00012 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku55-low | claude-haiku-5-5 | low | adaptive | 0.00012 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku55-medium | claude-haiku-5-5 | medium | adaptive | 0.00012 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku45 | claude-haiku-4-5 | ninguno | ninguno | 0.00123 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |
| sonnet55-low | claude-sonnet-5-5 | low | adaptive | 0.00245 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |

Elegido. haiku55-low es el más barato que pasa las compuertas y el juez. Empató en costo con 2 más y quedó primero en la escalera.

### weekly_report

| Candidato | Modelo | Esfuerzo | Razonamiento | Costo por llamada (USD) | Esquema al 1er intento | Anclaje | Rechazos | Adversarios | Negativas | Cortes | p95 | Juez | Compuertas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku55-off | claude-haiku-5-5 | low | off | 0.00009 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku55-low | claude-haiku-5-5 | low | adaptive | 0.00009 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku55-medium | claude-haiku-5-5 | medium | adaptive | 0.00009 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku45 | claude-haiku-4-5 | ninguno | ninguno | 0.00094 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |
| sonnet55-low | claude-sonnet-5-5 | low | adaptive | 0.00187 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |

Elegido. haiku55-off es el más barato que pasa las compuertas y el juez. Empató en costo con 2 más y quedó primero en la escalera.

### flashcards

| Candidato | Modelo | Esfuerzo | Razonamiento | Costo por llamada (USD) | Esquema al 1er intento | Anclaje | Rechazos | Adversarios | Negativas | Cortes | p95 | Juez | Compuertas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku55-low | claude-haiku-5-5 | low | adaptive | 0.00016 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 3.96 | pasa |
| haiku55-medium | claude-haiku-5-5 | medium | adaptive | 0.00016 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 3.96 | pasa |
| sonnet55-low | claude-sonnet-5-5 | low | adaptive | 0.00319 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |
| opus55-low | claude-opus-5-5 | low | adaptive | | | | | | | | | | no hizo falta, porque un candidato más barato pasó las compuertas |

Elegido. haiku55-medium es el más barato que pasa las compuertas y el juez. Empató en costo con 1 más y ganó por latencia p95.

### bias_tips

| Candidato | Modelo | Esfuerzo | Razonamiento | Costo por llamada (USD) | Esquema al 1er intento | Anclaje | Rechazos | Adversarios | Negativas | Cortes | p95 | Juez | Compuertas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku55-off | claude-haiku-5-5 | low | off | 0.00008 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku55-low | claude-haiku-5-5 | low | adaptive | 0.00008 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku55-medium | claude-haiku-5-5 | medium | adaptive | 0.00008 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| haiku45 | claude-haiku-4-5 | ninguno | ninguno | 0.00081 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |
| sonnet55-low | claude-sonnet-5-5 | low | adaptive | 0.00162 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |

Elegido. haiku55-off es el más barato que pasa las compuertas y el juez. Empató en costo con 2 más y quedó primero en la escalera.

### restructure

| Candidato | Modelo | Esfuerzo | Razonamiento | Costo por llamada (USD) | Esquema al 1er intento | Anclaje | Rechazos | Adversarios | Negativas | Cortes | p95 | Juez | Compuertas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| haiku55-medium | claude-haiku-5-5 | medium | adaptive | 0.00021 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | 4.00 | pasa |
| sonnet55-low | claude-sonnet-5-5 | low | adaptive | 0.00420 | 100% | 100% | 100% | 100% | 0 | 0 | 0.0 s | no hizo falta | pasa |
| opus55-low | claude-opus-5-5 | low | adaptive | | | | | | | | | | no hizo falta, porque un candidato más barato pasó las compuertas |

Elegido. haiku55-medium es el más barato que pasa las compuertas y el juez.

## Configuración elegida

Del modo simulado, solo para ver el formato. Con respuestas fijas todos los candidatos contestan igual, así que esto no se aplica.

```ts
models: {
  forgetting: { id: 'claude-haiku-5-5', effort: 'low', thinking: 'adaptive', maxTokens: 2000 },
  weekly_report: { id: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxTokens: 2000 },
  flashcards: { id: 'claude-haiku-5-5', effort: 'medium', thinking: 'adaptive', maxTokens: 8000 },
  bias_tips: { id: 'claude-haiku-5-5', effort: 'low', thinking: 'off', maxTokens: 1500 },
  restructure: { id: 'claude-haiku-5-5', effort: 'medium', thinking: 'adaptive', maxTokens: 6000 },
}
```

## Costo por alumno al mes

| Perfil | Hipótesis | Informes | Consejos | Secciones de tarjetas | Costo al mes (USD) | Alumnos al día con el presupuesto |
|---|---|---|---|---|---|---|
| Ligero | 4 | 4 | 8 | 10 | 0.00290 | 52323 |
| Típico | 12 | 4 | 16 | 40 | 0.00880 | 17050 |
| Intenso | 12 | 4 | 16 | 200 | 0.0343 | 4366 |

Preguntas reestructuradas, 20 al mes por lote en todo el sistema, 0.00210 dólares al mes.

## Notas

- Las compuertas se revisan en cada repetición. Esquema al primer intento en 98% o más y 100% después del reintento, anclaje, rechazos y adversarios en 100%, cero negativas, cero cortes por max_tokens y latencia p95 de 20 s en informe y consejos y de 30 s por sección en tarjetas, sin la primera llamada de cada esquema
- El juez califica a ciegas, solo a quien pasó las compuertas. Pasa con media de 3.3 o más y ningún texto con marca crítica. Puede preferir textos de Claude frente a los de otro proveedor (10.8). La palabra final es de los dos médicos en la compuerta 1
- Las hipótesis van por lote en producción, así que en la proyección cuestan la mitad de lo medido aquí
- Si Haiku 5.5 se niega en más de 1% de un motor, ese motor sube a Sonnet 5.5 (10.16). Aquí una sola negativa ya no pasa las compuertas
- Este reporte no lleva texto de casos ni razones del juez. Ese detalle va a private/eval-ai/ con --json

## Casos con la configuración actual

Corrida del 2026-10-15.

Evaluación de los motores de IA en modo simulado (respuestas fijas, sin costo)

Casos 60 sintéticos, 50 del banco de demostración, 25 adversarios.

| Motor | Casos | Esquema | Anclaje | Rechazos | Adversarios | Reintentos | Costo teórico (USD) | Latencia media | Latencia p95 |
|---|---|---|---|---|---|---|---|---|---|
| forgetting | 27 | 100% | 100% | 100% | 100% | 0 | 0.0331 | 1 ms | 4 ms |
| weekly_report | 25 | 100% | 100% | 100% | 100% | 0 | 0.0234 | 0 ms | 2 ms |
| flashcards | 29 | 100% | 100% | 100% | 100% | 0 | 0.0926 | 2 ms | 9 ms |
| bias_tips | 25 | 100% | 100% | 100% | 100% | 0 | 0.0203 | 1 ms | 2 ms |
| restructure | 29 | 100% | 100% | 100% | 100% | 2 | 0.1218 | 3 ms | 18 ms |
| total | 135 | 100% | 100% | 100% | 100% | 2 | 0.2912 | 2 ms | 7 ms |

Meta de esquema válido en 100% de los casos cumplida.
Meta de anclaje correcto en 100% de las respuestas cumplida.
Meta de rechazo correcto en los casos sin explicación cumplida.
Meta de casos adversarios bien resueltos en 100% cumplida.

El costo teórico se calcula con los precios configurados y los tokens aproximados de las respuestas fijas. No hubo gasto real.

## Camino por lotes

Corrida del 2026-10-15 en modo simulado, forgetting con claude-haiku-4-5.

- 1 lote con 10 peticiones, 0.0 minutos hasta ended
- Casos 10, esquema al primer intento 100%, anclaje 100%, rechazos 100% y negativas 0
- Costo al 50% de 0.00797 dólares, 0.00080 por llamada
- Lotes borrados en Anthropic al terminar sí
- Cada petición del lote es la misma del camino al momento, capturada del mismo proveedor del núcleo
