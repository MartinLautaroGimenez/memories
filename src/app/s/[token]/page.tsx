import type { Metadata } from 'next';
import { unlockShareAction } from '@/app/actions';
import { AlbumView } from '@/components/AlbumView';
import { PasswordForm } from '@/components/AuthForms';
import { TopBar } from '@/components/TopBar';
import { activeLink, linkUnlocked } from '@/server/access';
import { findAlbumById, loadAlbum } from '@/server/albums';
import { getSettings } from '@/server/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Álbum compartido', referrer: 'no-referrer' };

/** Vista pública de un álbum, de solo lectura. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await activeLink(token);
  const album = link ? await findAlbumById(link.albumId) : null;

  if (!link || !album) {
    return (
      <Card title="Este link ya no está activo">
        <p className="lead">Quien te lo compartió lo apagó o lo cambió. Pedile uno nuevo.</p>
      </Card>
    );
  }
  if (!(await linkUnlocked(link))) {
    return (
      <Card title={album.title}>
        <p className="lead">Este álbum pide contraseña.</p>
        <PasswordForm action={unlockShareAction.bind(null, token)} />
      </Card>
    );
  }

  const dto = await loadAlbum(album, 'public');
  dto.shareToken = token;
  dto.allowDownload = link.allowDownload;
  dto.allowUpload = link.allowUpload && (await getSettings()).guestUploads;
  return (
    <>
      <TopBar />
      <main className="page">
        <AlbumView album={dto} me={null} />
      </main>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="auth">
        <div className="auth-card">
          <div>
            <h1>{title}</h1>
            {children}
          </div>
        </div>
      </main>
    </>
  );
}
