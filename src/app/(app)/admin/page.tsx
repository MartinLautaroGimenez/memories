import type { Metadata } from 'next';
import { listUsers, soloAlbums, storageStats } from '@/server/admin';
import { smtpFromEnv, getSettings } from '@/server/settings';
import { requireAdmin } from '@/server/session';
import { AdminPanel } from './AdminPanel';

export const metadata: Metadata = { title: 'Administración' };

export default async function AdminPage() {
  const me = await requireAdmin();
  const [users, storage, settings] = await Promise.all([listUsers(), storageStats(), getSettings()]);
  const solo = Object.fromEntries(await Promise.all(users.map(async u => [u.id, await soloAlbums(u.id)] as const)));
  const envSmtp = !!smtpFromEnv();
  const smtp = settings.smtp ? { ...settings.smtp, pass: settings.smtp.pass ? 'guardada' : '' } : null;
  return (
    <section>
      <header className="page-head">
        <h1 className="page-title">Administración</h1>
      </header>
      <AdminPanel
        meId={me.id}
        users={users}
        solo={solo}
        storage={storage}
        features={{ maps: settings.maps, faces: settings.faces, guestUploads: settings.guestUploads }}
        smtp={smtp}
        envSmtp={envSmtp}
      />
    </section>
  );
}
