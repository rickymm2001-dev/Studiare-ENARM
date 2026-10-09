import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, testApi } from '../testing/fixtures';
import { InvalidLabelError, labelId, removeLabel, saveLabel, TAGGABLE_BIASES } from './labeling';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const setup = () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  return api;
};
const physician = { id: newId(), role: 'physician' } as const;
const distractor = () => ({ optionId: newId(), isCorrect: false });
const tag = TAGGABLE_BIASES[0]?.key ?? '';

describe('etiquetas de los médicos', () => {
  it('guarda la etiqueta de un médico a un distractor', async () => {
    const api = setup();
    const option = distractor();
    const saved = await saveLabel(api, physician, option, tag, new Date('2026-10-08T10:00:00Z'));
    expect(saved).toMatchObject({
      optionId: option.optionId,
      physicianId: physician.id,
      biasTag: tag,
      labeledAt: '2026-10-08T10:00:00.000Z',
    });
    expect(await api.repos.biasLabels.list()).toHaveLength(1);
  });

  it('etiquetar de nuevo reemplaza la etiqueta y no agrega otra', async () => {
    const api = setup();
    const option = distractor();
    const other = TAGGABLE_BIASES[1]?.key ?? '';
    await saveLabel(api, physician, option, tag);
    await saveLabel(api, physician, option, other);
    const labels = await api.repos.biasLabels.list();
    expect(labels).toHaveLength(1);
    expect(labels[0]?.biasTag).toBe(other);
    expect(labels[0]?.id).toBe(labelId(physician.id, option.optionId));
  });

  it('cada médico tiene su propia etiqueta para la misma opción', async () => {
    const api = setup();
    const option = distractor();
    await saveLabel(api, physician, option, tag);
    await saveLabel(api, { id: newId(), role: 'physician' }, option, tag);
    expect(await api.repos.biasLabels.list()).toHaveLength(2);
  });

  it('solo un médico etiqueta, no la opción correcta y solo con etiquetas que existen', async () => {
    const api = setup();
    await expect(
      saveLabel(api, { id: newId(), role: 'student' }, distractor(), tag),
    ).rejects.toThrow(InvalidLabelError);
    await expect(
      saveLabel(api, physician, { optionId: newId(), isCorrect: true }, tag),
    ).rejects.toThrow('correcta');
    await expect(saveLabel(api, physician, distractor(), 'inventada')).rejects.toThrow(
      InvalidLabelError,
    );
    expect(await api.repos.biasLabels.list()).toHaveLength(0);
  });

  it('quita la etiqueta de una opción', async () => {
    const api = setup();
    const option = distractor();
    await saveLabel(api, physician, option, tag);
    await removeLabel(api, physician.id, option.optionId);
    expect(await api.repos.biasLabels.list()).toHaveLength(0);
    // Quitar la que no existe no falla
    await removeLabel(api, physician.id, option.optionId);
  });

  it('solo se pueden usar etiquetas marcadas como etiquetables', () => {
    expect(TAGGABLE_BIASES.length).toBeGreaterThan(5);
    for (const bias of TAGGABLE_BIASES) expect(bias.taggable).toBe(true);
  });
});
