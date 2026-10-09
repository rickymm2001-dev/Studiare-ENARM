// Texto de la insignia que sale al final de una línea con marca. Es una función de módulo y no una
// del componente, para que el editor no se vuelva a armar en cada pintura.
import { clozeHoles } from '@/engines/cloze';
import type { ParsedLine } from '@/engines/outline';
import { t } from '@/i18n/es-MX';

export function lineBadge(line: ParsedLine): string | null {
  const { mark } = line;
  switch (mark.type) {
    case 'none':
      return null;
    case 'forward':
      return t.outlines.badge.forward;
    case 'backward':
      return t.outlines.badge.backward;
    case 'both':
      return t.outlines.badge.both;
    case 'multiline':
      return t.outlines.badge.multiline;
    case 'cloze':
      return t.outlines.badge.cloze(
        new Set(clozeHoles(mark.text).map((hole) => hole.ordinal)).size,
      );
  }
}
