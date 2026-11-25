# Prompt para continuar la investigación en tu computadora

Copia todo lo que está dentro del bloque y pégalo en Claude Code o en Claude con navegador en tu computadora. Desde ahí se pueden abrir las páginas oficiales de los bancos que en la sesión en la nube estaban bloqueadas.

````text
Necesito que investigues en internet, leyendo directamente las páginas y PDF oficiales, qué bancos en México le abren una cuenta empresarial en sucursal a una persona moral que NO tiene e.firma (FIEL) de la empresa. Hoy es finales de noviembre de 2026.

## Contexto de la empresa
- SA de CV recién constituida, Régimen General de Ley de Personas Morales (601)
- Tiene RFC y Constancia de Situación Fiscal. NO tiene e.firma de la empresa
- Cero ventas y cero facturas. Negocio digital (SaaS educativo) que cobrará suscripciones con Stripe y recibirá los depósitos por SPEI
- Prioridades en este orden. 1) que no pida e.firma, 2) que sea banco con seguro del IPAB, 3) costo mensual cero o mínimo sin ventas, 4) SPEI barato, 5) rendimiento sobre saldo, 6) acceso futuro a crédito
- No incluyas en ninguna búsqueda ni formulario el nombre, RFC ni datos de la empresa o del dueño

## Requisito duro
Solo cuentan instituciones de banca múltiple autorizadas por la CNBV y cubiertas por el IPAB. Descarta fintechs IFPE (Mercado Pago, Cuenca, Klar, albo), SOFIPO (Fondeadora) y SOFOM. Verifica el estatus en la lista oficial de bancos de la CNBV o del IPAB.

## Lo que ya sé, para que no lo repitas, solo confírmalo
- La norma (Disposiciones del art. 115 de la Ley de Instituciones de Crédito) pide el RFC o el número de serie de la e.firma "cuando cuenten con ella". La e.firma no es obligatoria por ley, es política de cada banco
- PIDEN e.firma de la empresa, según su lista oficial. BBVA Maestra Pyme, Banamex, Banorte, Banregio, Hey Banco, Monex y Bankaool
- Candidato principal. Scotiabank Cuenta Única Empresarial y Única Plus. Su página oficial lista RFC y cédula fiscal, acta inscrita, poderes notariados, identificación de representantes y comprobante de domicilio, sin e.firma, con $10,000 de apertura. La versión Cuenta Única Total PM aparecía sin comisión de manejo. Una búsqueda mencionó un posible "conocimiento de firma" de otro banco con 6 meses de arraigo, sin confirmar
- Sin confirmar. Santander PyME (un tercero lista requisitos sin e.firma, cuesta $520 al mes), BanBajío Conecta (un tercero lista requisitos sin e.firma), Mifel Empresarial 2 (no publica lista, $300 al mes exentable con $20,000 de saldo)
- Sin información. HSBC, Afirme, Inbursa, Banco Azteca

## Bancos a revisar
Scotiabank, Santander, BanBajío, Mifel, HSBC, Afirme, Inbursa, Banco Azteca, Kapital, Banco Multiva, Banco Base, Ve por Más (Bx+), Sabadell México, CIBanco, Bancrea, Banco Covalto, Actinver, Invex, Autofin y cualquier otro banco con cuenta para persona moral que encuentres en la lista de la CNBV.

## Para cada banco, busca en este orden
1. La página oficial del producto de cuenta para persona moral y su sección de requisitos
2. El folleto informativo y el anexo de comisiones en PDF del producto
3. El contrato registrado en RECA (Registro de Contratos de Adhesión de CONDUSEF)
4. El Buró de Entidades Financieras de CONDUSEF para comisiones y quejas
5. Solo si no hay fuente oficial, comparadores o prensa de 2025 y 2026, marcándolo como dato de tercero

## Qué debes extraer de cada banco
- ¿La lista oficial de requisitos para persona moral incluye e.firma de la empresa? Cita la frase literal y la URL
- ¿Pide e.firma de los apoderados o firmantes como persona física?
- Lista completa de documentos (acta, folio mercantil, poderes, Constancia, comprobante de domicilio, beneficiario controlador, referencias bancarias)
- Canal de apertura (sucursal, ejecutivo, videollamada)
- Monto mínimo de apertura, saldo promedio mínimo y comisión si no se cumple
- Comisión mensual de manejo, costo de banca electrónica y token
- Costo de cada SPEI de salida y si el SPEI de entrada tiene costo
- Límite mensual de depósitos, si existe
- Rendimiento o GAT sobre saldo, si existe
- Si emite CFDI mensual de comisiones
- Fecha del documento consultado

## Entregables
1. Tabla comparativa con todos los bancos revisados y una columna "¿Pide e.firma de la empresa?" con valores Sí, No o No publicado, cada celda con su URL
2. Ranking de los 3 mejores bancos para este caso, con justificación de una línea cada uno
3. Lista exacta de documentos que debo llevar a la sucursal del banco número 1
4. Guion corto de llamada para confirmar con cada uno de los 3 bancos antes de ir, con las preguntas clave
   - ¿Abren cuenta a una SA de CV sin e.firma de la empresa, solo con RFC y Constancia?
   - ¿Piden referencia bancaria o conocimiento de firma?
   - ¿Cuál es la apertura mínima, la comisión mensual y el costo del SPEI?
   - ¿Hay límite mensual de depósitos?
5. Lista de datos que no pudiste confirmar en fuente oficial

## Reglas
- No inventes cifras. Si un dato no está en la fuente, escribe "No publicado"
- Distingue siempre dato oficial, dato de tercero y dato anterior a 2025
- Si dos fuentes se contradicen, muestra ambas
- Escribe en español de México, con trato de tú, en viñetas y tablas fáciles de escanear, sin usar el signo de dos puntos en la prosa
- Recuérdame al final que la e.firma la voy a necesitar de todos modos para facturar y para el Buzón Tributario, que vence el 31 de diciembre de 2026
- Guarda el resultado en un archivo Markdown llamado "Bancos sin e.firma para persona moral.md"
````

## Antes de usarlo
- **Dónde correrlo.** En Claude Code en tu computadora, o en Claude con acceso a navegador. Tu red sí abre las páginas de los bancos
- **Contexto previo.** Si quieres que tenga todo el historial, adjunta también el resumen y el reporte completo de la carpeta `reports/`
