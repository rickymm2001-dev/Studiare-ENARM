// Opción del simulador para dirigir las opciones a las trampas que más atrapan al alumno (D-080).
// Mientras no hay suficientes errores con trampa etiquetada dice cuánto falta y no ofrece nada, así
// no se dirige a ciegas (4.3).
import { t } from '@/i18n/es-MX';
import type { InsightReport } from '@/engines/insights';
import { CheckboxField } from '@/ui/components/field';
import { CalibratingNote } from '@/ui/states/states';
import { biasCalibration, biasProfileRows } from '../progress/focusItems';

export function TargetedSamplingField({
  report,
  checked,
  onChange,
}: {
  /** El informe de Conócete del alumno. undefined mientras carga */
  report: InsightReport | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const text = t.simulator.targeted;
  if (report === undefined) return <p className="text-sm text-fg-muted">{text.loading}</p>;

  const calibration = biasCalibration(report);
  if (calibration) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{text.label}</p>
        <CalibratingNote current={calibration.have} target={calibration.need} unit={text.unit} />
        <p className="text-sm text-fg-muted">{text.calibrating}</p>
      </div>
    );
  }

  const rows = biasProfileRows(report);
  if (rows.length === 0) {
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
      hint={text.hint(rows.map((row) => row.name).join(', '))}
      checked={checked}
      onChange={(event) => {
        onChange(event.target.checked);
      }}
    />
  );
}
