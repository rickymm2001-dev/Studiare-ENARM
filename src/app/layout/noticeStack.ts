// El contenedor fijo de los avisos de arriba, con su región viva siempre presente. Lo pinta PwaUpdatePrompt y los
// avisos que van con él, como el de versión nueva de la sincronización, se meten dentro con un portal, así se
// apilan en flujo vertical con su separación y ninguno tapa los botones del otro con texto grande o zoom.
export const NOTICE_STACK_ID = 'avisos-de-version';
