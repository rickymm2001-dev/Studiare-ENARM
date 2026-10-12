// Usuarios y roles locales (pantalla 28, D-070). Sin la nube, el admin trabaja sobre los perfiles de
// este navegador. Nombra médico a un alumno, los conteos por rol cambian y el cambio sobrevive a
// recargar. Las reglas de engines/roles se ven en la pantalla. Nadie cambia su propio rol y un admin
// no nombra ni quita admins, eso solo lo hace el dueño.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { enterAs, readTable, signOut, statValue, userRow } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const roleField = (row: ReturnType<typeof userRow>) =>
  row.getByRole('combobox', { name: t.admin.role });

test('un admin nombra médico a un alumno, no se cambia a sí mismo ni nombra admins, y el dueño sí puede', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // Ana es el alumno que cambia de rol. Beto es el perfil con el que entra el admin
  await signUp(page, 'Ana');
  await signOut(page);
  await signUp(page, 'Beto');
  await enterAs(page, 'admin');
  await page.goto(SCREENS.adminUsers.path);
  await expect(page.getByText(t.admin.notice)).toBeVisible({ timeout: 90_000 });
  const stats = t.admin.stats;
  await expect(statValue(page, stats.label, stats.students)).toHaveText('2');
  await expect(statValue(page, stats.label, stats.physicians)).toHaveText('0');
  await expect(statValue(page, stats.label, stats.staff)).toHaveText('0');
  await expectNoSeriousA11yViolations(page);

  // Beto es él mismo. No hay selector de rol, solo la etiqueta de alumno
  const beto = userRow(page, 'Beto');
  await expect(beto.getByText(`(${t.party.you})`)).toBeVisible();
  await expect(roleField(beto)).toHaveCount(0);
  await expect(beto.getByText(t.roles.names.student, { exact: true })).toBeVisible();

  // La regla. A Ana se le ofrece Alumno o Médico, nunca Admin, porque solo el dueño nombra admins
  const ana = userRow(page, 'Ana');
  await expect(roleField(ana).getByRole('option')).toHaveText([
    t.roles.names.student,
    t.roles.names.physician,
  ]);
  await expect(
    roleField(ana).getByRole('option', { name: t.roles.names.admin, exact: true }),
  ).toHaveCount(0);

  // Nombrarla médica cambia los conteos, muestra sus asignaciones y sobrevive a recargar
  await roleField(ana).selectOption('physician');
  await expect(page.getByRole('status')).toHaveText(
    t.admin.roleChanged('Ana', t.roles.names.physician),
  );
  await expect(statValue(page, stats.label, stats.students)).toHaveText('1');
  await expect(statValue(page, stats.label, stats.physicians)).toHaveText('1');
  await expect(ana.getByText(t.admin.assignedCount(0))).toBeVisible();
  await expect(ana.getByRole('button', { name: t.admin.assign })).toBeVisible();
  await page.reload();
  await expect(roleField(ana)).toHaveValue('physician', { timeout: 90_000 });
  const users = await readTable<{ alias: string; role: string }>(page, 'users');
  expect(users.find((user) => user.alias === 'Ana')?.role).toBe('physician');
  expect(users.find((user) => user.alias === 'Beto')?.role).toBe('student');

  // El dueño sí puede nombrar admins. Ana pasa a admin y cuenta como equipo
  await enterAs(page, 'owner');
  await page.goto(SCREENS.adminUsers.path);
  await expect(roleField(ana)).toBeVisible({ timeout: 90_000 });
  await expect(roleField(ana).getByRole('option')).toHaveText([
    t.roles.names.student,
    t.roles.names.physician,
    t.roles.names.admin,
  ]);
  await roleField(ana).selectOption('admin');
  await expect(page.getByRole('status')).toHaveText(
    t.admin.roleChanged('Ana', t.roles.names.admin),
  );
  await expect(statValue(page, stats.label, stats.staff)).toHaveText('1');
  await expect(statValue(page, stats.label, stats.physicians)).toHaveText('0');
  await expectNoSeriousA11yViolations(page);

  // De vuelta como admin, a otro admin no se le puede tocar el rol. Solo se ve su etiqueta
  await enterAs(page, 'admin');
  await page.goto(SCREENS.adminUsers.path);
  await expect(ana.getByText(t.roles.names.admin, { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(roleField(ana)).toHaveCount(0);
});
