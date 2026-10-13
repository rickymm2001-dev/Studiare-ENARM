// Las marcas rápidas, siempre a la vista y compactas (B6 del plan del cambio). El botón Tarjeta de
// cada línea las escribe por el alumno, y aquí quedan para quien prefiere el teclado.
import { t } from '@/i18n/es-MX';

export function CheatSheet() {
  const text = t.outlines.cheatsheet;
  return (
    <section aria-labelledby="marcas-rapidas" className="flex flex-col gap-2">
      <h2 id="marcas-rapidas" className="text-base font-semibold">
        {text.title}
      </h2>
      <p className="text-sm text-fg-muted">{text.intro}</p>
      <dl className="flex flex-col divide-y divide-line text-sm">
        {text.rows.map((row) => (
          <div key={row.mark} className="flex flex-col gap-0.5 py-1.5">
            <dt className="font-mono font-semibold break-words text-primary-ink">{row.mark}</dt>
            <dd className="text-fg-muted">{row.what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
