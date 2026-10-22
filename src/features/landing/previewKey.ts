// La clave de la vista previa de la portada (preview.ts) y la revisión barata de si hay algo guardado. Va
// aparte para que la portada pueda preguntar sin cargar las reglas del texto ajeno, que solo se bajan
// cuando de verdad hay una vista previa que revisar y nunca en producción.

/** La clave de localStorage donde se pega la vista previa, como JSON con creator y testimonials */
export const LANDING_PREVIEW_KEY = 'enarm.landing.preview';

/** Si el navegador trae algo guardado en la clave. Sin almacenamiento, o con uno que falla, no */
export function hasLandingPreview(): boolean {
  try {
    return globalThis.localStorage.getItem(LANDING_PREVIEW_KEY) !== null;
  } catch {
    return false;
  }
}
