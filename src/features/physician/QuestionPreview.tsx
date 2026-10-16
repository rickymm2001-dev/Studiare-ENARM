// Vista de lectura de una versión del banco (B11), con sus opciones, la etiqueta y la justificación de
// cada distractor y la explicación. La usa el editor en solo lectura y la bandeja de reportes. Durante
// el paso a ciegas el revisor no la ve. Una opción escondida dice que lo está y no muestra nada del autor.
// Una pregunta de Inglés médico (B13, 5.4 del plan de B13) usa el diseño de lectura, con el texto y su
// fuente a la izquierda y la pregunta con sus opciones a la derecha, y marca lo que está en inglés con
// lang="en" para que el lector de pantalla lo diga bien. La explicación y las justificaciones siguen en
// español.
import type { EditorVersion } from '@/data/bank/contracts';
import { isPassageSourceRef } from '@/data/content/passageSource';
import { biasTaxonomy } from '@/demo/content';
import { physicianText } from '@/i18n/physician';
import { languageOfBranch } from './branchLanguage';
import { SourceLine } from './SourceLine';

const biasName = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias.name]));

export function VersionPreview({
  version,
  caseVignette,
}: {
  version: EditorVersion;
  /** La viñeta del caso seriado, si la pregunta es de uno */
  caseVignette?: string | null;
}) {
  const text = physicianText.questionEditor;
  const english = languageOfBranch(version.branch) === 'en';
  const lang = english ? 'en' : undefined;
  const options = [...version.options].sort((a, b) => a.position - b.position);
  // En inglés la fuente del texto se ve bajo el texto, así que no se repite entre las referencias
  const sourceAt = english ? version.gpcRefs.findIndex((ref) => isPassageSourceRef(ref.title)) : -1;
  const refs = version.gpcRefs.filter((_ref, at) => at !== sourceAt);
  const passage = (
    <>
      {caseVignette ? <p lang={lang}>{caseVignette}</p> : null}
      {version.vignette ? <p lang={lang}>{version.vignette}</p> : null}
      {english ? <SourceLine refs={version.gpcRefs} /> : null}
    </>
  );
  const question = (
    <>
      <p className="font-medium" lang={lang}>
        {version.prompt}
      </p>
      <ol className="flex flex-col gap-2">
        {options.map((option) => (
          <li key={option.id} className="flex flex-col gap-0.5">
            <span className={option.isCorrect ? 'font-semibold' : undefined}>
              <span lang={lang}>
                {option.letter ? `${option.letter}. ` : ''}
                {option.text}
              </span>
              {option.isCorrect ? ` · ${text.options.key}` : ''}
              {option.biasTag ? (
                <span className="ml-2 text-xs text-fg-muted">
                  ({biasName.get(option.biasTag) ?? option.biasTag})
                </span>
              ) : null}
            </span>
            <span className="text-xs text-fg-muted">
              {option.hidden ? physicianText.review.hiddenRationale : (option.rationale ?? '')}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
      {english ? (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-6">
          <div className="flex flex-col gap-2">{passage}</div>
          <div className="flex flex-col gap-2">{question}</div>
        </div>
      ) : (
        <>
          {passage}
          {question}
        </>
      )}
      {version.explanation ? <p className="text-fg-muted">{version.explanation}</p> : null}
      {refs.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-fg-muted">
          {refs.map((ref, index) => (
            <li key={index}>{ref.title}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
