import { useRef } from 'react';

/**
 * Regresa el foco a lo que abrió una ventana de Radix al cerrarla, para teclado y lector de
 * pantalla (4.8). Radix solo se lo devuelve a su Dialog.Trigger, así que una ventana controlada con
 * open y sin Trigger lo dejaba en el body. Va en Dialog.Content. onOpenAutoFocus recuerda lo que
 * tenía el foco antes de que Radix lo pase adentro, y onCloseAutoFocus se lo regresa si sigue en la
 * página. Con skip deja lo que hace Radix, para cuando cerrar lleva el foco a otro lado, como otra
 * pantalla cuyo título ya lo toma
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement ? active : null;
    },
    onCloseAutoFocus: (event: Event, skip = false) => {
      const target = opener.current;
      opener.current = null;
      if (skip || !target?.isConnected) return;
      event.preventDefault();
      target.focus();
    },
  };
}
