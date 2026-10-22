// Lo único de la franja de la encuesta que viaja en el JavaScript inicial (B18, 1.2 del diseño). Pesa menos de 1 KB. Solo
// baja el resto, con lazy, para un alumno con la cuenta de la nube conectada y fuera de una pregunta, un examen o un
// repaso. Si su archivo no llega, como sin red antes de que el service worker lo guarde, no se ve, pero la app sigue
import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router';
import { useCloud } from '../cloudState';
import { screenPath } from '../screens';

const LazySurveyNotice = lazy(() =>
  import('@/features/survey/SurveyNotice').then(
    (module) => ({ default: module.SurveyNotice }),
    () => ({ default: () => null }),
  ),
);

/** Donde no se ofrece: estudiando, en la propia encuesta y en la bienvenida */
const QUIET = [
  screenPath('question'),
  screenPath('feedback'),
  screenPath('exam'),
  screenPath('review'),
  screenPath('survey'),
  screenPath('onboarding'),
];

export function SurveyNoticeLauncher({ className = '' }: { className?: string }) {
  const cloud = useCloud((store) => store.state);
  const { pathname } = useLocation();
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  if (cloud.status !== 'linked' || cloud.identity.role !== 'student' || QUIET.includes(path)) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazySurveyNotice
        key={cloud.identity.authId}
        userId={cloud.identity.authId}
        className={className}
      />
    </Suspense>
  );
}
