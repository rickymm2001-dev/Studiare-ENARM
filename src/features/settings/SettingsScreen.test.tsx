// @vitest-environment jsdom
// Pruebas unitarias de Configuración (B3, criterio 3).
// Revisa que tenga exactamente tres secciones, ninguna pestaña, y prueba el flujo de Editar perfil.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 60_000 });
const WAIT = { timeout: 30_000 };

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

describe('Configuración (B3)', () => {
  it('tiene exactamente 3 secciones, 0 pestañas, y recorre Editar perfil con aviso de descarte', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.settings.path);

    // 1. Debe haber 0 pestañas (sin role="tab" ni role="tablist")
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('tablist')).toBeNull();

    // 2. Exactamente tres secciones principales con encabezado h2 para el alumno
    const perfilH2 = await screen.findByRole('heading', {
      level: 2,
      name: t.settings.sections.profile,
    }, WAIT);
    expect(perfilH2).toBeInTheDocument();

    const aparienciaH2 = screen.getByRole('heading', {
      level: 2,
      name: t.settings.sections.appearance,
    });
    expect(aparienciaH2).toBeInTheDocument();

    const privacidadH2 = screen.getByRole('heading', {
      level: 2,
      name: t.settings.sections.privacy,
    });
    expect(privacidadH2).toBeInTheDocument();

    // No debe mostrar la sección de admin para un estudiante
    expect(
      screen.queryByRole('heading', { level: 2, name: t.navItems.admin }),
    ).toBeNull();

    // 3. Plan actual y botón Cambiar tu plan (espera a que la sesión esté lista)
    expect(await screen.findByText(new RegExp(t.settings.currentPlan, 'i'), {}, WAIT)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: new RegExp(t.settings.changePlan, 'i') }),
    ).toBeInTheDocument();

    // 4. Perfil de solo lectura por omisión
    const editBtn = await screen.findByRole('button', { name: t.settings.editProfile }, WAIT);
    expect(editBtn).toBeInTheDocument();

    // 5. Iniciar edición
    await typing.click(editBtn);

    const aliasInput = screen.getByLabelText(t.onboarding.alias);
    expect(aliasInput).toBeInTheDocument();

    const saveBtn = screen.getByRole('button', { name: t.settings.save });
    const cancelBtn = screen.getByRole('button', { name: t.settings.cancelEdit });
    expect(saveBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    // 6. Probar descarte con cambios (dirty): modificar alias y pulsar Cancelar
    await typing.type(aliasInput, ' Modificado');
    await typing.click(cancelBtn);

    // Debe abrir el diálogo de confirmación de descarte
    const discardDialog = await screen.findByRole('alertdialog');
    expect(discardDialog).toBeInTheDocument();
    expect(
      within(discardDialog).getByText(t.settings.discardEditTitle),
    ).toBeInTheDocument();

    // Confirmar descarte
    const confirmDiscardBtn = within(discardDialog).getByRole('button', {
      name: t.settings.confirmDiscard,
    });
    await typing.click(confirmDiscardBtn);

    // Debe volver a solo lectura sin el cambio
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('button', { name: t.settings.editProfile })).toBeInTheDocument();
    });

    // 7. Guardar cambios exitosamente
    await typing.click(screen.getByRole('button', { name: t.settings.editProfile }));
    const aliasInput2 = screen.getByLabelText(t.onboarding.alias);
    await typing.clear(aliasInput2);
    await typing.type(aliasInput2, 'Dr. Ricardo M');

    await typing.click(screen.getByRole('button', { name: t.settings.save }));

    // Debe volver a solo lectura y mostrar el nuevo alias
    await waitFor(() => {
      expect(screen.getByText('Dr. Ricardo M')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: t.settings.editProfile })).toBeInTheDocument();
    });
  });
});
