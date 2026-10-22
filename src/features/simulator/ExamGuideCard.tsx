// Cómo es el examen (V4-B5). Estructura, niveles de Bloom y lo que cuentan quienes ya lo presentaron,
// plegado dentro de Simular. Texto fijo y propio, no sale de la IA.
import { t } from '@/i18n/es-MX';
import { Card } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';

export function ExamGuideCard() {
  const text = t.examGuide;
  return (
    <Card aria-label={text.title}>
      <Disclosure title={text.title} summary={text.summary}>
        <section aria-labelledby="examen-estructura" className="flex flex-col gap-1">
          <h3 id="examen-estructura" className="font-semibold">
            {text.structureTitle}
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {text.structure.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="examen-niveles" className="flex flex-col gap-1">
          <h3 id="examen-niveles" className="font-semibold">
            {text.levelsTitle}
          </h3>
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
        </section>
        <section aria-labelledby="examen-sensacion" className="flex flex-col gap-1">
          <h3 id="examen-sensacion" className="font-semibold">
            {text.feelTitle}
          </h3>
          <p className="text-sm text-fg-muted">{text.feelIntro}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {text.feel.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-sm">{text.practiceNote}</p>
        </section>
      </Disclosure>
    </Card>
  );
}
