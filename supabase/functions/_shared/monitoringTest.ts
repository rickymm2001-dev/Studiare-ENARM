// La función monitoring-test (B15 del plan del cambio, 2.4). La llama el botón Mandar error de prueba de
// Plataforma, Correos y alertas, solo un admin con su segundo factor. Manda a Sentry, desde las funciones, el
// mensaje fijo "Prueba de alertas de Studiare, funciones" para comprobar que el aviso por correo llega.
// Se despliega con la verificación de JWT de Supabase y además comprueba por su cuenta que quien llama es
// admin con su segundo factor.
//   - Sin sesión responde 401 y para quien no es admin 403
//   - Sin SENTRY_DSN, o con uno que no es de Sentry, responde { result: "missing_dsn" } y no manda nada
//   - Con el DSN manda el evento y espera la respuesta de Sentry. Si salió responde { result: "sent" }, y si
//     Sentry no contestó, 502
// El evento no lleva nada de quien lo pidió. No depende de Deno, así se prueba con Vitest (D-096).
import { corsHeaders, json } from './http.ts';
import {
  buildTestEvent,
  parseSentryDsn,
  sendSentryEvent,
  type MonitoringDeps,
} from './monitoring.ts';

export interface MonitoringTestDeps {
  /** APP_URL, para el CORS del botón */
  appUrl: string | undefined;
  /** Si la sesión de quien llama es de un admin con su segundo factor */
  adminOk: (authorization: string) => Promise<boolean>;
  monitoring: MonitoringDeps;
}

export async function handleMonitoringTest(
  request: Request,
  deps: MonitoringTestDeps,
): Promise<Response> {
  const cors = corsHeaders({ APP_URL: deps.appUrl }, request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'method' }, 405, cors);
  const authorization = request.headers.get('authorization');
  if (!authorization) return json({ error: 'unauthorized' }, 401, cors);
  if (!(await deps.adminOk(authorization))) return json({ error: 'not_admin' }, 403, cors);

  if (parseSentryDsn(deps.monitoring.dsn) === null) {
    deps.monitoring.log('monitoring-test sin SENTRY_DSN. No se mandó nada a Sentry');
    return json({ result: 'missing_dsn' }, 200, cors);
  }
  const sent = await sendSentryEvent(deps.monitoring, buildTestEvent(deps.monitoring));
  if (!sent) {
    deps.monitoring.log('monitoring-test no pudo mandar el evento de prueba a Sentry');
    return json({ error: 'sentry_unreachable' }, 502, cors);
  }
  return json({ result: 'sent' }, 200, cors);
}
