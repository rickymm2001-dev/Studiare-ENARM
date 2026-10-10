// Pantalla 26. Selector de rol sin login, solo para probar el prototipo. No tiene enlaces (D-059).
import { Crown, GraduationCap, ShieldCheck, Stethoscope } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { HOME_BY_ROLE } from '@/app/navigation';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { cloudConfigured } from '@/data/cloud/client';
import type { Role } from '@/data/schemas/common';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { RadioCards } from '@/ui/components/radio-cards';

const ROLE_ICONS: Record<Role, ReactNode> = {
  student: <GraduationCap />,
  physician: <Stethoscope />,
  admin: <ShieldCheck />,
  owner: <Crown />,
};

const ROLE_OPTIONS = (['student', 'physician', 'admin', 'owner'] as const).map((role) => ({
  value: role,
  label: t.roles.names[role],
  description: t.roles.descriptions[role],
  icon: ROLE_ICONS[role],
}));

export function RoleSelectorScreen() {
  const currentRole = usePreferences((state) => state.role);
  const setRole = usePreferences((state) => state.setRole);
  const [selected, setSelected] = useState<Role>(currentRole);
  const navigate = useNavigate();

  // Con cuenta en la nube el rol lo asigna el servidor y nadie se lo pone a sí mismo (D-075)
  if (cloudConfigured()) {
    return (
      <>
        <ScreenHeader
          title={t.screens.roleSelector.title}
          description={t.screens.roleSelector.description}
        />
        <Card>
          <p>{t.cloud.roleFromCloud}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t.screens.roleSelector.title}
        description={t.screens.roleSelector.description}
      />
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setRole(selected);
            void navigate(HOME_BY_ROLE[selected]);
          }}
        >
          <RadioCards
            legend={t.roles.legend}
            description={t.roles.notice}
            value={selected}
            options={ROLE_OPTIONS}
            onValueChange={setSelected}
          />
          <Button type="submit" size="lg">
            {t.roles.enterAs(t.roles.names[selected])}
          </Button>
        </form>
      </Card>
    </>
  );
}
