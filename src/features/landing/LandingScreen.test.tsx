// @vitest-environment jsdom
// La portada con los bloques del creador y de testimonios vacíos y llenos (B17, 5.2). Vacíos no pintan nada,
// llenos van entre los perfiles y los planes, el texto entra como texto y no como HTML, el contenido de prueba
// lleva su etiqueta y la foto solo se muestra con su texto alternativo.
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import type { LandingCreator, LandingTestimonial } from '@/i18n/landing';
import { CreatorSection, TestimonialsSection } from './LandingBlocks';
import { LandingScreen } from './LandingScreen';
import { LANDING_PREVIEW_KEY } from './preview';
import { hasLandingPreview } from './previewKey';
import { landingSlots, slotId, SLOT_FAMILIES } from './slots';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllEnvs();
});

const creator: LandingCreator = {
  name: 'Persona de prueba',
  role: 'Rol de prueba',
  quote: 'Cita de prueba.',
  photo: { file: 'creador-prueba.webp', alt: 'Retrato de prueba' },
};
const first: LandingTestimonial = {
  quote: 'Primer testimonio de prueba.',
  who: 'Alguien de prueba',
  permissionOn: '2026-10-01',
};
const second: LandingTestimonial = {
  quote: 'Segundo testimonio de prueba.',
  who: 'Otra persona de prueba',
  permissionOn: '2026-10-02',
};
const testimonials = [first, second];

const renderLanding = () =>
  render(
    <MemoryRouter>
      <LandingScreen />
    </MemoryRouter>,
  );

