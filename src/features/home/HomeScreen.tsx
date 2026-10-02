// Inicio (pantalla 2). Tablero de widgets programables (9.1). Agregar, quitar, reordenar con
// botones accesibles por teclado, acomodos predefinidos y ajustes por widget. Se guarda por alumno.
import { ArrowDown, ArrowUp, Pencil, Plus, Settings2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { WidgetLayout } from '@/data/schemas/activity';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { CalibratingState, LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { PartyWidget } from '../party/PartyWidget';
import {
  addWidget,
  ALL_WIDGETS,
  layoutFromPreset,
  moveWidget,
  removeWidget,
  updateWidgetSettings,
  type Preset,
  type WidgetType,
} from './layouts';
import { buildSnapshot, type Snapshot } from './snapshot';
import { HeatmapWidget } from './widgets/HeatmapWidget';
import { DEFAULT_HEATMAP, type HeatmapSettings } from './widgets/heatmapSettings';
import { DailyGoalWidget, LevelWidget, StreakWidget, TodayWidget } from './widgets/SimpleWidgets';

export function HomeScreen() {
  return (
    <RequireSession screen="home">{(session) => <Dashboard session={session} />}</RequireSession>
  );
}

function Dashboard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const stored = useLiveData(
    () => api.repos.widgetLayouts.get(user.id).then((layout) => layout ?? null),
    [api.repos, user.id],
  );
  const [editing, setEditing] = useState(false);
  const [toAdd, setToAdd] = useState<WidgetType>('heatmap');

  if (events === undefined || stored === undefined) return <LoadingState />;
  const saved: WidgetLayout = stored ?? layoutFromPreset(user.id, 'essential');
  // El Pomodoro se mudó a Repasar. Un tablero guardado antes ya no lo muestra (D-062)
  const layout: WidgetLayout = {
    ...saved,
    widgets: saved.widgets.filter(
      (widget) => widget.type !== 'pomodoro' && widget.type !== 'exam_countdown',
    ),
  };
  const save = (next: WidgetLayout) => {
    void api.repos.widgetLayouts.put(next);
  };
  const snapshot = buildSnapshot({ events, user, settings, now: new Date() });

  return (
    <>
      <ScreenHeader
        title={t.screens.home.title}
        description={`${t.home.greeting(user.alias)}. ${t.screens.home.description}`}
        badges={session.isDemo ? <SimulatedDataLabel /> : undefined}
      />
      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant={editing ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            setEditing((value) => !value);
          }}
        >
          <Pencil aria-hidden />
          {editing ? t.home.doneEditing : t.home.edit}
        </Button>
      </div>
      {editing ? (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t.home.presetLabel}
              value={layout.preset}
              options={(['essential', 'analytic', 'competitive', 'custom'] as Preset[]).map(
                (preset) => ({
                  value: preset,
                  label: t.home.presets[preset],
                }),
              )}
              onChange={(event) => {
                const preset = event.target.value as Preset;
                if (preset !== 'custom') save(layoutFromPreset(user.id, preset));
              }}
            />
            <div className="flex items-end gap-2">
              <SelectField
                className="flex-1"
                label={t.home.addLabel}
                value={toAdd}
                options={ALL_WIDGETS.map((type) => ({ value: type, label: t.widgets.names[type] }))}
                onChange={(event) => {
                  setToAdd(event.target.value as WidgetType);
                }}
              />
              <Button
                onClick={() => {
                  save(addWidget(layout, toAdd));
                }}
              >
                <Plus aria-hidden />
                {t.home.add}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      {layout.widgets.length === 0 ? <p className="text-fg-muted">{t.home.empty}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {layout.widgets.map((widget, index) => (
          <WidgetFrame
            key={widget.id}
            name={t.widgets.names[widget.type]}
            editing={editing}
            first={index === 0}
            last={index === layout.widgets.length - 1}
            onMove={(delta) => {
              save(moveWidget(layout, widget.id, delta));
            }}
            onRemove={() => {
              save(removeWidget(layout, widget.id));
            }}
            settingsPanel={
              widget.type === 'heatmap' ? (
                <HeatmapSettingsForm
                  value={{ ...DEFAULT_HEATMAP, ...(widget.settings as Partial<HeatmapSettings>) }}
                  onChange={(next) => {
                    save(
                      updateWidgetSettings(layout, widget.id, {
                        range: next.range,
                        metric: next.metric,
                      }),
                    );
                  }}
                />
              ) : null
            }
          >
            <WidgetBody
              type={widget.type}
              settings={widget.settings}
              snapshot={snapshot}
              session={session}
            />
          </WidgetFrame>
        ))}
      </div>
    </>
  );
}

function WidgetBody({
  type,
  settings,
  snapshot,
  session,
}: {
  type: WidgetType;
  settings: Record<string, unknown>;
  snapshot: Snapshot;
  session: ReadySession;
}) {
  switch (type) {
    case 'heatmap':
      return (
        <HeatmapWidget
          snapshot={snapshot}
          settings={{ ...DEFAULT_HEATMAP, ...(settings as Partial<HeatmapSettings>) }}
        />
      );
    case 'streak':
      return <StreakWidget snapshot={snapshot} />;
    case 'level_xp':
      return <LevelWidget snapshot={snapshot} />;
    case 'today':
      return <TodayWidget snapshot={snapshot} />;
    case 'daily_goal':
      return <DailyGoalWidget snapshot={snapshot} />;
    case 'party_challenge':
      return <PartyWidget session={session} snapshot={snapshot} />;
    case 'bias_pattern':
      return <CalibratingState current={0} target={40} unit={t.states.exampleUnit} />;
    default:
      return <p className="text-sm text-fg-muted">{t.home.comingSoon}</p>;
  }
}

function WidgetFrame({
  name,
  editing,
  first,
  last,
  onMove,
  onRemove,
  settingsPanel,
  children,
}: {
  name: string;
  editing: boolean;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  settingsPanel: ReactNode;
  children: ReactNode;
}) {
  const [showSettings, setShowSettings] = useState(false);
  return (
    <Card aria-label={name}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{name}</CardTitle>
        <div className="flex gap-1">
          {settingsPanel ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.home.settings(name)}
              aria-expanded={showSettings}
              onClick={() => {
                setShowSettings((value) => !value);
              }}
            >
              <Settings2 aria-hidden />
            </Button>
          ) : null}
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.home.moveUp(name)}
                disabled={first}
                onClick={() => {
                  onMove(-1);
                }}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.home.moveDown(name)}
                disabled={last}
                onClick={() => {
                  onMove(1);
                }}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.home.remove(name)}
                onClick={onRemove}
              >
                <X aria-hidden />
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      {showSettings ? <div className="mb-3 rounded-md bg-muted p-3">{settingsPanel}</div> : null}
      {children}
    </Card>
  );
}

function HeatmapSettingsForm({
  value,
  onChange,
}: {
  value: HeatmapSettings;
  onChange: (next: HeatmapSettings) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label={t.widgets.heatmap.range}
        value={String(value.range)}
        options={[90, 180, 365].map((n) => ({
          value: String(n),
          label: t.widgets.heatmap.days(n),
        }))}
        onChange={(event) => {
          onChange({ ...value, range: Number(event.target.value) as HeatmapSettings['range'] });
        }}
      />
      <SelectField
        label={t.widgets.heatmap.metric}
        value={value.metric}
        options={(['cards', 'questions', 'focusMinutes'] as const).map((metric) => ({
          value: metric,
          label: t.widgets.heatmap.metrics[metric],
        }))}
        onChange={(event) => {
          onChange({ ...value, metric: event.target.value as HeatmapSettings['metric'] });
        }}
      />
    </div>
  );
}
