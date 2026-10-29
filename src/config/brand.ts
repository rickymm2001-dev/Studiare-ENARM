// Marca en un solo lugar (D-016, D-119). Cambiarla aquí cambia toda la app y el manifest. Studiare es
// la marca definitiva (respuesta 54 del cuestionario). La descripción es un texto neutro mientras
// llegan los textos de venta del influencer o de la agencia (4.17 del plan del cambio).
export const BRAND = {
  name: 'Studiare',
  shortName: 'Studiare',
  description:
    'Studiare, la plataforma para preparar el ENARM. Repaso espaciado, simuladores tipo ENARM y seguimiento de tu técnica de examen.',
  // Deben coincidir con --enarm-primary y --enarm-canvas del modo claro de src/ui/tokens.css. Lo
  // vigila src/config/brand.test.ts
  themeColor: '#01337a',
  backgroundColor: '#ffffff',
  // El color del navegador cuando el sistema está en oscuro. Es el --enarm-primary del modo oscuro
  // de src/ui/tokens.css, el marino claro de la paleta sobre pizarra (V5, D-151)
  themeColorDark: '#1a4f9c',
} as const;
