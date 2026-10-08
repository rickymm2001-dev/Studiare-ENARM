// Subir mi mazo (D-093, fila 13 de la guía de Anki). Se elige un archivo, se lee en un Worker, se
// muestra qué contiene con sus avisos y las filas que no se pueden importar, y solo entonces, con el
// nombre del mazo y la confirmación de que el contenido es del alumno, se guarda como un mazo
// privado con sus submazos. Las tarjetas empiezan nuevas. Importar el mismo archivo otra vez no
// duplica nada.
import { FileUp, TriangleAlert } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { createCardSanitizer } from '@/data/content/cardHtml';
import { useDataApi } from '@/data/context';
import type { ParsedImport } from '@/data/import/types';
import { ImportBlockedError, importParsed, type ImportResult } from '@/data/usecases/importDeck';
import { htmlToPlain } from '@/engines/cardText';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, TextField } from '@/ui/components/field';
import { parseFileInWorker } from '@/workers/importClient';
import type { ImportParseResult } from '@/workers/importApi';
import type { ReadySession } from '../shared/RequireSession';

type Step =
  | { name: 'idle' }
  | { name: 'reading' }
  | { name: 'preview'; parsed: ParsedImport }
  | { name: 'saving'; parsed: ParsedImport }
  | { name: 'done'; result: ImportResult };

/** Cuántas filas con problema se listan antes de decir cuántas más hay */
const ERRORS_SHOWN = 5;
const SAMPLE_SIZE = 3;

const baseName = (file: string) =>
  file
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 120);

export function ImportDeckCard({
  session,
  parseFile = parseFileInWorker,
}: {
  session: ReadySession;
  /** Lee el archivo. Por defecto en un Worker. Las pruebas pasan una versión sin Worker */
  parseFile?: (file: File) => Promise<ImportParseResult>;
}) {
  const api = useDataApi();
  const inputId = useId();
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [problem, setProblem] = useState<string | null>(null);
  const [deckName, setDeckName] = useState('');
  const [rights, setRights] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  // El saneador necesita la ventana del navegador y se arma una sola vez
  const sanitizer = useMemo(() => createCardSanitizer(window), []);

  const reset = () => {
    setStep({ name: 'idle' });
    setProblem(null);
    setDeckName('');
    setRights(false);
    setNameError(null);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setStep({ name: 'reading' });
    try {
      const result = await parseFile(file);
      if (!result.ok) {
        setProblem(t.importer.errors[result.code] ?? t.importer.readError);
        setStep({ name: 'idle' });
        return;
      }
      setDeckName(baseName(file.name));
      setRights(false);
      setStep({ name: 'preview', parsed: result.parsed });
    } catch {
      setProblem(t.importer.readError);
      setStep({ name: 'idle' });
    }
  };

  const save = async (parsed: ParsedImport) => {
    setProblem(null);
    if (deckName.trim() === '') {
      setNameError(t.importer.nameRequired);
      return;
    }
    setNameError(null);
    if (!rights) {
      setProblem(t.importer.rightsRequired);
      return;
    }
    setStep({ name: 'saving', parsed });
    try {
      const result = await importParsed(api, session.user, parsed, {
        deckName,
        rightsConfirmed: rights,
        sanitize: (html) => sanitizer.sanitize(html, () => null),
      });
      setStep({ name: 'done', result });
    } catch (error) {
      setProblem(
        error instanceof ImportBlockedError && error.reason === 'nothing_to_import'
          ? t.importer.nothing
          : t.importer.saveError,
      );
      setStep({ name: 'preview', parsed });
    }
  };

  const reading = step.name === 'reading';
  const parsed = step.name === 'preview' || step.name === 'saving' ? step.parsed : null;

  return (
    <Card aria-labelledby="importar-titulo">
      <CardHeader>
        <CardTitle id="importar-titulo" className="flex items-center gap-2">
          <FileUp aria-hidden className="size-5 text-primary" />
          {t.importer.title}
        </CardTitle>
        <CardDescription>{t.importer.intro}</CardDescription>
      </CardHeader>

      {step.name === 'done' ? (
        <ImportDone result={step.result} onAgain={reset} />
      ) : (
        <div className="flex flex-col gap-3">
          {parsed === null ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={inputId} className="font-medium">
                {t.importer.fileLabel}
              </label>
              <input
                id={inputId}
                type="file"
                accept=".apkg,.csv,.tsv,.txt,.xlsx,.docx"
                disabled={reading}
                aria-describedby={`${inputId}-ayuda`}
                className="block w-full text-sm file:mr-3 file:min-h-touch file:rounded-full file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-primary-fg"
                onChange={(event) => {
                  const input = event.target;
                  void choose(input.files?.[0]).finally(() => {
                    // Así se puede elegir el mismo archivo otra vez
                    input.value = '';
                  });
                }}
              />
              <p id={`${inputId}-ayuda`} className="text-sm text-fg-muted">
                {t.importer.fileHint}
              </p>
              {reading ? (
                <p role="status" className="text-sm font-medium">
                  {t.importer.reading}
                </p>
              ) : null}
            </div>
          ) : (
            <ImportPreview
              parsed={parsed}
              deckName={deckName}
              nameError={nameError}
              rights={rights}
              saving={step.name === 'saving'}
              onName={setDeckName}
              onRights={setRights}
              onImport={() => {
                void save(parsed);
              }}
              onCancel={reset}
            />
          )}
          {problem ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {problem}
            </p>
          ) : null}
          <Disclosure title={t.importer.help.title} summary={t.importer.help.summary}>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
              {t.importer.help.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}
    </Card>
  );
}

