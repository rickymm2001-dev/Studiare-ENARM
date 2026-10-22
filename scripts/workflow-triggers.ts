// Lee los eventos que disparan un flujo de GitHub Actions (la clave on:) desde su texto, sin interpretar todo el YAML.
// Lo usan las pruebas de los flujos que publican (cloudflare.yml y pages.yml) para vigilar que nadie les ponga un
// evento que corra con secretos sobre código de otro repositorio, como pull_request_target o workflow_run.

/**
 * Los nombres de los eventos de la clave on: de primer nivel. Entiende los tres modos de escribirla en YAML
 * (on: push, on: [push, pull_request] y el bloque con una clave por evento). Lo demás es un error y no se adivina
 */
export function workflowTriggers(source: string): string[] {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^(?:on|"on"|'on'):/.test(line));
  if (start === -1) throw new Error('El flujo no tiene la clave on: de primer nivel');
  const head = (lines[start] ?? '')
    .replace(/^(?:on|"on"|'on'):/, '')
    .replace(/\s+#.*$/, '')
    .trim();
  if (head.startsWith('[')) {
    if (!head.endsWith(']'))
      throw new Error('La lista de eventos de on: debe cerrar en el mismo renglón');
    return head
      .slice(1, -1)
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== '');
  }
  if (head !== '') return [head];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // Un renglón sin sangría ya es otra clave de primer nivel
    if (/^\S/.test(line)) break;
    const key = /^ {2}([A-Za-z_][\w-]*):/.exec(line)?.[1];
    if (key !== undefined) names.push(key);
  }
  return names;
}
