// Las marcas rápidas, siempre a la mano pero plegadas, para no ocupar lugar a quien ya las sabe.
import { t } from '@/i18n/es-MX';
import { Disclosure } from '@/ui/components/disclosure';

export function CheatSheet() {
  const text = t.outlines.cheatsheet;
  return (
    <Disclosure title={text.title}>
      <p className="text-sm text-fg-muted">{text.intro}</p>
      <dl className="flex flex-col gap-2 text-sm">
        {text.rows.map((row) => (
          <div key={row.mark} className="flex flex-col gap-0.5">
            <dt className="font-mono font-semibold text-primary">{row.mark}</dt>
            <dd className="text-fg-muted">{row.what}</dd>
          </div>
        ))}
      </dl>
    </Disclosure>
  );
}
