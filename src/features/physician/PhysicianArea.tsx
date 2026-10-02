// Área del médico (pantallas 17 a 22). Se carga solo cuando se abre, para no pesar en el
// JavaScript inicial del alumno (14.4). Médico y admin pueden entrar.
import { Outlet } from 'react-router';
import { RoleGuard } from '@/app/layout/RoleGuard';

export function PhysicianArea() {
  return (
    <RoleGuard allow={['physician', 'admin', 'owner']} area="physician">
      <Outlet />
    </RoleGuard>
  );
}
