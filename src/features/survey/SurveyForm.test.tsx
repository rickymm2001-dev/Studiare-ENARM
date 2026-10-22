// @vitest-environment jsdom
// El formulario de la encuesta (B18). Siete preguntas cerradas obligatorias y un comentario opcional. Un faltante se
// nombra arriba y lleva el foco a la primera, un correo o un teléfono en el comentario se avisa y no se envía, el
// borrador sobrevive a una recarga, Enter no envía y sin red el botón se puede volver a pulsar.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '@/data/analytics/catalog';
import { surveyTexts } from '@/i18n/survey';
import { SurveyForm } from './SurveyForm';
import { SURVEY_DRAFT_STORAGE_KEY, readDraft } from './surveyState';
import { fetchSurveyStatus } from './surveyStatus';
import {
  createFakeSurveyState,
  fakeSurveyCloud,
  type FakeSurveyState,
} from './testing/fakeSurveyCloud';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

// Cada prueba contesta siete preguntas con el ratón y el teclado, y con la máquina cargada pasa de los 5 s de Vitest
vi.setConfig({ testTimeout: 20_000 });

const text = surveyTexts;
let server: FakeSurveyState;
let events: AnalyticsRecord[];
const onDone = vi.fn();

const submitCalls = () => server.calls.filter((call) => call[1] === 'submit_survey');
const question = (label: RegExp) => screen.getByRole('group', { name: label });
const sendButton = () => screen.getByRole('button', { name: text.actions.send });
/** Un valor de una escala. Su nombre accesible es 1, Nada claro / 2 / 3 / 4 / 5, Muy claro */
const scaleValue = (label: RegExp, value: number) =>
  within(question(label)).getByRole('radio', { name: new RegExp(`^${String(value)}(,|$)`) });

/** Contesta las siete preguntas con lo mínimo que la base acepta */
async function answerAll(typing: ReturnType<typeof userEvent.setup>) {
  await typing.click(within(question(/cuántos días/i)).getByLabelText('3 o 4'));
  await typing.click(within(question(/qué usaste/i)).getByLabelText('Repasar'));
  await typing.click(scaleValue(/qué tan claro/i, 4));
  await typing.click(scaleValue(/qué tan fácil/i, 5));
  await typing.click(scaleValue(/qué tan útil/i, 3));
  await typing.click(within(question(/te frenó/i)).getByLabelText('Fue lento'));
  await typing.click(within(question(/recomendarías/i)).getByLabelText('Sí'));
}

beforeEach(() => {
  localStorage.clear();
  onDone.mockReset();
  server = createFakeSurveyState();
  holder.cloud = fakeSurveyCloud(server);
  events = [];
  resetAnalytics();
  setAnalyticsConsent(true);
  setAnalyticsSink((record) => events.push(record));
});

afterEach(() => {
  cleanup();
  resetAnalytics();
  holder.cloud = null;
});

describe('las preguntas', () => {
  it('son siete grupos con su pregunta numerada, más el comentario como la octava', () => {
    render(<SurveyForm userId="ana" onDone={onDone} />);
    expect(
      screen.getAllByRole('group').filter((group) => group.tagName === 'FIELDSET'),
    ).toHaveLength(7);
    expect(question(/cuántos días/i)).toHaveTextContent('Pregunta 1 de 8');
    expect(question(/recomendarías/i)).toHaveTextContent('Pregunta 7 de 8');
    expect(screen.getByLabelText(new RegExp(text.comment.label))).toHaveTextContent('');
    expect(screen.getByText('Pregunta 8 de 8')).toBeVisible();
    expect(screen.getByText(text.questions.clarity.low)).toBeVisible();
    expect(screen.getAllByText(text.questions.clarity.high).length).toBeGreaterThan(0);
  });

  it('cada escala son cinco radios y los extremos dicen su texto al lector de pantalla', () => {
    render(<SurveyForm userId="ana" onDone={onDone} />);
    const clarity = within(question(/qué tan claro/i));
    expect(clarity.getAllByRole('radio')).toHaveLength(5);
    expect(clarity.getByRole('radio', { name: '1, Nada claro' })).toBeInTheDocument();
    expect(clarity.getByRole('radio', { name: '5, Muy claro' })).toBeInTheDocument();
  });

  it('Nada todavía y Nada me frenó excluyen a las demás, y los motivos topan en tres', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    const used = within(question(/qué usaste/i));
    await typing.click(used.getByLabelText('Repasar'));
    await typing.click(used.getByLabelText('Apuntes'));
    await typing.click(used.getByLabelText('Nada todavía'));
    expect(used.getByLabelText('Nada todavía')).toBeChecked();
    expect(used.getByLabelText('Repasar')).not.toBeChecked();
    await typing.click(used.getByLabelText('Party'));
    expect(used.getByLabelText('Nada todavía')).not.toBeChecked();

    const blockers = within(question(/te frenó/i));
    await typing.click(blockers.getByLabelText('Fue lento'));
    await typing.click(blockers.getByLabelText('Algo falló'));
    await typing.click(blockers.getByLabelText('No entendí cómo empezar'));
    expect(blockers.getByLabelText('Me confundió el diseño')).toBeDisabled();
    expect(blockers.getByLabelText('Nada me frenó')).toBeEnabled();
    await typing.click(blockers.getByLabelText('Nada me frenó'));
    expect(blockers.getByLabelText('Nada me frenó')).toBeChecked();
    expect(blockers.getByLabelText('Fue lento')).not.toBeChecked();
    expect(blockers.getByLabelText('Me confundió el diseño')).toBeEnabled();
  });
});

