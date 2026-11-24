import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = { title: 'Sin conexión' };
export const dynamic = 'force-static';

/** La muestra el service worker cuando no hay red y la página no estaba guardada. */
export default function Offline() {
  return (
    <main className="offline">
      <Logo />
      <div className="print empty-sheet" aria-hidden="true">
        <div className="paper">
          <div className="photo" style={{ ['--ar' as string]: 1.5 }} />
          <p className="print-note">Sin señal</p>
        </div>
      </div>
      <h1>Estás sin conexión</h1>
      <p>Lo que ya miraste sigue guardado en este dispositivo. Para ver el resto, volvé a conectarte.</p>
      <Link className="btn" href="/">Volver a la mesa</Link>
    </main>
  );
}
