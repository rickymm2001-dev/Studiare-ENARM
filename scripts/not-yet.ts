// Marcador de los scripts de 5.2 que llegan en fases posteriores.
// Sale con error para que nadie confunda un script vacío con uno que pasó.
const [script = 'este script', phase = '?'] = process.argv.slice(2);

console.error(`npm run ${script} todavía no existe. Llega en la Fase ${phase} (ver PLAN.md).`);
process.exit(1);