describe('enviar', () => {
  it('con todo contestado manda las respuestas, mide survey_completed con 7 y borra el borrador', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    expect(localStorage.getItem(SURVEY_DRAFT_STORAGE_KEY)).toContain('d3_4');
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('sent');
    });
    expect(submitCalls()).toHaveLength(1);
    expect(submitCalls()[0]?.[2]).toEqual({
      p_survey_id: 'first-week-v1',
      p_answers: {
        days_used: 'd3_4',
        used: ['review'],
        clarity: 4,
        ease: 5,
        useful: 3,
        blockers: ['slow'],
        recommend: 'yes',
      },
      p_comment: null,
    });
    expect(events.at(-1)).toMatchObject({ event: 'survey_completed', properties: { answered: 7 } });
    // La medición nunca lleva una respuesta ni el comentario
    expect(JSON.stringify(events)).not.toMatch(/d3_4|review|slow|comentario/);
    expect(readDraft('ana').answers).toEqual({});
    expect(localStorage.getItem(SURVEY_DRAFT_STORAGE_KEY)).toBe('{}');
  });

  it('con comentario manda el comentario limpio y mide 8', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    await typing.type(screen.getByLabelText(new RegExp(text.comment.label)), '  Ubicar Simular  ');
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('sent');
    });
    expect((submitCalls()[0]?.[2] as { p_comment: string }).p_comment).toBe('Ubicar Simular');
    expect(events.at(-1)).toMatchObject({ event: 'survey_completed', properties: { answered: 8 } });
  });

  it('sin permiso de Medición de uso contesta igual y no sale ningún evento', async () => {
    setAnalyticsConsent(false);
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('sent');
    });
    expect(events).toEqual([]);
  });

  it('olvida lo recordado del servidor para que la franja no vuelva a salir', async () => {
    const typing = userEvent.setup();
    await fetchSurveyStatus('ana');
    const before = server.calls.filter((call) => call[1] === 'my_survey_status').length;
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
    });
    await fetchSurveyStatus('ana');
    expect(server.calls.filter((call) => call[1] === 'my_survey_status').length).toBe(before + 1);
  });
});

