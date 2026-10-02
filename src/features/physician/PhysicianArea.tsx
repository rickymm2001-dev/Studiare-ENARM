// Área del médico (pantallas 17 a 22). Se carga solo cuando se abre, para no pesar en el
// JavaScript inicial del alumno (14.4).
import { Outlet } from 'react-router';

export function PhysicianArea() {
  return <Outlet />;
}
