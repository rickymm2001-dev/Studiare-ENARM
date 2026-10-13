// Borrador de Ajustes del repaso (B3 del plan del cambio). Guarda lo mismo que guardaba
// Configuración y junta los cambios que llegan de fuera sin pisar lo que el alumno escribe.
import { describe, expect, it } from 'vitest';
import { UserSettingsSchema } from '@/data/schemas/people';
import { differs, draftOf, mergeDraft, patchOf, sameDraft } from './studyDraft';

const settings = UserSettingsSchema.parse({});

describe('borrador de Ajustes del repaso', () => {
  it('lo guardado no cuenta como cambio y el parche respeta los límites de cada campo', () => {
    expect(differs(patchOf(draftOf(settings)), settings)).toBe(false);
    const patch = patchOf({ ...draftOf(settings), newCards: '900', retention: '50', goal: '' });
    expect(patch.newCardsPerDay).toBe(500);
    expect(patch.desiredRetention).toBe(0.8);
    expect(patch.dailyGoal.value).toBe(1);
    expect(differs(patch, settings)).toBe(true);
  });

  it('un cambio de fuera entra en los campos que el alumno no tocó y no pisa los que sí', () => {
    const base = draftOf(settings);
    // El alumno cambió los repasos por día y la sugerencia guardó 8 nuevas por día
    const draft = { ...base, reviews: '120' };
    const incoming = draftOf({ ...settings, newCardsPerDay: 8 });
    const merged = mergeDraft(base, draft, incoming);
    expect(merged.newCards).toBe('8');
    expect(merged.reviews).toBe('120');
    // Si el alumno también había tocado las nuevas, se queda su número
    expect(mergeDraft(base, { ...draft, newCards: '30' }, incoming).newCards).toBe('30');
  });

  it('dos borradores iguales campo por campo son el mismo', () => {
    expect(sameDraft(draftOf(settings), draftOf(UserSettingsSchema.parse({})))).toBe(true);
    expect(sameDraft(draftOf(settings), draftOf({ ...settings, optionsShown: 5 }))).toBe(false);
  });
});
