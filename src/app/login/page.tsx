import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loginAction } from '@/app/actions';
import { LoginForm } from '@/components/AuthForms';
import { TopBar } from '@/components/TopBar';
import { getUser, hasUsers } from '@/server/session';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getUser()) redirect(next?.startsWith('/') && !next.startsWith('//') ? next : '/');
  if (!(await hasUsers())) redirect('/setup');
  return (
    <>
      <TopBar />
      <main className="auth">
        <div className="auth-card">
          <div>
            <h1>Entrar</h1>
            <p className="lead">Tus álbumes te esperan sobre la mesa.</p>
            <LoginForm action={loginAction} next={next} />
            <p className="auth-foot">¿No tenés cuenta? Pedile a alguien que te invite a un álbum.</p>
          </div>
        </div>
      </main>
    </>
  );
}
