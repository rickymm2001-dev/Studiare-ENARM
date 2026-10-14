// Lo que se lee en Perfil de solo lectura (B3 del plan del cambio, comentario 16)
import { describe, expect, it } from 'vitest';
import { ENARM_EXAM } from '@/config/exam';
import { EMPTY_DETAILS } from '@/data/usecases/account';
import { t } from '@/i18n/es-MX';
import { accountRows, examDateLabel, sameDetails, specialtyName } from './accountView';

describe('datos de Perfil de solo lectura', () => {
  it('cada dato sale con su texto y lo que falta queda sin dato', () => {
    const rows = accountRows({
      ...EMPTY_DETAILS,
      sex: 'male',
      state: 'CDMX',
      attempt: 5,
      targetSpecialty: 'anesthesiology',
    });
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      [t.account.sex, t.account.sexes.male],
      [t.account.birthYear, null],
      [t.account.state, 'Ciudad de México'],
      [t.account.situation, null],
      [t.account.attempt, t.account.attempts(5)],
      [t.account.targetSpecialty, 'Anestesiología'],
    ]);
    // En Perfil la especialidad va aparte, a la vista, y no se repite entre las filas (B9)
    expect(
      accountRows({ ...EMPTY_DETAILS, targetSpecialty: 'anesthesiology' }, { withSpecialty: false })
        .map((row) => row.label)
        .includes(t.account.targetSpecialty),
    ).toBe(false);
    expect(specialtyName({ targetSpecialty: 'anesthesiology' })).toBe('Anestesiología');
    expect(specialtyName({ targetSpecialty: null })).toBeNull();
  });

  it('la fecha del ENARM es la de la plataforma y dice que es provisional mientras lo sea', () => {
    const platform = examDateLabel({ examDate: null });
    expect(platform).toContain(String(Number(ENARM_EXAM.date.slice(0, 4))));
    expect(platform.endsWith('fecha provisional')).toBe(ENARM_EXAM.provisional);
    expect(examDateLabel({ examDate: '2027-09-14' })).toBe('14 de septiembre de 2027');
  });

  it('dos juegos de datos iguales, foto incluida, no cuentan como cambio', () => {
    expect(sameDetails(EMPTY_DETAILS, { ...EMPTY_DETAILS })).toBe(true);
    expect(sameDetails(EMPTY_DETAILS, { ...EMPTY_DETAILS, birthYear: 2000 })).toBe(false);
    expect(
      sameDetails(EMPTY_DETAILS, {
        ...EMPTY_DETAILS,
        avatar: { kind: 'photo', dataUrl: 'data:image/jpeg;base64,AAAA' },
      }),
    ).toBe(false);
  });
});
