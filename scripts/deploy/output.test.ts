import { describe, expect, it } from 'vitest';
import { ClosureError } from './closure.ts';
import { ManagementApiError } from './managementApi.ts';
import { errorText } from './output.ts';
import { PlanError } from './plan.ts';
import { SqlParseError } from './sql.ts';

const TOKEN = 'token-falso-de-prueba-que-no-debe-salir-en-pantalla';

describe('mensajes de error', () => {
  it('los errores propios dicen su mensaje', () => {
    expect(errorText(new ManagementApiError(401, 'Supabase respondió 401'))).toBe(
      'Supabase respondió 401',
    );
    expect(errorText(new PlanError('El plan no sirve'))).toBe('El plan no sirve');
    expect(errorText(new SqlParseError('Una cadena sin cerrar'))).toBe('Una cadena sin cerrar');
    expect(errorText(new ClosureError('Falta un archivo'))).toBe('Falta un archivo');
  });

  it('un error ajeno, como el TypeError de fetch con el encabezado, no muestra su mensaje', () => {
    const error = new TypeError(`Headers.append: Bearer ${TOKEN}\r is an invalid header value.`);
    expect(errorText(error)).not.toContain(TOKEN);
    expect(errorText(error)).toContain('TypeError');
  });
});
