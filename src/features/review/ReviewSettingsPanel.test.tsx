// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import { UserSettingsSchema } from '@/data/schemas/people';
import { makeUser } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import { ReviewSettingsPanel } from './ReviewSettingsPanel';

afterEach(cleanup);

describe('ReviewSettingsPanel', () => {
  it('permite cambiar opciones de estudio y guardarlas', async () => {
    const typing = userEvent.setup();
    const user = makeUser();
    const settings = UserSettingsSchema.parse({});
    const session = { status: 'ready' as const, user, settings, isDemo: false };
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <DataProvider kind="real">
        <ReviewSettingsPanel session={session} onSave={onSave} />
      </DataProvider>,
    );

    // Cambiar el paso de confianza
    const checkbox = screen.getByRole('checkbox', { name: t.settings.cardConfidenceStep });
    expect(checkbox).not.toBeChecked();
    await typing.click(checkbox);
    expect(checkbox).toBeChecked();

    // Guardar cambios
    const saveButton = await screen.findByRole('button', { name: t.settings.saveChanges });
    await typing.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        cardConfidenceStep: true,
      }),
    );
  });
});
