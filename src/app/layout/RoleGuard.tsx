// Guarda de rol del prototipo. Sin login, el rol sale del selector de la pantalla 26.
// En producción esto lo hará la cuenta real con Row Level Security (17, R2).
import type { ReactNode } from 'react';
import type { Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { EmptyState } from '@/ui/states/states';
import { usePreferences } from '../preferences';
import { ScreenHeader } from './ScreenHeader';

export function RoleGuard({
  allow,
  area,
  children,
}: {
  allow: readonly Role[];
  area: 'physician' | 'admin';
  children: ReactNode;
}) {
  const role = usePreferences((state) => state.role);
  if (allow.includes(role)) return children;
  const title = area === 'physician' ? t.access.physicianTitle : t.access.adminTitle;
  return (
    <>
      <ScreenHeader title={title} />
      <EmptyState title={t.roles.current(t.roles.names[role])} description={t.access.description} />
    </>
  );
}
