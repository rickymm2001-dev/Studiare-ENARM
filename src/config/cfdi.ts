// Catálogos del SAT para pedir factura (B10 del plan del cambio, 3.2 y 8.23). Régimen fiscal
// (c_RegimenFiscal) y uso del CFDI (c_UsoCFDI) de la versión 4.0, con su código y su nombre. Son los
// mismos que acepta la base (supabase/migrations/20261022000003_invoice_requests.sql) y una prueba lo
// revisa. Que el uso sea compatible con el régimen lo revisa quien emite la factura.

export interface CatalogEntry {
  code: string;
  name: string;
}

export const TAX_REGIMES: readonly CatalogEntry[] = [
  { code: '601', name: 'General de Ley Personas Morales' },
  { code: '603', name: 'Personas Morales con Fines no Lucrativos' },
  { code: '605', name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '606', name: 'Arrendamiento' },
  { code: '607', name: 'Régimen de Enajenación o Adquisición de Bienes' },
  { code: '608', name: 'Demás ingresos' },
  { code: '610', name: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { code: '611', name: 'Ingresos por Dividendos (socios y accionistas)' },
  { code: '612', name: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '614', name: 'Ingresos por intereses' },
  { code: '615', name: 'Régimen de los ingresos por obtención de premios' },
  { code: '616', name: 'Sin obligaciones fiscales' },
  { code: '620', name: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
  { code: '621', name: 'Incorporación Fiscal' },
  { code: '622', name: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { code: '623', name: 'Opcional para Grupos de Sociedades' },
  { code: '624', name: 'Coordinados' },
  {
    code: '625',
    name: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  },
  { code: '626', name: 'Régimen Simplificado de Confianza' },
];

/** Gastos en general va primero, porque es el uso más común de una suscripción */
export const CFDI_USES: readonly CatalogEntry[] = [
  { code: 'G03', name: 'Gastos en general' },
  { code: 'G01', name: 'Adquisición de mercancías' },
  { code: 'G02', name: 'Devoluciones, descuentos o bonificaciones' },
  { code: 'I01', name: 'Construcciones' },
  { code: 'I02', name: 'Mobiliario y equipo de oficina por inversiones' },
  { code: 'I03', name: 'Equipo de transporte' },
  { code: 'I04', name: 'Equipo de cómputo y accesorios' },
  { code: 'I05', name: 'Dados, troqueles, moldes, matrices y herramental' },
  { code: 'I06', name: 'Comunicaciones telefónicas' },
  { code: 'I07', name: 'Comunicaciones satelitales' },
  { code: 'I08', name: 'Otra maquinaria y equipo' },
  { code: 'D01', name: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { code: 'D02', name: 'Gastos médicos por incapacidad o discapacidad' },
  { code: 'D03', name: 'Gastos funerales' },
  { code: 'D04', name: 'Donativos' },
  {
    code: 'D05',
    name: 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
  },
  { code: 'D06', name: 'Aportaciones voluntarias al SAR' },
  { code: 'D07', name: 'Primas por seguros de gastos médicos' },
  { code: 'D08', name: 'Gastos de transportación escolar obligatoria' },
  {
    code: 'D09',
    name: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones',
  },
  { code: 'D10', name: 'Pagos por servicios educativos (colegiaturas)' },
  { code: 'S01', name: 'Sin efectos fiscales' },
  { code: 'CP01', name: 'Pagos' },
  { code: 'CN01', name: 'Nómina' },
];

/** El texto de una opción, con el código primero como lo pide el SAT */
export const catalogLabel = (entry: CatalogEntry) => `${entry.code} ${entry.name}`;
