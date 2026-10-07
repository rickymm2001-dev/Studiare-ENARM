// Compartir la tarjeta de logro con la Web Share API y un respaldo (9.6). Donde el navegador puede
// compartir archivos abre el menú de compartir del sistema. Donde no, descarga la imagen para que el
// alumno la suba donde quiera. Cancelar no es un error. Las dependencias del navegador entran por
// parámetro, así se prueba sin navegador.
import { t } from '@/i18n/es-MX';
import { achievementText, type AchievementCard } from './achievement';

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export interface ShareDeps {
  /** navigator.share. No existe en todos los navegadores */
  share?: ((data: ShareData) => Promise<void>) | undefined;
  /** navigator.canShare. Dice si se pueden compartir archivos */
  canShare?: ((data: ShareData) => boolean) | undefined;
  /** Descarga el archivo como respaldo */
  download: (file: File) => void;
}

const isCancel = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export async function shareAchievement(
  card: AchievementCard,
  render: (card: AchievementCard) => Promise<Blob>,
  deps: ShareDeps,
): Promise<ShareOutcome> {
  let file: File;
  try {
    file = new File([await render(card)], t.party.share.fileName, { type: 'image/png' });
  } catch {
    return 'failed';
  }
  const data: ShareData = {
    files: [file],
    title: t.party.share.shareTitle,
    text: achievementText(card),
  };
  if (deps.share && deps.canShare?.(data) === true) {
    try {
      await deps.share(data);
      return 'shared';
    } catch (error) {
      if (isCancel(error)) return 'cancelled';
      // Cualquier otro fallo del menú de compartir cae al respaldo de la descarga
    }
  }
  try {
    deps.download(file);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

/** Las dependencias del navegador de verdad */
export function browserShareDeps(): ShareDeps {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: typeof nav?.share === 'function' ? nav.share.bind(nav) : undefined,
    canShare: typeof nav?.canShare === 'function' ? nav.canShare.bind(nav) : undefined,
    download: (file) => {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      // El navegador ya empezó la descarga. Se libera la memoria un momento después
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 10_000);
    },
  };
}
