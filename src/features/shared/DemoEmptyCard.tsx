// Aviso de la demostración vacía, en cada pantalla que necesita un alumno (B3 del plan del cambio,
// 5.4). Los datos se generan en Datos de demostración, que solo abren el admin y el dueño y solo con la
// bandera demoTools prendida. A ellos se les lleva ahí. A los demás no se les manda a una pantalla que
// no pueden usar, sino de vuelta a Mi cuenta, su base real.
import { Sparkles, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { canGenerateDemo } from './demoAccess';

export function DemoEmptyCard() {
  const role = usePreferences((state) => state.role);
  const setDatabase = usePreferences((state) => state.setDatabase);
  const text = t.settingsPage.demoEmpty;
  const generate = canGenerateDemo(role);
  return (
    <Card aria-labelledby="demo-vacia">
      <CardHeader>
        <CardTitle id="demo-vacia">{t.session.demoEmptyTitle}</CardTitle>
        <CardDescription>{generate ? text.body : text.bodyBack}</CardDescription>
      </CardHeader>
      {generate ? (
        <Button asChild className="self-start">
          <Link to={screenPath('demoData')}>
            <Sparkles aria-hidden />
            {text.link}
          </Link>
        </Button>
      ) : (
        <Button
          className="self-start"
          onClick={() => {
            setDatabase('real');
          }}
        >
          <UserRound aria-hidden />
          {t.database.backToReal}
        </Button>
      )}
    </Card>
  );
}
