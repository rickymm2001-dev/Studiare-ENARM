# Textos legales

Borradores del aviso de privacidad y de los términos y condiciones de Studiare, para que los revise un abogado antes de abrir a alumnos de pago.

## Qué hay aquí

- aviso-de-privacidad.md es el aviso que ve el alumno en la página de Privacidad y al crear su cuenta
- terminos-y-condiciones.md son los términos y condiciones, que se leen en la página de Términos

Son el mismo texto que muestra la app. Se generan con npm run legal:export a partir de src/i18n/legal.ts, y una prueba falla si estos archivos se quedan atrás del texto de la app. Los dos archivos de esta carpeta traen los datos del responsable como pendientes de completar. Con los datos reales puestos, el comando los escribe llenos.

## Qué le debes pedir al abogado

1. Que revise los dos textos contra la ley mexicana de protección de datos personales en posesión de particulares y contra la regulación de consumo que aplique a una suscripción digital
2. Que defina la política de reembolsos, que hoy está marcada como pendiente en los términos
3. Que defina los tribunales competentes, también pendientes
4. Que confirme si hace falta algo más para recabar datos como el año de nacimiento, el sexo y el estado, o para transferirlos a Supabase, Stripe, Mercado Pago y Anthropic
5. Que confirme la edad mínima, que hoy es de 18 años
6. Que revise las cláusulas de límite de responsabilidad y de propiedad de lo que sube el alumno, como sus apuntes y los mazos que importa

## Qué debes decidir tú antes

- El nombre o razón social que será el responsable de los datos
- El domicilio
- El correo de privacidad, que también atiende las solicitudes de acceso, rectificación, cancelación y oposición

## Cómo poner los datos del responsable

Son públicos por diseño, porque la ley obliga a decirlos. En GitHub, en Settings, Secrets and variables, Actions, pestaña Variables, crea estas tres.

- VITE_LEGAL_NAME con el nombre o razón social
- VITE_LEGAL_ADDRESS con el domicilio
- VITE_SUPPORT_EMAIL con el correo. Es la misma variable que ya usa el aviso de ayuda

Vuelve a publicar la página. Mientras alguna falte, el texto la muestra como pendiente de completar y no inventa nada.

## Cuando el texto cambie

Cambia el texto en src/i18n/legal.ts y sube PRIVACY_NOTICE_VERSION en src/config/legal.ts. Esa versión es la que se guarda cuando el alumno acepta el aviso. Corre npm run legal:export y manda la nueva versión al abogado.
