// Opción del simulador para dirigir las opciones a las trampas que más atrapan al alumno (D-080). Mientras no
// hay suficientes errores con trampa etiquetada dice cuánto falta y no ofrece nada, así no se dirige a ciegas
// (4.3). Lee el modelo del alumno (B14, 4.3). Mientras SimulatorSetupScreen y la práctica de inglés no pasen
// el modelo, report sigue valiendo y dice lo mismo, porque sale del mismo cálculo.
// Con variant status no ofrece la casilla y solo dice en qué va. Es lo que muestra el modo Dirigido de
// Armar tu simulador (D-150), donde elegir el modo ya es encenderlo.
import type { StudentModel } from '@/data/model/contracts';
import type { InsightReport } from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import { CheckboxField } from '@/ui/components/field';
import { CalibratingNote } from '@/ui/states/states';
import { targetedViewOf } from './targetedView';

export function TargetedSamplingField({
  model,
  report,
  checked,
  onChange,
  variant = 'checkbox',
}: {
  /** El modelo del alumno. undefined mientras carga */
  model?: StudentModel | undefined;
  /** El informe de Conócete, que vale hasta que todos los que pintan este campo pasen el modelo */
  report?: InsightReport | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** status solo informa, sin casilla, porque el modo elegido ya lo enciende */
  variant?: 'checkbox' | 'status';
}) {
  const text = t.simulator.targeted;
  const view = targetedViewOf(model, report);
  if (view === null) return <p className="text-sm text-fg-muted">{text.loading}</p>;

  if (view.kind === 'calibrating') {
    return (
      <div className="flex flex-col gap-1.5">
        {variant === 'checkbox' ? <p className="text-sm font-medium">{text.label}</p> : null}
        <CalibratingNote current={view.have} target={view.need} unit={text.unit} />
        <p className="text-sm text-fg-muted">{text.calibrating}</p>
      </div>
    );
  }
  if (view.kind === 'none') {
    return (
      <div className="flex flex-col gap-0.5">
        {variant === 'checkbox' ? <p className="text-sm font-medium">{text.label}</p> : null}
        <p className="text-sm text-fg-muted">{text.none}</p>
      </div>
    );
  }
  if (variant === 'status') {
    return (
      <p role="status" className="text-sm text-fg">
        {text.hint(view.names.join(', '))}
      </p>
    );
  }
  return (
    <CheckboxField
      label={text.label}
      hint={text.hint(view.names.join(', '))}
      checked={checked}
      onChange={(event) => {
        onChange(event.target.checked);
      }}
    />
  );
}
