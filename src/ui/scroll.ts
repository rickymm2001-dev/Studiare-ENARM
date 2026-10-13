// Lleva un elemento a la vista, por ejemplo una sección de Configuración que se pidió en la dirección.
// jsdom no implementa scrollIntoView, por eso se revisa que exista antes de llamarlo.
export function scrollToElement(element: Element | null): void {
  if (element && 'scrollIntoView' in element) element.scrollIntoView({ block: 'start' });
}
