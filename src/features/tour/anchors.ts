// De la ruta a las anclas del recorrido (B15, 4.3 y 7.5 del plan de B15). El encabezado de cada pantalla
// (ScreenHeader) y cada sección del menú (BottomNav) se marcan solos a partir de la ruta, así el recorrido
// no obliga a tocar las pantallas una por una. Es lo único del recorrido que viaja en el JavaScript inicial
// junto con steps.ts, así que es chico y no importa React.
import { SCREENS, SCREEN_KEYS, type ScreenKey } from '@/app/screens';

/** El valor de data-tour en el botón Más de la barra del teléfono */
export const NAV_MORE_ANCHOR = 'nav-more';

const KEY_BY_PATH: ReadonlyMap<string, ScreenKey> = new Map(
  SCREEN_KEYS.map((key) => [SCREENS[key].path, key]),
);

/** La clave de la pantalla que vive en esa ruta, o undefined si ninguna. Tolera la diagonal final */
export function screenKeyOfPath(pathname: string): ScreenKey | undefined {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return KEY_BY_PATH.get(path);
}

/** El data-tour de una sección del menú, nav- y la clave de su pantalla, o undefined si no es una pantalla */
export function navAnchorOfPath(path: string): string | undefined {
  const key = screenKeyOfPath(path);
  return key === undefined ? undefined : `nav-${key}`;
}
