# Cambios del bloque B16 en los textos legales

En este documento se detallan los cambios realizados al aviso de privacidad y a los términos y condiciones de Studiare para la revisión legal del abogado de Ricardo. Los textos actualizados se encuentran en src/i18n/legal.ts y se exportan en formato Markdown en docs/legal/aviso-de-privacidad.md y docs/legal/terminos-y-condiciones.md.

---

## 1. Aviso de privacidad (aviso-de-privacidad.md)

### Quién es el responsable
- Se define a **Plexus Medica S. de R.L. de C.V.** como la empresa responsable del tratamiento de los datos personales (respuestas 42 y 24 del plan V3).
- El domicilio fiscal y los correos electrónicos específicos de privacidad y de soporte se dejan marcados como `[PENDIENTE DE RICARDO]` hasta que Ricardo los proporcione.

### Qué datos tratamos
- **Foto de perfil**. Se mantiene la especificación técnica de la Fase B2 y D-121. La foto se almacena en Supabase Storage en un espacio privado del alumno, la ven únicamente el propio alumno y los integrantes de los grupos activos de Party a los que se una, y se suprime si el alumno elige iniciales o al eliminar la cuenta.
- **Comparación y modelo del alumno**. Pendiente de B14. Al integrar estos borradores (2026-10-14) se dejó fuera del aviso visible como consentimiento, porque la app todavía no tiene ese permiso ni esa función. Cuando B14 lo construya, se añade el tratamiento de las respuestas para calcular percentiles históricos frente a la comunidad de aspirantes y calibrar la dificultad de las preguntas, aclarando que no se predice puntaje del examen ni probabilidad de plaza.
- **Facturación**. Se agregan los datos necesarios para emitir comprobantes fiscales digitales por internet (CFDI): nombre o razón social, Registro Federal de Contribuyentes (RFC), régimen fiscal, código postal del domicilio fiscal y uso de CFDI.
- **Exclusión de datos sensibles**. Se reitera que los textos clínicos de las preguntas son material pedagógico y no constituyen datos sensibles de salud del aspirante.

### Para qué los usamos
- Se incorporan las finalidades de emisión de facturas fiscales a solicitud del usuario, la gestión de pases de estudio de un solo pago y el cumplimiento de las obligaciones fiscales aplicables.

### Lo que solo hacemos si lo permites (consentimientos opcionales)
- Se formaliza que cada finalidad opcional se solicita por separado y comienza desactivada por omisión (regla 4.27 del plan V3 y D-120).
- Los consentimientos opcionales que existen hoy en la app son tres. Sus textos en el aviso son los que dejó B7, que describe Party como funciona ahora.
  1. **Party**. Compartir alias, foto de perfil, XP de la semana y aporte a los retos con los miembros de los grupos, y en un duelo los aciertos y el tiempo.
  2. **Análisis con IA**. Usar los errores para las hipótesis y el informe del tutor.
  3. **Mejora anónima**. Medición del parecido entre el banco y el examen real, registro voluntario del puntaje oficial del ENARM y reporte técnico de fallas sin identificadores personales.

### Qué pasa con la inteligencia artificial
- Se clarifica el rol de **Anthropic** como encargado tecnológico de la inteligencia artificial de la plataforma.
- Se establece expresamente que **OpenAI** se emplea únicamente para evaluaciones internas de calidad y consistencia del banco de preguntas; recibe únicamente texto del banco con identificadores seudónimos y nunca datos, nombres, correos ni actividad de los alumnos.
- Se mantiene el compromiso de que al motor de IA en producción solo viajan identificadores seudónimos y texto de estudio, filtrando previamente nombres, correos y números telefónicos.
- Se ratifica que las respuestas generadas son borradores que ningún médico ha validado, no existe chat libre y no se calcula predicción alguna sobre el puntaje del examen.

