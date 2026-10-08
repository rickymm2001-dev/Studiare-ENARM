// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { createOutline } from '@/data/usecases/outlines';
import { t } from '@/i18n/es-MX';

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 10_000 };

/** Abre Apuntes, crea uno con título y espera a que se abra el editor */
async function openNewPage(title: string) {
  app = await renderApp(SCREENS.notes.path);
  const typing = userEvent.setup();
  await typing.type(await screen.findByLabelText(t.notes.titleLabel, undefined, WAIT), title);
  await typing.click(screen.getByRole('button', { name: t.notes.create }));
  const first = await screen.findByLabelText(t.notes.lineLabel(1, 1), undefined, WAIT);
  return { typing, first };
}

describe('pantalla de Apuntes', () => {
  it('sin apuntes lo dice, invita a crear el primero y es la cuarta pestaña', async () => {
    app = await renderApp(SCREENS.notes.path);
    expect(await screen.findByText(t.notes.empty, undefined, WAIT)).toBeVisible();
    const tabs = screen.getByRole('navigation', { name: t.studyTabs.label });
    expect(within(tabs).getByRole('link', { name: t.studyTabs.notes })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('pide un título y no acepta uno repetido', async () => {
    app = await renderApp(SCREENS.notes.path);
    const typing = userEvent.setup();
    await typing.click(await screen.findByRole('button', { name: t.notes.create }, WAIT));
    expect(await screen.findByText(t.notes.titleEmpty)).toBeVisible();

    await createOutline(app.api, app.user, { title: 'Cardiología' });
    await typing.type(screen.getByLabelText(t.notes.titleLabel), 'cardiologia');
    await typing.click(screen.getByRole('button', { name: t.notes.create }));
    expect(await screen.findByText(t.notes.titleTaken, undefined, WAIT)).toBeVisible();
  });

  it('crear un apunte abre el editor con una línea y se vuelve parte de la lista', async () => {
    await openNewPage('Cardiología');
    expect(screen.getByRole('heading', { name: 'Cardiología' })).toBeVisible();
    expect(screen.getByRole('group', { name: t.notes.editorLabel })).toBeVisible();
    expect(screen.getByRole('toolbar', { name: t.notes.toolbar.label })).toBeVisible();
  });

  it('una marca vuelve la línea tarjeta, la guarda sola y la deja en el mazo del apunte', async () => {
    const { typing, first } = await openNewPage('Cardiología');
    await typing.click(first);
    await typing.type(first, 'Triada de Beck :: Hipotensión{Enter}');
    expect(await screen.findByText(t.notes.badges.basic)).toBeVisible();
    expect(first).toHaveValue('Triada de Beck :: Hipotensión');
    // Esperó el guardado automático y la tarjeta quedó en la base
    await waitFor(async () => {
      expect(await app?.api.repos.notes.list()).toHaveLength(1);
    }, WAIT);
    expect(await screen.findByText(t.notes.save.saved, undefined, WAIT)).toBeVisible();
  });

  it('tres líneas escritas seguidas llegan completas a la base, sin perder la última', async () => {
    const { typing, first } = await openNewPage('Cardiología');
    await typing.click(first);
    await typing.type(
      first,
      'Triada :: Hipotensión{Enter}Metformina ;; Biguanida{Enter}La {{{{troponina}} sube a las {{{{3 horas}}',
    );
    await waitFor(async () => {
      expect(await app?.api.repos.notes.list()).toHaveLength(3);
    }, WAIT);
    // 1 de la básica, 2 de la inversa y 2 huecos
    expect(await app?.api.repos.cards.list()).toHaveLength(5);
    expect(await screen.findByText(t.notes.save.saved, undefined, WAIT)).toBeVisible();
  });

  it('Enter parte la línea en el cursor y Tab y Mayús Tab cambian el nivel', async () => {
    const { typing, first } = await openNewPage('Cardiología');
    await typing.click(first);
    await typing.type(first, 'Infarto agudo');
    await typing.keyboard('{Enter}');
    const second = await screen.findByLabelText(t.notes.lineLabel(2, 1));
    expect(second).toHaveFocus();
    await typing.type(second, 'Troponina');
    await typing.keyboard('{Tab}');
    expect(screen.getByLabelText(t.notes.lineLabel(2, 2))).toHaveFocus();
    await typing.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByLabelText(t.notes.lineLabel(2, 1))).toBeVisible();
  });

  it('los botones de la barra ponen las marcas y cambian la sangría de la línea activa', async () => {
    const { typing, first } = await openNewPage('Cardiología');
    await typing.click(first);
    await typing.type(first, 'Metformina');
    await typing.click(screen.getByRole('button', { name: t.notes.toolbar.card }));
    await typing.type(first, 'Biguanida');
    expect(first).toHaveValue('Metformina :: Biguanida');
    expect(await screen.findByText(t.notes.badges.basic)).toBeVisible();

    await typing.click(screen.getByRole('button', { name: t.notes.toolbar.add }));
    const second = await screen.findByLabelText(t.notes.lineLabel(2, 1));
    await typing.click(screen.getByRole('button', { name: t.notes.toolbar.indent }));
    expect(await screen.findByLabelText(t.notes.lineLabel(2, 2))).toBe(second);
  });

  it('una pregunta sin respuesta avisa qué falta y una cloze cuenta sus huecos', async () => {
    const { typing, first } = await openNewPage('Cardiología');
    await typing.click(first);
    await typing.type(first, 'Pregunta ::');
    expect(await screen.findByText(t.notes.problems.empty_back)).toBeVisible();
    expect(first).toHaveAttribute('aria-invalid', 'true');
    await typing.clear(first);
    await typing.type(first, 'La {{{{a}} y la {{{{b}}');
    expect(await screen.findByText(t.notes.badges.cloze(2))).toBeVisible();
  });

  it('plegar una línea oculta lo que cuelga de ella', async () => {
    const { typing, first } = await openNewPage('Cardiología');
    await typing.click(first);
    await typing.type(first, 'Padre{Enter}');
    await typing.keyboard('{Tab}');
    await typing.type(screen.getByLabelText(t.notes.lineLabel(2, 2)), 'Hija');
    const fold = await screen.findByRole('button', { name: t.notes.collapse('Padre') });
    await typing.click(fold);
    expect(screen.queryByLabelText(t.notes.lineLabel(2, 2))).toBeNull();
    await typing.click(screen.getByRole('button', { name: t.notes.expand('Padre') }));
    expect(screen.getByLabelText(t.notes.lineLabel(2, 2))).toBeVisible();
  });

  it('un enlace a un apunte que existe lo abre y uno que falta lo crea', async () => {
    app = await renderApp(SCREENS.notes.path, {
      seed: async (api, user) => {
        await createOutline(api, user, { title: 'Diabetes' });
      },
    });
    const typing = userEvent.setup();
    await typing.type(
      await screen.findByLabelText(t.notes.titleLabel, undefined, WAIT),
      'Insulina',
    );
    await typing.click(screen.getByRole('button', { name: t.notes.create }));
    const first = await screen.findByLabelText(t.notes.lineLabel(1, 1), undefined, WAIT);
    await typing.click(first);
    await typing.type(first, 'Ver [[[[Diabetes]] y [[[[Glucagón]]');
    const existing = await screen.findByRole('link', { name: t.notes.links.open('Diabetes') });
    expect(existing).toHaveAttribute('href', expect.stringContaining('apunte='));
    await typing.click(screen.getByRole('button', { name: t.notes.links.missing('Glucagón') }));
    expect(await screen.findByRole('link', { name: t.notes.links.open('Glucagón') })).toBeVisible();
    // Los apuntes que enlazan aquí aparecen en el otro apunte
    await typing.click(existing);
    expect(await screen.findByRole('heading', { name: 'Diabetes' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Insulina' }, WAIT)).toBeVisible();
  });

  it('cambiar el título y borrar el apunte con confirmación', async () => {
    const { typing } = await openNewPage('Cardiología');
    const title = screen.getByLabelText(t.notes.renameLabel);
    await typing.clear(title);
    await typing.type(title, 'Cardio');
    await typing.click(screen.getByRole('button', { name: t.notes.rename }));
    expect(await screen.findByText(t.notes.renamed)).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Cardio' })).toBeVisible();

    await typing.click(screen.getByRole('button', { name: t.notes.remove.button }));
    expect(screen.getByText(t.notes.remove.confirm('Cardio'))).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.notes.remove.yes }));
    expect(await screen.findByText(t.notes.empty, undefined, WAIT)).toBeVisible();
  });
});
