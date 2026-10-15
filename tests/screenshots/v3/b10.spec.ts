// Capturas de cierre de B10 del plan del cambio (pagos completos, 5.6 del diseño). Los planes con la
// prueba gratis, la forma de pago con su aviso, con tarjeta y con OXXO, la prueba activa en Suscripción
// y en Perfil, el pase pendiente y el pase activo, el formulario de factura, Facturas en Perfil con su
// solicitud y Admin, Pagos. Corren contra el build con la nube y el Supabase simulado de las e2e de nube
// (tests/e2e/cloud/README.md), con las banderas freeTrial, cashPasses y mercadoPago prendidas en el
// servidor simulado. Quedan en docs/screenshots/v3/b10. El recorrido completo va en teléfono claro y en
// computadora clara y oscura, y lo clave además en 1920 y en el teléfono oscuro, como en b8.spec.ts
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import {
  enterWithLink,
  expect,
  openSecondDevice,
  reloadWithServerFlags,
  test as cloudTest,
} from '../../e2e/support/cloudFixtures';
import { gatewayText } from '../../e2e/support/fakeGateway';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { capture, outDirFor } from './capture';

const B10_DIR = outDirFor('b10');

const FULL_WALK = (project: string) => !project.startsWith('1920') && project !== '390-oscuro';

const text = billingCloudText;
const invoices = invoicesText;

/**
 * Abre una ruta del build con la nube y espera su título y lo que se pide antes de capturar. Va con la
 * dirección completa, porque los navegadores de Carla y del admin toman la baseURL del proyecto, que es
 * la del build sin la nube
 */
