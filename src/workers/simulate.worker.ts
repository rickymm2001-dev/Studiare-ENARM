// Web Worker de simulación. Genera los datos de demostración sin trabar la interfaz (14.4).
import { expose } from 'comlink';
import { simulateApi } from './simulateApi';

expose(simulateApi);
