// Opción del simulador para dirigir las opciones a las trampas que más atrapan al alumno (D-080). Mientras no
// hay suficientes errores con trampa etiquetada dice cuánto falta y no ofrece nada, así no se dirige a ciegas
// (4.3). Lee el modelo del alumno (B14, 4.3). Mientras SimulatorSetupScreen y la práctica de inglés no pasen
// el modelo, report sigue valiendo y dice lo mismo, porque sale del mismo cálculo.
import type { StudentModel } from '@/data/model/contracts';
import type { InsightReport } from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import { CheckboxField } from '@/ui/components/field';
import { CalibratingNote } from '@/ui/states/states';
import { targetedFromModel, targetedFromReport } from './targetedView';

export function TargetedSamplingField({
  model,
  report,
  checked,
  onChange,
}: {
  /** El modelo del alumno. undefined mientras carga */
  model?: StudentModel | undefined;
  /** El informe de Conócete, que vale hasta que todos los que pintan este campo pasen el modelo */
  report?: InsightReport | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const text = t.simulator.targeted;
  const view =
    model !== undefined ? targetedFromModel(model) : report ? targetedFromReport(report) : null;
  if (view === null) return <p className="text-sm text-fg-muted">{text.loading}</p>;

  if (view.kind === 'calibrating') {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{text.label}</p>
        <CalibratingNote current={view.have} target={view.need} unit={text.unit} />
        <p className="text-sm text-fg-muted">{text.calibrating}</p>
      </div>
    );
  }
  if (view.kind === 'none') {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{text.label}</p>
        <p className="text-sm text-fg-muted">{text.none}</p>
      </div>
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
