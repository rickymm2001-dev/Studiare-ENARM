// Área de admin (pantallas 23 a 25). Se carga solo cuando se abre (14.4). Solo admin.
import { Outlet } from 'react-router';
import { RoleGuard } from '@/app/layout/RoleGuard';

export function AdminArea() {
  return (
    <RoleGuard allow={['admin', 'owner']} area="admin">
      <Outlet />
    </RoleGuard>
  );
}
