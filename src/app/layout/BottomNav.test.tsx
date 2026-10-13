// @vitest-environment jsdom
// Pruebas unitarias de navegación para cada rol en computadora y teléfono (B3, criterio 1).
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NAV_BY_ROLE, settingsItem } from '@/app/navigation';
import { usePreferences } from '@/app/preferences';
import type { Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { BottomNav } from './BottomNav';

function renderNav(role: Role, currentPath = '/') {
  usePreferences.setState({ role });
  const items = NAV_BY_ROLE[role];
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <BottomNav items={items} />
    </MemoryRouter>,
  );
}

describe('BottomNav por rol (B3)', () => {
  const ROLES: Role[] = ['student', 'physician', 'admin', 'owner'];

  for (const role of ROLES) {
    it(`muestra los ítems de computadora y móvil para el rol ${role}`, async () => {
      renderNav(role);
      const nav = screen.getByRole('navigation', { name: t.nav.label });

      // En computadora (riel):
      const desktop = nav.querySelector('div.hidden.lg\\:flex');
      expect(desktop).toBeInTheDocument();
      if (!desktop) {
        throw new Error('desktop navigation element not found');
      }
      expect(within(desktop as HTMLElement).getByRole('link', { name: settingsItem.label })).toBeInTheDocument();

      if (role === 'student') {
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.home })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.review })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.outlines })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.simulate })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.progress })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.tutor })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.party })).toBeInTheDocument();

        // No deben existir Plan, Logros ni Perfil
        expect(within(desktop as HTMLElement).queryByRole('link', { name: t.navItems.planner })).toBeNull();
        expect(within(desktop as HTMLElement).queryByRole('link', { name: t.navItems.rewards })).toBeNull();
        expect(within(desktop as HTMLElement).queryByRole('link', { name: t.navItems.profile })).toBeNull();
      }

      if (role === 'physician') {
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.bank })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.agreement })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).queryByRole('link', { name: t.navItems.home })).toBeNull();
      }

      if (role === 'admin' || role === 'owner') {
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.home })).toBeInTheDocument();
        expect(within(desktop as HTMLElement).getByRole('link', { name: t.navItems.users })).toBeInTheDocument();
      }

      // En el teléfono: exactamente 5 casillas en la barra inferior
      const mobile = nav.querySelector('ul.grid.grid-cols-5');
      expect(mobile).toBeInTheDocument();
      if (!mobile) {
        throw new Error('mobile navigation element not found');
      }
      const moreBtn = within(mobile as HTMLElement).getByRole('button', { name: t.navItems.more });
      expect(moreBtn).toBeInTheDocument();

      const user = userEvent.setup();
      await user.click(moreBtn);

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByRole('link', { name: settingsItem.label })).toBeInTheDocument();

      if (role === 'student') {
        expect(within(dialog).getByRole('link', { name: t.navItems.outlines })).toBeInTheDocument();
        expect(within(dialog).getByRole('link', { name: t.navItems.tutor })).toBeInTheDocument();
        expect(within(dialog).getByRole('link', { name: t.navItems.party })).toBeInTheDocument();
      }
    });
  }
});
