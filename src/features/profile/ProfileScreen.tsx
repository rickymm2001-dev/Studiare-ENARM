// Perfil (pantalla 15). En la Fase A trae el tema visual. El resto de los ajustes llega en la Fase C.
import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { AiModeBadge } from '@/ai/AiModeBadge';
import { useAiStatus } from '@/ai/useAiStatus';
import { usePreferences } from '@/app/preferences';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { RadioCards } from '@/ui/components/radio-cards';
import type { ThemePreference } from '@/ui/theme';

const THEME_OPTIONS = [
  { value: 'system', label: t.theme.system, icon: <Monitor /> },
  { value: 'light', label: t.theme.light, icon: <Sun /> },
  { value: 'dark', label: t.theme.dark, icon: <Moon /> },
] as const satisfies readonly { value: ThemePreference; label: string; icon: ReactNode }[];

export function ProfileScreen() {
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const aiStatus = useAiStatus();

  return (
    <>
      <ScreenHeader
        title={t.screens.profile.title}
        description={t.screens.profile.description}
        badges={<Badge variant="info">{t.phase.builtIn(SCREENS.profile.phase)}</Badge>}
      />
      <Card>
        <RadioCards
          legend={t.theme.legend}
          value={theme}
          options={THEME_OPTIONS}
          onValueChange={setTheme}
        />
      </Card>
      <Card aria-labelledby="ia-titulo">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="ia-titulo">{t.ai.cardTitle}</CardTitle>
            <AiModeBadge status={aiStatus} />
          </div>
          <CardDescription>{t.ai.detail[aiStatus.kind]}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
