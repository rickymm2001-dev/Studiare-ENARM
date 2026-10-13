// Capturas de "antes" del examen en curso y de sus resultados (B2 del plan del cambio, D-119). Con
// una cuenta nueva, como en la prueba del examen completo, porque con los datos de demostración
// generados el examen de antes.spec.ts no arrancó en la pregunta 1
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { answerExamQuestions, finishExam, startExam } from '../../e2e/support/b1';
import { expect, signUp, test } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('antes');

test('examen en curso y resultados antes del rediseño', async ({ page }, info) => {
  test.skip(
    info.project.name.startsWith('1920') || info.project.name === '390-oscuro',
    'Solo teléfono claro y computadora clara y oscura',
  );
  test.setTimeout(300_000);
  await signUp(page);
  await startExam(page, 20);
  await answerExamQuestions(page, 20, 2);
  await capture(page, OUT_DIR, '19-examen', info.project.name);
  await finishExam(page, { answered: 2, blank: 18, marked: 0 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.examResults.title);
  await expect(page).toHaveURL(new RegExp(SCREENS.examResults.path));
  await capture(page, OUT_DIR, '20-examen-resultados', info.project.name);
});
