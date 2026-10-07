import { describe, expect, it } from 'vitest';
import { BRAND } from '@/config/brand';
import { t } from '@/i18n/es-MX';
import { achievementText, buildAchievement } from './achievement';

const snapshot = {
  level: { level: 7, title: 'R2', xpIntoLevel: 10, xpForNext: 100 },
  streak: { current: 12 },
  weeklyXp: 1240,
};

describe('tarjeta de logro', () => {
  it('lleva solo el nivel, la racha y los XP de la semana, y sin alias por defecto', () => {
    const card = buildAchievement({ snapshot: snapshot as never, alias: null, simulated: false });
    expect(card).toEqual({
      brand: BRAND.name,
      alias: null,
      level: 7,
      levelTitle: 'R2',
      streak: 12,
      weeklyXp: 1240,
      simulated: false,
    });
  });

  it('el texto que acompaña a la imagen dice el nivel, la racha y los XP', () => {
    const card = buildAchievement({ snapshot: snapshot as never, alias: null, simulated: false });
    const text = achievementText(card);
    expect(text).toContain('nivel 7');
    expect(text).toContain('R2');
    expect(text).toContain('12 días');
    expect(text).toContain('1,240 XP');
    expect(text).not.toContain(t.party.share.simulatedBanner);
  });

  it('el alias solo entra cuando el alumno lo pide', () => {
    const withAlias = buildAchievement({
      snapshot: snapshot as never,
      alias: 'Ana',
      simulated: false,
    });
    expect(achievementText(withAlias).startsWith('Ana. ')).toBe(true);
    const without = buildAchievement({
      snapshot: snapshot as never,
      alias: null,
      simulated: false,
    });
    expect(achievementText(without)).not.toContain('Ana');
  });

  it('con datos de demostración la tarjeta y el texto lo dicen', () => {
    const card = buildAchievement({ snapshot: snapshot as never, alias: null, simulated: true });
    expect(card.simulated).toBe(true);
    expect(achievementText(card)).toContain(t.party.share.simulatedBanner);
  });

  it('con una racha de un día habla en singular', () => {
    const card = buildAchievement({
      snapshot: { ...snapshot, streak: { current: 1 } } as never,
      alias: null,
      simulated: false,
    });
    expect(achievementText(card)).toContain('1 día de racha');
  });
});
