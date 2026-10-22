import { describe, expect, it } from 'vitest';
import {
  branchChoices,
  chosenBranches,
  MAX_PLAN_BRANCHES,
  moveBranch,
  toggleBranch,
} from './branchOrder';

const ALL = ['mi', 'ped', 'gyo', 'cir', 'fam', 'urg', 'sp', 'en'];

describe('ramas del plan del Calendario', () => {
  it('las elegidas van primero y en su orden, y las demás después en el orden de la taxonomía', () => {
    expect(branchChoices(['gyo', 'mi'], ALL)).toEqual([
      { key: 'gyo', included: true },
      { key: 'mi', included: true },
      { key: 'ped', included: false },
      { key: 'cir', included: false },
      { key: 'fam', included: false },
      { key: 'urg', included: false },
      { key: 'sp', included: false },
      { key: 'en', included: false },
    ]);
  });

  it('una clave que ya no existe o repetida se deja fuera', () => {
    expect(chosenBranches(['mi', 'viejo', 'mi', 'ped'], ALL)).toEqual(['mi', 'ped']);
  });

  it('incluir una rama la pone al final y quitarla la saca sin mover las otras', () => {
    expect(toggleBranch(['mi', 'ped'], 'urg', ALL)).toEqual(['mi', 'ped', 'urg']);
    expect(toggleBranch(['mi', 'ped', 'urg'], 'ped', ALL)).toEqual(['mi', 'urg']);
  });

  it('nunca se queda sin ramas y nunca pasa del máximo', () => {
    expect(toggleBranch(['mi'], 'mi', ALL)).toEqual(['mi']);
    const many = Array.from({ length: MAX_PLAN_BRANCHES }, (_, index) => `r${index}`);
    expect(toggleBranch(many, 'mi', [...many, 'mi'])).toEqual(many);
    expect(toggleBranch(['mi'], 'no-existe', ALL)).toEqual(['mi']);
  });

  it('subir y bajar cambia un lugar y en los extremos no hace nada', () => {
    expect(moveBranch(['mi', 'ped', 'gyo'], 'gyo', -1, ALL)).toEqual(['mi', 'gyo', 'ped']);
    expect(moveBranch(['mi', 'ped', 'gyo'], 'mi', 1, ALL)).toEqual(['ped', 'mi', 'gyo']);
    expect(moveBranch(['mi', 'ped', 'gyo'], 'mi', -1, ALL)).toEqual(['mi', 'ped', 'gyo']);
    expect(moveBranch(['mi', 'ped', 'gyo'], 'gyo', 1, ALL)).toEqual(['mi', 'ped', 'gyo']);
    // Una rama que no está elegida no se mueve
    expect(moveBranch(['mi', 'ped'], 'urg', -1, ALL)).toEqual(['mi', 'ped']);
  });
});
