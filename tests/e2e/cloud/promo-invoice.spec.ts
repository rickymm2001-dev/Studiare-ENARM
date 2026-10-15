// Código de descuento y factura a pedido (B10, respuestas 12 y 21). El código se escribe en la página
// de pago simulada, el cobro queda con su descuento y Admin, Pagos lo cuenta. El alumno pide factura en
// Perfil con la validación junto a cada campo, la ve pendiente, el admin la marca emitida y el alumno
// la ve emitida. La pasarela es simulada y nunca se cobra nada
import { SCREENS } from '@/app/screens';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { invoicesText } from '@/i18n/invoices';
import {
  enterWithLink,
  expect,
  longDateIn,
  openSecondDevice,
  test,
} from '../support/cloudFixtures';
import { gatewayText } from '../support/fakeGateway';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana.factura@ejemplo.mx';
const ADMIN = 'admin.pagos@ejemplo.mx';
const student = invoicesText.student;
const admin = invoicesText.admin;

test.describe('Código de descuento y factura', () => {
  test('paga con PRUEBA10, pide factura y el admin la marca emitida', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    const zone = test.info().project.use.timezoneId ?? 'America/Merida';
    // Sin prueba gratis, para que el código baje el primer cobro hoy
    cloud.setBillingRules({ trialDays: 0 });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.subscription.path);
    await page
      .getByRole('region', { name: t.billing.plans.monthly, exact: true })
      .getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) })
      .click();
    await expect(page.getByText(billingCloudText.summary.code)).toBeVisible();
    await page.getByRole('button', { name: billingCloudText.go }).click();

    // Un código que no existe se rechaza en la misma página, sin cobrar
    await page.getByLabel(gatewayText.code).fill('NOEXISTE');
    await page.getByRole('button', { name: gatewayText.pay }).click();
    await expect(page.getByRole('alert')).toHaveText(gatewayText.invalidCode);
    expect(cloud.paymentsOf(ANA)).toEqual([]);
    await page.getByLabel(gatewayText.code).fill('prueba10');
    await page.getByRole('button', { name: gatewayText.pay }).click();
    await expect(page.getByText(billingCloudText.returning.confirmed)).toBeVisible({
      timeout: 20_000,
    });
    expect(cloud.paymentsOf(ANA)).toMatchObject([
      { amountMxn: 71.1, discountMxn: 7.9, promotionCode: 'PRUEBA10', status: 'paid' },
    ]);
    const paidAt = cloud.paymentsOf(ANA)[0]?.paidAt ?? '';

    // Pide factura en Perfil. El RFC con mal formato se marca junto al campo y no se manda
    await page.goto(`${SCREENS.settings.path}#perfil`);
    const card = page.getByRole('region', { name: student.title });
    await card.getByRole('button', { name: student.request }).click();
    await expect(card.getByLabel(student.form.email)).toHaveValue(ANA);
    await card.getByLabel(student.form.rfc).fill('XAXX0101');
    await card.getByLabel(student.form.legalName).fill('Ana López');
    await card.getByLabel(student.form.taxRegime).selectOption('612');
    await card.getByLabel(student.form.postalCode).fill('97000');
    await card.getByRole('button', { name: student.form.save }).click();
    await expect(card.getByText(student.errors.rfc)).toBeVisible();
    expect(cloud.invoiceRequestsOf(ANA)).toEqual([]);
    await expectNoSeriousA11yViolations(page);
    await card.getByLabel(student.form.rfc).fill('XAXX010101000');
    await card.getByRole('button', { name: student.form.save }).click();
    await expect(card.getByText(student.sent(ANA))).toBeVisible();
    expect(cloud.invoiceRequestsOf(ANA)).toMatchObject([
      {
        rfc: 'XAXX010101000',
        legalName: 'ANA LÓPEZ',
        taxRegime: '612',
        postalCode: '97000',
        cfdiUse: 'G03',
        status: 'pending',
      },
    ]);
    // Al equipo le queda un correo sin RFC ni datos fiscales (B15 lo manda)
    expect(cloud.outbox()).toMatchObject([{ kind: 'invoice_requested', recipientRole: 'team' }]);
    expect(JSON.stringify(cloud.outbox())).not.toContain('XAXX010101000');
    const line = `${student.paymentLine(longDateIn(paidAt, zone), t.billing.price(71.1))} ${student.pending}`;
    await expect(card.getByRole('list', { name: student.listLabel })).toContainText(line);
    await expectNoSeriousA11yViolations(page);

    // El admin ve el código con su pago y la solicitud, y la marca emitida
    cloud.createUser({ email: ADMIN, alias: 'Admin', role: 'admin' });
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterWithLink(second.page, cloud, ADMIN);
    await second.page.goto(SCREENS.adminBilling.path);
    const codes = second.page.getByRole('region', { name: admin.codes.title });
    await expect(codes.getByRole('rowheader', { name: 'PRUEBA10' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(codes.getByText(t.billing.price(71.1))).toBeVisible();
    const requests = second.page.getByRole('region', { name: admin.invoices.title });
    await expect(requests.getByText('ANA LÓPEZ')).toBeVisible();
    await expectNoSeriousA11yViolations(second.page);
    await requests.getByRole('button', { name: admin.invoices.markIssued }).click();
    await expect(requests.getByText(admin.invoices.markedIssued('Ana'))).toBeVisible();
    expect(cloud.invoiceRequestsOf(ANA)).toMatchObject([{ status: 'issued' }]);
    await second.context.close();

    // Ana la ve emitida
    await page.reload();
    const issuedAt = cloud.invoiceRequestsOf(ANA)[0]?.issuedAt ?? '';
    await expect(
      page
        .getByRole('region', { name: student.title })
        .getByRole('list', { name: student.listLabel }),
    ).toContainText(student.issued(longDateIn(issuedAt, zone)), { timeout: 20_000 });
  });
});
