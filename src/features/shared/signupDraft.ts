// Lo que llena el alumno en el registro antes de guardarlo (B9 del plan del cambio). Los permisos
// opcionales, que empiezan apagados (4.27), y la respuesta de cómo nos conoció con su código de
// influencer (respuesta 22). Lo usan Crear cuenta y Completa tu registro.
import { INFLUENCER_CODE, normalizeInfluencerCode, type HeardFromChannel } from '@/config/signup';
import type { ConsentPurposeSchema } from '@/data/schemas/common';
import type { z } from 'zod';

type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;

export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  'party',
  'ai_analysis',
  'anonymized_improvement',
];
export const NO_CONSENTS: Record<ConsentPurpose, boolean> = {
  party: false,
  ai_analysis: false,
  anonymized_improvement: false,
};

export interface HeardFromDraft {
  channel: HeardFromChannel | '';
  code: string;
}
export const EMPTY_HEARD_FROM: HeardFromDraft = { channel: '', code: '' };

/**
 * La respuesta lista para guardar. null si no contestó, invalid si el código no tiene la forma que
 * acepta la base. Un código sin canal cuenta como de un influencer, para no perderlo
 */
export function heardFromOf(
  draft: HeardFromDraft,
): { channel: HeardFromChannel; influencerCode: string | null } | null | 'invalid' {
  const code = normalizeInfluencerCode(draft.code);
  if (code !== null && !INFLUENCER_CODE.test(code)) return 'invalid';
  if (draft.channel === '') {
    return code === null ? null : { channel: 'influencer', influencerCode: code };
  }
  return { channel: draft.channel, influencerCode: code };
}
