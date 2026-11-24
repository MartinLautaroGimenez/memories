import type { Metadata } from 'next';
import { inviteSignupAction, joinAction, logoutAction } from '@/app/actions';
import { JoinForm, LoginLink, SignupForm } from '@/components/AuthForms';
import { TopBar } from '@/components/TopBar';
import { albumRole } from '@/server/access';
import { findAlbumById } from '@/server/albums';
import { db } from '@/server/db';
import { user } from '@/server/db/schema';
import { getUser } from '@/server/session';
import { findInvite } from '@/server/share';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Invitación' };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [me, inv] = await Promise.all([getUser(), findInvite(token)]);
  const album = inv ? await findAlbumById(inv.albumId) : null;

  if (!inv || !album) {
    return (
      <Shell me={me}>
        <h1>Esta invitación venció</h1>
        <p className="lead">Las invitaciones duran 14 días. Pedile a quien te invitó que te mande un link nuevo.</p>
      </Shell>
    );
  }
  if (me && (await albumRole(album.id, me.id))) redirect(`/a/${album.slug}`);

  const [from] = inv.createdBy ? await db.select({ name: user.name }).from(user).where(eq(user.id, inv.createdBy)) : [];
  const who = from?.name?.split(' ')[0] ?? 'Alguien';

  return (
    <Shell me={me}>
      <p className="auth-note">
        {who} te invitó a {album.title}
      </p>
      <h1>{album.title}</h1>
      {me ? (
        <>
          <p className="lead">Vas a poder ver todas las fotos del álbum y subir las tuyas.</p>
          <JoinForm action={joinAction.bind(null, token)} label="Sumarme al álbum" />
        </>
      ) : (
        <>
          <p className="lead">Creá tu cuenta para ver las fotos y subir las tuyas.</p>
          <SignupForm action={inviteSignupAction.bind(null, token)} submit="Crear cuenta y entrar" />
          <LoginLink next={`/invite/${token}`} />
        </>
      )}
    </Shell>
  );
}

function Shell({ me, children }: { me: Awaited<ReturnType<typeof getUser>>; children: React.ReactNode }) {
  return (
    <>
      <TopBar me={me} logout={me ? logoutAction : undefined} />
      <main className="auth">
        <div className="auth-card">
          <div>{children}</div>
        </div>
      </main>
    </>
  );
}