function ImportPreview({
  parsed,
  deckName,
  nameError,
  rights,
  saving,
  onName,
  onRights,
  onImport,
  onCancel,
}: {
  parsed: ParsedImport;
  deckName: string;
  nameError: string | null;
  rights: boolean;
  saving: boolean;
  onName: (value: string) => void;
  onRights: (value: boolean) => void;
  onImport: () => void;
  onCancel: () => void;
}) {
  const kinds = { basic: 0, basic_reverse: 0, cloze: 0 };
  const paths = new Set<string>();
  for (const note of parsed.notes) {
    kinds[note.kind] += 1;
    if (note.deckPath.length > 0) paths.add(note.deckPath.join('::'));
  }
  // El mazo raíz y cada ruta distinta, sin contar dos veces los niveles que comparten
  const decks = new Set<string>(['']);
  for (const path of paths) {
    const parts = path.split('::');
    for (let level = 1; level <= parts.length; level += 1)
      decks.add(parts.slice(0, level).join('::'));
  }
  const shownErrors = parsed.errors.slice(0, ERRORS_SHOWN);
  const plain = (text: string, html: boolean) =>
    (html ? htmlToPlain(text) : text).replace(/\s+/g, ' ').trim().slice(0, 90);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onImport();
      }}
    >
      <section aria-label={t.importer.previewTitle} className="flex flex-col gap-2">
        <h3 className="font-semibold">{t.importer.previewTitle}</h3>
        <p className="text-sm text-fg-muted">
          {t.importer.previewSource(t.importer.sources[parsed.source], parsed.fileName)}
        </p>
        <p className="font-semibold">{t.importer.summary(parsed.notes.length, decks.size)}</p>
        <ul className="flex flex-wrap gap-2 text-sm">
          {(['basic', 'basic_reverse', 'cloze'] as const)
            .filter((kind) => kinds[kind] > 0)
            .map((kind) => (
              <li key={kind} className="rounded-full bg-muted px-3 py-1">
                {t.importer.kinds[kind]} · {kinds[kind].toLocaleString('es-MX')}
              </li>
            ))}
        </ul>
        {parsed.warnings.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {parsed.warnings.map((warning) => (
              <li key={warning.code} className="flex items-start gap-2 text-fg-muted">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                {t.importer.warnings[warning.code]?.(warning.count) ?? warning.code}
              </li>
            ))}
          </ul>
        ) : null}
        {parsed.errors.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold text-danger">
              {t.importer.rowErrorsTitle(parsed.errors.length)}
            </p>
            <ul className="list-disc pl-5 text-fg-muted">
              {shownErrors.map((error, index) => (
                <li key={`${error.position ?? 'x'}-${index}`}>
                  {t.importer.rowError(
                    error.position,
                    t.importer.rowErrors[error.code] ?? error.code,
                  )}
                </li>
              ))}
            </ul>
            {parsed.errors.length > ERRORS_SHOWN ? (
              <p className="text-fg-muted">
                {t.importer.moreErrors(parsed.errors.length - ERRORS_SHOWN)}
              </p>
            ) : null}
          </div>
        ) : null}
        {parsed.notes.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold">{t.importer.sample}</p>
            <ul className="flex flex-col gap-1 text-fg-muted">
              {parsed.notes.slice(0, SAMPLE_SIZE).map((note, index) => (
                <li key={index} className="truncate">
                  {plain(note.front, note.html)}
                  {note.kind === 'cloze' ? '' : ` → ${plain(note.back, note.html)}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      <TextField
        label={t.importer.deckName}
        hint={t.importer.deckNameHint}
        value={deckName}
        maxLength={120}
        error={nameError}
        onChange={(event) => {
          onName(event.target.value);
        }}
      />
      <CheckboxField
        label={t.importer.rights}
        hint={t.importer.rightsHint}
        checked={rights}
        onChange={(event) => {
          onRights(event.target.checked);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || parsed.notes.length === 0}>
          {saving ? t.importer.importing : t.importer.import(parsed.notes.length)}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
          {t.importer.cancel}
        </Button>
      </div>
    </form>
  );
}

function ImportDone({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="font-semibold">
        {t.importer.doneTitle}
      </p>
      <p className="text-sm">{t.importer.done(result.notesCreated, result.cardsCreated)}</p>
      {result.duplicates > 0 ? (
        <p className="text-sm text-fg-muted">{t.importer.doneDuplicates(result.duplicates)}</p>
      ) : null}
      {result.repaired > 0 ? (
        <p className="text-sm text-fg-muted">{t.importer.doneRepaired(result.repaired)}</p>
      ) : null}
      {result.rejected.length > 0 ? (
        <p className="text-sm text-fg-muted">{t.importer.doneRejected(result.rejected.length)}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to={screenPath('explore')}>{t.studyTabs.explore}</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to={screenPath('review')}>{t.studyTabs.review}</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={onAgain}>
          {t.importer.again}
        </Button>
      </div>
    </div>
  );
}
