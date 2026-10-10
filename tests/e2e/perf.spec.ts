// Rendimiento (14.4, Fase F). Una sesión de 200 tarjetas no se traba en un teléfono de gama media.
// Se simula con el procesador 4 veces más lento y se mide, dentro de la página, cuánto tarda cada
// tarjeta desde que se aprieta la tecla hasta que la siguiente está pintada. Mostrar la respuesta y
// calificar son dos pasos por tarjeta y se miden juntos.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, signUp, test } from './support/fixtures';

const CARDS = 200;
/** Cuántas veces más lento que la máquina de la prueba. Equivale a un teléfono de gama media */
const CPU_SLOWDOWN = 4;
/** Lo que una tarjeta puede tardar, ya con el procesador lento. Pasar de aquí se siente como trabón */
const MEDIAN_MS = 150;
const P95_MS = 350;
const WORST_MS = 800;

interface CardTimings {
  count: number;
  durations: number[];
  longTasks: number[];
}

/** Corre en la página. Aprieta Espacio y 4 (Fácil) y espera a que cambien los contadores */
async function reviewCards(total: number): Promise<CardTimings> {
  const longTasks: number[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) longTasks.push(entry.duration);
  });
  observer.observe({ type: 'longtask', buffered: false });

  const press = (key: string, code: string) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }),
    );
  };
  const remaining = () => {
    const list = document.querySelector('ul[aria-label]');
    return [...(list?.querySelectorAll('strong') ?? [])]
      .map((node) => Number(node.textContent.replace(/\D/g, '')))
      .reduce((sum, n) => sum + n, 0);
  };
  const nextFrame = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  const until = async (condition: () => boolean, limitMs = 5000) => {
    const start = performance.now();
    while (!condition()) {
      if (performance.now() - start > limitMs) throw new Error('La pantalla no respondió a tiempo');
      await nextFrame();
    }
  };

  const durations: number[] = [];
  for (let i = 0; i < total; i += 1) {
    const before = remaining();
    const start = performance.now();
    press(' ', 'Space');
    // La respuesta está a la vista cuando aparecen los botones de calificar
    await until(() => document.body.innerText.includes('¿Qué tan bien la recordaste?'));
    press('4', 'Digit4');
    await until(() => remaining() < before || !document.body.innerText.includes('¿Qué tan bien'));
    await nextFrame();
    durations.push(performance.now() - start);
  }
  observer.disconnect();
  return { count: durations.length, durations, longTasks };
}

const percentile = (values: number[], p: number) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

test('una sesión de 200 tarjetas con el procesador 4 veces más lento sigue fluida', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  await signUp(page);

  // Un mazo grande y 250 tarjetas nuevas al día, para tener 200 en una sola sesión
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Medicina interna (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 120_000,
  });
  await page.goto(`${SCREENS.settings.path}?seccion=study`);
  await page.getByLabel(t.settings.newCardsPerDay).fill('250');
  await page.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(page.getByText(t.settings.saved)).toBeVisible();

  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  const timings = await page.evaluate(reviewCards, CARDS);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const median = percentile(timings.durations, 0.5);
  const p95 = percentile(timings.durations, 0.95);
  const worst = Math.max(...timings.durations);
  await testInfo.attach('tiempos-por-tarjeta.json', {
    body: JSON.stringify(
      { cards: timings.count, median, p95, worst, longTasks: timings.longTasks.length },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  console.log(
    `perf ${testInfo.project.name}: ${String(timings.count)} tarjetas, mediana ${median.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, peor ${worst.toFixed(0)} ms, tareas largas ${String(timings.longTasks.length)}`,
  );

  expect(timings.count).toBe(CARDS);
  expect(median).toBeLessThan(MEDIAN_MS);
  expect(p95).toBeLessThan(P95_MS);
  expect(worst).toBeLessThan(WORST_MS);
});