async function open(page: Page, path: string, ...ready: Locator[]) {
  await page.goto(`${CLOUD_PREVIEW_URL}${path}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  for (const locator of ready) await expect(locator).toBeVisible({ timeout: 60_000 });
}

/**
 * Captura la página completa desde arriba. Después de un clic la página queda desplazada y la barra de
 * arriba, que es fija, saldría a media imagen
 */
async function shot(page: Page, name: string, project: string) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await capture(page, B10_DIR, name, project);
}

/** Captura solo una tarjeta, como el formulario de factura */
async function card(region: Locator, name: string, project: string) {
  await region.scrollIntoViewIfNeeded();
  await region.screenshot({
    path: `${B10_DIR}/${name}--${project}.jpg`,
    type: 'jpeg',
    quality: 60,
  });
}

cloudTest.describe('Pagos completos', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B10. Prueba gratis, forma de pago, pases, facturas y Admin, Pagos',
    async ({ page, browser, cloud, consoleErrors }, info) => {
      cloudTest.setTimeout(600_000);
      const project = info.project.name;
      const full = FULL_WALK(project);
      cloud.setFeatureFlags({ freeTrial: true, cashPasses: true, mercadoPago: true });

      // Ana ve los planes con la prueba gratis y el anual Fundador
      await enterWithLink(page, cloud, 'ana.b10@ejemplo.mx', 'Ana');
      await reloadWithServerFlags(page);
      const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
      await open(
        page,
        SCREENS.subscription.path,
        monthly.getByRole('button', { name: t.billing.freeTrialCta }),
      );
      await shot(page, '01-planes-con-prueba', project);

      // La forma de pago con el aviso de la prueba, y con OXXO
      await monthly.getByRole('button', { name: t.billing.freeTrialCta }).click();
      await expect(
        page.getByRole('heading', { name: text.checkoutTitle(t.billing.plans.monthly) }),
      ).toBeVisible();
      await shot(page, '02-forma-de-pago-con-prueba', project);
      if (full) {
        await page.getByRole('radio', { name: new RegExp(text.options.oxxo.label) }).click();
        await expect(page.getByText(text.summary.oxxoRefund, { exact: false })).toBeVisible();
        await shot(page, '03-forma-de-pago-oxxo', project);
        await page.getByRole('radio', { name: new RegExp(text.options.card.label) }).click();
      }

      // Empieza la prueba en la pasarela simulada y la ve en Suscripción y en Perfil
      await page.getByRole('button', { name: text.actions.trial }).click();
      await page.getByRole('button', { name: gatewayText.startTrial }).click();
      await expect(page.getByText(text.returning.trialStarted)).toBeVisible({ timeout: 30_000 });
      await shot(page, '04-prueba-activa', project);
      if (full) {
        await open(
          page,
          `${SCREENS.settings.path}#perfil`,
          page.getByRole('region', { name: invoices.student.title }),
        );
        await shot(page, '05-perfil-con-prueba', project);
      }

      // Carla paga un pase de un mes con OXXO en su propio navegador. Primero pendiente y luego activo
      const carla = await openSecondDevice(browser, cloud, consoleErrors);
      const carlaPage = carla.page;
      await enterWithLink(carlaPage, cloud, 'carla.b10@ejemplo.mx', 'Carla');
      await reloadWithServerFlags(carlaPage);
      const carlaMonthly = carlaPage.getByRole('region', {
        name: t.billing.plans.monthly,
        exact: true,
      });
      await open(
        carlaPage,
        SCREENS.subscription.path,
        carlaMonthly.getByRole('button', { name: t.billing.freeTrialCta }),
      );
      await carlaMonthly.getByRole('button', { name: t.billing.freeTrialCta }).click();
      await carlaPage.getByRole('radio', { name: new RegExp(text.options.oxxo.label) }).click();
      await carlaPage.getByRole('button', { name: text.actions.oxxo }).click();
      await carlaPage.getByRole('button', { name: gatewayText.voucher }).click();
      await expect(carlaPage).toHaveURL(/pago=pendiente&metodo=oxxo/);
      const pending = cloud.paymentsOf('carla.b10@ejemplo.mx')[0];
      await expect(
        carlaPage.getByText(
          text.pending.oxxoUntil(
            t.billing.price(149),
            new Date(pending?.expiresAt ?? 0).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: info.project.use.timezoneId ?? 'America/Merida',
            }),
          ),
        ),
      ).toBeVisible({ timeout: 30_000 });
      await shot(carlaPage, '06-pase-pendiente', project);
      cloud.settleVoucher('carla.b10@ejemplo.mx', 'paid');
      await open(
        carlaPage,
        SCREENS.subscription.path,
        carlaPage.getByRole('region', { name: t.billing.current(t.billing.plans.monthly) }),
      );
      await shot(carlaPage, '07-pase-activo', project);

      // Carla pide la factura de su pase en Perfil
      await open(
        carlaPage,
        `${SCREENS.settings.path}#perfil`,
        carlaPage
          .getByRole('region', { name: invoices.student.title })
          .getByRole('button', { name: invoices.student.request }),
      );
      const invoiceCard = carlaPage.getByRole('region', { name: invoices.student.title });
      await invoiceCard.getByRole('button', { name: invoices.student.request }).click();
      await invoiceCard.getByLabel(invoices.student.form.rfc).fill('XAXX010101000');
      await invoiceCard.getByLabel(invoices.student.form.legalName).fill('Carla Gómez');
      await invoiceCard.getByLabel(invoices.student.form.taxRegime).selectOption('612');
      await invoiceCard.getByLabel(invoices.student.form.postalCode).fill('97000');
      if (full) await card(invoiceCard, '08-formulario-de-factura', project);
      await invoiceCard.getByRole('button', { name: invoices.student.form.save }).click();
      await expect(
        invoiceCard.getByText(invoices.student.sent('carla.b10@ejemplo.mx')),
      ).toBeVisible();
      await shot(carlaPage, '09-perfil-con-facturas', project);
      await carla.context.close();

      // El admin, en otro navegador, ve el resumen, la solicitud, los códigos y los pagos
      cloud.createUser({ email: 'admin.b10@ejemplo.mx', alias: 'Admin', role: 'admin' });
      const admin = await openSecondDevice(browser, cloud, consoleErrors);
      await enterWithLink(admin.page, cloud, 'admin.b10@ejemplo.mx');
      await reloadWithServerFlags(admin.page);
      await open(
        admin.page,
        SCREENS.adminBilling.path,
        admin.page
          .getByRole('region', { name: invoices.admin.invoices.title })
          .getByText('CARLA GÓMEZ'),
        admin.page.getByRole('region', { name: invoices.admin.payments.title }).getByText('Carla', {
          exact: false,
        }),
      );
      await shot(admin.page, '10-admin-pagos', project);
      await admin.context.close();
    },
  );
});
