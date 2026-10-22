/** Una cantidad con su unidad en singular o plural, con separador de miles de México */
export const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;
