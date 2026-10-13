// Dominio estimado por rama y por tema (D-066). El color va solo en un punto de 8 px junto al
// porcentaje, que se lee en texto neutro y tabular y ya dice si va mal (H02 de la revisión de
// diseño de B2). Sin fondo de color ni píldora.
import { cn } from '@/ui/cn';

/** Clases del punto del dominio estimado. Verde desde 75%, ámbar de 60% a 74% y rojo abajo de 60% */
export const masteryDot = (mastery: number) =>
  cn(
    'size-2 shrink-0 rounded-full',
    mastery >= 0.75 ? 'bg-success' : mastery >= 0.6 ? 'bg-warning' : 'bg-danger',
  );
