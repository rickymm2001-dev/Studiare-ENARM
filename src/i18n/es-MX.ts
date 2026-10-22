// Todos los textos de la interfaz, en español de México con trato de tú (4.9).
// El código usa claves en inglés y nunca escribe texto visible fuera de los módulos de src/i18n.
// Este archivo compone el idioma completo y solo lo importan las pantallas, que cargan por demanda, y las
// pruebas. El armazón de la app importa de core.ts, para que el JavaScript inicial no cargue los textos de
// todas las pantallas (14.4)
import { accountsText } from './accounts';
import { calendarText } from './calendar';
import { cardSearchText } from './cardSearch';
import { examText } from './exam';
import { examReviewText } from './examReview';
import { featureText } from './features';
import { outlineText } from './outlines';
import { partyCloudText } from './partyCloud';
import { qualityText } from './quality';
import { examGuideText } from './examGuide';
import { settingsPageText } from './settingsPage';
import { studyMethodsText } from './studyMethods';
import { tutorText } from './tutor';
import { vocabularyText } from './vocabulary';
import { weekPlanText } from './weekPlan';
import { b7ExtrasText } from './b7extras';
import { freePlanText } from './freePlan';
import { cloudBankText } from './cloudBank';
import { t as coreText } from './core';

// cloud, accounts, headerStats y levelLadder de core son partes de los bloques completos, que ya traen esas
// mismas piezas desde shell.ts, así que aquí no se mezclan
const {
  cloud: _cloud,
  accounts: _accounts,
  headerStats: _hs,
  levelLadder: _ll,
  ...coreRest
} = coreText;

export const t = {
  ...featureText,
  ...examText,
  ...outlineText,
  ...qualityText,
  ...tutorText,
  ...vocabularyText,
  ...cardSearchText,
  ...studyMethodsText,
  ...calendarText,
  ...examGuideText,
  weekPlan: weekPlanText,
  examReview: examReviewText,
  partyCloud: partyCloudText,
  ...coreRest,
  accounts: accountsText,
  // Modo enfoque, resumen semanal, enlace de referidos y producción sin demo (B7 del plan del cambio)
  b7: b7ExtrasText,
  settingsPage: settingsPageText,
  // Candados del plan Gratis con su vista previa (B8 del plan del cambio)
  freePlan: freePlanText,
  // Banco en la nube y Google Sheets (B11 del plan del cambio). Del alumno y del admin
  cloudBank: cloudBankText,
} as const;
