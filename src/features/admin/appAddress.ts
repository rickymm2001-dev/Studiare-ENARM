// La dirección donde corre la app, con el dominio y la carpeta en que está publicada (B18, 4 del diseño). Es la que lleva el
// mensaje de invitación que el dueño pega en su chat. Vale con cualquier dominio, también el de la demo de GitHub Pages,
// que vive en una carpeta, porque sale de donde está abierta la tarjeta y de la base de la publicación y no de una
// dirección escrita en el código.
export function appAddress(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
