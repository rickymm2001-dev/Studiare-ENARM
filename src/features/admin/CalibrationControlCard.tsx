// Interruptor y modo de la calibración nocturna (B14, 3.15 y 7.2 del plan de B14). Enciende o apaga la
// calibración y elige entre Solo reporte, que calcula y guarda la corrida sin cambiar nada de lo que ven
// los alumnos, y Publicar, que lo aplica todo. Pasar a Publicar pide confirmación, porque cambia lo que
// ven los alumnos desde la siguiente noche. Escribe en model_settings por el permiso por fila del admin,
// y con B9 un 42501 lleva a pedir el segundo factor.
import { useState } from 'react';
import { saveCalibrationControl } from '@/data/cloud/calibrationAdmin';
import type { ModelSettings } from '@/config/modelSettings';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { SegmentedControl } from '@/ui/components/segmented';
import { askSecondFactor } from '../physician/secondFactor';
import { bankErrorText } from './bankErrors';
import { requireCloud } from './useBankAdminQuery';

const text = calibrationAdminTexts.control;
type Mode = ModelSettings['calibration']['mode'];

export function CalibrationControlCard({
  settings,
  onChanged,
}: {
  settings: ModelSettings['calibration'];
  /** Después de guardar, para que la pantalla vuelva a leer la configuración */
  onChanged: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mode, setMode] = useState<Mode>(settings.mode);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'saved' | 'failed'; detail: string } | null>(null);

  const changed = enabled !== settings.enabled || mode !== settings.mode;
  // Lo que cambia lo que ven los alumnos es quedar encendida en Publicar
  const publishes = enabled && mode === 'apply' && (!settings.enabled || settings.mode !== 'apply');

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveCalibrationControl(await requireCloud(), { enabled, mode }, askSecondFactor);
      setMessage({ kind: 'saved', detail: text.saved });
      setConfirming(false);
      onChanged();
    } catch (caught) {
      setMessage({ kind: 'failed', detail: `${text.failed} ${bankErrorText(caught)}`.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="calibracion-control" className="flex flex-col gap-3">
      <CardHeader className="mb-0">
        <CardTitle id="calibracion-control">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      <CheckboxField
        label={text.enabled}
        hint={text.enabledHint}
        checked={enabled}
        onChange={(event) => {
          setMessage(null);
          setConfirming(false);
          setEnabled(event.target.checked);
        }}
      />
      <div className="flex flex-col gap-1.5">
        <SegmentedControl
          label={text.mode}
          options={[
            { value: 'dry_run' as const, label: calibrationAdminTexts.modes.dry_run },
            { value: 'apply' as const, label: calibrationAdminTexts.modes.apply },
          ]}
          value={mode}
          onChange={(next) => {
            setMessage(null);
            setConfirming(false);
            setMode(next);
          }}
        />
        <p className="text-sm text-fg-muted">{text.modeHint[mode]}</p>
      </div>
      {confirming ? (
        <>
          <p className="text-sm font-medium">{text.confirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                void save();
              }}
            >
              {text.confirmYes}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {text.cancel}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            disabled={busy || !changed}
            onClick={() => {
              if (publishes) setConfirming(true);
              else void save();
            }}
          >
            {text.save}
          </Button>
        </div>
      )}
      <p
        role={message?.kind === 'failed' ? 'alert' : 'status'}
        aria-live="polite"
        className={
          message?.kind === 'failed' ? 'text-sm text-danger' : 'text-sm font-medium text-success'
        }
      >
        {message?.detail ?? ''}
      </p>
    </Card>
  );
}
