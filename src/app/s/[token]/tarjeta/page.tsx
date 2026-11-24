import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { activeLink } from '@/server/access';
import { findAlbumById } from '@/server/albums';
import { linkUrl } from '@/server/share';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tarjeta para imprimir', referrer: 'no-referrer' };

/** Tarjeta para imprimir y dejar en las mesas de un evento. */
export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await activeLink(token);
  const album = link ? await findAlbumById(link.albumId) : null;
  if (!link || !album) notFound();
  const url = linkUrl(token);
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#172024', light: '#ffffff' } });
  return (
    <main className="print-card-page">
      <div className="print-card">
        <p className="card-hand">{link.allowUpload ? '¿Sacaste fotos? Subilas acá' : 'Las fotos de'}</p>
        <h1>{album.title}</h1>
        <div className="card-qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="card-steps">
          {link.allowUpload
            ? 'Escaneá el código con la cámara del celu, poné tu nombre y elegí tus fotos. No hace falta crear una cuenta.'
            : 'Escaneá el código con la cámara del celu para ver todas las fotos.'}
        </p>
        <p className="card-url">{url}</p>
      </div>
      <PrintButton />
    </main>
  );
}
