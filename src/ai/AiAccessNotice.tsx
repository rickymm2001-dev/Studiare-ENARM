// El aviso de por qué un motor de IA no se ofrece ahora (B12, 3.5). Con la compuerta cerrada el botón
// no aparece para los alumnos y se ve este aviso. Sin IA, sin conexión o mientras se revisa también
// se dice. Cuando el motor está abierto no hay nada que decir. Las funciones que en producción
// usan su plantilla sin hablar de IA, como el Tutor, no pintan este aviso con la IA no disponible.
import { cn } from '@/ui/cn';
import type { EngineAccess } from './gate';
import { accessNotice } from './text';

export function AiAccessNotice({
  access,
  gatedText,
  className,
}: {
  access: EngineAccess;
  /** El texto de la compuerta cerrada, que cambia según la función */
  gatedText?: string;
  className?: string;
}) {
  const text = accessNotice(access, gatedText);
  if (text === null) return null;
  return (
    <p role="status" className={cn('text-sm text-fg-muted', className)}>
      {text}
    </p>
  );
}
