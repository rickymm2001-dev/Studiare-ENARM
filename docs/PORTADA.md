# Portada de Studiare. Guía para quien escribe el texto

Este documento es para la agencia o el influencer que escribe el texto de venta de la portada de Studiare. Dice qué lugares tiene la página, cuánto cabe en cada uno, qué tono usar, qué no se puede prometer y cómo entregar el texto. Ricardo aprueba todo antes de que se publique.

## Cómo se arma la portada

La portada es lo primero que ve quien entra a Studiare sin sesión. Va en este orden.

- Título principal, con una etiqueta arriba, un párrafo, dos botones y una línea corta de confianza
- Seis tarjetas de funciones
- Seis perfiles de estudiante
- Un bloque del creador y un bloque de testimonios, que no se ven hasta que haya texto para ellos
- Los planes y sus precios
- Preguntas frecuentes
- Un cierre con el botón principal y los enlaces legales

Hoy la página trae un texto neutro que escribió el equipo mientras llegaba el de la agencia. Ese texto se queda tal cual hasta que Ricardo apruebe el nuevo. Con los dos bloques opcionales vacíos la página se ve igual que siempre.

## Cómo entregar

- Un solo documento, de Word, Google Docs o texto simple
- Una entrada por cada lugar de la tabla, con su id arriba y el texto abajo, como en el ejemplo
- Si un lugar no cambia, no lo pongas y se queda el texto de hoy
- Si traes una cifra, una comparación o un testimonio, manda aparte el respaldo, que se explica más abajo

```
hero.title
El texto que quieras para el título

hero.subtitle
El texto que quieras para el párrafo
```

## Lugares de texto

El largo máximo cuenta caracteres con espacios. Si te pasas, la prueba automática del proyecto lo marca y el texto no entra hasta que lo acortes. Las filas con N se repiten para cada elemento y N es su número en la página.

| Lugar | Dónde se ve | Máximo |
| --- | --- | --- |
| `hero.badge` | Etiqueta chica arriba del título | 60 |
| `hero.title` | Título principal de la portada | 70 |
| `hero.subtitle` | Párrafo debajo del título | 220 |
| `hero.cta` | Botón principal. Se repite en el cierre de la página | 30 |
| `hero.trust` | Línea corta debajo de los botones | 80 |
| `features.N.title` | Título de cada tarjeta de funciones, N de 1 a 6 | 40 |
| `features.N.text` | Texto de cada tarjeta de funciones, N de 1 a 6 | 180 |
| `personas.N.who` | Quién es cada perfil de estudiante, N de 1 a 6 | 40 |
| `personas.N.text` | Texto de cada perfil de estudiante, N de 1 a 6 | 140 |
| `creator.name` | Bloque del creador, su nombre | 60 |
| `creator.role` | Bloque del creador, su rol | 80 |
| `creator.quote` | Bloque del creador, su cita | 240 |
| `creator.photoAlt` | Bloque del creador, texto alternativo de su foto | 120 |
| `testimonials.N.quote` | Cita de cada testimonio, hasta 6 | 240 |
| `testimonials.N.who` | Quién lo dice en cada testimonio, hasta 6 | 60 |
| `faq.N.question` | Pregunta frecuente, tres o más | 90 |
| `faq.N.answer` | Respuesta a cada pregunta frecuente | 300 |
| `final.title` | Título del cierre de la página | 70 |
| `meta.title` | Título que se ve al compartir el enlace en WhatsApp, Facebook o Google | 60 |
| `meta.description` | Descripción que se ve al compartir el enlace | 160 |

Quien inspecciona la página en el navegador ve el id de cada lugar en el atributo `data-slot` del elemento que lo pinta. El botón del cierre repite el texto de `hero.cta` y lo dice en el atributo `data-slot-repeat`, así cada id aparece una sola vez. Así puedes comprobar qué texto va dónde. El título y la descripción de `meta` no se ven en la página, viven en la configuración de la marca y salen al compartir el enlace.

### Íconos de las tarjetas de funciones

Cada tarjeta lleva un ícono fijo según su posición. Si cambias de tema una tarjeta, avisa a Ricardo para cambiar también su ícono.

| N | Tema de hoy | Ícono |
| --- | --- | --- |
| 1 | Técnica de examen | Medidor |
| 2 | Repaso espaciado | Libro con palomita |
| 3 | Sesgos en las opciones | Cerebro |
| 4 | Estudio con juego | Trofeo |
| 5 | Mazos propios | Archivo que se sube |
| 6 | Médicos que revisan | Estetoscopio |

## Lo que no es un lugar de texto

- Los precios, los planes, la prueba gratis, los descuentos y lo que incluye cada plan salen de la configuración del cobro y de las banderas del producto. Así el texto de venta nunca contradice lo que se cobra. No escribas precios ni condiciones de plan en tu texto
- Los nombres de las secciones, como Planes o Preguntas frecuentes, y el botón de quien ya tiene cuenta son fijos. Si quieres cambiarlos, díselo a Ricardo
- La imagen que se ve al compartir el enlace no lleva texto de venta, para que no se desactualice con el tuyo

## Tono

