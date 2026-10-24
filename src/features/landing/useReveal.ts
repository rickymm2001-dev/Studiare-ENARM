// Movimiento de la portada (D-149). Dos observadores de intersección, uno que marca cada bloque con
// data-reveal cuando llega a la pantalla y otro que dice qué sección de la barra está a la vista.
// Sin IntersectionObserver, como en jsdom, o con reducir movimiento, todo se marca de entrada. El
// bloque sin marcar solo está corrido unos píxeles, nunca transparente, así siempre se lee.
import { useEffect, useState, type RefObject } from 'react';

function reducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  if (document.documentElement.dataset.motion === 'off') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Marca con is-in cada [data-reveal] dentro de root al entrar a la pantalla, una sola vez */
export function useReveal(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const targets = [...node.querySelectorAll<HTMLElement>('[data-reveal]')];
    if (typeof IntersectionObserver === 'undefined' || reducedMotion()) {
      for (const target of targets) target.classList.add('is-in');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    for (const target of targets) observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [root]);
}

/** El id de la sección que cruza la mitad de la pantalla, para resaltar su enlace en la barra */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );
    for (const section of sections) observer.observe(section);
    return () => {
      observer.disconnect();
    };
  }, [ids]);
  return active;
}