describe('portada con los bloques vacíos', () => {
  it('no pinta el bloque del creador ni el de testimonios', () => {
    renderLanding();
    expect(screen.getByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
    expect(screen.queryByRole('heading', { name: t.landing.testimonialsTitle })).toBeNull();
    expect(screen.queryByText(t.landing.sampleLabel)).toBeNull();
    // La foto del héroe es decorativa y las capturas de la app solo salen cuando no hay foto. Lo que no
    // debe haber es la foto del creador
    expect(document.querySelector('img[src*="/landing/creador"]')).toBeNull();
    expect(document.querySelector('[data-slot^="creator."]')).toBeNull();
    expect(document.querySelector('[data-slot^="testimonials."]')).toBeNull();
  });

  it('cada lugar de la tabla con texto tiene su elemento con data-slot y su texto', () => {
    renderLanding();
    for (const slot of landingSlots(t.landing)) {
      if (slot.id.startsWith('meta.')) continue;
      const element = document.querySelector(`[data-slot="${slot.id}"]`);
      expect(element, slot.id).not.toBeNull();
      expect(element?.textContent, slot.id).toBe(slot.value);
    }
    // Nuestro método es un tablist. El primer paso está elegido y los seis paneles están en la página,
    // con hidden los que no se ven, para que cada texto tenga su lugar marcado
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(6);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(6);
    expect(document.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
    // Las familias de la tabla que no son meta están todas pintadas, menos las de los bloques vacíos
    const painted = new Set(
      [...document.querySelectorAll('[data-slot]')].map((node) => node.getAttribute('data-slot')),
    );
    for (const family of SLOT_FAMILIES) {
      if (/^(?:meta|creator|testimonials)\./.test(family.id)) continue;
      expect(painted.has(slotId(family.id, 1)), family.id).toBe(true);
    }
    // El botón principal se repite en el cierre. El del cierre dice de qué lugar repite el texto, y ningún id
    // de data-slot sale dos veces en la página
    expect(document.querySelectorAll('[data-slot="hero.cta"]')).toHaveLength(1);
    const repeat = document.querySelectorAll('[data-slot-repeat="hero.cta"]');
    expect(repeat).toHaveLength(1);
    expect(repeat[0]?.textContent).toBe(t.landing.cta);
    const ids = [...document.querySelectorAll('[data-slot]')].map((node) =>
      node.getAttribute('data-slot'),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('portada con los bloques llenos', () => {
  it('van entre los perfiles y los planes, con la etiqueta de contenido de prueba', async () => {
    localStorage.setItem(LANDING_PREVIEW_KEY, JSON.stringify({ creator, testimonials }));
    renderLanding();
    // La vista previa se baja aparte, así que llega un momento después de pintar la portada
    await screen.findByRole('region', { name: creator.name });
    const personas = screen.getByRole('region', { name: t.landing.personasTitle });
    const about = screen.getByRole('region', { name: creator.name });
    const proof = screen.getByRole('region', { name: t.landing.testimonialsTitle });
    const pricing = screen.getByRole('region', { name: t.landing.pricingTitle });
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(personas, about)).toBe(true);
    expect(follows(about, proof)).toBe(true);
    expect(follows(proof, pricing)).toBe(true);
    expect(screen.getAllByText(t.landing.sampleLabel)).toHaveLength(2);
    expect(within(proof).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 2, name: creator.name })).toBeVisible();
    expect(screen.getByRole('img', { name: creator.photo?.alt })).toHaveAttribute(
      'src',
      `${import.meta.env.BASE_URL}landing/creador-prueba.webp`,
    );
  });
});

describe('vista previa guardada en el navegador', () => {
  it('se nota si hay algo guardado y un almacenamiento que falla cuenta como nada', () => {
    expect(hasLandingPreview()).toBe(false);
    localStorage.setItem(LANDING_PREVIEW_KEY, '{}');
    expect(hasLandingPreview()).toBe(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(hasLandingPreview()).toBe(false);
  });

  it('en producción la portada nunca la lee, aunque el navegador la traiga', async () => {
    vi.stubEnv('VITE_APP_ENV', 'production');
    localStorage.setItem(LANDING_PREVIEW_KEY, JSON.stringify({ creator, testimonials }));
    renderLanding();
    expect(screen.getByRole('heading', { level: 1, name: t.landing.title })).toBeVisible();
    // Se espera a que una vista previa, de haberse pedido, ya hubiera llegado
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('region', { name: creator.name })).toBeNull();
    expect(screen.queryByText(t.landing.sampleLabel)).toBeNull();
  });

  it('una vista previa que rompe una regla se ignora y la portada queda como siempre', async () => {
    localStorage.setItem(
      LANDING_PREVIEW_KEY,
      JSON.stringify({
        creator: { ...creator, quote: 'Mira https://ejemplo.com ya' },
        testimonials,
      }),
    );
    renderLanding();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('region', { name: creator.name })).toBeNull();
    expect(screen.queryByText(t.landing.sampleLabel)).toBeNull();
  });
});

describe('bloques por separado', () => {
  it('sin creador, o sin nombre o cita, no pintan nada', () => {
    const { container, rerender } = render(<CreatorSection creator={null} sample={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CreatorSection creator={{ ...creator, name: ' ' }} sample={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CreatorSection creator={{ ...creator, quote: '' }} sample={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sin testimonios, o solo con los incompletos, no pintan nada', () => {
    const { container, rerender } = render(
      <TestimonialsSection testimonials={[]} sample={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <TestimonialsSection
        testimonials={[
          { ...first, quote: '' },
          { ...second, who: ' ' },
        ]}
        sample={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('la foto solo se muestra si trae su texto alternativo', () => {
    const { rerender } = render(
      <CreatorSection
        creator={{ ...creator, photo: { file: 'creador.webp', alt: ' ' } }}
        sample={false}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('heading', { name: creator.name })).toBeVisible();
    rerender(<CreatorSection creator={{ ...creator, photo: null }} sample={false} />);
    expect(screen.queryByRole('img')).toBeNull();
    rerender(<CreatorSection creator={creator} sample={false} />);
    expect(screen.getByRole('img', { name: 'Retrato de prueba' })).toBeVisible();
  });

  it('sin marca de prueba el contenido real no lleva etiqueta, y con ella sí', () => {
    const { rerender } = render(<CreatorSection creator={creator} sample={false} />);
    expect(screen.queryByText(t.landing.sampleLabel)).toBeNull();
    rerender(<CreatorSection creator={creator} sample />);
    expect(screen.getByText(t.landing.sampleLabel)).toBeVisible();
  });

  it('el texto entra como texto, nunca como HTML', () => {
    render(
      <TestimonialsSection
        testimonials={[{ ...first, quote: '<img src=x onerror=alert(1)> y <b>negritas</b>' }]}
        sample={false}
      />,
    );
    expect(screen.getByText('<img src=x onerror=alert(1)> y <b>negritas</b>')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });
});