describe('lo que falta', () => {
  it('un faltante se nombra arriba, con un enlace a cada pregunta, y el foco va a la primera', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await typing.click(scaleValue(/qué tan fácil/i, 5));
    await typing.click(sendButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text.errors.heading(6));
    expect(within(alert).getAllByRole('link')).toHaveLength(6);
    // El foco va al primer control de la primera pregunta que falta (Cuántos días)
    expect(within(question(/cuántos días/i)).getAllByRole('radio')[0]).toHaveFocus();
    expect(submitCalls()).toHaveLength(0);
    // Cada pregunta que falta lo dice, y la que sí se contestó no
    expect(screen.getAllByText(text.errors.required)).toHaveLength(6);
    // Un enlace del resumen lleva el foco a su pregunta
    await typing.click(within(alert).getByRole('link', { name: /Pregunta 7 de 8/ }));
    expect(within(question(/recomendarías/i)).getAllByRole('radio')[0]).toHaveFocus();
  });

  it('con un solo faltante lo dice en singular y quita el aviso al contestarlo', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    await typing.click(within(question(/recomendarías/i)).getByLabelText('Tal vez'));
    // Se desmarca recargando solo esa respuesta: se parte de un borrador con 6 respuestas
    cleanup();
    localStorage.setItem(
      SURVEY_DRAFT_STORAGE_KEY,
      JSON.stringify({
        ana: {
          answers: {
            days_used: 'd0',
            used: ['none'],
            clarity: 1,
            ease: 1,
            useful: 1,
            blockers: ['nothing'],
          },
          comment: '',
        },
      }),
    );
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await typing.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.heading(1));
    await typing.click(within(question(/recomendarías/i)).getByLabelText('No'));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

describe('el comentario', () => {
  it('con un correo avisa al salir del campo y no se envía hasta quitarlo', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    const comment = screen.getByLabelText(new RegExp(text.comment.label));
    await typing.type(comment, 'Escríbeme a alguien@correo.mx');
    // Mientras escribe no se avisa
    expect(screen.queryByText(text.comment.problems.email)).toBeNull();
    await typing.tab();
    expect(await screen.findByText(text.comment.problems.email)).toBeVisible();
    expect(comment).toHaveAttribute('aria-invalid', 'true');
    await typing.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(text.errors.commentProblem);
    expect(comment).toHaveFocus();
    expect(submitCalls()).toHaveLength(0);
    await typing.clear(comment);
    await typing.type(comment, 'Ubicar Simular');
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('sent');
    });
  });

  it('con un teléfono avisa de lo mismo', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await typing.type(
      screen.getByLabelText(new RegExp(text.comment.label)),
      'Mi cel es 55 1234 5678',
    );
    await typing.tab();
    expect(await screen.findByText(text.comment.problems.phone)).toBeVisible();
  });

  it('avisa también de un correo disfrazado, con la misma lista de casos que revisa la base', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    const comment = screen.getByLabelText(new RegExp(text.comment.label));
    // Una muestra de tests/fixtures/survey-comments.json, escrita con el teclado: espacios alrededor de la arroba, la
    // arroba de ancho completo, un carácter de ancho cero, la forma "(at)" y la palabra arroba. Se pegan, para no depender
    // de cómo userEvent escribe los caracteres especiales
    for (const hidden of [
      'ana @ ejemplo . mx',
      'ana\uFF20ejemplo.mx',
      'ana\u200B@ejemplo.mx',
      'ana (at) ejemplo.mx',
      'ana arroba ejemplo punto mx',
    ]) {
      await typing.clear(comment);
      await typing.click(comment);
      await typing.paste(hidden);
      await typing.tab();
      expect(await screen.findByText(text.comment.problems.email), hidden).toBeVisible();
    }
    await typing.clear(comment);
    await typing.click(comment);
    await typing.paste('55 - 1234 - 5678');
    await typing.tab();
    expect(await screen.findByText(text.comment.problems.phone)).toBeVisible();
  });

  it('dice en la pantalla que el filtro es un apoyo y no una garantía', () => {
    render(<SurveyForm userId="ana" onDone={onDone} />);
    const hint = screen.getByText(text.comment.hint);
    expect(hint).toBeVisible();
    expect(hint).toHaveTextContent(/No escribas tu correo, tu teléfono ni datos de pacientes/);
    expect(hint).toHaveTextContent(/solo una ayuda y no lo detecta todo/);
  });

  it('cuenta los caracteres sin anunciarlos y no deja pasar de 500', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    const comment = screen.getByLabelText(new RegExp(text.comment.label));
    expect(comment).toHaveAttribute('maxlength', '500');
    const counter = screen.getByText(text.comment.counter(0, 500));
    expect(counter).not.toHaveAttribute('aria-live');
    expect(comment.getAttribute('aria-describedby')).toContain(counter.id);
    await typing.type(comment, 'hola');
    expect(screen.getByText(text.comment.counter(4, 500))).toBeVisible();
  });
});

