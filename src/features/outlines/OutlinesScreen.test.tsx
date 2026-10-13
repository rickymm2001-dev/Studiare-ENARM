// @vitest-environment jsdom
// Pantalla de Apuntes. La lista, crear un apunte, buscar, abrir uno y las tarjetas que dice que dará.
// Desde B6 es de los planes de pago, con su vista previa en Gratis, y trae el modo clase, el mazo y
// el tema de cada apunte, la búsqueda por líneas, el esquema y las tarjetas con IA en modo simulado.
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { newId } from '@/data/ids';
import { isLive, isAiNote } from '@/data/schemas/decks';
import type { User } from '@/data/schemas/people';
import { createManualDeck, deleteManualDeck } from '@/data/usecases/manualDecks';
import { createOutline, saveOutline } from '@/data/usecases/outlines';
import { t } from '@/i18n/es-MX';

vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

// Abrir un apunte carga el editor y sus pruebas tardan más que los 5 segundos por defecto
vi.setConfig({ testTimeout: 30_000 });

// ProseMirror mide rectángulos que jsdom no calcula
beforeAll(() => {
  const rect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  });
  document.elementFromPoint = () => null;
});

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 15_000 };

interface Line {
  id: string;
  text: string;
  children: Line[];
}
const node = (text: string, ...children: Line[]): Line => ({ id: newId(), text, children });

/** Apuntes es de pago desde B6 (respuesta 20). Las pruebas de la función entran con el mensual */
async function subscribe(api: DataApi, user: User) {
  await api.repos.subscriptions.put({
    userId: user.id,
    plan: 'monthly',
    status: 'active',
    isSimulated: true,
    updatedAt: '2026-10-01T10:00:00.000Z',
  });
}

/** Abre Apuntes con un plan de pago y lo que la prueba siembre */
function openPaid(
  seed?: (api: DataApi, user: User) => Promise<void>,
  path = SCREENS.outlines.path,
) {
  return renderApp(path, {
    seed: async (api, user) => {
      await subscribe(api, user);
      await seed?.(api, user);
    },
  });
}

