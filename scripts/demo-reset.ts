// npm run demo-reset. La base demo vive en IndexedDB dentro del navegador y un script de Node no
// puede borrarla (D-052). Este script explica cómo hacerlo y sale sin error.
console.log(
  [
    'La base de demostración vive en el navegador (enarm_demo) y se regenera desde la app.',
    '1. Abre la app con npm run dev',
    '2. Ve a Perfil y elige Demostración',
    '3. Usa Regenerar desde cero y confirma',
    'Tu cuenta real (enarm_real) no se toca.',
  ].join('\n'),
);