### Con quién compartimos tus datos (encargados del tratamiento)
Se actualiza la lista de terceros receptores y encargados con su finalidad específica:
- **Supabase**. Alojamiento de la base de datos relacional, sistema de autenticación y almacenamiento de archivos (foto de perfil en Supabase Storage).
- **Stripe y Mercado Pago**. Procesamiento de pagos, suscripciones con tarjeta, pases de OXXO y SPEI, y facturación.
- **Resend**. Envío de correos electrónicos transaccionales (enlaces de acceso sin contraseña y notificaciones del servicio).
- **PostHog**. Analítica del uso del producto, supeditada al consentimiento previo del alumno.
- **Sentry**. Registro y análisis de errores técnicos y excepciones de la aplicación, sin datos personales sensibles.
- **Google**. Mecanismo de inicio de sesión opcional (Google Sign-In) y sincronización del banco de preguntas desde la hoja de cálculo de los médicos revisores (Google Sheets).
- **Anthropic**. Proveedor de modelos de lenguaje para el tutor y análisis pedagógico, bajo consentimiento y con datos seudónimos.
- **Cloudflare / GitHub Pages**. Alojamiento de la interfaz web y red de entrega de contenido (CDN), con tratamiento de datos técnicos de conexión como la dirección IP.
- **Autoridades**. Solo por mandato de ley o mandamiento fundado y motivado de autoridad competente.

### Tus derechos y cómo ejercerlos
- Se detallan las rutas dentro de la aplicación para el ejercicio directo de los derechos de acceso, rectificación, cancelación y oposición (Configuración, sección Perfil y sección Privacidad).
- Se indica el medio por correo electrónico ante el correo de privacidad de la empresa.

### Cuánto tiempo los conservamos
- Se aclara que los datos de pago y facturación se retienen en las pasarelas y registros contables durante los plazos que fijan las leyes fiscales en México (Código Fiscal de la Federación), mientras que los datos de estudio y la foto de perfil se borran al eliminar la cuenta.

### Personas menores de edad
- Se fija expresamente la regla de que la plataforma no admite registros de menores de 18 años.

---

## 2. Términos y condiciones (terminos-y-condiciones.md)

### Introducción
- Se formaliza que el contrato de uso se celebra entre el alumno y **Plexus Medica S. de R.L. de C.V.**

### Tu cuenta
- **Edad mínima**. Se establece como requisito indispensable tener 18 años cumplidos y capacidad legal.
- **Registro por invitación**. Se estipula que durante la etapa de lanzamiento el acceso opera exclusivamente con invitación o código válido.

### Planes, pagos y cancelación
- **Pasarelas de pago**. El alumno puede elegir entre Stripe y Mercado Pago para gestionar sus transacciones.
- **Prueba gratis de 7 días**. Se aclara que aplica para suscripciones con tarjeta. La pantalla de pago informa de manera previa y visible el cobro automático recurrente al finalizar el séptimo día, salvo cancelación anticipada.
- **Garantía de 7 días**. Se introduce la garantía de satisfacción de 7 días naturales a partir del primer cobro efectivo, con derecho a devolución íntegra del 100% de dicho cobro solicitándola por correo.
- **Cambio de plan con prorrateo**. Se permite la modificación del plan (mensual a anual o viceversa) a través del portal de cliente, aplicando el prorrateo automático correspondiente.
- **Pases de OXXO y SPEI**. Se define que los pagos en efectivo en OXXO y las transferencias SPEI corresponden a pases de acceso temporal (1 mes o 1 año) que no admiten renovación automática. Al expirar su vigencia, la cuenta regresa al plan Gratis sin cobros adicionales.
- **Precio Fundador**. Se detallan sus reglas contractuales:
  - Cupo cerrado y limitado a 100 lugares en total, unificados entre las modalidades mensual y anual.
  - Exclusivo para suscripción con renovación automática por tarjeta.
  - El lugar se aparta durante los 7 días de prueba gratis; si el usuario cancela antes del primer cobro, el lugar se libera para otro aspirante.
  - Una vez efectuado el primer cobro, el precio se conserva de forma permanente mientras la suscripción no sea cancelada ni caiga en mora. Si se cancela después de haber pagado, el lugar y el precio preferencial se pierden de forma definitiva y el cupo no se reabre.
  - El cambio entre Fundador mensual y Fundador anual dentro del portal preserva el lugar y el beneficio.
