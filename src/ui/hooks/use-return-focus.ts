// Foco de vuelta en los diálogos que se abren sin un botón Trigger de Radix, como el aviso de cambios
// sin guardar y Ajustes del repaso (4.8). Al cerrar, Radix lleva el foco a su Trigger y, sin él, el
// foco cae en el body y el lector de pantalla pierde su lugar. Esto recuerda qué tenía el foco al
// abrir y lo regresa ahí al cerrar, si sigue en la página.
import { useRef } from 'react';

export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    /** Para onOpenAutoFocus. Corre antes de que Radix mueva el foco dentro del diálogo */
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    },
    /**
     * Para onCloseAutoFocus. Con skip el foco no regresa, porque lo pone el destino, como el título
     * de la pantalla nueva
     */
    onCloseAutoFocus: (event: Event, skip = false) => {
      event.preventDefault();
      const target = opener.current;
      opener.current = null;
      if (!skip && target?.isConnected) target.focus();
    },
  };
}