- Español de México con trato de tú
- Sin signos de exclamación
- Sin el signo de dos puntos en la prosa
- Texto plano. Sin HTML, sin formato y sin enlaces
- Sin caracteres invisibles ni de formato, como el espacio de ancho cero, el guion suave o las marcas de dirección que a veces trae un texto copiado de Word, de un chat o de una página. Pégalo como texto sin formato
- Frases cortas y claras para un médico que prepara el ENARM, sin promesas de resultado

## Lo que no se puede prometer

Estas reglas salen del proyecto. La prueba automática src/i18n/landing.test.ts atrapa los casos más comunes, con sus variantes más usuales, el ancho completo y los caracteres invisibles, pero no todas las formas de decir lo mismo. Por eso la aprobación final de cada texto es de Ricardo, aunque la prueba pase.

- Predecir o estimar el puntaje del ENARM. Studiare no lo hace y nadie puede hacerlo con honestidad. Se puede decir que Studiare muestra tu dominio por rama y por subespecialidad y que te ayuda a mejorar tu técnica
- Una plaza asegurada, una garantía de aprobar o cualquier resultado seguro
- Un 100% de nada
- Decir «el mejor», «el único», «número uno» o «líder» sin respaldo, y comparar con «más preciso», «más rápido» o parecidos sin respaldo
- Cifras sin respaldo, como porcentajes, número de alumnos, de médicos, de preguntas o de resultados
- Un chat libre con IA. Studiare no lo tiene y no se anuncia
- Que la IA corrige o valida sola contenido médico. Todo texto médico que genera la IA queda en borrador hasta que un médico lo aprueba

Lo que digas de datos personales, de médicos que revisan el contenido o de precios lo revisa además el abogado. Si dudas de una frase, mándala a Ricardo antes.

## Cifras, comparaciones y respaldo

- Cualquier cifra o comparación lleva respaldo, que puede ser un documento, un estudio o un dato del producto con su fecha
- El respaldo se entrega junto con el texto. Ricardo lo registra en la lista BACKED_CLAIMS de src/features/landing/slots.ts, con el lugar, la frase exacta y dónde está la prueba
- Sin ese registro la prueba automática no deja pasar la frase que reconoce. Con él, solo vale para ese lugar y esa frase

## Testimonios

- Solo de personas reales y con su permiso por escrito. No se aceptan testimonios inventados, compuestos ni de personajes
- Se entrega el texto exacto que la persona aprobó, cómo quiere que aparezca su nombre o su descripción y la fecha del permiso con formato AAAA-MM-DD
- Ricardo guarda el permiso por escrito. La fecha va en el texto de la página y la prueba automática no deja pasar un testimonio sin ella ni con una fecha futura
- Hasta seis testimonios
- Cualquier contenido de ejemplo, de demostración o de prueba lleva siempre la etiqueta visible Contenido de prueba, y nunca se publica como si fuera real

## Bloque del creador

- Es opcional. Lleva nombre, rol y una cita en palabras de la persona
- La foto es opcional. Si la hay, es un archivo webp que Ricardo guarda en public/landing, por ejemplo public/landing/creador.webp, y pesa menos de 250 KB. Una imagen de 400 por 400 píxeles o más se ve bien
- La foto solo se muestra si trae su texto alternativo, que describe lo que se ve para quien usa lector de pantalla. No repitas solo el nombre
- Necesitamos el permiso por escrito de la persona para usar su imagen y su cita

## Enlaces

El texto de la portada no lleva enlaces ni menciones a cuentas. La lista de sitios permitidos, ALLOWED_LINK_HOSTS en src/features/landing/slots.ts, está vacía a propósito. Agregar un sitio es una decisión de Ricardo.

## Qué pasa después de que entregas

1. Ricardo lee el texto y lo aprueba por escrito. Si habla de datos, médicos o precios, lo revisa también el abogado
2. La sesión de desarrollo pasa el texto a src/i18n/landing.ts y el título y la descripción de compartir a src/config/brand.ts
3. Corre la prueba src/i18n/landing.test.ts, que dice el lugar exacto de cualquier problema, ya sea un largo que se pasa o una regla rota
4. Ricardo ve la portada en una vista previa y da el visto bueno final
5. Se publica

## Para quien integra el texto

Antes de tocar el código se puede ver cómo queda el bloque del creador y el de testimonios en una página real. En la demostración o en desarrollo, nunca en producción, la portada lee un JSON guardado en localStorage con la clave enarm.landing.preview, lo pasa por las mismas reglas y lo pinta con la etiqueta Contenido de prueba. Si algo no cumple una regla, lo ignora y la portada queda como siempre.

```js
localStorage.setItem(
  'enarm.landing.preview',
  JSON.stringify({
    creator: {
      name: 'Nombre de prueba',
      role: 'Rol de prueba',
      quote: 'Cita de prueba.',
      photo: null,
    },
    testimonials: [
      { quote: 'Testimonio de prueba.', who: 'Persona de prueba', permissionOn: '2026-10-01' },
    ],
  }),
);
```

Cuando el texto es el definitivo, se escribe en creator y testimonials de src/i18n/landing.ts. Ahí la foto se declara con su archivo y su texto alternativo, por ejemplo photo con file creador.webp y alt con la descripción.
