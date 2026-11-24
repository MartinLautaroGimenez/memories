import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Atlas } from '@/components/Atlas';
import { atlasAlbums } from '@/server/albums';
import { requireUser } from '@/server/session';
import { getSettings } from '@/server/settings';

export const metadata: Metadata = { title: 'Atlas' };

export default async function AtlasPage() {
  const me = await requireUser('/atlas');
  if (!(await getSettings()).maps) notFound();
  const albums = await atlasAlbums(me.id);
  const head = (
    <header className="page-head">
      <h1 className="page-title">Atlas</h1>
      <p className="home-sub" style={{ marginTop: 12 }}>
        {albums.length ? 'Cada punto es un viaje. Tocalo para abrir el álbum.' : 'Cuando subas fotos con ubicación (la mayoría de los celulares la guardan), tus viajes aparecen acá.'}
      </p>
    </header>
  );
  return <section>{albums.length > 0 ? <Atlas albums={albums}>{head}</Atlas> : head}</section>;
}
