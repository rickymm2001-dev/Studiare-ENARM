// Acuerdo noche por noche (Acuerdo del etiquetado, B14, 7.2 del plan de B14). El kappa que calculó la
// calibración cada noche con los pares de etiquetas del autor y del revisor, con su número de pares y si
// coincide con el del tablero de la misma pantalla (la paridad). Si no coincide, la corrida de esa noche
// quedó con aviso. Viene de editor_agreement_history, que ven el médico, el admin y el dueño. Sin la nube,
// como en la demostración, no hay calibración nocturna y lo dice. Una lectura que falla solo apaga esta
// tarjeta: el resto del tablero sigue.
import { useState } from 'react';
import { loadCloud } from '@/data/cloud/client';
import { readAgreementHistory, type AgreementNight } from '@/data/cloud/calibrationAdmin';
import { EditorialError } from '@/data/editorial/editorialRepo';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { physicianText } from '@/i18n/physician';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { dayInWords, nightOfStudyDay } from '../model/dayWords';
import { askSecondFactor } from './secondFactor';
import { useRepoQuery } from './useRepoQuery';

const text = calibrationAdminTexts.agreementHistory;
/** Noches que se ven de entrada. El resto se abre con un botón */
const VISIBLE_NIGHTS = 14;
const fixed = (value: number) => value.toLocaleString('es-MX', { maximumFractionDigits: 2 });

function ParityBadge({ parity }: { parity: boolean | null }) {
  if (parity === null) return <Badge variant="neutral">{text.parityUnknown}</Badge>;
  return parity ? (
    <Badge variant="success">{text.parityMatch}</Badge>
  ) : (
    <Badge variant="warning">{text.parityMismatch}</Badge>
  );
}

function NightsTable({ nights }: { nights: readonly AgreementNight[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? nights : nights.slice(0, VISIBLE_NIGHTS);
  return (
    <>
      {/* La tabla tiene su propio scroll en el teléfono, así que se enfoca para recorrerla con el teclado */}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={text.tableLabel}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-fg-muted">
              <th scope="col" className="py-1 pr-2">
                {text.night}
              </th>
              <th scope="col" className="py-1 pr-2 text-right">
                {text.pairs}
              </th>
              <th scope="col" className="py-1 pr-2 text-right">
                {text.kappa}
              </th>
              <th scope="col" className="py-1 text-right">
                {text.parity}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((night) => (
              <tr key={night.studyDay} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                  {dayInWords(nightOfStudyDay(night.studyDay))}
                </th>
                <td className="py-1.5 pr-2 text-right tabular-nums">{night.pairs}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {night.kappa === null ? text.noKappa : fixed(night.kappa)}
                </td>
                <td className="py-1.5 text-right">
                  <ParityBadge parity={night.parity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nights.length > VISIBLE_NIGHTS ? (
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAll((current) => !current);
            }}
          >
            {all ? text.showFewer : text.showAll(nights.length)}
          </Button>
        </div>
      ) : null}
      {nights.some((night) => night.parity === false) ? (
        <p role="note" className="mt-2 text-sm text-warning">
          {text.mismatchNote}
        </p>
      ) : null}
    </>
  );
}

export function AgreementHistoryCard({
  cloud,
  ready,
  sourceKey,
}: {
  /** El tablero lee de la nube. En la demostración y sin nube no hay calibración nocturna */
  cloud: boolean;
  ready: boolean;
  /** Cambia cuando cambia de dónde lee el tablero, para volver a leer */
  sourceKey: string;
}) {
  const { state, reload } = useRepoQuery(
    async () => {
      const client = await loadCloud();
      if (!client) throw new EditorialError('network');
      return readAgreementHistory(client, askSecondFactor);
    },
    `agreement-history|${sourceKey}`,
    ready && cloud,
  );
  return (
    <Card aria-labelledby="acuerdo-historial">
      <CardHeader className="mb-2">
        <CardTitle id="acuerdo-historial">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {!cloud ? <p className="text-sm text-fg-muted">{text.local}</p> : null}
      {cloud && state.status === 'loading' ? <LoadingState /> : null}
      {cloud && state.status === 'failed' ? (
        <ErrorState
          title={text.failed}
          description={physicianText.errors[state.code] ?? ''}
          onRetry={reload}
        />
      ) : null}
      {cloud && state.status === 'ready' ? (
        state.value.length === 0 ? (
          <p role="status" className="text-sm text-fg-muted">
            {text.empty}
          </p>
        ) : (
          <NightsTable nights={state.value} />
        )
      ) : null}
    </Card>
  );
}
