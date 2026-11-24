import type { Metadata } from 'next';
import { SharePicker } from '@/components/SharePicker';
import { uploadableAlbums } from '@/server/albums';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Compartir fotos' };

/** Llegan acá las fotos compartidas desde la galería del celu (ver public/sw.js). */
export default async function SharePage() {
  const me = await requireUser('/compartir');
  return (
    <section>
      <header className="page-head">
        <h1 className="page-title">¿A qué álbum?</h1>
      </header>
      <SharePicker albums={await uploadableAlbums(me.id)} />
    </section>
  );
}
