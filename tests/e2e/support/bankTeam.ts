// Ayudas de las e2e de nube del equipo del banco (B11, paquete C). Engancha un banco en memoria al
// Supabase simulado con su directorio de cuentas, crea las cuentas del equipo ya registradas y entra
// con el enlace del correo. Las rutas del equipo las atiende fakeEditorial.ts.
import type { Page } from '@playwright/test';
import type { Role } from '@/data/schemas/common';
import { expect, openEmailLink } from './cloudFixtures';
import { createFakeBankStore, type FakeBankCaller, type FakeBankStore } from './fakeBankStore';
import { setEditorialDirectory } from './fakeEditorial';
import { attachBank, type FakeSupabaseServer, type FakeUser } from './fakeSupabase';

export interface TeamMember {
  email: string;
  alias: string;
  role: Role;
}

/** Un banco nuevo enganchado a la nube con las cuentas del equipo, en el orden en que se piden */
export function teamBank(
  cloud: FakeSupabaseServer,
  members: readonly TeamMember[],
): { bank: FakeBankStore; users: FakeUser[] } {
  const bank = createFakeBankStore();
  attachBank(cloud, bank);
  const users = members.map((member) =>
    cloud.createUser({ email: member.email, alias: member.alias, role: member.role }),
  );
  setEditorialDirectory(bank, (id) => {
    for (const member of members) {
      const user = cloud.userByEmail(member.email);
      if (user?.id === id) return { id: user.id, alias: user.alias, role: user.role };
    }
    return null;
  });
  return { bank, users };
}

/** Quien llama una rpc del banco desde la prueba, para dejar lista una parte del flujo */
export const callerOf = (user: FakeUser): FakeBankCaller => ({
  userId: user.id,
  role: user.role,
  alias: user.alias,
  activeDevice: true,
  plan: 'free',
  flags: {},
});

/** Las preferencias del dispositivo, donde el puente de la nube deja el rol de la cuenta */
const PREFERENCES_KEY = 'enarm.preferences.v1';

/**
 * Entra con el enlace del correo y espera la primera pantalla con su título y el rol de la cuenta.
 * El título sale antes de que el puente lea la sesión del enlace, y navegar en ese momento la pierde y
 * deja al médico o al admin como alumno. El rol queda guardado después de la sesión, así que con él ya
 * se puede navegar
 */
export async function enterTeam(
  page: Page,
  cloud: FakeSupabaseServer,
  email: string,
): Promise<void> {
  await openEmailLink(page, cloud.issueMagicLink(email));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  const role = cloud.userByEmail(email)?.role ?? 'student';
  await expect
    .poll(
      () =>
        page.evaluate((key) => {
          try {
            const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { role?: unknown };
            return typeof stored.role === 'string' ? stored.role : null;
          } catch {
            return null;
          }
        }, PREFERENCES_KEY),
      { timeout: 20_000 },
    )
    .toBe(role);
}
