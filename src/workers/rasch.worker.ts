// Web Worker de Rasch (7.7). La calibración por lotes corre aquí para no trabar la interfaz.
import { expose } from 'comlink';
import { raschApi } from './raschApi';

expose(raschApi);
