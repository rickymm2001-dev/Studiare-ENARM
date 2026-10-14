// Cómo nos conociste antes de guardarlo (B9, respuesta 22)
import { describe, expect, it } from 'vitest';
import { heardFromOf } from './signupDraft';

describe('la respuesta de cómo nos conociste', () => {
  it('sin canal ni código no contestó, y con canal guarda el código limpio', () => {
    expect(heardFromOf({ channel: '', code: '' })).toBeNull();
    expect(heardFromOf({ channel: '', code: '   ' })).toBeNull();
    expect(heardFromOf({ channel: 'instagram', code: '' })).toEqual({
      channel: 'instagram',
      influencerCode: null,
    });
    expect(heardFromOf({ channel: 'influencer', code: ' ana_2026 ' })).toEqual({
      channel: 'influencer',
      influencerCode: 'ANA_2026',
    });
  });

  it('un código sin canal no se pierde y cuenta como de un influencer', () => {
    expect(heardFromOf({ channel: '', code: 'ana_2026' })).toEqual({
      channel: 'influencer',
      influencerCode: 'ANA_2026',
    });
  });

  it('un código con una forma que la base no acepta no se guarda, con o sin canal', () => {
    expect(heardFromOf({ channel: '', code: 'ana 2026' })).toBe('invalid');
    expect(heardFromOf({ channel: 'tiktok', code: 'x' })).toBe('invalid');
  });
});
