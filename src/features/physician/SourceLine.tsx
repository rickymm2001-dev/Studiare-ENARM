// La línea de la fuente de un texto en inglés (B13, 1.4 y 5.4 del plan de B13). Va bajo el texto, en letra
// chica, con el título, la licencia y el enlace, que abre en otra pestaña con rel noopener. Lee la fuente
// de las referencias de la pregunta con parsePassageSource, la misma lectura que hace la base, así el
// médico ve lo que ve el alumno. Si la fuente falta o está incompleta lo dice en vez de esconderlo.
import {
  isPassageSourceRef,
  LICENSE_LABELS,
  parsePassageSource,
} from '@/data/content/passageSource';
import { physicianText } from '@/i18n/physician';
import { cn } from '@/ui/cn';

export function SourceLine({
  refs,
  className,
}: {
  /** Las referencias de la pregunta. La fuente es la primera que empieza con Fuente del texto */
  refs: readonly { title: string }[];
  className?: string;
}) {
  const text = physicianText.sourceLine;
  const read = parsePassageSource(refs);
  if (!read.ok) {
    const written = refs.some((ref) => isPassageSourceRef(ref.title));
    return (
      <p className={cn('text-xs font-medium text-warning', className)}>
        {written ? text.incomplete : text.missing}
      </p>
    );
  }
  const { source } = read;
  return (
    <p className={cn('text-xs text-fg-muted', className)}>
      {text.label}{' '}
      {source.title ? (
        <>
          <span lang="en">{source.title}</span>.{' '}
        </>
      ) : null}
      {LICENSE_LABELS[source.license]}.
      {source.url ? (
        <>
          {' '}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline"
          >
            {source.url}
            <span className="sr-only">{text.newTab}</span>
          </a>
        </>
      ) : null}
    </p>
  );
}
