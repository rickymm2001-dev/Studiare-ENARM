// Elegir el tema de un apunte (B6 del plan del cambio). Sin tema, un tema del ENARM con su rama, o
// una materia libre de la carrera, que nunca cuenta en las estadísticas del ENARM. Lo usan el
// formulario para crear un apunte y el de Mazo y tema de un apunte abierto.
import { useId } from 'react';
import { t } from '@/i18n/es-MX';
import { SelectField, TextField } from '@/ui/components/field';
import { SegmentedControl } from '@/ui/components/segmented';
import { BRANCH_OPTIONS, topicOptions, type SubjectDraft, type SubjectKind } from './subjectDraft';

const KINDS: readonly SubjectKind[] = ['none', 'enarm', 'free'];

export function SubjectFields({
  value,
  onChange,
  suggestions,
  error,
  kinds = KINDS,
}: {
  value: SubjectDraft;
  onChange: (next: SubjectDraft) => void;
  /** Materias libres que el alumno ya usó */
  suggestions: readonly string[];
  error?: string | null;
  /** Qué tipos se ofrecen. El modo clase ofrece solo la materia libre */
  kinds?: readonly SubjectKind[];
}) {
  const text = t.outlines.subject;
  const listId = useId();
  const topics = topicOptions(value.branch);
  return (
    <div className="flex flex-col gap-2">
      {kinds.length > 1 ? (
        <SegmentedControl
          label={text.label}
          value={value.kind}
          options={kinds.map((kind) => ({ value: kind, label: text.kinds[kind] }))}
          onChange={(kind) => {
            onChange({ ...value, kind });
          }}
        />
      ) : null}
      {value.kind === 'enarm' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <SelectField
            className="min-w-0 sm:flex-1"
            label={text.branch}
            value={value.branch}
            options={[{ value: '', label: text.chooseBranch }, ...BRANCH_OPTIONS]}
            onChange={(event) => {
              onChange({ ...value, branch: event.target.value, topic: '' });
            }}
          />
          <SelectField
            className="min-w-0 sm:flex-1"
            label={text.topic}
            value={value.topic}
            disabled={value.branch === ''}
            options={[{ value: '', label: text.chooseTopic }, ...topics]}
            onChange={(event) => {
              onChange({ ...value, topic: event.target.value });
            }}
          />
        </div>
      ) : null}
      {value.kind === 'free' ? (
        <>
          <TextField
            label={text.freeName}
            value={value.name}
            maxLength={80}
            placeholder={text.freePlaceholder}
            list={suggestions.length > 0 ? listId : undefined}
            onChange={(event) => {
              onChange({ ...value, name: event.target.value });
            }}
          />
          {suggestions.length > 0 ? (
            <datalist id={listId}>
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          ) : null}
        </>
      ) : null}
      {value.kind !== 'none' ? (
        <p className="text-sm text-fg-muted">
          {value.kind === 'enarm' ? text.enarmHint : text.freeHint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
