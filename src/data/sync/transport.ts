// El canal con el servidor para sincronizar (D-095). La sincronización solo conoce esta interfaz, así
// se prueba con un servidor en memoria y en producción habla con Supabase. Todo error se traduce a
// una de estas causas, que es lo que le interesa a quien muestra el estado.
import type { WireEvent, WireRecord } from '@/engines/sync';

/**
 * network, sin conexión o el servidor no respondió. auth, la sesión venció. device, este dispositivo
 * ya no es el activo de la cuenta. clock, el reloj de este dispositivo está fuera de rango. server,
 * el servidor respondió con un error. local, falló algo en este navegador
 */
export type SyncFailure = 'network' | 'auth' | 'device' | 'clock' | 'server' | 'local';

export class SyncTransportError extends Error {
  readonly failure: SyncFailure;

  constructor(failure: SyncFailure, message: string) {
    super(message);
    this.name = 'SyncTransportError';
    this.failure = failure;
  }
}

export interface PulledRecord {
  /** Contador del servidor. Crece con cada cambio, y se usa como cursor */
  seq: number;
  record: WireRecord;
}

export interface PulledEvent {
  seq: number;
  event: WireEvent;
}

/** Una página de lo que bajó. next es el cursor desde donde seguir y more dice si puede haber otra */
export interface Page<T> {
  rows: T[];
  next: number;
  more: boolean;
}

export interface SyncTransport {
  /** La hora del servidor, para comprobar que el reloj de este dispositivo es de fiar */
  serverTime(): Promise<Date>;
  pushRecords(records: readonly WireRecord[]): Promise<void>;
  /** Los registros con contador mayor que after, en orden y hasta limit */
  pullRecords(after: number, limit: number): Promise<Page<PulledRecord>>;
  pushEvents(events: readonly WireEvent[]): Promise<void>;
  pullEvents(after: number, limit: number): Promise<Page<PulledEvent>>;
}