- **Política de reembolsos complementaria**. Queda señalada como `[pendiente de definir la política de reembolsos por el abogado]` para los supuestos posteriores al vencimiento de la garantía de 7 días.

### Ley aplicable y jurisdicción
- Se reitera el sometimiento a la legislación mexicana. La designación de tribunales competentes queda señalada como `[pendiente de definir los tribunales competentes por el abogado]`.

---

## 3. Preguntas para el abogado de Ricardo

1. **Razón social y objeto social**. ¿La razón social Plexus Medica S. de R.L. de C.V. cuenta en su objeto social con facultades para la comercialización de servicios digitales, plataformas educativas y software como servicio (SaaS)?
2. **Domicilio y datos de contacto**. Se requiere el domicilio fiscal completo y las cuentas oficiales de correo para atención de derechos ARCO y soporte técnico general.
3. **Mecanismo de aceptación y consentimiento**. El sistema recaba consentimientos opcionales independientes y apagados por omisión (checkboxes desmarcados al registro y configurables en cualquier momento). ¿Considera conveniente recabar una firma electrónica simple adicional o el registro electrónico de fecha, hora, dirección IP y versión aceptada resulta suficiente conforme a la LFPDPPP y el Código de Comercio?
4. **Transferencias internacionales y encargados**. Varios de los encargados tienen servidores en Estados Unidos u otras jurisdicciones (Supabase, Stripe, Anthropic, PostHog, Sentry, Cloudflare, Resend, Google). ¿Es recomendable incorporar alguna leyenda complementaria sobre cláusulas contractuales tipo o transferencia internacional de datos personales en el aviso de privacidad?
5. **Garantía de 7 días y reembolsos posteriores**. Se fijó una garantía de satisfacción total de 7 días naturales desde el primer cobro con devolución del 100%. ¿Qué política de reembolsos sugiere establecer para reclamaciones posteriores a dicho plazo (por ejemplo, cargos no reconocidos, fallas imputables a la plataforma o solicitudes de cancelación extemporáneas)?
6. **Contratos de adhesión y PROFECO**. Tratándose de una suscripción digital dirigida a personas físicas en México con cobro recurrente automático, ¿recomienda registrar el contrato de adhesión ante la Procuraduría Federal del Consumidor (PROFECO) conforme a la Ley Federal de Protección al Consumidor y la NOM-151-SCFI?
7. **Jurisdicción y tribunales**. ¿Qué ciudad y fuero judicial recomienda fijar en la cláusula de jurisdicción y controversias (por ejemplo, los tribunales competentes de la Ciudad de México o del domicilio social de la empresa)?
8. **Responsabilidad y limitación de daños**. En el sector médico es crucial limitar la responsabilidad respecto a los resultados del examen ENARM y la aplicación de decisiones clínicas en pacientes reales. ¿Considera suficiente la cláusula que tope la responsabilidad civil como máximo a las cantidades pagadas en los últimos 12 meses?
9. **Propiedad de apuntes y mazos de estudio**. El estudiante conserva la titularidad de los apuntes y mazos que crea o importa (por ejemplo archivos .apkg de Anki), y otorga una licencia limitada de uso necesaria para la prestación del servicio en la nube. ¿Sugiere alguna previsión específica para prevenir infracciones de derechos de autor respecto a materiales médicos de terceros subidos por los alumnos?

## Nota de integración

El nombre del responsable vuelve a salir de VITE_LEGAL_NAME, como en el resto de la app, así que al publicar hay que fijarlo en Plexus Medica S. de R.L. de C.V. junto con VITE_LEGAL_ADDRESS y VITE_SUPPORT_EMAIL. Los textos ya no muestran corchetes de pendiente de Ricardo al alumno. Al unir esta rama con main el 2026-10-15 se conservaron el texto de Party que escribió B7 y lo que agregó B9 (edad mínima, entrar con Google y cómo nos conociste), y se dejó fuera la finalidad de comparación y modelo del alumno hasta que B14 la construya. La versión del aviso pasó de 2026-10-14b a 2026-10-15, así que quien ya lo aceptó verá el aviso de actualización. El aviso sigue marcado como borrador hasta que el abogado lo apruebe.
