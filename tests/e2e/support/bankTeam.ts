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

/** Entra con el enlace del correo y espera la primera pantalla con su título */
export async function enterTeam(
  page: Page,
  cloud: FakeSupabaseServer,
  email: string,
): Promise<void> {
  await openEmailLink(page, cloud.issueMagicLink(email));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
}
