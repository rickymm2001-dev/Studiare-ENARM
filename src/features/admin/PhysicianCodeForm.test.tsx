// @vitest-environment jsdom
// La clave corta de un médico para Autor y Revisor del Google Sheet (B11, 3.7 del plan de B11). Se
// escribe en mayúsculas, no se manda si no sigue la regla y avisa si ya es de otro médico.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bankAdminText } from '@/i18n/bankAdmin';
import { PhysicianCodeForm } from './PhysicianCodeForm';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = bankAdminText.users;
const DOCTOR = '44444444-4444-4444-8444-444444444444';

function fakeCloud(reply: 'ok' | 'taken'): [string, unknown][] {
  const calls: [string, unknown][] = [];
  holder.cloud = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({ data: reply, error: null });
    },
  };
  return calls;
}

afterEach(() => {
  cleanup();
  holder.cloud = null;
});

describe('Clave del Sheet de un médico', () => {
  it('guarda la clave en mayúsculas y dice cómo firma', async () => {
    const calls = fakeCloud('ok');
    const typing = userEvent.setup();
    render(<PhysicianCodeForm userId={DOCTOR} alias="Dra. Ruiz" />);
    await typing.type(screen.getByLabelText(text.code), 'mr1');
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.saved('Dra. Ruiz', 'MR1'))).toBeVisible();
    expect(calls).toEqual([['admin_set_physician_code', { p_user: DOCTOR, p_code: 'MR1' }]]);
  });

  it('una clave que no sigue la regla no se manda y una ocupada avisa', async () => {
    const calls = fakeCloud('taken');
    const typing = userEvent.setup();
    render(<PhysicianCodeForm userId={DOCTOR} alias="Dra. Ruiz" />);
    const field = screen.getByLabelText(text.code);
    await typing.type(field, '1A');
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.invalid)).toBeVisible();
    expect(calls).toEqual([]);
    await typing.clear(field);
    await typing.type(field, 'MR');
    await typing.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(text.taken)).toBeVisible();
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
  });
});
