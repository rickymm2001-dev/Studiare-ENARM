// Guardado automático de un apunte (D-092). Es una clase y no un hook para guardar sin depender de
// cuándo React repinta. Espera un instante después de cada cambio, nunca corre dos guardados a la
// vez y, si el alumno siguió escribiendo mientras guardaba, programa otro. Al soltarla guarda lo que
// quede pendiente sin esperar, para no perder lo último que escribió al salir de la pantalla.
import type { OutlineLine, OutlinePage } from '@/data/schemas/outlines';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface AutosaveSnapshot {
  lines: readonly OutlineLine[];
  tags: readonly string[];
}

export interface AutosaveHandlers {
  save: (snapshot: AutosaveSnapshot) => Promise<OutlinePage>;
  onStatus: (status: SaveStatus) => void;
  onSaved: (page: OutlinePage) => void;
}

export class OutlineAutosaver {
  private readonly delay: number;
  private handlers: AutosaveHandlers | null = null;
  private snapshot: AutosaveSnapshot = { lines: [], tags: [] };
  private version = 0;
  private savedVersion = 0;
  private failed = false;
  private disposed = false;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(delay: number) {
    this.delay = delay;
  }

  configure(handlers: AutosaveHandlers): void {
    this.handlers = handlers;
    this.disposed = false;
  }

  /** Lo más reciente que tiene el alumno en pantalla */
  setSnapshot(snapshot: AutosaveSnapshot): void {
    this.snapshot = snapshot;
  }

  /** Si hay cambios que todavía no se guardan */
  hasPending(): boolean {
    return this.version !== this.savedVersion;
  }

  /** El alumno cambió algo. Programa el guardado para dentro de un instante */
  touch(): void {
    this.version += 1;
    this.failed = false;
    this.handlers?.onStatus(this.running ? 'saving' : 'dirty');
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delay);
  }

  /** Guarda ya lo que esté pendiente. Si hay un guardado en curso espera a que termine */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    while (this.running) await this.running;
    if (!this.hasPending() || !this.handlers) return;
    const handlers = this.handlers;
    const startedAt = this.version;
    const job = (async () => {
      if (!this.disposed) handlers.onStatus('saving');
      try {
        const page = await handlers.save(this.snapshot);
        this.savedVersion = startedAt;
        this.failed = false;
        if (this.disposed) return;
        handlers.onSaved(page);
        handlers.onStatus(this.hasPending() ? 'dirty' : 'saved');
      } catch {
        this.failed = true;
        if (!this.disposed) handlers.onStatus('error');
      }
    })();
    this.running = job;
    try {
      await job;
    } finally {
      this.running = null;
    }
    // Si siguió escribiendo mientras se guardaba, queda otro guardado programado
    if (!this.disposed && this.hasPending() && !this.failed) this.schedule();
  }

  /** Suelta el guardador. Lo pendiente se guarda una última vez y ya no avisa a la pantalla */
  dispose(): void {
    clearTimeout(this.timer);
    this.disposed = true;
    if (this.hasPending()) void this.flush();
  }
}
