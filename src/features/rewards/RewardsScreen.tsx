// Logros fue retirado en B3 (D-119). Redirige a Progreso.
import { Navigate } from 'react-router';
import { screenPath } from '@/app/screens';

export function RewardsScreen() {
  return <Navigate to={screenPath('progress')} replace />;
}
