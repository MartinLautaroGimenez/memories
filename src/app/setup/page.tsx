import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setupAction } from '@/app/actions';
import { SignupForm } from '@/components/AuthForms';
import { TopBar } from '@/components/TopBar';
import { hasUsers } from '@/server/session';

export const metadata: Metadata = { title: 'Primeros pasos' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await hasUsers()) redirect('/login');
  return (
    <>
      <TopBar />
      <main className="auth">
        <div className="auth-card">
          <div>
            <h1>Tu mesa está lista</h1>
            <p className="lead">Creá la primera cuenta. Va a administrar esta instalación de Memories y después vas a poder invitar a quien quieras a cada álbum.</p>
            <SignupForm action={setupAction} submit="Crear cuenta" />
          </div>
        </div>
      </main>
    </>
  );
}
