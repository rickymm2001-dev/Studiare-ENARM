// Vista de lectura de una versión del banco (B11), con sus opciones, la etiqueta y la justificación de
// cada distractor y la explicación. La usan el editor en solo lectura y la bandeja de reportes. Durante
// el paso a ciegas el revisor no la ve. Una opción escondida dice que lo está y no muestra nada del autor.
import type { EditorVersion } from '@/data/bank/contracts';
import { biasTaxonomy } from '@/demo/content';
import { physicianText } from '@/i18n/physician';

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
  const options = [...version.options].sort((a, b) => a.position - b.position);
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
      {caseVignette ? <p>{caseVignette}</p> : null}
      {version.vignette ? <p>{version.vignette}</p> : null}
      <p className="font-medium">{version.prompt}</p>
      <ol className="flex flex-col gap-2">
        {options.map((option) => (
          <li key={option.id} className="flex flex-col gap-0.5">
            <span className={option.isCorrect ? 'font-semibold' : undefined}>
              {option.letter ? `${option.letter}. ` : ''}
              {option.text}
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
      {version.explanation ? <p className="text-fg-muted">{version.explanation}</p> : null}
      {version.gpcRefs.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-fg-muted">
          {version.gpcRefs.map((ref, index) => (
            <li key={index}>{ref.title}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