describe('pantalla de Apuntes', () => {
  it('en Gratis se ve con candado, una vista previa y la prueba de 7 días que lleva a Suscripción', async () => {
    app = await renderApp(SCREENS.outlines.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.outlines.title }, WAIT),
    ).toBeInTheDocument();
    const preview = await screen.findByRole('region', { name: t.outlines.locked.title }, WAIT);
    for (const point of t.outlines.locked.points) {
      expect(within(preview).getByText(point)).toBeInTheDocument();
    }
    expect(within(preview).getByRole('link', { name: t.outlines.locked.cta })).toHaveAttribute(
      'href',
      SCREENS.subscription.path,
    );
    // No se puede crear un apunte ni ver la lista
    expect(screen.queryByRole('button', { name: t.outlines.create })).toBeNull();
    expect(screen.queryByLabelText(t.outlines.newTitle)).toBeNull();
  });

  it('sin apuntes dice cómo empezar y deja crear el primero', async () => {
    const typing = userEvent.setup();
    app = await openPaid();
    expect(await screen.findByText(t.outlines.empty, {}, WAIT)).toBeInTheDocument();
    // Un título vacío se avisa y no crea nada
    await typing.click(screen.getByRole('button', { name: t.outlines.create }));
    expect(await screen.findByText(t.outlines.titleRequired)).toBeInTheDocument();
    expect(await app.api.repos.outlines.list()).toHaveLength(0);

    await typing.type(screen.getByLabelText(t.outlines.newTitle), 'Asma');
    await typing.click(screen.getByRole('button', { name: t.outlines.create }));
    // Se abre el editor del apunte nuevo, con su título y su mazo
    expect(
      await screen.findByRole('textbox', { name: t.outlines.editor.label }, WAIT),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(t.outlines.editor.titleLabel)).toHaveValue('Asma');
    const [outline] = await app.api.repos.outlines.list();
    expect(outline?.title).toBe('Asma');
    expect(outline?.subject ?? null).toBeNull();
    const deck = (await app.api.repos.decks.list()).find((entry) => entry.id === outline?.deckId);
    expect(deck?.name).toBe('Asma');
    expect(await screen.findByText(t.outlines.editor.deck('Asma'))).toBeInTheDocument();
  });

  it('el modo clase crea el apunte con su plantilla y una materia libre, sin tema del ENARM', async () => {
    const typing = userEvent.setup();
    app = await openPaid();
    await screen.findByText(t.outlines.empty, {}, WAIT);
    const form = t.outlines.form;
    await typing.click(screen.getByRole('button', { name: form.purposes.class }));
    expect(screen.getByText(form.classHint)).toBeInTheDocument();
    // La materia es obligatoria en el modo clase
    await typing.click(screen.getByRole('button', { name: form.startClass }));
    expect(await screen.findByText(t.outlines.subject.freeRequired)).toBeInTheDocument();
    expect(await app.api.repos.outlines.list()).toHaveLength(0);

    await typing.type(screen.getByLabelText(t.outlines.subject.freeName), 'Anatomía');
    await typing.click(screen.getByRole('button', { name: form.startClass }));
    expect(
      await screen.findByRole('textbox', { name: t.outlines.editor.label }, WAIT),
    ).toBeInTheDocument();
    const [outline] = await app.api.repos.outlines.list();
    // Sin título se llama como la materia y la fecha
    expect(outline?.title).toMatch(/^Anatomía, \d{1,2} de \p{L}+$/u);
    expect(outline?.subject).toEqual({ kind: 'free', name: 'Anatomía' });
    // Las líneas de la plantilla de clase, cada sección con una línea en blanco debajo
    expect(outline?.nodes.map((line) => line.text)).toEqual(
      t.outlines.templateLines.class.map((line) => line.text),
    );
    expect(outline?.nodes.every((line) => line.children.length === 1)).toBe(true);
    // El modo clase deja solo el editor, sin la columna de tarjetas
    expect(screen.getByRole('button', { name: t.outlines.editor.classMode })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('region', { name: t.outlines.preview.title })).toBeNull();
  });

  it('la lista dice cuántas líneas y tarjetas tiene cada apunte y busca en todas sus líneas', async () => {
    const typing = userEvent.setup();
    app = await openPaid(async (api, user) => {
      const asma = await createOutline(api, user, { title: 'Asma' });
      await saveOutline(api, user, {
        outlineId: asma.id,
        nodes: [
          node('Asma :: Obstrucción reversible'),
          node('Tratamiento', node('Primera línea >> Salbutamol')),
        ],
      });
      const sodio = await createOutline(api, user, { title: 'Sodio' });
      await saveOutline(api, user, {
        outlineId: sodio.id,
        nodes: [node('El {{sodio}} es el catión principal')],
      });
    });
    const asmaRow = await screen.findByRole('link', { name: t.outlines.open('Asma') }, WAIT);
    // Un :: da dos tarjetas y un >> una
    expect(asmaRow).toHaveTextContent(t.outlines.summary(3, 3));
    expect(screen.getByRole('link', { name: t.outlines.open('Sodio') })).toHaveTextContent(
      t.outlines.summary(1, 1),
    );

    // Busca dentro de las líneas, sin acentos ni mayúsculas, y dice en qué línea está
    await typing.type(screen.getByRole('searchbox', { name: t.outlines.search }), 'SALBUTAMOL');
    await waitFor(() => {
      expect(
        screen.queryByRole('link', { name: t.outlines.open('Sodio') }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: t.outlines.open('Asma') })).toBeInTheDocument();
    const hit = screen.getByRole('link', {
      name: t.outlines.openLine('Asma', 'Primera línea >> Salbutamol'),
    });
    // La línea sale con su ruta, de qué sección cuelga
    expect(hit).toHaveTextContent('Tratamiento');
    expect(screen.getByText(t.outlines.searchResults(1))).toBeInTheDocument();
    await typing.clear(screen.getByRole('searchbox', { name: t.outlines.search }));
    await typing.type(screen.getByRole('searchbox', { name: t.outlines.search }), 'cation');
    expect(
      await screen.findByRole('link', {
        name: t.outlines.openLine('Sodio', 'El {{sodio}} es el catión principal'),
      }),
    ).toBeInTheDocument();
    await typing.clear(screen.getByRole('searchbox', { name: t.outlines.search }));
    await typing.type(screen.getByRole('searchbox', { name: t.outlines.search }), 'zzzz');
    expect(await screen.findByText(t.outlines.noMatches)).toBeInTheDocument();

    // Abrir un resultado abre el apunte con el cursor en esa línea
    await typing.clear(screen.getByRole('searchbox', { name: t.outlines.search }));
    await typing.type(screen.getByRole('searchbox', { name: t.outlines.search }), 'salbutamol');
    await typing.click(
      await screen.findByRole('link', {
        name: t.outlines.openLine('Asma', 'Primera línea >> Salbutamol'),
      }),
    );
    expect(
      await screen.findByRole('textbox', { name: t.outlines.editor.label }, WAIT),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(t.outlines.editor.titleLabel)).toHaveValue('Asma');
  });

  it('un apunte abierto muestra sus tarjetas, sus enlaces, su esquema y las marcas a la vista', async () => {
    const typing = userEvent.setup();
    app = await openPaid(async (api, user) => {
      const asma = await createOutline(api, user, { title: 'Asma' });
      const epoc = await createOutline(api, user, { title: 'EPOC' });
      await saveOutline(api, user, {
        outlineId: asma.id,
        nodes: [
          node('Ver [[EPOC]] y [[Tos crónica]]'),
          node('Tratamiento', node('Salbutamol >> Broncodilatador')),
        ],
      });
      await saveOutline(api, user, {
        outlineId: epoc.id,
        nodes: [node('Parecido a [[asma]]')],
      });
    });
    await typing.click(await screen.findByRole('link', { name: t.outlines.open('Asma') }, WAIT));
    const links = await screen.findByRole('region', { name: t.outlines.links.title }, WAIT);
    // A EPOC sí lo enlaza y Tos crónica todavía no existe
    expect(within(links).getByText('Tos crónica')).toBeInTheDocument();
    expect(within(links).getByText(t.outlines.links.missing)).toBeInTheDocument();
    // EPOC aparece dos veces, porque Asma lo enlaza y él menciona a Asma aunque lo escribió en
    // minúsculas, y el título se resuelve sin importar mayúsculas
    expect(within(links).getAllByRole('link', { name: 'EPOC' })).toHaveLength(2);
    const preview = screen.getByRole('region', { name: t.outlines.preview.title });
    expect(within(preview).getByText(t.outlines.preview.count(1))).toBeInTheDocument();
    expect(within(preview).getByText('Broncodilatador')).toBeInTheDocument();
    // Las marcas rápidas están a la vista, sin abrir nada
    const cheatsheet = screen.getByRole('region', { name: t.outlines.cheatsheet.title });
    expect(within(cheatsheet).getByText('Pregunta >> Respuesta')).toBeVisible();
    // El esquema lista la sección Tratamiento y salta a ella, con el editor ya cargado
    const editor = await screen.findByRole('textbox', { name: t.outlines.editor.label }, WAIT);
    await typing.click(screen.getByText(t.outlines.structure.title));
    const sections = screen.getByRole('navigation', { name: t.outlines.structure.label });
    await typing.click(within(sections).getByRole('button', { name: 'Tratamiento' }));
    // El cursor queda en esa línea del editor
    await waitFor(() => {
      expect(editor).toHaveFocus();
    });
    expect(window.getSelection()?.anchorNode?.textContent).toBe('Tratamiento');
  });

  it('el mazo y el tema del ENARM del apunte llevan sus tarjetas a ese mazo con su tema', async () => {
    const typing = userEvent.setup();
    let outlineId = '';
    let deckId = '';
    app = await openPaid(async (api, user) => {
      const asma = await createOutline(api, user, { title: 'Asma' });
      outlineId = asma.id;
      await saveOutline(api, user, { outlineId, nodes: [node('Salbutamol >> Broncodilatador')] });
      deckId = (await createManualDeck(api, user, { name: 'Neumología' })).id;
    });
    await typing.click(await screen.findByRole('link', { name: t.outlines.open('Asma') }, WAIT));
    await typing.click(await screen.findByText(t.outlines.settings.title, {}, WAIT));
    await typing.selectOptions(screen.getByLabelText(t.outlines.editor.deckLabel), deckId);
    await typing.click(
      screen.getByRole('button', { name: t.outlines.subject.kinds.enarm, pressed: false }),
    );
    // Sin tema elegido avisa y no guarda
    await typing.click(screen.getByRole('button', { name: t.outlines.settings.save }));
    expect(await screen.findByText(t.outlines.subject.enarmRequired)).toBeInTheDocument();
    await typing.selectOptions(
      screen.getByLabelText(t.outlines.subject.branch),
      'internal_medicine',
    );
    await typing.selectOptions(screen.getByLabelText(t.outlines.subject.topic), 'pulmonology');
    await typing.click(screen.getByRole('button', { name: t.outlines.settings.save }));
    expect(await screen.findByText(t.outlines.settings.saved, {}, WAIT)).toBeInTheDocument();
    const outline = await app.api.repos.outlines.get(outlineId);
    expect(outline).toMatchObject({
      deckId,
      subject: { kind: 'enarm', branch: 'internal_medicine', topic: 'pulmonology' },
    });
    const [note] = (await app.api.repos.notes.listAllByOutline(outlineId)).filter(isLive);
    expect(note?.deckId).toBe(deckId);
    expect(note?.tags).toContain('topic:pulmonology');
  });

  it('si el mazo del apunte se borró deja elegir otro y pasa el apunte con sus tarjetas', async () => {
    const typing = userEvent.setup();
    let outlineId = '';
    let newDeckId = '';
    app = await openPaid(async (api, user) => {
      const asma = await createOutline(api, user, { title: 'Asma' });
      outlineId = asma.id;
      await saveOutline(api, user, {
        outlineId,
        nodes: [node('Salbutamol >> Broncodilatador')],
      });
      await deleteManualDeck(api, user, asma.deckId);
      newDeckId = (await createManualDeck(api, user, { name: 'Neumología' })).id;
    });
    await typing.click(await screen.findByRole('link', { name: t.outlines.open('Asma') }, WAIT));
    expect(await screen.findByText(t.outlines.editor.deckMissing)).toBeInTheDocument();
    await typing.selectOptions(screen.getByLabelText(t.outlines.editor.deckLabel), newDeckId);
    await typing.click(screen.getByRole('button', { name: t.outlines.settings.save }));
    await waitFor(async () => {
      expect((await app?.api.repos.outlines.get(outlineId))?.deckId).toBe(newDeckId);
    });
    // Las tarjetas regresan al mazo nuevo y el aviso desaparece
    await waitFor(async () => {
      const notes = (await app?.api.repos.notes.listAllByOutline(outlineId))?.filter(isLive);
      expect(notes).toHaveLength(1);
      expect(notes?.[0]?.deckId).toBe(newDeckId);
    });
    await waitFor(() => {
      expect(screen.queryByText(t.outlines.editor.deckMissing)).not.toBeInTheDocument();
    });
  });

  it('las tarjetas con IA del apunte llegan como borrador con la frase de su línea y se deciden una por una', async () => {
    const typing = userEvent.setup();
    let outlineId = '';
    app = await openPaid(async (api, user) => {
      const outline = await createOutline(api, user, {
        title: 'Diabetes',
        subject: { kind: 'enarm', branch: 'internal_medicine', topic: 'endocrinology' },
      });
      outlineId = outline.id;
      await saveOutline(api, user, {
        outlineId,
        nodes: [
          node(
            'Tratamiento',
            node('La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2'),
            node('La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos'),
          ),
        ],
      });
    });
    await typing.click(
      await screen.findByRole('link', { name: t.outlines.open('Diabetes') }, WAIT),
    );
    const panel = await screen.findByRole('region', { name: t.outlines.ai.title }, WAIT);
    const generate = within(panel).getByRole('button', { name: t.outlines.ai.generate });
    await waitFor(() => {
      expect(generate).toBeEnabled();
    }, WAIT);
    await typing.click(generate);
    const first = await within(panel).findByRole(
      'listitem',
      { name: t.outlines.ai.proposal(1) },
      WAIT,
    );
    const second = within(panel).getByRole('listitem', { name: t.outlines.ai.proposal(2) });
    // Cada propuesta es borrador sin validar y trae la frase literal de una línea del apunte
    expect(within(first).getByText(t.aiCards.draftLabel)).toBeInTheDocument();
    expect(within(first).getByText(t.outlines.ai.quote)).toBeInTheDocument();
    expect(
      within(first).getByText(
        'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2',
      ),
    ).toBeInTheDocument();

    // Se acepta la primera y se descarta la segunda
    await typing.click(within(first).getByRole('button', { name: t.outlines.ai.accept }));
    expect(await within(panel).findByText(t.outlines.ai.accepted(1), {}, WAIT)).toBeInTheDocument();
    const remaining = within(panel).getByRole('listitem', { name: t.outlines.ai.proposal(1) });
    expect(remaining).toHaveTextContent('500 mg');
    fireEvent.click(within(remaining).getByRole('button', { name: t.outlines.ai.discard }));
    expect(await within(panel).findByText(t.outlines.ai.done)).toBeInTheDocument();
    expect(second).not.toBeInTheDocument();

    // Solo se guardó la aceptada, en el mazo del apunte, en borrador, con su cita y su tema
    const outline = await app.api.repos.outlines.get(outlineId);
    const saved = (await app.api.repos.notes.list()).filter((note) => isAiNote(note));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      deckId: outline?.deckId,
      origin: 'generated',
      editorialStatus: 'draft',
      sourceTitle: 'Diabetes',
      sourceQuote:
        'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2',
    });
    expect(saved[0]?.tags).toContain('topic:endocrinology');
    // La nota no queda unida a una línea, así la sincronización del apunte no la retira
    expect(saved[0]?.outlineId ?? null).toBeNull();
    // La generación queda aprobada, con una guardada y una descartada
    await waitFor(async () => {
      const artifacts = (await app?.api.repos.aiArtifacts.list()) ?? [];
      expect(artifacts[0]).toMatchObject({ status: 'approved' });
      expect(artifacts[0]?.content).toMatchObject({ saved: 1, discarded: 1 });
    });
  });

  it('si otra ventana guardó antes, avisa en lugar de pisar el apunte', async () => {
    const typing = userEvent.setup();
    let outlineId = '';
    app = await openPaid(async (api, user) => {
      const asma = await createOutline(api, user, { title: 'Asma' });
      outlineId = asma.id;
      await saveOutline(api, user, { outlineId, nodes: [node('Salbutamol >> Broncodilatador')] });
    });
    await typing.click(await screen.findByRole('link', { name: t.outlines.open('Asma') }, WAIT));
    const titleField = await screen.findByLabelText(t.outlines.editor.titleLabel);
    // Otra ventana agrega una línea con tarjeta mientras esta sigue con la copia vieja
    const user = (await app.api.repos.outlines.get(outlineId))?.ownerId ?? '';
    await saveOutline(
      app.api,
      { id: user },
      { outlineId, nodes: [node('Salbutamol >> Broncodilatador'), node('Otra >> Cosa')] },
      new Date(Date.now() + 60_000),
    );
    await typing.type(titleField, ' crónica');
    expect(await screen.findByText(t.outlines.editor.conflict, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.outlines.editor.reload })).toBeInTheDocument();
    // Lo que guardó la otra ventana sigue intacto
    const stored = await app.api.repos.outlines.get(outlineId);
    expect(stored?.title).toBe('Asma');
    expect(stored?.nodes).toHaveLength(2);
  });

  it('un apunte que no existe lo dice y regresa a la lista', async () => {
    app = await openPaid(undefined, `${SCREENS.outlines.path}?apunte=${newId()}`);
    expect(await screen.findByText(t.outlines.notFound, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.outlines.backToList })).toHaveAttribute(
      'href',
      SCREENS.outlines.path,
    );
  });
});
