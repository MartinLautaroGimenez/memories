import { logoutAction } from '@/app/actions';
import { TopBar } from '@/components/TopBar';
import { getUser } from '@/server/session';

export const dynamic = 'force-dynamic';

/** Cada página pide la sesión con `requireUser(next)` para volver al mismo lugar después de entrar. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getUser();
  return (
    <>
      <TopBar me={me} logout={me ? logoutAction : undefined} />
      <main className="page">{children}</main>
    </>
  );
}
