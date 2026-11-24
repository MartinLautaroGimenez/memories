import Link from 'next/link';
import { LOGO_MARKUP, LOGO_VIEWBOX } from './logo-markup';

/** Logo de Memories. Los colores siguen al tema (ver --logo-* en app.css). */
export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link className="logo" href={href} aria-label="Memories, ir a tu mesa">
      <svg viewBox={LOGO_VIEWBOX} role="img" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_MARKUP }} />
    </Link>
  );
}
