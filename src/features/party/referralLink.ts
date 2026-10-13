// Enlace de invitación de cada alumno (respuesta 77 del plan del cambio, B7). Lleva a la bienvenida con
// su código, /bienvenida?ref=CODIGO, que la bienvenida guarda y la nube canjea al conectar la cuenta
// (src/data/referrals/pendingReferral.ts). Se comparte con el menú del teléfono y, donde no lo hay, se
// copia. Las dependencias del navegador entran por parámetro, así se prueba sin navegador.
import { screenPath } from '@/app/screens';
import { REFERRAL_PARAM } from '@/data/referrals/pendingReferral';
import { t } from '@/i18n/es-MX';

/** El enlace completo, con la ruta pública de la app. Solo lleva el código, que es seudónimo */
export function referralLink(code: string, origin: string, basePath: string): string {
  const root = basePath.replace(/\/+$/, '');
  const url = new URL(`${root}${screenPath('onboarding')}`, origin);
  url.searchParams.set(REFERRAL_PARAM, code);
  return url.toString();
}

/** El enlace en esta página, con su origen y la ruta con la que se publicó la app */
export function referralLinkHere(code: string): string {
  return referralLink(code, window.location.origin, import.meta.env.BASE_URL);
}

export type LinkShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface LinkShareDeps {
  /** navigator.share. No existe en todos los navegadores */
  share?: ((data: ShareData) => Promise<void>) | undefined;
  /** Copia el texto al portapapeles */
  copy: (text: string) => Promise<void>;
}

const isCancel = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/**
 * Comparte el enlace con el menú del sistema. Sin él, o si falla por otra razón que no sea cancelar,
 * lo copia. Cancelar no es un error y no copia nada
 */
export async function shareReferralLink(
  link: string,
  deps: LinkShareDeps,
): Promise<LinkShareOutcome> {
  if (deps.share) {
    try {
      await deps.share({
        title: t.b7.referral.shareTitle,
        text: t.b7.referral.shareText,
        url: link,
      });
      return 'shared';
    } catch (error) {
      if (isCancel(error)) return 'cancelled';
      // Otro fallo del menú cae al respaldo de copiar
    }
  }
  try {
    await deps.copy(link);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Las dependencias del navegador de verdad */
export function browserLinkShareDeps(): LinkShareDeps {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    share: typeof nav?.share === 'function' ? nav.share.bind(nav) : undefined,
    copy: async (text) => {
      if (!nav?.clipboard) throw new Error('Sin portapapeles');
      await nav.clipboard.writeText(text);
    },
  };
}
