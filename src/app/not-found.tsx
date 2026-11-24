import Link from 'next/link';
import { TopBar } from '@/components/TopBar';

export default function NotFound() {
  return (
    <>
      <TopBar />
      <main className="auth">
        <div className="auth-card">
          <div>
            <p className="auth-note">Esta copia no está en la mesa</p>
            <h1>No la encontramos</h1>
            <p className="lead">Puede que el álbum se haya borrado o que no tengas acceso. Si te lo compartieron, pedí una invitación nueva.</p>
            <Link className="btn" href="/">
              Volver a tu mesa
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
