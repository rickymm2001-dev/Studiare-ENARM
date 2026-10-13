// Ajustes del repaso (B3 del plan del cambio, comentario 4). Todo lo que se guarda del repaso vive
// en este panel de Repasar y en ningún otro lugar. Metas del día, al estudiar, temporizador, días
// fáciles, repaso avanzado de FSRS, las ayudas de carga diaria y el Pomodoro. En el teléfono ocupa
// toda la pantalla y en computadora es una hoja a la derecha. Lo que se elige para una sola sesión,
// como el modo o los mazos, se queda en Qué quieres repasar.
import { SlidersHorizontal, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { useDataApi } from '@/data/context';
import { updateProfile } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { scrollToElement } from '@/ui/scroll';
import { PomodoroSettingsForm } from '../../pomodoro/Pomodoro';
import type { ReadySession } from '../../shared/RequireSession';
import type { ReviewSettingsFocus } from './panelParam';
import { StudySettingsForm } from './StudySettingsForm';

/** Dentro del panel no hay barra de navegación abajo, así que la barra de guardar va cerca del borde */
const PANEL_SAVE_BAR = 'bottom-3 lg:bottom-3';

/** Botón secundario que abre el panel, a la altura del título de Repasar */
export function ReviewSettingsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onOpen}>
      <SlidersHorizontal aria-hidden />
      {t.settingsPage.reviewSettings.open}
    </Button>
  );
}

export function ReviewSettingsDialog({
  session,
  focus,
  onClose,
  dailyLoad,
}: {
  session: ReadySession;
  /** Parte a la que se va al abrir. null con el panel cerrado */
  focus: ReviewSettingsFocus | null;
  onClose: () => void;
  /** Ayudas de carga diaria, que necesitan las tarjetas y la bitácora que tiene Repasar */
  dailyLoad?: ReactNode;
}) {
  const text = t.settingsPage.reviewSettings;
  return (
    <Dialog.Root
      open={focus !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-surface shadow-raised sm:left-auto sm:w-full sm:max-w-2xl sm:border-l sm:border-line">
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Dialog.Title className="text-lg font-bold">{text.title}</Dialog.Title>
              <Dialog.Description className="text-sm text-fg-muted">
                {text.description}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label={text.close}
              className="flex size-touch shrink-0 items-center justify-center rounded-md hover:bg-muted"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <PanelBody session={session} focus={focus ?? 'all'} dailyLoad={dailyLoad} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** El contenido se monta al abrir, así cada vez empieza con lo guardado */
function PanelBody({
  session,
  focus,
  dailyLoad,
}: {
  session: ReadySession;
  focus: ReviewSettingsFocus;
  dailyLoad?: ReactNode;
}) {
  const api = useDataApi();
  const { user, settings } = session;
  const pomodoro = useRef<HTMLElement>(null);
  // Abierto desde el engrane del Pomodoro, el panel empieza en sus ajustes
  useEffect(() => {
    if (focus === 'pomodoro') scrollToElement(pomodoro.current);
  }, [focus]);
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <PanelSection id="ajustes-metas" title={t.settings.goalsTitle}>
        <StudySettingsForm
          userId={user.id}
          settings={settings}
          saveBarClassName={PANEL_SAVE_BAR}
          onSave={(patch) => updateProfile(api, user, { settings: patch })}
        />
      </PanelSection>
      {dailyLoad ? (
        <PanelSection id="ajustes-carga" title={t.dailyLoad.title}>
          {dailyLoad}
        </PanelSection>
      ) : null}
      <PanelSection ref={pomodoro} id="ajustes-pomodoro" title={t.settings.pomodoroTitle}>
        <PomodoroSettingsForm
          value={settings.pomodoro}
          saveBarClassName={PANEL_SAVE_BAR}
          onSave={async (next) => {
            await updateProfile(api, user, { settings: { pomodoro: next } });
          }}
        />
      </PanelSection>
      {/* B15. Recordatorios por correo (respuesta 81). Van aquí como su propia PanelSection, después
          del Pomodoro, y se guardan con los demás ajustes del alumno */}
    </div>
  );
}

/** Una parte del panel con su título y una línea arriba, sin tarjetas dentro de tarjetas (H06) */
function PanelSection({
  id,
  title,
  children,
  ref,
}: {
  id: string;
  title: string;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={ref}
      aria-labelledby={`${id}-titulo`}
      className="flex scroll-mt-4 flex-col gap-3 border-t border-line pt-4 first:border-t-0 first:pt-0"
    >
      <h3 id={`${id}-titulo`} className="text-base font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}
