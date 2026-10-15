// La rúbrica de 5.2 de un texto de la auditoría. Exactitud, anclaje, seguridad, utilidad, claridad,
// veredicto y un comentario. Cada elección se guarda en cuanto la rúbrica está completa, sin botón de
// guardar (B12, 5.3). Los controles son botones excluyentes con aria-pressed, que se recorren con el
// teclado y se tocan bien en el teléfono.
import { useId } from 'react';
import { aiAuditText } from '@/i18n/aiAudit';
import { SegmentedControl } from '@/ui/components/segmented';
import { TextAreaField } from '@/ui/components/field';
import { MAX_COMMENT, missingFields, type ReviewDraft } from './aiAuditView';

const text = aiAuditText.reviewer;

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function Question({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">{label}</p>
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
      {children}
    </div>
  );
}

export function Rubric({
  draft,
  disabled,
  saveState,
  onChange,
}: {
  draft: ReviewDraft;
  /** La muestra ya se cerró y las respuestas quedaron fijas */
  disabled: boolean;
  saveState: SaveState;
  onChange: (next: ReviewDraft) => void;
}) {
  const statusId = useId();
  const set = <K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) => {
    if (!disabled) onChange({ ...draft, [key]: value });
  };
  const scale = ['1', '2', '3', '4'].map((value) => ({ value, label: value }));
  const missing = missingFields(draft);
  return (
    <section
      aria-label={text.rubricTitle}
      className={
        disabled ? 'pointer-events-none flex flex-col gap-4 opacity-70' : 'flex flex-col gap-4'
      }
    >
      <h4 className="text-base font-semibold">{text.rubricTitle}</h4>

      <Question label={text.accuracy.label}>
        <SegmentedControl
          label={text.accuracy.label}
          value={draft.accuracy}
          options={[
            { value: 'correct', label: text.accuracy.correct },
            { value: 'minor', label: text.accuracy.minor },
            { value: 'severe', label: text.accuracy.severe },
          ]}
          onChange={(value) => {
            set('accuracy', value);
          }}
        />
        {draft.accuracy === 'severe' ? (
          <p role="status" className="text-sm text-warning">
            {text.severeNote}
          </p>
        ) : null}
      </Question>

      <Question label={text.grounded.label} hint={text.grounded.hint}>
        <SegmentedControl
          label={text.grounded.label}
          value={draft.grounded}
          options={[
            { value: 'yes', label: text.grounded.yes },
            { value: 'no', label: text.grounded.no },
          ]}
          onChange={(value) => {
            set('grounded', value);
          }}
        />
      </Question>

      <Question label={text.safety.label} hint={text.safety.hint}>
        <SegmentedControl
          label={text.safety.label}
          value={draft.safetyIssue}
          options={[
            { value: 'no', label: text.safety.no },
            { value: 'yes', label: text.safety.yes },
          ]}
          onChange={(value) => {
            set('safetyIssue', value);
          }}
        />
      </Question>

      <Question label={text.usefulness.label} hint={text.usefulness.hint}>
        <SegmentedControl
          label={text.usefulness.label}
          value={draft.usefulness}
          options={scale}
          onChange={(value) => {
            set('usefulness', value as ReviewDraft['usefulness']);
          }}
        />
      </Question>

      <Question label={text.clarity.label} hint={text.clarity.hint}>
        <SegmentedControl
          label={text.clarity.label}
          value={draft.clarity}
          options={scale}
          onChange={(value) => {
            set('clarity', value as ReviewDraft['clarity']);
          }}
        />
      </Question>

      <Question label={text.verdict.label}>
        <SegmentedControl
          label={text.verdict.label}
          value={draft.verdict}
          options={[
            { value: 'approved', label: text.verdict.approved },
            { value: 'minor_changes', label: text.verdict.minor_changes },
            { value: 'rejected', label: text.verdict.rejected },
          ]}
          onChange={(value) => {
            set('verdict', value);
          }}
        />
      </Question>

      <TextAreaField
        label={text.comment}
        hint={text.commentHint(draft.comment.length)}
        rows={2}
        maxLength={MAX_COMMENT}
        disabled={disabled}
        value={draft.comment}
        onChange={(event) => {
          set('comment', event.target.value);
        }}
      />

      <p id={statusId} role="status" className="min-h-5 text-sm text-fg-muted">
        {disabled
          ? ''
          : saveState === 'saving'
            ? text.saving
            : saveState === 'saved'
              ? text.saved
              : saveState === 'failed'
                ? text.saveFailed
                : missing.length > 0 && missing.length < 6
                  ? text.missing(missing.map((field) => text.missingFields[field] ?? field))
                  : ''}
      </p>
    </section>
  );
}
