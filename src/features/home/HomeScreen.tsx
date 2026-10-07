// Inicio (pantalla 2). Tablero de widgets programables (9.1). Agregar, quitar, reordenar con
// botones accesibles por teclado, acomodos predefinidos y ajustes por widget. Se guarda por alumno.
import { ArrowDown, ArrowUp, Pencil, Plus, Settings2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { WidgetLayout } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import { studyDayOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { LoadingState } from '@/ui/states/states';
import { useSession } from '@/app/session';
import { LandingScreen } from '../landing/LandingScreen';
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
  WIDGETS_WITH_SETTINGS,
  type Preset,
  type WidgetType,
} from './layouts';
import { followedDeckIds } from '../decks/followed';
import { buildSnapshot, type Snapshot } from './snapshot';
import {
  BiasPatternWidget,
  FutureLoadWidget,
  LatestHypothesisWidget,
  WeakTopicsWidget,
} from './widgets/AnalysisWidgets';
import { HeatmapWidget } from './widgets/HeatmapWidget';
import { DEFAULT_HEATMAP, type HeatmapSettings } from './widgets/heatmapSettings';
import { DailyGoalWidget, LevelWidget, StreakWidget, TodayWidget } from './widgets/SimpleWidgets';
import { WidgetSettingsForm } from './widgets/WidgetSettingsForm';

export function HomeScreen() {
  // Sin sesión, la raíz es la portada de venta (D-068)
  const session = useSession();
  if (session.status === 'signed-out') return <LandingScreen />;
  return <RequireSession screen="home">{(ready) => <Dashboard session={ready} />}</RequireSession>;
}

function Dashboard({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const stored = useLiveData(
    () => api.repos.widgetLayouts.get(user.id).then((layout) => layout ?? null),
    [api.repos, user.id],
  );
  // Las tarjetas que Repasar sí ofrece, para que Hoy cuente lo mismo
  const cards = useLiveData(async () => {
    const [decks, all] = await Promise.all([api.repos.decks.list(), api.repos.cards.list()]);
    const followed = followedDeckIds(session, decks);
    return new Set(all.filter((card) => followed.has(card.deckId)).map((card) => card.id));
  }, [api.repos, session.isDemo, session.user.id, session.settings.followedDecks.join(',')]);
  const [editing, setEditing] = useState(false);
  const [toAdd, setToAdd] = useState<WidgetType>('heatmap');

  if (events === undefined || stored === undefined || cards === undefined) return <LoadingState />;
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
  const snapshot = buildSnapshot({
    events,
    user,
    settings,
    now: new Date(),
    activeCardIds: cards,
  });

  return (
    <>
      <ScreenHeader
        title={t.screens.home.title}
        description={`${t.home.greeting(user.alias)}. ${t.screens.home.description}`}
        stats={false}
        actions={
          <Button
            variant={editing ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={editing}
            onClick={() => {
              setEditing((value) => !value);
            }}
          >
            <Pencil aria-hidden />
            {editing ? t.home.doneEditing : t.home.edit}
          </Button>
        }
      />
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
      {/* En el teléfono racha y meta van lado a lado y lo demás a todo lo ancho (D-078). En
          computadora son dos columnas y el heatmap ocupa las dos */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {layout.widgets.map((widget, index) => (
          <WidgetFrame
            key={widget.id}
            name={t.widgets.names[widget.type]}
            className={widgetSpan(widget.type, editing)}
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
              WIDGETS_WITH_SETTINGS.has(widget.type) ? (
                <WidgetSettingsForm
                  type={widget.type}
                  settings={widget.settings}
                  onChange={(next) => {
                    save(updateWidgetSettings(layout, widget.id, next));
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
              events={events}
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
  events,
}: {
  type: WidgetType;
  settings: Record<string, unknown>;
  snapshot: Snapshot;
  session: ReadySession;
  events: readonly AppEvent[];
}) {
  switch (type) {
    case 'heatmap':
      return (
        <HeatmapWidget
          snapshot={snapshot}
          since={studyDayOf(new Date(session.user.createdAt), session.user.timeZone)}
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
      return <PartyWidget session={session} snapshot={snapshot} events={events} />;
    case 'weak_topics':
      return <WeakTopicsWidget session={session} events={events} settings={settings} />;
    case 'bias_pattern':
      return <BiasPatternWidget session={session} events={events} settings={settings} />;
    case 'future_load':
      return <FutureLoadWidget session={session} events={events} settings={settings} />;
    case 'latest_hypothesis':
      return <LatestHypothesisWidget session={session} events={events} settings={settings} />;
    default:
      // El Pomodoro y la cuenta regresiva ya no son widgets y el tablero los filtra
      return null;
  }
}

/** Widgets chicos que en el teléfono comparten renglón de dos en dos */
const HALF_ON_PHONE: ReadonlySet<WidgetType> = new Set(['streak', 'daily_goal']);

/**
 * Columnas que ocupa cada widget. Al editar todos van a todo lo ancho para que quepan los botones
 * de subir, bajar y quitar
 */
function widgetSpan(type: WidgetType, editing: boolean): string {
  if (editing) return 'col-span-2 md:col-span-1';
  return cn(
    HALF_ON_PHONE.has(type) ? 'col-span-1' : 'col-span-2',
    type === 'heatmap' ? 'md:col-span-2' : 'md:col-span-1',
  );
}

function WidgetFrame({
  name,
  className,
  editing,
  first,
  last,
  onMove,
  onRemove,
  settingsPanel,
  children,
}: {
  name: string;
  className?: string;
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
    <Card aria-label={name} className={className}>
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
