// Crear un apunte (B6 del plan del cambio, respuesta 74). Para el ENARM basta el título, y en Mazo,
// tema y plantilla se elige a dónde van sus tarjetas, su tema del ENARM y una plantilla. El modo
// clase es para tomar apuntes rápido en clase, con una plantilla y una materia libre de la carrera,
// que nunca cuenta en las estadísticas del ENARM. Si el título queda vacío se llama como la materia
// y la fecha. Al crearlo se abre el editor con el cursor en la primera línea en blanco.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDataApi } from '@/data/context';
import { newId } from '@/data/ids';
import type { Deck } from '@/data/schemas/decks';
import { createOutline } from '@/data/usecases/outlines';
import { firstBlankLine, nodesFromTemplate } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { SelectField, TextField } from '@/ui/components/field';
import { SegmentedControl } from '@/ui/components/segmented';
import type { ReadySession } from '../shared/RequireSession';
import { outlineHref, ownDeckOptions } from './outlineNav';
import { SubjectFields } from './SubjectFields';
import { EMPTY_SUBJECT, subjectLabel, subjectOf, type SubjectDraft } from './subjectDraft';

type Purpose = 'enarm' | 'class';
type TemplateKey = 'blank' | 'class' | 'clinicalCase' | 'topicSummary';

const TEMPLATES: readonly TemplateKey[] = ['blank', 'class', 'clinicalCase', 'topicSummary'];

export function NewOutline({
  session,
  decks,
  suggestions,
}: {
  session: ReadySession;
  decks: readonly Deck[];
  /** Materias libres que el alumno ya usó */
  suggestions: readonly string[];
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const text = t.outlines;
  const form = text.form;
  const [purpose, setPurpose] = useState<Purpose>('enarm');
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateKey>('blank');
  const [subject, setSubject] = useState<SubjectDraft>(EMPTY_SUBJECT);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const deckOptions = useMemo(
    () => [{ value: '', label: form.deckAutomatic }, ...ownDeckOptions(decks, session.user.id)],
    [decks, session.user.id, form.deckAutomatic],
  );
  const isClass = purpose === 'class';

  const choosePurpose = (next: Purpose) => {
    setPurpose(next);
    setTitleError(null);
    setSubjectError(null);
    // El modo clase arranca con la plantilla de clase y una materia libre
    setTemplate(next === 'class' ? 'class' : 'blank');
    setSubject(next === 'class' ? { ...EMPTY_SUBJECT, kind: 'free' } : EMPTY_SUBJECT);
  };

  const create = async () => {
    const chosen = subjectOf(subject);
    setSubjectError(chosen.ok ? null : chosen.error);
    const subjectName = chosen.ok && chosen.subject?.kind === 'free' ? chosen.subject.name : '';
    const date = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
    const finalTitle =
      title.trim() === '' && isClass && subjectName !== ''
        ? form.classTitle(subjectName, date)
        : title.trim();
    if (finalTitle === '') {
      setTitleError(text.titleRequired);
      return;
    }
    setTitleError(null);
    if (!chosen.ok) return;
    setProblem(null);
    setBusy(true);
    try {
      const outline = await createOutline(api, session.user, {
        title: finalTitle,
        ...(deckId === '' ? {} : { deckId }),
        subject: chosen.subject,
        nodes: nodesFromTemplate(text.templateLines[template], newId),
      });
      setTitle('');
      void navigate(
        outlineHref(outline.id, { line: firstBlankLine(outline.nodes), classMode: isClass }),
      );
    } catch {
      setProblem(text.createFailed);
      setBusy(false);
    }
  };

  const templateField = (
    <div className="flex flex-col gap-1">
      <SegmentedControl
        label={form.template}
        value={template}
        options={TEMPLATES.map((key) => ({ value: key, label: form.templates[key] }))}
        onChange={setTemplate}
      />
      {template === 'clinicalCase' ? (
        <p className="text-sm text-fg-muted">{form.clinicalCaseHint}</p>
      ) : null}
    </div>
  );
  const deckField = (
    <SelectField
      label={form.deck}
      value={deckId}
      options={deckOptions}
      onChange={(event) => {
        setDeckId(event.target.value);
      }}
    />
  );

  return (
    <Card aria-labelledby="nuevo-apunte">
      <CardHeader>
        <CardTitle id="nuevo-apunte">{text.listTitle}</CardTitle>
        <p className="text-sm text-fg-muted">{text.listHint}</p>
      </CardHeader>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <SegmentedControl
          label={form.purpose}
          value={purpose}
          options={[
            { value: 'enarm', label: form.purposes.enarm },
            { value: 'class', label: form.purposes.class },
          ]}
          onChange={choosePurpose}
        />
        {isClass ? (
          <>
            <p className="text-sm text-fg-muted">{form.classHint}</p>
            <SubjectFields
              value={subject}
              onChange={(next) => {
                setSubject(next);
                setSubjectError(null);
              }}
              suggestions={suggestions}
              error={subjectError}
              kinds={['free']}
            />
            <TextField
              label={text.newTitle}
              hint={form.classTitleHint}
              value={title}
              maxLength={120}
              error={titleError}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleError(null);
              }}
            />
            {templateField}
            {deckField}
          </>
        ) : (
          <>
            <TextField
              label={text.newTitle}
              value={title}
              placeholder={text.newPlaceholder}
              maxLength={120}
              error={titleError}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleError(null);
              }}
            />
            <Disclosure
              title={form.options}
              summary={`${form.templates[template]} · ${subjectLabelOf(subject)}`}
              defaultOpen={false}
            >
              {templateField}
              <SubjectFields
                value={subject}
                onChange={(next) => {
                  setSubject(next);
                  setSubjectError(null);
                }}
                suggestions={suggestions}
                error={subjectError}
              />
              {deckField}
            </Disclosure>
          </>
        )}
        <Button type="submit" disabled={busy} className="self-start">
          {busy ? text.creating : isClass ? form.startClass : text.create}
        </Button>
        {problem ? (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

/** Cómo se lee el tema que se está eligiendo, aunque todavía le falte algo */
function subjectLabelOf(draft: SubjectDraft): string {
  const chosen = subjectOf(draft);
  return chosen.ok ? subjectLabel(chosen.subject) : t.outlines.subject.kinds[draft.kind];
}
