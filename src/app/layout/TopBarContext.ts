import { createContext, useContext } from 'react';

/**
 * Si la pantalla va dentro del marco con barra superior. En computadora el título de la pantalla,
 * la racha y el nivel suben a esa barra, y en el teléfono quedan en una franja blanca (D-117)
 */
export const TopBarContext = createContext(false);

export function useInTopBar(): boolean {
  return useContext(TopBarContext);
}

/**
 * Clases del encabezado de una pantalla dentro del marco. En el teléfono es una franja blanca de
 * orilla a orilla arriba del contenido. En computadora se fija sobre la barra superior, a la
 * derecha del botón del menú y del símbolo, que siempre miden lo mismo aunque el riel se oculte
 */
export const TOP_BAR_SLOT = [
  'max-lg:-mx-5 max-lg:border-b max-lg:border-line max-lg:bg-surface max-lg:px-5 max-lg:py-3 max-lg:first:-mt-5',
  'lg:fixed lg:top-0 lg:right-0 lg:left-[calc(var(--spacing-rail)+var(--spacing-topbar-logo))] lg:z-30 lg:h-topbar lg:flex-row lg:flex-nowrap lg:items-center lg:gap-3 lg:pr-5',
].join(' ');
