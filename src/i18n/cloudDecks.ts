// Textos del catálogo de mazos de la nube para el alumno (B11, 4.8 y 5.8 del plan de B11). Viven
// aparte de t.cloudBank para que solo los cargue la pantalla Mazos con la bandera deckCatalogCloud y no
// pesen en el JavaScript inicial. Español de México con trato de tú y sin signos de exclamación.
const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;

/** Tamaño de un archivo para el alumno, en KB o MB */
export function fileSize(bytes: number): string {
  if (bytes < 1_000_000) {
    return `${Math.max(1, Math.round(bytes / 1000)).toLocaleString('es-MX')} KB`;
  }
  return `${(bytes / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MB`;
}

export const deckCatalogText = {
  title: 'Catálogo de mazos',
  description:
    'Mazos de médicos compartidos con su autorización. Baja solo las materias que vas a estudiar y repásalas también sin conexión.',
  loading: 'Cargando el catálogo…',
  offline:
    'Conéctate para ver el catálogo de mazos. Lo que ya bajaste sigue en Repasar sin conexión.',
  failed: 'No se pudo cargar el catálogo de mazos.',
  retry: 'Intentar de nuevo',
  empty: 'Todavía no hay mazos en el catálogo.',
  totals: (notes: number, size: string) =>
    `${plural(notes, 'nota', 'notas')} en total, ${size} con imágenes`,
  subjects: (n: number) => plural(n, 'materia', 'materias'),
  subjectsSummary: (downloaded: number, total: number) =>
    downloaded === 0
      ? `Ninguna bajada de ${total.toLocaleString('es-MX')}`
      : `${downloaded.toLocaleString('es-MX')} de ${total.toLocaleString('es-MX')} bajadas`,
  subjectStats: (notes: number, size: string) => `${plural(notes, 'nota', 'notas')}, ${size}`,
  download: 'Bajar',
  downloadLabel: (subject: string) => `Bajar ${subject}`,
  update: 'Actualizar',
  updateLabel: (subject: string) => `Actualizar ${subject}`,
  downloaded: 'Bajada',
  downloading: 'Bajando…',
  downloadAll: (size: string) => `Bajar todo (${size})`,
  updateAll: (size: string) => `Actualizar lo que cambió (${size})`,
  sizeWarning: (size: string) =>
    `Son ${size}. En el teléfono conviene bajarlo con wifi y con espacio libre.`,
  updateAvailable:
    'Hay una versión nueva de este mazo. Solo se bajan las materias que cambiaron y tus repasos se conservan.',
  done: (notes: number) => `Listo. Bajaste ${plural(notes, 'nota', 'notas')}.`,
  /** El aviso de arriba cuando el plan no baja todo el catálogo y el admin dejó mazos abiertos */
  freeDecks: (names: readonly string[]) => {
    const list = new Intl.ListFormat('es-MX', { style: 'long', type: 'conjunction' }).format(names);
    return names.length === 1 ? `${list} va abierto en Gratis.` : `${list} van abiertos en Gratis.`;
  },
  failures: {
    network: 'Sin conexión. Inténtalo cuando vuelvas a tener red.',
    missing: 'Falta un archivo de este mazo en el catálogo. Inténtalo más tarde.',
    denied: 'Bajar mazos del catálogo es parte de los planes de pago.',
    corrupt: 'Un archivo llegó dañado y no se guardó nada. Inténtalo de nuevo.',
  },
  preview: 'Notas de muestra',
  previewHint: 'Así se ven algunas notas de este mazo, sin imágenes.',
  review: 'Repasar',
  removeDownloads: 'Quitar descargas',
  removeDownloadsLabel: (deck: string) => `Quitar descargas de ${deck}`,
  removed:
    'Quitaste las imágenes de este mazo del dispositivo y ya no sale en Repasar. Si lo vuelves a bajar, tus repasos siguen donde iban.',
  removeFailed: 'No se pudieron quitar las descargas. Inténtalo de nuevo.',
  // La fuente de un mazo que no se comparte con autorización sino que sale de una fuente pública, como el
  // vocabulario de MedlinePlus (B13, 4.4). Dice quién publica la información y con qué licencia
  source: {
    line: (name: string, license: string) => `Fuente ${name}. ${license}.`,
    // Al pie de la lista de temas del mazo
    topicsFooter: (name: string, license: string) =>
      `Fuente ${name}. ${license}. Los nombres en español son los que publica la fuente. Studiare no los tradujo.`,
  },
} as const;
