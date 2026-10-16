// Si la base activa es la de demostración (B14, 4.7 del plan de B14). Lo que se compara con "los demás
// alumnos" en la demostración sale de una cohorte simulada, y todo dato simulado lleva su etiqueta visible. Con
// la base real son alumnos de verdad. Lo leen los textos que dependen de la población. Sin DataProvider, como
// en una prueba de un componente suelto, no hay demostración.
import { useContext } from 'react';
import { DataContext } from '@/data/context';

export function useIsDemo(): boolean {
  return useContext(DataContext)?.demo != null;
}
