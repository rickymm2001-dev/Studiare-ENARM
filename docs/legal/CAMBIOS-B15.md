# Cambios al aviso de privacidad en B15

Lista de lo que B15 cambió en el aviso de privacidad, para que el abogado y Ricardo la revisen junto con CAMBIOS-B16.md. El texto sigue en borrador. La versión del aviso pasa de 2026-10-15b a 2026-10-21, y quien aceptó la anterior ve el aviso de que cambió y lo vuelve a aceptar.

## Qué cambió en el texto

- Nuevo permiso Medición de uso, el cuarto, apagado por omisión y pedido aparte en el registro, en Completa tu registro y en Configuración, Privacidad. Sale en la sección Lo que solo hacemos si lo permites, y la prueba que compara las finalidades del aviso con los permisos de la app lo exige
- Nueva viñeta en Qué datos tratamos para Medición de uso. Dice qué eventos se miden, que el identificador es seudónimo, lo da el servidor y no se deriva de la cuenta, y que nunca salen el nombre, el correo, los textos, las respuestas, los puntajes ni la especialidad. Dice también que, si el alumno paga, el servidor manda con el mismo identificador cuándo empezó o terminó su prueba, cuándo se le cobró, si cambió o canceló su plan y si hubo un reembolso, sin montos ni datos de pago
- Nueva viñeta en Qué datos tratamos para los recordatorios de repaso por correo. Dice la hora, los días, la zona horaria, la opción de recibirlos solo con tarjetas por repasar y la foto de conteos que sube la app con las fechas de los próximos 14 días y cuántas tarjetas vencen cada día, sin el contenido de ninguna tarjeta. Dice que no se mide si el alumno abre el correo o da clic
- Lo opcional deja de decir que la analítica y los recordatorios serán opcionales cuando existan. La analítica ya es un permiso, y los recordatorios se prenden en Ajustes del repaso y empiezan apagados
- PostHog, Sentry y Resend siguen con cuando se active, porque las cuentas todavía no existen. PostHog dice que solo recibe datos con el permiso Medición de uso, que no usa cookies, que no graba la pantalla y que está configurado para no guardar la dirección IP
- Sentry dice que está configurado para no guardar la dirección IP y cuánto conserva los reportes. Antes el aviso hablaba solo de los 14 días de la base de Supabase. Ahora dice 14 días en la base y, cuando se active Sentry, el tiempo de su plan, hoy 30 días
- Cookies y almacenamiento dice que con el permiso Medición de uso el navegador manda los eventos sin cookies y sin guardar nada del alumno, que Sentry tampoco usa cookies y que el recorrido de bienvenida guarda en el navegador solo si ya se vio o se saltó
- Conservación dice que los eventos que ya recibió PostHog no llevan nombre ni correo, y que al eliminar la cuenta se borra el identificador seudónimo que los ligaba al alumno
- Derechos, Cancelar dice que borrar los datos también quita los recordatorios, la foto de conteos y el identificador de Medición de uso

## Preguntas para el abogado y para Ricardo

1. Retención de Sentry. El plan Developer conserva los eventos 30 días según fuentes de terceros y falta confirmarlo en sentry.io/pricing. Si es otro número, se cambia el aviso
2. Reportes de fallas del navegador. Siguen con el permiso de mejora, como hoy. Mandarlos sin permiso, ya limpios, sería una decisión de interés legítimo que tomaría el abogado (8.4 del plan de B15)
3. Datos en PostHog al borrar la cuenta. El aviso dice que lo que queda en PostHog ya no se puede ligar al alumno, porque se borra el identificador. Borrar también en PostHog pediría una llave personal con permisos amplios y no se usa (8.21 del plan de B15)
4. Eventos de dinero desde el servidor. El aviso los menciona dentro de Medición de uso, con el mismo permiso y sin montos
5. La propiedad $geoip_disable y el descarte de la IP en el proyecto de PostHog dependen de lo que configure Ricardo con el guion. El aviso dice que está configurado así, así que el guion no se puede saltar
