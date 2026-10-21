import { describe, expect, it } from 'vitest';
import { effectiveDifficulty, effectiveDifficultyFromStats } from '@/data/bank/calibration';
import type { CalibrationState, CatalogCalibration } from '@/data/model/contracts';
import { newId } from '@/data/testing/fixtures';
import { physicianDifficultyOf } from '@/engines/studentModel';
import { question } from '../tutor/testing/fixtures';
import { cacheDifficulty, catalogDifficulty, loadMeasuredDifficulties } from './useDifficultyOf';

const VERSION = newId();
const calibration = (overrides: Partial<CatalogCalibration> = {}): CatalogCalibration => ({
  versionId: VERSION,
  state: 'calibrated',
  difficulty: 0.8,
  se: 0.2,
  students: 130,
  elo: 0.7,
  extreme: false,
  studyDay: '2026-10-15',
  ...overrides,
});

describe('dificultad de una fila del catálogo (4.4)', () => {
  it('usa la de Rasch cuando es de la versión publicada y está provisional o calibrada', () => {
    expect(catalogDifficulty({ versionId: VERSION, calibration: calibration() })).toEqual({
      logit: 0.8,
      state: 'calibrated',
      students: 130,
    });
    expect(
      catalogDifficulty({
        versionId: VERSION,
        calibration: calibration({ state: 'provisional', students: 41 }),
      }),
    ).toMatchObject({ state: 'provisional', students: 41 });
  });

  it('una calibración de otra versión no vale para la publicada', () => {
    expect(catalogDifficulty({ versionId: newId(), calibration: calibration() })).toBeNull();
  });

  it('la estimada por el médico, la extrema y la que no tiene número no cuentan como medidas', () => {
    for (const override of [
      { state: 'physician_estimate' as const },
      { extreme: true },
      { difficulty: null },
      { difficulty: Number.NaN },
    ]) {
      expect(
        catalogDifficulty({ versionId: VERSION, calibration: calibration(override) }),
      ).toBeNull();
    }
  });

  it('una fila sin la llave calibration, como las de una app anterior, no trae nada', () => {
    expect(catalogDifficulty({ versionId: VERSION })).toBeNull();
    expect(catalogDifficulty({ versionId: VERSION, calibration: null })).toBeNull();
  });
});

describe('dificultad de la caché de la demostración', () => {
  it('usa la de Rasch si se midió con alumnos', () => {
    expect(
      cacheDifficulty({ raschDifficulty: -0.4, calibration: 'provisional', responses: 52 }),
    ).toEqual({ logit: -0.4, state: 'provisional', students: 52 });
  });

  it('sin estimación o con la del médico no cuenta', () => {
    expect(
      cacheDifficulty({ raschDifficulty: null, calibration: 'calibrated', responses: 200 }),
    ).toBeNull();
    expect(
      cacheDifficulty({ raschDifficulty: 0.2, calibration: 'physician_estimate', responses: 10 }),
    ).toBeNull();
  });
});

describe('dificultades medidas de lo que contestó', () => {
  const a = question({ id: newId() });
  const b = question({ id: newId() });
  const api = {
    repos: {
      catalog: {
        getByVersion: (id: string) =>
          Promise.resolve(
            id === a.id
              ? {
                  versionId: a.id,
                  calibration: calibration({ versionId: a.id }),
                }
              : undefined,
          ),
      },
      caches: {
        itemStats: {
          get: (id: string) =>
            Promise.resolve(
              id === b.id
                ? { raschDifficulty: 1.1, calibration: 'calibrated' as const, responses: 150 }
                : undefined,
            ),
        },
      },
    },
  } as unknown as Parameters<typeof loadMeasuredDifficulties>[0];

  it('con el banco de la nube lee el catálogo y deja fuera lo que no tiene calibración', async () => {
    const found = await loadMeasuredDifficulties(api, 'cloud', [a, b]);
    expect([...found.keys()]).toEqual([a.id]);
    expect(found.get(a.id)?.logit).toBe(0.8);
  });

  it('en la demostración lee la caché de estadísticas', async () => {
    const found = await loadMeasuredDifficulties(api, 'local', [a, b]);
    expect([...found.keys()]).toEqual([b.id]);
    expect(found.get(b.id)).toEqual({ logit: 1.1, state: 'calibrated', students: 150 });
  });
});

// El modelo del alumno (Progreso, Inicio, el Tutor) y el banco (Simular, los filtros de dificultad) cuentan
// la dificultad cada uno con su función. Aquí se vigila que den lo mismo, para que una pregunta Media sea la
// misma en todos lados (4.4)
describe('la dificultad del modelo y la del banco son la misma', () => {
  const physician = 4;
  const subject = question({ id: VERSION, physicianDifficulty: physician });
  const fromModel = (found: ReturnType<typeof catalogDifficulty>) =>
    found ?? physicianDifficultyOf(subject);

  it('con el catálogo de la nube, en cada estado y en sus bordes', () => {
    const states: CalibrationState[] = ['physician_estimate', 'provisional', 'calibrated'];
    const cases = states.flatMap((state) =>
      [
        {},
        { extreme: true },
        { difficulty: null },
        { difficulty: Number.POSITIVE_INFINITY },
        { versionId: newId() },
      ].map((override) => calibration({ state, ...override })),
    );
    for (const given of [...cases, null, undefined]) {
      const entry = { versionId: VERSION, difficulty: physician, calibration: given };
      const bank = effectiveDifficulty(entry);
      const model = fromModel(catalogDifficulty(entry));
      expect({ logit: model.logit, source: model.state }).toEqual({
        logit: bank.logit,
        source: bank.source,
      });
    }
  });

  it('con la caché de la demostración, en cada estado y con o sin estimación', () => {
    const states: CalibrationState[] = ['physician_estimate', 'provisional', 'calibrated'];
    const stats = states.flatMap((state) =>
      [0.4, null, Number.NaN].map((raschDifficulty) => ({
        calibration: state,
        raschDifficulty,
        responses: 80,
      })),
    );
    for (const given of [...stats, undefined]) {
      const bank = effectiveDifficultyFromStats(physician, given);
      const model = fromModel(given ? cacheDifficulty(given) : null);
      expect({ logit: model.logit, source: model.state }).toEqual({
        logit: bank.logit,
        source: bank.source,
      });
    }
  });
});
