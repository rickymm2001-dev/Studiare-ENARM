// La calibración nocturna real (B14, 3.2 y 3.12 del plan de B14). La corre GitHub Actions con
// node dist-calibration/calibrate.mjs, después de npm run calibration:build. Lee su configuración del
// entorno, arma el transporte de supabase-js con la llave secreta dedicada y corre la pipeline.
//
// Sin la llave o sin la dirección escribe not_configured con un aviso amarillo de GitHub y termina en 0,
// así la noche no sale en rojo mientras Ricardo crea la llave (docs/PENDIENTES_DE_RICARDO.md). Termina
// en 0 con ok, partial, skipped y not_configured, y en 1 con failed, para que GitHub avise por correo.
// Solo escribe códigos y números (log.ts). Nunca imprime la llave, la dirección ni un mensaje de error.
import { describeError, stdoutLogger } from './log.ts';
import type { Logger } from './log.ts';
import { runPipeline } from './pipeline.ts';
import { createRestStore } from './restStore.ts';

type Env = Readonly<Record<string, string | undefined>>;

/**
 * La dirección a la que viaja la llave. Una dirección https de un proyecto de Supabase (algo.supabase.co),
 * o http solo hacia esta misma máquina para las pruebas locales. Cualquier otra cosa no se usa, así que
 * una variable VITE_SUPABASE_URL mal puesta no manda la llave a otro servidor. Con un dominio propio de
 * Supabase hay que agregarlo aquí a propósito
 */
export function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username !== '' || url.password !== '') return false;
    return (
      (url.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export async function main(env: Env, log: Logger): Promise<number> {
  const url = (env.SUPABASE_URL ?? '').trim();
  const key = (env.SUPABASE_CALIBRATION_KEY ?? '').trim();
  log.log('start', { configured: url !== '' && key !== '' });
  if (url === '' || key === '' || !isAllowedUrl(url)) {
    log.warning('not_configured');
    log.log('not_configured');
    return 0;
  }
  const runnerId = (env.CALIBRATION_RUN_ID ?? '').trim();
  const sha = (env.CALIBRATION_SHA ?? '').trim();
  try {
    const result = await runPipeline(createRestStore({ url, key }), {
      trigger: env.CALIBRATION_TRIGGER === 'schedule' ? 'schedule' : 'manual',
      forceDryRun: (env.CALIBRATION_FORCE_DRY_RUN ?? '').trim().toLowerCase() === 'true',
      runner: {
        ...(/^[0-9]{1,20}$/.test(runnerId) ? { runId: runnerId } : {}),
        ...(/^[0-9a-f]{7,64}$/.test(sha) ? { sha } : {}),
      },
      log,
    });
    log.log('done', { status: result.status, mode: result.mode ?? 'dry_run' });
    if (result.status === 'partial') log.warning(result.reason ?? 'partial');
    return result.status === 'failed' ? 1 : 0;
  } catch (error) {
    // La pipeline ya dejó su línea de error con el paso que falló. Aquí solo se cierra el proceso
    log.log('error', { ...describeError(error), reason: 'unexpected' });
    return 1;
  }
}

// Solo corre cuando es el programa principal, no cuando una prueba lo importa
if (process.argv[1]?.endsWith('calibrate.mjs') || process.argv[1]?.endsWith('calibrate.ts')) {
  process.exitCode = await main(process.env, stdoutLogger);
}
