// Stripe.js solo vive en los botones de Apple Pay y Google Pay (B17, 6.5 y 8.2 del plan de B17). Se revisa con el
// código de src
//   - Solo walletSetup.ts lee VITE_STRIPE_PUBLISHABLE_KEY (la otra lectura es vite.config.ts, fuera de src)
//   - Solo stripeJs.ts importa @stripe/stripe-js, con import() dinámico, y los demás solo sus tipos
//   - WalletPay se carga con lazy, nunca con un import estático, y solo él inicia el SDK de Checkout
//   - La dirección del script de Stripe solo se nombra en la lista de orígenes de csp.ts
// Que el script no esté en el JavaScript inicial lo revisa el build (tests/security/build-policy.test.ts y
// npm run budget)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', '..', '..');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const rel = (path: string) => relative(SRC, path).split(sep).join('/');
const isTest = (file: string) => /\.test\.tsx?$/.test(file) || file.includes(`${sep}testing${sep}`);
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const sources = listFiles(SRC)
  .filter((file) => /\.tsx?$/.test(file) && !isTest(file) && !file.endsWith('.d.ts'))
  .map((file) => ({ file: rel(file), code: withoutComments(readFileSync(file, 'utf8')) }));

const filesThat = (test: (code: string) => boolean) =>
  sources.filter(({ code }) => test(code)).map(({ file }) => file);

describe('arquitectura de Stripe.js (B17)', () => {
  it('solo walletSetup.ts lee la llave publicable de Stripe', () => {
    expect(filesThat((code) => /env(\.|\[\s*['"])VITE_STRIPE_PUBLISHABLE_KEY/.test(code))).toEqual([
      'features/billing/wallet/walletSetup.ts',
    ]);
  });

  it('solo stripeJs.ts importa el paquete de Stripe, y lo hace con import() dinámico', () => {
    // Un import que no es de tipos, estático, trae el script al archivo que lo importa
    expect(
      filesThat((code) => /^\s*import\s+(?!type\b)[^;]*from\s+['"]@stripe\/stripe-js/m.test(code)),
    ).toEqual([]);
    expect(filesThat((code) => /^\s*import\s+['"]@stripe\/stripe-js/m.test(code))).toEqual([]);
    expect(filesThat((code) => /import\(\s*['"]@stripe\/stripe-js/.test(code))).toEqual([
      'features/billing/wallet/stripeJs.ts',
    ]);
    // Y es la entrada pure, que no pone el script hasta llamar loadStripe
    const loader = sources.find(({ file }) => file === 'features/billing/wallet/stripeJs.ts');
    expect(loader?.code).toContain("import('@stripe/stripe-js/pure')");
    expect(loader?.code).not.toMatch(/import\(\s*['"]@stripe\/stripe-js['"]\s*\)/);
  });

  it('WalletPay solo se carga con lazy y solo él inicia el SDK de Checkout', () => {
    expect(filesThat((code) => /from\s+['"][^'"]*\/WalletPay['"]/.test(code))).toEqual([]);
    expect(filesThat((code) => /import\(\s*['"][^'"]*\/WalletPay['"]\s*\)/.test(code))).toEqual([
      'features/billing/CheckoutOptions.tsx',
    ]);
    expect(filesThat((code) => code.includes('.initCheckoutElementsSdk('))).toEqual([
      'features/billing/wallet/WalletPay.tsx',
    ]);
  });

  it('la dirección del script de Stripe solo está en la lista de orígenes de la política', () => {
    expect(filesThat((code) => code.includes('js.stripe.com'))).toEqual(['config/csp.ts']);
  });
});
