// Sección e idioma de una rama (B13, 1.2 y 1.4 del plan de B13). La lista de ramas en inglés es la de la
// taxonomía, y cada rama toma el idioma de su sección.
import { describe, expect, it } from 'vitest';
import { branchSection } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';
import { branchesOfSection } from './bankTaxonomy';
import { ENGLISH_BRANCH_KEYS, languageOfBranch, sectionOfBranch } from './branchLanguage';

describe('sección e idioma de una rama', () => {
  it('la lista de ramas en inglés es la de la taxonomía', () => {
    const fromTaxonomy = topicTaxonomy.branches
      .filter((branch) => branchSection(branch) === 'english')
      .map((branch) => branch.key);
    expect([...ENGLISH_BRANCH_KEYS].sort()).toEqual(fromTaxonomy.sort());
  });

  it('cada rama toma la sección de la taxonomía y su idioma', () => {
    for (const branch of topicTaxonomy.branches) {
      expect(sectionOfBranch(branch.key), branch.key).toBe(branchSection(branch));
      expect(languageOfBranch(branch.key), branch.key).toBe(
        branchSection(branch) === 'english' ? 'en' : 'es',
      );
    }
    expect(sectionOfBranch('medical_english')).toBe('english');
    expect(languageOfBranch('medical_english')).toBe('en');
    expect(languageOfBranch('internal_medicine')).toBe('es');
    // Una rama que no se conoce es de la sección clinical, como en branchSection
    expect(sectionOfBranch('inventada')).toBe('clinical');
    expect(languageOfBranch('inventada')).toBe('es');
  });

  it('las ramas de cada sección suman las de la taxonomía, sin repetirse', () => {
    const clinical = branchesOfSection('clinical').map((branch) => branch.key);
    const english = branchesOfSection('english').map((branch) => branch.key);
    expect(english).toEqual(['medical_english']);
    expect(clinical).not.toContain('medical_english');
    expect([...clinical, ...english].sort()).toEqual(
      topicTaxonomy.branches.map((branch) => branch.key).sort(),
    );
  });
});
