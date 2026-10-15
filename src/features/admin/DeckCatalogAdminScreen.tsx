// Catálogo de mazos (pantalla 37, 4.8 del plan de B11, respuestas 46, 47 y 49). El admin sube un .apkg,
// que se abre aquí en el navegador con el lector del importador, se parte por submazo con su rama y su
// tema propuestos y se sube por partes de hasta 5 MB a Supabase Storage. Cada mazo lleva licencia,
// autor con crédito visible y, si es de terceros, la nota de su autorización escrita, que solo el dueño
// confirma. Publicar revisa que estén todos los archivos (BK011) y la autorización (BK010). Retirar lo
// saca del catálogo y quien ya lo bajó lo conserva.
import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { useCloud } from '@/app/cloudState';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { usePreferences } from '@/app/preferences';
import type { DeckAdminEntry } from '@/data/bank/contracts';
import { createCardSanitizer } from '@/data/content/cardHtml';
import {
  apkgMedia,
  manifestOf,
  packDeck,
  planSubjects,
  referencedImages,
  subjectKeyOf,
  uploadFilesOf,
  type PackNote,
  type SubjectPlan,
} from '@/data/content/deckPack';
import { PACO_DECKS, proposeDeckTopic } from '@/data/content/deckTopicMap';
import {
  confirmDeckAuthorization,
  nextDeckVersion,
  publishDeckVersion,
  readDeckCatalog,
  registerDeckVersion,
  retireDeck,
  uploadDeckFile,
} from '@/data/cloud/deckCatalogAdmin';
import { EditorialError } from '@/data/editorial/editorialRepo';
import { readZip } from '@/data/import/zip';
import { IMPORT_LIMITS } from '@/data/import/limits';
import { DeckCatalogKeySchema } from '@/data/schemas/deckCatalog';
import { tagSegments } from '@/engines/tagPath';
import { topicTaxonomy } from '@/demo/content';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField, TextAreaField, TextField } from '@/ui/components/field';
import { FileChooser } from '@/ui/components/file-chooser';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { askSecondFactor } from '../physician/secondFactor';
import { bankCodeText, bankErrorText } from './bankErrors';
import { requireCloud, useBankAdminQuery } from './useBankAdminQuery';

const text = bankAdminText.decks;
const date = (iso: string) => new Date(iso).toLocaleDateString('es-MX');
const propose = (segments: readonly string[]) => proposeDeckTopic(segments, topicTaxonomy);

