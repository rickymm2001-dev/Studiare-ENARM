// Avisos de calidad y de duplicados de una tarjeta (fila 9 de D-085). Es una lista breve de
// sugerencias que acompaña al editor. No bloquea nada, no pide confirmación y no cambia el texto de
// la tarjeta, el alumno decide. El editor calcula los avisos con checkCardQuality y los duplicados
// con findDuplicates, y aquí solo se muestran.
//
// La región de estado existe siempre, aunque esté vacía. Un lector de pantalla anuncia los cambios
// de una región que ya estaba en la página y no las que aparecen junto con su contenido. Quien la
// conecte debe calcular los avisos con una pausa después de teclear, para no anunciar cada letra.
import { Info, TriangleAlert } from 'lucide-react';
import type { CardQualityIssue, CardQualitySeverity } from '@/engines/cardQuality';
import type { DuplicateResult } from '@/engines/duplicates';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

interface HintEntry {
  key: string;
  severity: CardQualitySeverity;
  message: string;
}

export interface CardQualityHintsProps {
  issues: readonly CardQualityIssue[];
  duplicates?: DuplicateResult | null;
  /** Cuántos avisos se muestran antes de resumir el resto */
  maxVisible?: number;
  className?: string;
}

const text = t.cardQuality;

/** Los exactos y los avisos primero, las sugerencias y los casi iguales después */
function buildEntries(
  issues: readonly CardQualityIssue[],
  duplicates: DuplicateResult | null | undefined,
): HintEntry[] {
  const warnings: HintEntry[] = [];
  const notes: HintEntry[] = [];
  const firstExact = duplicates?.exact[0];
  if (duplicates && firstExact) {
    warnings.push({
      key: 'duplicate-exact',
      severity: 'warning',
      message: text.duplicateExact(duplicates.totalExact, firstExact),
    });
  }
  const firstNear = duplicates?.near[0];
  if (duplicates && firstNear) {
    notes.push({
      key: 'duplicate-near',
      severity: 'note',
      message: text.duplicateNear(duplicates.totalNear, firstNear),
    });
  }
  for (const issue of issues) {
    const entry = { key: issue.code, severity: issue.severity, message: text.issue(issue) };
    (issue.severity === 'warning' ? warnings : notes).push(entry);
  }
  return [...warnings, ...notes];
}

export function CardQualityHints({
  issues,
  duplicates,
  maxVisible = 4,
  className,
}: CardQualityHintsProps) {
  const entries = buildEntries(issues, duplicates);
  const visible = entries.slice(0, maxVisible);
  const hidden = entries.length - visible.length;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        entries.length > 0 &&
          'flex flex-col gap-2 rounded-md border border-line bg-muted p-3 text-sm',
        className,
      )}
    >
      {entries.length > 0 ? (
        <>
          <p className="font-medium text-fg">{text.title}</p>
          <ul className="flex flex-col gap-2">
            {visible.map((entry) => {
              const Icon = entry.severity === 'warning' ? TriangleAlert : Info;
              return (
                <li key={entry.key} className="flex items-start gap-2 text-fg">
                  <Icon
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      entry.severity === 'warning' ? 'text-warning' : 'text-fg-muted',
                    )}
                  />
                  <span>
                    <span className="sr-only">{text.severity[entry.severity]}. </span>
                    {entry.message}
                  </span>
                </li>
              );
            })}
          </ul>
          {hidden > 0 ? <p className="text-fg-muted">{text.more(hidden)}</p> : null}
          <p className="text-fg-muted">{text.footer}</p>
        </>
      ) : null}
    </div>
  );
}
