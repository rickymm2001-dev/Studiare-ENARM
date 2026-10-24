// Nuestro método (D-149). Seis pasos numerados a la izquierda y el panel con el texto del paso elegido
// a la derecha, como en el boceto. Es un tablist vertical, se recorre con las flechas y los seis
// paneles están en la página, con hidden los que no se ven, para que cada texto tenga su lugar
// marcado aunque no esté a la vista.
import { useRef, useState, type KeyboardEvent } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { slotId } from './slotId';

export function MethodTabs({ items }: { items: readonly (readonly [string, string])[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = (index + items.length) % items.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => {
        select(index + 1);
      },
      ArrowRight: () => {
        select(index + 1);
      },
      ArrowUp: () => {
        select(index - 1);
      },
      ArrowLeft: () => {
        select(index - 1);
      },
      Home: () => {
        select(0);
      },
      End: () => {
        select(items.length - 1);
      },
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  return (
    <div className="ld-method__grid">
      <div
        role="tablist"
        aria-label={t.landing.methodTitle}
        aria-orientation="vertical"
        className="ld-method__list"
      >
        {items.map(([title], index) => (
          <button
            key={title}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`metodo-paso-${index + 1}`}
            aria-selected={index === active}
            aria-controls={`metodo-panel-${index + 1}`}
            tabIndex={index === active ? 0 : -1}
            className={cn('ld-method__tab', index === active && 'is-active')}
            data-reveal=""
            style={{ '--i': index } as React.CSSProperties}
            onClick={() => {
              setActive(index);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
          >
            <span className="ld-method__num" aria-hidden>
              {index + 1}
            </span>
            <span className="ld-method__label" data-slot={slotId('method.N.title', index + 1)}>
              {title}
            </span>
          </button>
        ))}
      </div>
      <div className="ld-method__panel" data-reveal="">
        {items.map(([title, description], index) => (
          <div
            key={title}
            role="tabpanel"
            id={`metodo-panel-${index + 1}`}
            aria-labelledby={`metodo-paso-${index + 1}`}
            hidden={index !== active}
            className="ld-method__panel-inner"
          >
            <h3>{title}</h3>
            <p data-slot={slotId('method.N.text', index + 1)}>{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
