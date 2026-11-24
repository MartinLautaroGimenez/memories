import type { Metadata } from 'next';
import Link from 'next/link';
import { resetPasswordAction } from '@/app/actions';
import { TopBar } from '@/components/TopBar';
import { NewPasswordForm } from './NewPasswordForm';

export const metadata: Metadata = { title: 'Contraseña nueva' };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <>
      <TopBar />
      <main className="auth">
        <div className="auth-card">
          <div>
            <h1>Contraseña nueva</h1>
            {!token || error ? (
              <>
                <p className="lead">El link venció o ya se usó. Pedí uno nuevo.</p>
                <Link className="btn" href="/recuperar">Pedir otro link</Link>
              </>
            ) : (
              <NewPasswordForm action={resetPasswordAction.bind(null, token)} />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
