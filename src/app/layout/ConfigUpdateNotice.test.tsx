// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import { useConfigUpdate } from '../configUpdate';
import { ConfigUpdateNotice } from './ConfigUpdateNotice';

afterEach(() => {
  cleanup();
  useConfigUpdate.setState({ pending: false });
});

describe('aviso de configuración nueva', () => {
  it('no aparece mientras no haya nada pendiente', () => {
    render(<ConfigUpdateNotice />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('explica qué pasó y ofrece recargar o dejarlo para después', async () => {
    act(() => {
      useConfigUpdate.getState().set(true);
    });
    render(<ConfigUpdateNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(t.configUpdate.title);
    expect(screen.getByRole('button', { name: t.configUpdate.reload })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: t.configUpdate.later }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(useConfigUpdate.getState().pending).toBe(false);
  });
});
