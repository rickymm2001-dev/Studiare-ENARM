// Aviso de que una sesión empezó con menos preguntas de las pedidas (B11, 5.4 del plan de B11). La
// práctica y el examen arrancan con lo que el servidor concedió y el marco de la app dice por qué faltó
// lo demás, aunque ya se esté en la pregunta. Vive en memoria y se quita con Entendido.
import { create } from 'zustand';
import type { ShortfallReason } from '@/data/bank/quota';

export interface BankNotice {
  reason: ShortfallReason;
  granted: number;
  requested: number;
  /** Con el freno, la hora en que puede volver a pedir */
  retryAt: string | null;
}

export const useBankNotice = create<{
  notice: BankNotice | null;
  show: (notice: BankNotice) => void;
  clear: () => void;
}>()((set) => ({
  notice: null,
  show: (notice) => {
    set({ notice });
  },
  clear: () => {
    set({ notice: null });
  },
}));