export function DeckCatalogAdminScreen() {
  const linked = useCloud((store) => store.state.status === 'linked');
  const catalog = useBankAdminQuery(
    (cloud, onForbidden) => readDeckCatalog(cloud, onForbidden),
    'deck-catalog',
  );
  return (
    <>
      <ScreenHeader
        title={t.screens.deckCatalogAdmin.title}
        description={t.screens.deckCatalogAdmin.description}
      />
      {linked ? (
        <>
          <UploadCard onUploaded={catalog.reload} />
          <Card aria-labelledby="mazos-lista" className="flex flex-col gap-3">
            <CardHeader>
              <CardTitle id="mazos-lista">{text.list}</CardTitle>
            </CardHeader>
            {catalog.state.status === 'loading' ? <LoadingState /> : null}
            {catalog.state.status === 'failed' ? (
              <ErrorState description={bankCodeText(catalog.state.code)} onRetry={catalog.reload} />
            ) : null}
            {catalog.state.status === 'ready' ? (
              catalog.state.value.length === 0 ? (
                <p className="text-sm text-fg-muted">{text.none}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {catalog.state.value.map((entry) => (
                    <li key={entry.deckKey}>
                      <DeckEntry entry={entry} onChanged={catalog.reload} />
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-sm text-fg-muted">{bankAdminText.needsCloud}</p>
        </Card>
      )}
    </>
  );
}

function DeckEntry({ entry, onChanged }: { entry: DeckAdminEntry; onChanged: () => void }) {
  const role = usePreferences((state) => state.role);
  const [note, setNote] = useState(entry.authorizationNote ?? '');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = `mazo-${entry.deckKey}`;
  const auth = text.authorization;

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      setNotice(await work());
      onChanged();
    } catch (caught) {
      setError(bankErrorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-2 rounded-lg border border-line p-3"
    >
      <h3 id={titleId} className="flex flex-wrap items-center gap-2 font-semibold">
        {entry.name}
        <Badge variant={entry.status === 'published' ? 'success' : 'neutral'}>
          {text.status[entry.status] ?? entry.status}
        </Badge>
        <Badge>{text.license[entry.license] ?? entry.license}</Badge>
      </h3>
      <p className="text-sm text-fg-muted">
        {entry.deckKey} · {entry.author} · {text.downloads(entry.downloads)}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {entry.versions.map((version) => (
          <li key={version.version} className="flex flex-wrap items-center gap-2">
            <span>
              {text.version(
                version.version,
                text.versionStatus[version.status] ?? version.status,
                version.uploaded,
                version.files,
              )}
            </span>
            {version.status === 'uploading' ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    const result = await publishDeckVersion(
                      await requireCloud(),
                      entry.deckKey,
                      version.version,
                      askSecondFactor,
                    );
                    return result === 'published' ? text.published : text.alreadyPublished;
                  });
                }}
              >
                {text.publish}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t border-line pt-2">
        <p className="text-sm font-medium">{auth.title}</p>
        <p className="text-sm">
          {entry.license === 'own'
            ? auth.own
            : entry.authorizationConfirmedAt
              ? auth.confirmed(date(entry.authorizationConfirmedAt))
              : auth.pending}
        </p>
        {entry.license === 'third_party' ? (
          role === 'owner' ? (
            <>
              <TextAreaField
                label={auth.note}
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
              <div>
                <Button
                  variant="secondary"
                  disabled={busy || note.trim() === ''}
                  onClick={() => {
                    void run(async () => {
                      await confirmDeckAuthorization(
                        await requireCloud(),
                        entry.deckKey,
                        note,
                        askSecondFactor,
                      );
                      return auth.confirmed_notice;
                    });
                  }}
                >
                  {auth.confirm}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-fg-muted">{auth.ownerOnly}</p>
          )
        ) : null}
      </div>
      {entry.status === 'published' ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await retireDeck(await requireCloud(), entry.deckKey, askSecondFactor);
                return text.retired;
              });
            }}
          >
            {text.retire}
          </Button>
        </div>
      ) : null}
      <p role="status" className="text-sm font-medium text-success">
        {notice}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'reading'; fileName: string }
  | {
      kind: 'ready';
      fileName: string;
      notes: PackNote[];
      media: Map<string, Uint8Array>;
      subjects: SubjectPlan[];
    }
  | { kind: 'uploading'; fileName: string; done: number; total: number };

/** La clave que se propone para un mazo. La de la demo si es de Paco, así conserva el historial */
function proposedKey(notes: readonly PackNote[], fileName: string): string {
  const root = tagSegments(notes[0]?.tags[0] ?? '')[0] ?? '';
  const paco = PACO_DECKS.find((deck) => deck.roots.includes(root));
  return paco?.key ?? subjectKeyOf(fileName.replace(/\.[^.]+$/, '')).slice(0, 48);
}

function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const upload = text.upload;
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deckKey, setDeckKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [license, setLicense] = useState<'own' | 'third_party'>('third_party');
  const [note, setNote] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setNotice('');
    setPhase({ kind: 'reading', fileName: file.name });
    try {
      const [{ parseFileInWorker }, bytes] = await Promise.all([
        import('@/workers/importClient'),
        file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      ]);
      const parsed = await parseFileInWorker(file);
      if (!parsed.ok || parsed.parsed.source !== 'apkg') throw new Error('read');
      const notes: PackNote[] = parsed.parsed.notes.map((parsedNote) => ({
        guid: parsedNote.guid,
        kind: parsedNote.kind,
        front: parsedNote.front,
        back: parsedNote.back,
        tags: parsedNote.tags,
        deckPath: parsedNote.deckPath,
      }));
      const media = apkgMedia(
        (wanted) => readZip(bytes, IMPORT_LIMITS, (info) => wanted(info.name)),
        referencedImages(notes),
      );
      const key = proposedKey(notes, file.name);
      const paco = PACO_DECKS.find((deck) => deck.key === key);
      setDeckKey(key);
      setName(paco?.name ?? file.name.replace(/\.[^.]+$/, '').slice(0, 120));
      setDescription(paco?.description ?? '');
      setAuthor(paco ? 'Paco' : '');
      setPhase({
        kind: 'ready',
        fileName: file.name,
        notes,
        media,
        subjects: planSubjects(notes, propose),
      });
    } catch {
      setPhase({ kind: 'idle' });
      setError(upload.readFailed);
    }
  };

  const valid =
    DeckCatalogKeySchema.safeParse(deckKey).success &&
    name.trim() !== '' &&
    author.trim() !== '' &&
    (license === 'own' || note.trim() !== '');

  const submit = async () => {
    if (phase.kind !== 'ready' || !valid) return;
    setError('');
    setNotice('');
    const ready = phase;
    try {
      const cloud = await requireCloud();
      const version = nextDeckVersion(await readDeckCatalog(cloud, askSecondFactor), deckKey);
      const { zipSync } = await import('fflate');
      const sanitizer = createCardSanitizer(window);
      const packed = await packDeck(
        ready.notes,
        { deckKey, deckVersion: version, author: author.trim() },
        {
          sanitize: (html, resolveMedia) => sanitizer.sanitize(html, resolveMedia),
          media: (file) => ready.media.get(file) ?? null,
          zip: (files) => zipSync(files, { level: 0 }),
          propose,
        },
        new Map(ready.subjects.map((subject) => [subject.subjectKey, subject])),
      );
      const manifest = manifestOf(
        {
          deckKey,
          name: name.trim(),
          description: description.trim(),
          author: author.trim(),
          license,
          authorizationNote: note.trim() === '' ? null : note.trim(),
        },
        packed.subjects,
      );
      const registered = await registerDeckVersion(cloud, manifest, askSecondFactor);
      if (registered.version !== version) throw new EditorialError('stale');
      const files = uploadFilesOf(deckKey, version, packed.subjects);
      let done = 0;
      setPhase({
        kind: 'uploading',
        fileName: ready.fileName,
        done,
        total: registered.files.length,
      });
      for (const file of registered.files) {
        const bytes = files.get(file.path);
        if (!bytes) throw new EditorialError('deck_files_missing');
        await uploadDeckFile(cloud, file.path, bytes, file.contentType);
        done += 1;
        setPhase({
          kind: 'uploading',
          fileName: ready.fileName,
          done,
          total: registered.files.length,
        });
      }
      setPhase({ kind: 'idle' });
      setNotice(
        packed.skipped > 0
          ? `${upload.uploaded} ${upload.warnings(packed.skipped)}`
          : upload.uploaded,
      );
      onUploaded();
    } catch (caught) {
      setPhase(ready);
      setError(caught instanceof EditorialError ? bankErrorText(caught) : upload.failed);
    }
  };

  const setSubject = (subjectKey: string, change: Partial<SubjectPlan>) => {
    if (phase.kind !== 'ready') return;
    setPhase({
      ...phase,
      subjects: phase.subjects.map((subject) =>
        subject.subjectKey === subjectKey ? { ...subject, ...change } : subject,
      ),
    });
  };

  return (
    <Card aria-labelledby="mazos-subir" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="mazos-subir">{upload.title}</CardTitle>
        <CardDescription>{upload.hint}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-2">
        <label id="mazo-archivo-etiqueta" htmlFor="mazo-archivo" className="font-medium">
          {upload.file}
        </label>
        <FileChooser
          id="mazo-archivo"
          labelledBy="mazo-archivo-etiqueta"
          accept=".apkg"
          disabled={phase.kind === 'reading' || phase.kind === 'uploading'}
          fileName={phase.kind === 'idle' ? null : phase.fileName}
          chooseText={upload.choose}
          emptyText={upload.none}
          icon={<FileUp aria-hidden />}
          onChoose={pick}
        />
      </div>
      {phase.kind === 'reading' ? <LoadingState label={upload.reading} /> : null}
      {phase.kind === 'uploading' ? (
        <p role="status" className="text-sm font-medium">
          {upload.uploading(phase.done, phase.total)}
        </p>
      ) : null}
      {phase.kind === 'ready' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={upload.key}
              hint={upload.keyHint}
              value={deckKey}
              onChange={(event) => {
                setDeckKey(event.target.value.trim().toLowerCase());
              }}
            />
            <TextField
              label={upload.name}
              value={name}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <TextField
              label={upload.author}
              value={author}
              maxLength={80}
              onChange={(event) => {
                setAuthor(event.target.value);
              }}
            />
            <SelectField
              label={upload.license}
              value={license}
              options={(['third_party', 'own'] as const).map((value) => ({
                value,
                label: text.license[value] ?? value,
              }))}
              onChange={(event) => {
                setLicense(event.target.value === 'own' ? 'own' : 'third_party');
              }}
            />
          </div>
          <TextAreaField
            label={upload.description}
            rows={2}
            maxLength={1000}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
          {license === 'third_party' ? (
            <TextAreaField
              label={upload.note}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          ) : null}
          <p className="font-medium">{upload.subjects(phase.subjects.length)}</p>
          <ul className="flex flex-col divide-y divide-line">
            {phase.subjects.map((subject) => {
              const topics =
                topicTaxonomy.branches.find((branch) => branch.key === subject.branch)?.topics ??
                [];
              return (
                <li key={subject.subjectKey} className="flex flex-col gap-2 py-2">
                  <p className="text-sm font-medium">
                    {subject.name} · {subject.notes.toLocaleString('es-MX')}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SelectField
                      label={`${upload.branch} ${subject.name}`}
                      value={subject.branch ?? ''}
                      options={[
                        { value: '', label: upload.noTopic },
                        ...topicTaxonomy.branches.map((branch) => ({
                          value: branch.key,
                          label: branch.name,
                        })),
                      ]}
                      onChange={(event) => {
                        setSubject(subject.subjectKey, {
                          branch: event.target.value || null,
                          topic: null,
                        });
                      }}
                    />
                    <SelectField
                      label={`${upload.topic} ${subject.name}`}
                      value={subject.topic ?? ''}
                      disabled={subject.branch === null}
                      options={[
                        { value: '', label: upload.noTopic },
                        ...topics.map((topic) => ({ value: topic.key, label: topic.name })),
                      ]}
                      onChange={(event) => {
                        setSubject(subject.subjectKey, { topic: event.target.value || null });
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {!valid ? <p className="text-sm text-fg-muted">{upload.invalid}</p> : null}
          <div>
            <Button
              disabled={!valid}
              onClick={() => {
                void submit();
              }}
            >
              {upload.register}
            </Button>
          </div>
        </>
      ) : null}
      <p role="status" className="text-sm font-medium text-success">
        {notice}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
