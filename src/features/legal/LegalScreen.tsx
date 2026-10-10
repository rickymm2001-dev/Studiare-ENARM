// Aviso de privacidad y términos y condiciones, como páginas públicas de la app (Fase G, G2). No
// piden sesión, porque el alumno los lee antes de crear su cuenta. Muestran, arriba y siempre, que
// son un borrador pendiente de revisión legal mientras no los apruebe un abogado.
import { FileText } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { readLegalIdentity, type LegalIdentity } from '@/config/legal';
import { legalText, type LegalDoc, type LegalKey } from '@/i18n/legal';
import { t } from '@/i18n/es-MX';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { Card } from '@/ui/components/card';
import { fillLegal } from './fillLegal';

/** El texto ya lleno, con el correo como enlace para escribir si está configurado */
function Text({ value, identity }: { value: string; identity: LegalIdentity }): ReactNode {
  const filled = fillLegal(value, identity);
  const email = identity.email;
  if (!email || !filled.includes(email)) return filled;
  return filled.split(email).map((part, index, parts) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 ? (
        <a href={`mailto:${email}`} className="font-semibold underline underline-offset-4">
          {email}
        </a>
      ) : null}
    </Fragment>
  ));
}

function LegalPage({ docKey }: { docKey: LegalKey }) {
  const doc: LegalDoc = legalText[docKey];
  const identity = readLegalIdentity();
  const other: LegalKey = docKey === 'privacy' ? 'terms' : 'privacy';
  const screenKey = docKey === 'privacy' ? 'privacyNotice' : 'terms';
  return (
    <>
      <ScreenHeader
        title={t.screens[screenKey].title}
        description={legalText.updated(doc.updated)}
        stats={false}
      />
      <div className="mx-auto flex w-full max-w-reading flex-col gap-4">
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-sim-line bg-sim px-3 py-2 text-sm text-sim-fg"
        >
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{legalText.draftNotice}</span>
        </p>

        <p className="text-sm text-fg-muted">{legalText.version(doc.version)}</p>
        {doc.intro.map((paragraph) => (
          <p key={paragraph}>
            <Text value={paragraph} identity={identity} />
          </p>
        ))}

        <nav aria-label={legalText.links.contents}>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="underline underline-offset-4">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((section) => (
          <Card key={section.id} aria-labelledby={`legal-${section.id}`} id={section.id}>
            <h2 id={`legal-${section.id}`} className="text-lg font-semibold">
              {section.title}
            </h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>
                <Text value={paragraph} identity={identity} />
              </p>
            ))}
            {section.bullets ? (
              <ul className="list-disc space-y-1.5 pl-5">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>
                    <Text value={bullet} identity={identity} />
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ))}

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link
            to={screenPath(other === 'privacy' ? 'privacyNotice' : 'terms')}
            className="underline underline-offset-4"
          >
            {legalText.links[other]}
          </Link>
          <Link to={screenPath('home')} className="underline underline-offset-4">
            {legalText.links.backHome}
          </Link>
        </p>
      </div>
    </>
  );
}

export const PrivacyNoticeScreen = () => <LegalPage docKey="privacy" />;
export const TermsScreen = () => <LegalPage docKey="terms" />;
