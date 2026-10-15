# Textos legales

Borradores del aviso de privacidad y de los términos y condiciones de Studiare, para que los revise el abogado de Ricardo antes de abrir a alumnos de pago (respuesta 44). Siguen marcados como borrador para revisión del abogado, en la app y aquí. La marca se quita solo cuando Ricardo diga que el abogado los aprobó (0.1 del plan del cambio).

## Qué hay aquí

- aviso-de-privacidad.md es el aviso que ve el alumno en la página de Privacidad y al crear su cuenta
- terminos-y-condiciones.md son los términos y condiciones, que se leen en la página de Términos
- CAMBIOS-B16.md es la lista de lo que cambió en B16, con el porqué y las preguntas para el abogado y para Ricardo

Son el mismo texto que muestra la app. Se generan con npm run legal:export a partir de src/i18n/legal.ts, y una prueba falla si estos archivos se quedan atrás del texto de la app.

La única diferencia es lo que falta. Aquí cada dato que falta va entre corchetes, con quién lo pone, por ejemplo [Pendiente de Ricardo. Domicilio del responsable] o [Pendiente del abogado. Tribunales competentes]. El alumno nunca ve esas marcas. En la app lee un texto neutro, como la empresa que opera Studiare o al equipo de Studiare por el medio donde te dieron acceso, y una línea que sin su dato no dice nada, como la del domicilio o la de los tribunales, no se le muestra. Una prueba lo revisa.

## Qué le debes pedir al abogado

La lista completa está en CAMBIOS-B16.md, sección Preguntas para el abogado. Lo principal

1. Que revise los dos textos contra la ley mexicana de protección de datos personales en posesión de particulares vigente y contra la regulación de consumo que aplique a una suscripción digital con cobro automático
2. Que defina qué reembolsos hay después de la garantía de 7 días y los tribunales competentes, que hoy están marcados como pendientes
3. Que confirme cómo se presentan los proveedores que reciben datos, varios de ellos fuera de México
4. Que revise las condiciones del precio Fundador, la prueba gratis y la garantía

## Cómo poner los datos del responsable

Son públicos por diseño, porque la ley obliga a decirlos. En GitHub, en Settings, Secrets and variables, Actions, pestaña Variables, crea estas cuatro. Cuando la página pase a Cloudflare (B17), van también ahí.

- VITE_LEGAL_NAME con la razón social, Plexus Medica S. de R.L. de C.V. (respuestas 24 y 42)
- VITE_LEGAL_ADDRESS con el domicilio
- VITE_PRIVACY_EMAIL con el correo de privacidad, que atiende las solicitudes de acceso, rectificación, cancelación y oposición. Si falta, el aviso usa el de soporte
- VITE_SUPPORT_EMAIL con el correo de soporte. Es la misma variable que ya usa el aviso de ayuda, y la usan los términos para la garantía y las aclaraciones

Vuelve a publicar la página. Mientras alguna falte, la app no inventa nada y el alumno lee el texto neutro.

Para mandarle al abogado los textos con los datos ya puestos, corre el comando con las variables, por ejemplo VITE_LEGAL_NAME="Plexus Medica S. de R.L. de C.V." npm run legal:export. Los archivos llenos no se suben al repositorio, porque la prueba compara contra la versión con los datos pendientes. Después de mandarlos, corre npm run legal:export sin variables para dejarlos como estaban.

## Cuando el texto cambie

Cambia el texto en src/i18n/legal.ts y sube PRIVACY_NOTICE_VERSION en src/config/legal.ts. Esa versión es la que se guarda cuando el alumno acepta el aviso, y se compara como texto, así que la nueva tiene que quedar después de la anterior al ordenarlas. Quien aceptó una versión anterior ve el aviso de que cambió. Corre npm run legal:export y manda la nueva versión al abogado.
