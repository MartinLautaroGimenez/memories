import { logoutAction } from '@/app/actions';
import { TopBar } from '@/components/TopBar';
import { requireUser } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <>
      <TopBar me={me} logout={logoutAction} />
      <main className="page">{children}</main>
    </>
  );
}
