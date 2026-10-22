// Guía de métodos de estudio (V4-B4). Tres métodos con sus pasos, cada uno plegado, y la herramienta
// de Studiare que le sirve. El texto es fijo y propio, no sale de la IA.
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';

export function StudyMethodsCard() {
  const text = t.studyMethods;
  return (
    <Card aria-labelledby="metodos-titulo">
      <CardHeader className="mb-3">
        <CardTitle id="metodos-titulo">{text.title}</CardTitle>
        <CardDescription>{text.intro}</CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-2">
        {text.methods.map((method) => (
          <Disclosure key={method.key} title={method.name} summary={method.summary}>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
              {method.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-sm font-medium text-fg-muted">{method.tool}</p>
          </Disclosure>
        ))}
      </div>
    </Card>
  );
}
