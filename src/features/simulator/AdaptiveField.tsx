// Opción del simulador para que la práctica elija preguntas cerca del nivel del alumno (B14, 4.5 del plan,
// respuesta 89). Mientras lo que eligió no tenga suficientes preguntas con dificultad calculada con las
// respuestas de otros alumnos dice calibrando y cuántas hay, y no ofrece nada, igual que las opciones
// dirigidas a las trampas (4.3). Abierto en todos los planes: no da más preguntas, solo cambia cuáles se
// eligen de las que ya le tocan.
import type { AdaptiveAvailability } from '@/data/model/contracts';
import { adaptiveTexts as text } from '@/i18n/adaptive';
import { CheckboxField } from '@/ui/components/field';
import { CalibratingNote } from '@/ui/states/states';

export function AdaptiveField({
  availability,
  checked,
  onChange,
}: {
  /** Cuántas preguntas calibradas hay en lo elegido. undefined mientras carga */
  availability: AdaptiveAvailability | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  if (availability === undefined) return <p className="text-sm text-fg-muted">{text.loading}</p>;

  if (!availability.available) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{text.label}</p>
        <CalibratingNote
          current={availability.calibratedInScope}
          target={availability.needed}
          unit={text.unit}
        />
        <p className="text-sm text-fg-muted">{text.calibrating(availability.needed)}</p>
      </div>
    );
  }
  return (
    <CheckboxField
      label={text.label}
      hint={text.hint}
      checked={checked}
      onChange={(event) => {
        onChange(event.target.checked);
      }}
    />
  );
}
