// Cómo nos conocieron, en conteos para el admin (B9 del plan del cambio, respuesta 22). Cada respuesta
// vive en la tabla privada signup_sources y nadie la lee una por una. El admin solo recibe cuántos
// alumnos llegaron por cada canal y por cada código de influencer, con dos funciones de la base.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { HEARD_FROM_CHANNELS, type HeardFromChannel } from '../../config/signup.ts';

export interface SignupSourceCounts {
  channels: { channel: HeardFromChannel; total: number }[];
  codes: { code: string; total: number }[];
}

export type SourcesFailure = 'not_admin' | 'network' | 'unknown';

const ChannelRow = z.object({ channel: z.enum(HEARD_FROM_CHANNELS), total: z.coerce.number() });
const CodeRow = z.object({ code: z.string(), total: z.coerce.number() });

function failureOf(error: { code?: string | undefined }): SourcesFailure {
  if (error.code === '42501') return 'not_admin';
  return error.code ? 'unknown' : 'network';
}

export async function readSignupSourceCounts(
  cloud: Pick<SupabaseClient, 'rpc'>,
): Promise<{ ok: true; counts: SignupSourceCounts } | { ok: false; reason: SourcesFailure }> {
  try {
    const [channels, codes] = await Promise.all([
      cloud.rpc('admin_signup_source_counts'),
      cloud.rpc('admin_influencer_code_counts'),
    ]);
    if (channels.error) return { ok: false, reason: failureOf(channels.error) };
    if (codes.error) return { ok: false, reason: failureOf(codes.error) };
    const parsedChannels = z.array(ChannelRow).safeParse(channels.data);
    const parsedCodes = z.array(CodeRow).safeParse(codes.data);
    if (!parsedChannels.success || !parsedCodes.success) return { ok: false, reason: 'unknown' };
    return { ok: true, counts: { channels: parsedChannels.data, codes: parsedCodes.data } };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
