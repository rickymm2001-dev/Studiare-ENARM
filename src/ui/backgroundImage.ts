// Foto de fondo personalizada (D-065). Se reduce y comprime en el navegador antes de guardarla en
// este dispositivo. Nunca sale del navegador.
const KEY = 'enarm.background-image.v1';
const MAX_SIDE = 1600;

export function loadBackgroundImage(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Guarda la foto. Devuelve false si no cupo en el almacenamiento del navegador */
export function saveBackgroundImage(dataUrl: string | null): boolean {
  try {
    if (dataUrl === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

/** Lee una imagen del alumno, la reduce a 1600 px por lado y la pasa a JPEG */
export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no-canvas');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}
