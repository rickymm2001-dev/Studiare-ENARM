import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { t as coreText } from './core';
import { t } from './es-MX';

const ROOT = resolve(import.meta.dirname, '../..');

// Los módulos que van en el JavaScript inicial. Si importan es-MX.ts, el chunk inicial vuelve a cargar los
// textos de todas las pantallas y se come el presupuesto de 300 KB (14.4). Ver core.ts
const SHELL_FILES = [
  'src/app/layout/AccessGate.tsx',
  'src/app/layout/AppShell.tsx',
  'src/app/layout/BottomNav.tsx',
  'src/app/layout/ConfigUpdateNotice.tsx',
  'src/app/layout/DeviceLimitNotice.tsx',
  'src/app/layout/HeaderStats.tsx',
  'src/app/layout/LevelLadderDialog.tsx',
  'src/app/layout/NoticeUpdateNotice.tsx',
  'src/app/layout/OAuthErrorNotice.tsx',
  'src/app/layout/OtherDeviceNotice.tsx',
  'src/app/layout/PwaUpdatePrompt.tsx',
  'src/app/layout/RouteFallbacks.tsx',
  'src/app/layout/ScreenHeader.tsx',
  'src/app/navigation.ts',
  'src/ui/states/states.tsx',
];

describe('textos del armazón y textos completos', () => {
  it('el armazón importa de core y no de es-MX', () => {
    for (const file of SHELL_FILES) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      expect(source, file).not.toMatch(/from '@\/i18n\/es-MX'/);
      expect(source, file).toMatch(/from '@\/i18n\/core'/);
    }
  });

  it('el texto completo trae los mismos bloques que core, sin copiarlos', () => {
    for (const key of Object.keys(coreText) as (keyof typeof coreText)[]) {
      // cloud y accounts de core son solo las partes del armazón, que el texto completo trae dentro de sus
      // bloques completos
      if (key === 'cloud' || key === 'accounts') continue;
      expect(t[key as keyof typeof t], key).toBe(coreText[key]);
    }
    expect(t.cloud.otherDevice).toBe(coreText.cloud.otherDevice);
    expect(t.cloud.deviceLimit).toBe(coreText.cloud.deviceLimit);
    expect(t.accounts.access).toBe(coreText.accounts.access);
    expect(t.accounts.oauthError).toBe(coreText.accounts.oauthError);
    expect(t.accounts.mfa.checking).toBe(coreText.accounts.mfa.checking);
  });
});
