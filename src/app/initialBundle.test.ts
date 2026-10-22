// El JavaScript inicial tiene un presupuesto de 300 KB (14.4) y B15 lo dejó a 0.5 KB. Estos archivos van en el
// inicial y antes importaban la cuenta de la nube (account.ts, accountDetails.ts, avatars.ts y cloudLink.ts, con
// lo que ellos jalan), que solo se usa con la nube conectada y al acabar una acción. Ahora la bajan con un import
// dinámico donde la usan. La prueba lee el código, porque el tamaño del build lo mide npm run budget y esto avisa
// antes de compilar y dice quién fue.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');

/** Los archivos del inicial que no deben importar la cuenta de la nube de forma estática */
const IN_INITIAL_BUNDLE = [
  'app/preferences.ts',
  'app/cloudState.ts',
  'app/layout/NoticeUpdateNotice.tsx',
  'data/cloud/oauth.ts',
];

/** Una importación estática de valores, no de tipos, de la cuenta de la nube */
const STATIC_CLOUD_ACCOUNT =
  /^import\s+(?!type\b)[^;]*?from\s+['"](?:@\/data\/cloud\/(?:account|accountDetails|avatars)|@\/data\/usecases\/cloudLink|\.\/account)['"]/m;

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('el JavaScript inicial no arrastra la cuenta de la nube', () => {
  it.each(IN_INITIAL_BUNDLE)('%s la baja solo con un import dinámico', (file) => {
    const code = withoutComments(readFileSync(join(SRC, file), 'utf8'));
    expect(code).not.toMatch(STATIC_CLOUD_ACCOUNT);
  });

  it('el cierre de sesión, el aviso de privacidad y la subida de la cuenta siguen llegando a esos módulos', () => {
    const read = (file: string) => withoutComments(readFileSync(join(SRC, file), 'utf8'));
    expect(read('app/preferences.ts')).toContain("import('@/data/cloud/account')");
    expect(read('app/layout/NoticeUpdateNotice.tsx')).toContain("import('@/data/cloud/account')");
    expect(read('app/cloudState.ts')).toContain("import('@/data/usecases/cloudLink')");
  });
});
