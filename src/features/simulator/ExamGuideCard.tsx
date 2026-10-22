// Cómo es el examen (V4-B5). Estructura, niveles de Bloom y lo que cuentan quienes ya lo presentaron,
// plegado dentro de Simular. Texto fijo y propio, no sale de la IA. Es una sola región con su nombre, y
// cada parte lleva su título como etiqueta de su lista, sin encabezados, porque el título de la tarjeta
// es el resumen del plegable y los encabezados no tendrían un h2 propio del que colgar.
import { t } from '@/i18n/es-MX';
import { Card } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';

export function ExamGuideCard() {
  const text = t.examGuide;
  return (
    <Card aria-label={text.title}>
      <Disclosure title={text.title} summary={text.summary}>
        <div className="flex flex-col gap-1">
          <p id="examen-estructura" className="font-semibold">
            {text.structureTitle}
          </p>
          <ul
            aria-labelledby="examen-estructura"
            className="flex list-disc flex-col gap-1 pl-5 text-sm"
          >
            {text.structure.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1">
          <p id="examen-niveles" className="font-semibold">
            {text.levelsTitle}
          </p>
          <p className="text-sm text-fg-muted">{text.levelsIntro}</p>
          <dl className="flex flex-col gap-1 text-sm">
            {text.levels.map((level) => (
              <div key={level.group}>
                <dt className="inline font-semibold">{level.group}. </dt>
                <dd className="inline">{level.detail}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-fg-muted">{text.levelsNote}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p id="examen-sensacion" className="font-semibold">
            {text.feelTitle}
          </p>
          <p className="text-sm text-fg-muted">{text.feelIntro}</p>
          <ul
            aria-labelledby="examen-sensacion"
            className="flex list-disc flex-col gap-1 pl-5 text-sm"
          >
            {text.feel.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-sm">{text.practiceNote}</p>
        </div>
        <p className="text-xs text-fg-muted">{text.sources}</p>
      </Disclosure>
    </Card>
  );
}
