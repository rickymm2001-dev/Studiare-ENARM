// Entradas de ejemplo de cada motor de IA para las pruebas. Textos cortos del estilo del banco.
import type {
  BiasTipInput,
  FlashcardsInput,
  HypothesisInput,
  RestructureInput,
  WeeklyReportInput,
} from '../../engines/aiContracts.ts';

export const hypothesisInput = (overrides: Partial<HypothesisInput> = {}): HypothesisInput => ({
  rule: 'interference',
  area: 'Antibióticos en neumonía',
  recentFindings: 6,
  evidence: [
    {
      ref: 'q-01',
      kind: 'question',
      text: 'Mujer de 70 años con neumonía adquirida en la comunidad. El tratamiento ambulatorio es amoxicilina.',
    },
    {
      ref: 'q-02',
      kind: 'question',
      text: 'Hombre de 30 años con neumonía atípica. El fármaco de elección es azitromicina.',
    },
    {
      ref: 'c-03',
      kind: 'card',
      text: 'La neumonía atípica responde a macrólidos y no a penicilinas.',
    },
  ],
  causesReported: 3,
  causeMismatches: 1,
  allowedActions: ['create_contrast_card'],
  ...overrides,
});

export const weeklyReportInput = (
  overrides: Partial<WeeklyReportInput> = {},
): WeeklyReportInput => ({
  answers: 120,
  priorities: [
    { ref: 'p1', title: 'Cardiología', detail: 'Es el tema donde más fallas esta semana.' },
    { ref: 'p2', title: 'Lectura', detail: 'Lee la pregunta final antes de ver las opciones.' },
    { ref: 'p3', title: 'Descarte', detail: 'Descarta dos opciones antes de elegir.' },
  ],
  habit: { ref: 'h1', title: 'Pausas', detail: 'Haz una pausa corta cada bloque de preguntas.' },
  challenge: { ref: 'r1', title: 'Reto', detail: 'Practica diez preguntas de cardiología.' },
  ...overrides,
});

export const flashcardsInput = (overrides: Partial<FlashcardsInput> = {}): FlashcardsInput => ({
  title: 'Diabetes mellitus tipo 2',
  text: 'La metformina es el tratamiento inicial de elección en la diabetes mellitus tipo 2. La dosis habitual inicia con 500 mg una vez al día con alimentos. La hemoglobina glucosilada meta en la mayoría de los adultos es menor de 7%.',
  ...overrides,
});

export const biasTipInput = (overrides: Partial<BiasTipInput> = {}): BiasTipInput => ({
  biasKey: 'anchoring',
  biasLabel: 'Anclaje',
  baseTip: 'Antes de responder, nombra el dato del caso que no encaja con tu primera idea.',
  examples: [
    {
      ref: 'q-10',
      text: 'Mujer con dolor torácico que se atribuyó a ansiedad pero era un infarto.',
    },
    { ref: 'q-11', text: 'Lactante con fiebre que se atribuyó a dentición pero tenía otitis.' },
  ],
  ...overrides,
});

export const restructureInput = (overrides: Partial<RestructureInput> = {}): RestructureInput => ({
  questionRef: 'q-20',
  transform: 'to_except',
  stem: 'Mujer de 25 años con tirotoxicosis. ¿Cuál es el tratamiento de elección durante el primer trimestre del embarazo?',
  options: [
    { label: 'A', text: 'Propiltiouracilo', isKey: true },
    { label: 'B', text: 'Metimazol', isKey: false },
    { label: 'C', text: 'Yodo radiactivo', isKey: false },
    { label: 'D', text: 'Tiroidectomía inmediata', isKey: false },
  ],
  explanation:
    'En el primer trimestre se prefiere el propiltiouracilo porque el metimazol se asocia con malformaciones. El yodo radiactivo está contraindicado en el embarazo.',
  ...overrides,
});