describe('el teclado', () => {
  it('Enter en un radio, en una casilla o en el comentario no envía el formulario', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    scaleValue(/qué tan claro/i, 4).focus();
    await typing.keyboard('{Enter}');
    within(question(/qué usaste/i))
      .getByLabelText('Repasar')
      .focus();
    await typing.keyboard('{Enter}');
    const comment = screen.getByLabelText(new RegExp(text.comment.label));
    await typing.click(comment);
    await typing.keyboard('{Enter}');
    expect(comment).toHaveValue('\n');
    expect(submitCalls()).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();
    // Sí envía el botón, también con el teclado
    sendButton().focus();
    await typing.keyboard('{Enter}');
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('sent');
    });
  });

  it('se contesta entera con el teclado', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await typing.tab();
    expect(within(question(/cuántos días/i)).getAllByRole('radio')[0]).toHaveFocus();
    await typing.keyboard(' ');
    expect(within(question(/cuántos días/i)).getAllByRole('radio')[0]).toBeChecked();
    await typing.keyboard('{ArrowDown}');
    expect(within(question(/cuántos días/i)).getAllByRole('radio')[1]).toBeChecked();
  });
});

describe('cuando algo falla', () => {
  it('sin red lo dice, deja el borrador y el botón se puede volver a pulsar', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    server.failNext.submit_survey = 'throw';
    await typing.click(sendButton());
    expect(await screen.findByText(text.states.sendFailed)).toBeVisible();
    expect(sendButton()).toBeEnabled();
    expect(onDone).not.toHaveBeenCalled();
    expect(readDraft('ana').answers.days_used).toBe('d3_4');
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('sent');
    });
    expect(submitCalls()).toHaveLength(2);
  });

  it('un dispositivo que ya no es el activo lo dice', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    server.failNext.submit_survey = { code: '42501' };
    await typing.click(sendButton());
    expect(await screen.findByText(text.states.notActiveDevice)).toBeVisible();
  });

  it('respuestas que la base no acepta lo dicen y no cierran el formulario', async () => {
    const typing = userEvent.setup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    server.setting.id = 'first-week-v1';
    server.answered = false;
    vi.spyOn(server, 'calls', 'get');
    const cloud = holder.cloud as { rpc: (name: string, args?: unknown) => Promise<unknown> };
    const original = cloud.rpc.bind(cloud);
    cloud.rpc = (name, args) =>
      name === 'submit_survey'
        ? Promise.resolve({ data: { ok: false, reason: 'invalid' }, error: null })
        : original(name, args);
    await typing.click(sendButton());
    expect(await screen.findByText(text.states.invalid)).toBeVisible();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('si ya la había contestado o se cerró, avisa a la pantalla y borra el borrador', async () => {
    const typing = userEvent.setup();
    server.answered = true;
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('already');
    });
    expect(localStorage.getItem(SURVEY_DRAFT_STORAGE_KEY)).toBe('{}');
    onDone.mockReset();
    server.answered = false;
    server.setting.enabled = false;
    cleanup();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    await answerAll(typing);
    await typing.click(sendButton());
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith('closed');
    });
  });
});

describe('el borrador', () => {
  it('sobrevive a una recarga, con las respuestas y el comentario', async () => {
    const typing = userEvent.setup();
    const first = render(<SurveyForm userId="ana" onDone={onDone} />);
    await typing.click(within(question(/cuántos días/i)).getByLabelText('1 o 2'));
    await typing.click(scaleValue(/qué tan útil/i, 5));
    await typing.type(screen.getByLabelText(new RegExp(text.comment.label)), 'A medias');
    first.unmount();
    render(<SurveyForm userId="ana" onDone={onDone} />);
    expect(within(question(/cuántos días/i)).getByLabelText('1 o 2')).toBeChecked();
    expect(scaleValue(/qué tan útil/i, 5)).toBeChecked();
    expect(screen.getByLabelText(new RegExp(text.comment.label))).toHaveValue('A medias');
    expect(within(question(/qué tan fácil/i)).queryByRole('radio', { checked: true })).toBeNull();
  });

  it('es por cuenta y la pantalla lo dice', () => {
    localStorage.setItem(
      SURVEY_DRAFT_STORAGE_KEY,
      JSON.stringify({ beto: { answers: { days_used: 'd7' }, comment: 'de Beto' } }),
    );
    render(<SurveyForm userId="ana" onDone={onDone} />);
    expect(within(question(/cuántos días/i)).queryByRole('radio', { checked: true })).toBeNull();
    expect(screen.getByLabelText(new RegExp(text.comment.label))).toHaveValue('');
    expect(screen.getByText(text.draftNote)).toBeVisible();
  });
});
