// Quién gana con los datos opcionales entre dispositivos (H29, B9)
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DETAIL_VALUES,
  detailColumns,
  parseRemoteDetails,
  planDetailsSync,
  type DetailsSide,
} from './accountDetails';

const EARLY = '2026-10-12T09:00:00.000Z';
const LATE = '2026-10-13T09:00:00.000Z';
const filled = { ...EMPTY_DETAIL_VALUES, birthYear: 1996, sex: 'female' as const, attempt: 2 };
const side = (values: Partial<DetailsSide['values']>, changedAt: string | null): DetailsSide => ({
  values: { ...EMPTY_DETAIL_VALUES, ...values },
  changedAt,
});

describe('planDetailsSync', () => {
  it('un dispositivo sin fecha ni datos nunca manda vacíos y baja lo de la nube', () => {
    expect(planDetailsSync(side({}, null), side(filled, EARLY))).toEqual({
      push: null,
      pull: { values: filled, changedAt: EARLY },
    });
    // Sin fecha en la nube también baja, campo por campo
    expect(planDetailsSync(side({}, null), side(filled, null))).toEqual({
      push: null,
      pull: { values: { birthYear: 1996, sex: 'female', attempt: 2 }, changedAt: null },
    });
  });

  it('gana la versión más reciente completa, también un dato que el alumno borró', () => {
    const plan = planDetailsSync(side({ sex: 'female' }, LATE), side(filled, EARLY));
    expect(plan.pull).toBeNull();
    expect(plan.push).toEqual({
      birth_year: null,
      sex: 'female',
      state: null,
      situation: null,
      attempt: null,
      target_specialty: null,
      details_changed_at: LATE,
    });
    expect(planDetailsSync(side(filled, EARLY), side({ sex: 'male' }, LATE))).toEqual({
      push: null,
      pull: { values: { ...EMPTY_DETAIL_VALUES, sex: 'male' }, changedAt: LATE },
    });
  });

  it('una fecha conocida gana a una desconocida', () => {
    expect(planDetailsSync(side({ attempt: 1 }, EARLY), side(filled, null)).push).toMatchObject({
      attempt: 1,
      birth_year: null,
      details_changed_at: EARLY,
    });
  });

  it('con la misma fecha no hace nada si coinciden y manda este dispositivo si no', () => {
    expect(planDetailsSync(side(filled, EARLY), side(filled, EARLY))).toEqual({
      push: null,
      pull: null,
    });
    expect(planDetailsSync(side({ attempt: 3 }, EARLY), side(filled, EARLY)).push).toMatchObject({
      attempt: 3,
      details_changed_at: EARLY,
    });
  });

  it('sin fechas en ningún lado junta campo por campo y en un choque gana la nube', () => {
    expect(
      planDetailsSync(
        side({ sex: 'male', state: 'YUC' }, null),
        side({ sex: 'female', attempt: 2 }, null),
      ),
    ).toEqual({
      push: { state: 'YUC' },
      pull: { values: { sex: 'female', attempt: 2 }, changedAt: null },
    });
    expect(planDetailsSync(side(filled, null), side(filled, null))).toEqual({
      push: null,
      pull: null,
    });
  });
});

describe('la fila de la nube', () => {
  it('valida cada dato con el esquema de la cuenta y nombra las columnas de la tabla', () => {
    expect(
      parseRemoteDetails({
        birth_year: 1996,
        sex: 'robot',
        state: 'YUC',
        target_specialty: 'Pediatría',
        details_changed_at: '2026-10-13T09:00:00+00:00',
      }),
    ).toEqual({
      values: { ...EMPTY_DETAIL_VALUES, birthYear: 1996, state: 'YUC' },
      changedAt: LATE,
    });
    expect(parseRemoteDetails(null)).toEqual({ values: EMPTY_DETAIL_VALUES, changedAt: null });
    expect(detailColumns({ targetSpecialty: 'pediatrics', attempt: null })).toEqual({
      target_specialty: 'pediatrics',
      attempt: null,
    });
  });
});
