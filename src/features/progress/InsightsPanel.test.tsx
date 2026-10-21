// @vitest-environment jsdom
// La nota de la fatiga en Conócete. Mientras el detector se valida con los datos de todos, la lectura de
// fatiga sigue calibrando aunque el alumno ya tenga sus sesiones largas, y en la demostración esos otros
// alumnos son simulados (B14, 3.6 y 4.7, revisión de B14 hallazgo 10)
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DataContext, type DataApi } from '@/data/context';
import type { InsightReport } from '@/engines/insights';
import { modelTexts } from '@/i18n/model';
import { InsightsPanel } from './InsightsPanel';

const report: InsightReport = {
  insights: [
    {
      id: 'fatigue',
      area: 'study',
      state: { kind: 'calibrating', have: 5, need: 3, unit: 'sessions' },
      weight: 0,
    },
  ],
  strengths: [],
  focus: [],
  totals: { answers: 0, reviews: 0, taggedErrors: 0, sessions: 0 },
};

/** Una base de demostración mínima: solo importa que `demo` no sea null, como en la app con enarm_demo */
const demoApi = {
  repos: {},
  recordEvent: () => Promise.reject(new Error('Sin base')),
  rebuildDerivedState: () => Promise.resolve(),
  demo: {
    generate: () => Promise.reject(new Error('Sin base')),
    regenerate: () => Promise.reject(new Error('Sin base')),
    clear: () => Promise.resolve(),
  },
  deleteAllData: null,
} as unknown as DataApi;

describe('nota de la fatiga mientras el detector se valida', () => {
  const text = modelTexts.fatigue;

  it('con alumnos de verdad habla de los que dieron su permiso', () => {
    render(
      <MemoryRouter>
        <InsightsPanel report={report} fatigueValidation="calibrating" />
      </MemoryRouter>,
    );
    expect(screen.getByText((content) => content.includes(text.validating))).toBeInTheDocument();
    expect(screen.queryByText(/alumnos simulados de la demostración/)).toBeNull();
  });

  it('en la demostración habla de los alumnos simulados y no de los que dieron su permiso', () => {
    render(
      <DataContext.Provider value={demoApi}>
        <MemoryRouter>
          <InsightsPanel report={report} fatigueValidation="calibrating" />
        </MemoryRouter>
      </DataContext.Provider>,
    );
    expect(
      screen.getByText((content) => content.includes(text.validatingSimulated)),
    ).toBeInTheDocument();
    expect(screen.queryByText(/alumnos que dieron su permiso/)).toBeNull();
  });
});
