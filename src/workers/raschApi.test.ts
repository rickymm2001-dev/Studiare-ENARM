import { expose, wrap } from 'comlink';
import { describe, expect, it } from 'vitest';
import { createRng } from '@/engines/random';
import { estimateRasch, type RaschResponse } from '@/engines/rasch';
import { raschApi } from './raschApi';

describe('worker de Rasch', () => {
  it('expone la estimación por Comlink y da lo mismo que el motor', async () => {
    const rng = createRng('rasch-worker');
    const responses: RaschResponse[] = [];
    for (let p = 0; p < 40; p += 1) {
      for (let i = 0; i < 8; i += 1)
        responses.push({ person: `p${p}`, item: `i${i}`, correct: rng.chance(0.6) });
    }
    // Un canal de mensajes en el mismo hilo prueba el mismo protocolo que usa el worker
    const { port1, port2 } = new MessageChannel();
    expose(raschApi, port1);
    const remote = wrap<typeof raschApi>(port2);
    expect(await remote.estimate(responses)).toEqual(estimateRasch(responses));
    port1.close();
    port2.close();
  });
});
