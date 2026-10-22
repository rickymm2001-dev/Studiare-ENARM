// Variables públicas del build que B17 agrega (1.6 del plan de B17). Todas son públicas por diseño y llegan al
// navegador, así que ninguna es un secreto. Vite ya tipa import.meta.env con vite/client (tsconfig.app.json) y
// aquí solo se nombran las de este bloque, como string opcional porque un build puede no traerlas.
// Las de las otras partes de la app (VITE_SUPABASE_URL, VITE_POSTHOG_KEY...) se leen donde se usan, con su
// propia validación, y no se declaran aquí.
interface ImportMetaEnv {
  /**
   * Llave publicable de Stripe, pk_test_ o pk_live_. La leen csp.ts, por vite.config.ts, y WalletPay. Vacía o con
   * otra forma, la sección de billeteras no aparece y la política de seguridad no abre Stripe
   */
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  /** Dirección a la que se muda la demo de GitHub Pages, por ejemplo https://tudominio.mx. La lee MovedNotice */
  readonly VITE_MOVED_TO?: string;
  /** Día de la mudanza, como 2026-12-15. Con VITE_MOVED_TO prende el aviso de 14 días de MovedNotice */
  readonly VITE_MOVED_ON?: string;
}
