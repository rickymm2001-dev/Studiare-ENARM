// Generado por scripts/content/sync-bank-shared.ts desde src/demo/content/structure-dict.json. No lo edites a mano. Cambia el
// original y corre npm run bank:shared.
import type { StructureDictionary } from './types.ts';

export const structureDictionary: StructureDictionary = {
  version: 2,
  status: 'pending_physician_review',
  negations: [
    {
      id: 'excepto',
      pattern: 'excepto',
      kind: 'exception',
    },
    {
      id: 'a-excepcion-de',
      pattern: 'a excepcion de',
      kind: 'exception',
    },
    {
      id: 'salvo',
      pattern: 'salvo',
      kind: 'exception',
    },
    {
      id: 'no',
      pattern: 'no',
      kind: 'negation',
    },
    {
      id: 'nunca',
      pattern: 'nunca',
      kind: 'negation',
    },
    {
      id: 'incorrecta',
      pattern: 'incorrect[oa]s?',
      kind: 'false_statement',
    },
    {
      id: 'falsa',
      pattern: 'fals[oa]s?',
      kind: 'false_statement',
    },
    {
      id: 'menos',
      pattern:
        'menos (?:probables?|frecuentes?|utiles?|indicad[oa]s?|asociad[oa]s?|adecuad[oa]s?|apropiad[oa]s?|recomendad[oa]s?|recomendables?|comun(?:es)?|sugestiv[oa]s?|caracteristic[oa]s?|eficaz|efectiv[oa]s?|util)',
      kind: 'least_likely',
    },
    {
      id: 'contraindicado',
      pattern: 'contraindicad[oa]s?',
      kind: 'contraindication',
    },
    {
      id: 'contraindicacion',
      pattern: 'contraindicacion(?:es)?',
      kind: 'contraindication',
    },
  ],
  falsePositives: [
    'al menos',
    'por lo menos',
    'menos de',
    'no obstante',
    'si no',
    'en caso de no',
    'aun cuando no',
  ],
  english: {
    negations: [
      {
        id: 'not',
        pattern: 'not',
        kind: 'negation',
      },
      {
        id: 'cannot',
        pattern: 'cannot',
        kind: 'negation',
      },
      {
        id: 'contraction',
        pattern: "[a-z]+n['’]t",
        kind: 'negation',
      },
      {
        id: 'never',
        pattern: 'never',
        kind: 'negation',
      },
      {
        id: 'except',
        pattern: 'except(?: for)?',
        kind: 'exception',
      },
      {
        id: 'with-the-exception-of',
        pattern: 'with the exception of',
        kind: 'exception',
      },
      {
        id: 'other-than',
        pattern: 'other than',
        kind: 'exception',
      },
      {
        id: 'apart-from',
        pattern: 'apart from',
        kind: 'exception',
      },
      {
        id: 'excluding',
        pattern: 'excluding',
        kind: 'exception',
      },
      {
        id: 'false',
        pattern: 'false',
        kind: 'false_statement',
      },
      {
        id: 'incorrect',
        pattern: 'incorrect(?:ly)?',
        kind: 'false_statement',
      },
      {
        id: 'untrue',
        pattern: 'untrue',
        kind: 'false_statement',
      },
      {
        id: 'inaccurate',
        pattern: 'inaccurate',
        kind: 'false_statement',
      },
      {
        id: 'least',
        pattern:
          'least\\s+(?:likely|common|commonly|frequent|frequently|probable|appropriate|useful|helpful|effective|beneficial|indicated|recommended|associated|consistent|characteristic|suggestive|accurate|supported|important|relevant|reliable|expected|typical|serious)',
        kind: 'least_likely',
      },
      {
        id: 'most-unlikely',
        pattern: 'most\\s+unlikely',
        kind: 'least_likely',
      },
      {
        id: 'contraindicated',
        pattern: 'contraindicat(?:ed|ion|ions)',
        kind: 'contraindication',
      },
    ],
    falsePositives: [
      'not only',
      'not just',
      'whether or not',
      'or not',
      'if not',
      'at least',
      'at the very least',
      'false (?:positives?|negatives?|labor|aneurysms?)',
      "(?:does|do|did|has|have|had|is|are|was|were)(?: not|n['’]t)(?: yet)? (?:respond|responding|responded|improve|improving|improved|tolerate|tolerating|tolerated|resolve|resolving|resolved)",
    ],
  },
  tasks: [
    {
      task: 'treatment_of_choice',
      patterns: [
        'tratamiento de eleccion',
        'farmaco de eleccion',
        'antibiotico de eleccion',
        'manejo de eleccion',
        'tratamiento definitivo',
      ],
    },
    {
      task: 'initial_treatment',
      patterns: [
        'tratamiento inicial',
        'manejo inicial',
        'medida inicial',
        'farmaco inicial',
        'primera linea',
        'tratamiento de primera',
      ],
    },
    {
      task: 'confirmatory_study',
      patterns: [
        'estudio de eleccion',
        'estandar de oro',
        'patron de oro',
        'confirma(?:r|ria)? el diagnostico',
        'estudio confirmatorio',
        'prueba confirmatoria',
        'diagnostico definitivo',
      ],
    },
    {
      task: 'initial_study',
      patterns: [
        'estudio inicial',
        'primer estudio',
        'estudio de primera',
        'prueba inicial',
        'primera prueba',
        'abordaje inicial',
      ],
    },
    {
      task: 'next_step',
      patterns: [
        'siguiente paso',
        'paso a seguir',
        'conducta a seguir',
        'conducta mas (?:apropiada|adecuada)',
        'que (?:debe|deberia) hacer',
        'manejo inmediato',
        'accion inmediata',
      ],
    },
    {
      task: 'prevention_screening',
      patterns: [
        'tamizaje',
        'cribado',
        'prevencion',
        'prevenir',
        'profilaxis',
        'vacuna',
        'deteccion oportuna',
      ],
    },
    {
      task: 'complication_prognosis',
      patterns: ['complicacion(?:es)?', 'pronostico', 'secuelas?', 'mortalidad'],
    },
    {
      task: 'risk_factor',
      patterns: [
        'factor(?:es)? de riesgo',
        'etiologia',
        'agente (?:causal|etiologico)',
        'causa mas (?:frecuente|comun|probable)',
      ],
    },
    {
      task: 'mechanism',
      patterns: ['mecanismo', 'fisiopatologi(?:a|co|ca)'],
    },
    {
      task: 'data_interpretation',
      patterns: [
        'interpretacion',
        '(?:el|la|los|las) (?:electrocardiograma|radiografia|tomografia|imagen|gasometria|biometria|resultados?|estudios?|laboratorios?) (?:muestra|muestran|indica|indican|reporta|reportan|sugiere|sugieren)',
        'que indica (?:el|la|este|esta)',
        'hallazgo',
      ],
    },
    {
      task: 'diagnosis',
      patterns: [
        'diagnostico',
        'padece',
        'cuadro clinico',
        'entidad',
        'que (?:tiene|presenta) (?:el|la) paciente',
      ],
    },
  ],
};
