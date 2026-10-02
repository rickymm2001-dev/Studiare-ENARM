// Guarda de rol del prototipo. Sin login, el rol sale del selector de la pantalla 26.
// En producción esto lo hará la cuenta real con Row Level Security (17, R2).
import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { EmptyState } from '@/ui/states/states';
import { usePreferences } from '../preferences';
import { screenPath } from '../screens';
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
      <EmptyState
        title={t.roles.current(t.roles.names[role])}
        description={t.access.description}
        action={
          <Button asChild>
            <Link to={screenPath('roleSelector')}>
              <ShieldCheck aria-hidden />
              {t.roles.change}
            </Link>
          </Button>
        }
      />
    </>
  );
}
