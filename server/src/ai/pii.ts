// Filtro de datos personales del proxy (8.1, 4.5). La app ya oculta lo que identifica a una
// persona antes de enviar nada. Aquí se revisa otra vez, porque el proxy no confía en el cliente, y
// si queda un correo, un teléfono, un CURP, un RFC o un nombre del perfil, se bloquea la petición
// completa. Al modelo nunca llega algo que pase por aquí con datos personales.
import { scrubPersonalData } from '../../../src/engines/piiFilter.ts';

/** Todos los textos de una entrada, sin importar qué tan anidados estén */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

export interface PiiFinding {
  email: number;
  phone: number;
  curp: number;
  rfc: number;
  name: number;
}

/** Cuántos datos personales trae una entrada. Los enlaces solos no cuentan como datos personales */
export function findPersonalData(value: unknown, names: readonly string[] = []): PiiFinding {
  const found: PiiFinding = { email: 0, phone: 0, curp: 0, rfc: 0, name: 0 };
  for (const text of collectStrings(value)) {
    const { counts } = scrubPersonalData(text, names);
    found.email += counts.email;
    found.phone += counts.phone;
    found.curp += counts.curp;
    found.rfc += counts.rfc;
    found.name += counts.name;
  }
  return found;
}

export const hasPersonalData = (finding: PiiFinding): boolean =>
  Object.values(finding).some((count) => count > 0);
