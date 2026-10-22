// La llamada a email-unsubscribe desde la página Darte de baja (B15, 3.6). Aparte de la pantalla para poder probarla sin
// pintar nada. La ficha va en el cuerpo de un POST en JSON y nunca en la dirección, sin cookies y sin referente
import { readCloudConfig } from '@/data/cloud/client';
import {
  EMAIL_UNSUBSCRIBE_FUNCTION,
  EmailUnsubscribeReplySchema,
  UNSUBSCRIBE_TOKEN,
  type EmailUnsubscribeReply,
} from '@/data/cloud/engagementContracts';

/** Lo que pasó al pedir la baja. failed es que no se pudo preguntar al servidor y se puede volver a intentar */
export type UnsubscribeOutcome = EmailUnsubscribeReply['result'] | 'failed';

/**
 * Pide la baja a email-unsubscribe con la ficha. Nunca lanza. Sin la nube configurada o sin red devuelve failed, y
 * una ficha que no tiene la forma buena devuelve invalid sin preguntar nada
 */
export async function requestUnsubscribe(
  token: string,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
  config = readCloudConfig(),
): Promise<UnsubscribeOutcome> {
  if (!UNSUBSCRIBE_TOKEN.test(token)) return 'invalid';
  if (!config) return 'failed';
  try {
    const reply = await fetchFn(`${config.url}/functions/v1/${EMAIL_UNSUBSCRIBE_FUNCTION}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!reply.ok) return 'failed';
    const parsed = EmailUnsubscribeReplySchema.safeParse(await reply.json());
    return parsed.success ? parsed.data.result : 'failed';
  } catch {
    return 'failed';
  }
}
