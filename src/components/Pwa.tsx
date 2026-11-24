'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useSyncExternalStore } from 'react';

/**
 * La app instalable. El service worker guarda lo que ya viste para mirarlo sin
 * conexión y recibe las fotos que se comparten desde la galería del celu.
 * Los navegadores solo instalan apps servidas por HTTPS (o desde localhost).
 */
type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => subs.delete(cb);
};

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(err => console.warn('[memories] service worker:', err));
  }, []);
  return (
    <Suspense fallback={null}>
      <KeepPages />
    </Suspense>
  );
}

/** Cada página que se abre queda guardada para verla sin conexión (la guarda el service worker, sin apuro). */
function KeepPages() {
  const path = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
    if (!sw || path.startsWith('/s/') || path === '/offline') return;
    const t = setTimeout(() => sw.postMessage({ type: 'keep-page', url: path + (search ? `?${search}` : '') }), 1500);
    return () => clearTimeout(t);
  }, [path, search]);
  return null;
}

export type InstallState = { can: boolean; standalone: boolean; ios: boolean; secure: boolean };
const serverState: InstallState = { can: false, standalone: false, ios: false, secure: true };
let last: InstallState = serverState;
function snapshot(): InstallState {
  const next: InstallState = {
    can: !!deferred,
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    ios: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    secure: window.isSecureContext,
  };
  // Mismo objeto si nada cambió (useSyncExternalStore lo exige)
  if (Object.keys(next).every(k => next[k as keyof InstallState] === last[k as keyof InstallState])) return last;
  return (last = next);
}

export function useInstall() {
  const state = useSyncExternalStore(subscribe, snapshot, () => serverState);
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    emit();
    return outcome === 'accepted';
  };
  return { ...state, install };
}

/** Al cerrar sesión: que no queden fotos guardadas en este navegador. */
export function forgetOfflineCopies() {
  navigator.serviceWorker?.controller?.postMessage('logout');
  if ('caches' in window) {
    caches.delete('memories-media').catch(() => {});
    caches.delete('memories-pages').catch(() => {});
  }
}

/** Para el perfil: cómo tener Memories como app en el celu o la compu. */
export function InstallCard() {
  const s = useInstall();
  return (
    <section className="panel install-card" aria-labelledby="app">
      <h2 id="app">La app</h2>
      {s.standalone ? (
        <p>Ya estás usando Memories como app. Desde la galería del celu podés compartir fotos directo a un álbum.</p>
      ) : !s.secure ? (
        <>
          <p>Memories se puede instalar como app en el celu y la compu, sin tiendas. Pero los navegadores solo lo permiten cuando la página se abre con <b>https://</b>.</p>
          <p className="hint">Quien administra el servidor puede ponerle HTTPS (por ejemplo con Caddy o Tailscale). Está explicado en el README.</p>
        </>
      ) : s.can ? (
        <>
          <p>Instalala para abrirla como una app, mirar sin conexión lo que ya viste y compartir fotos desde la galería directo a un álbum.</p>
          <button className="btn" type="button" onClick={() => s.install()}>Instalar Memories</button>
        </>
      ) : s.ios ? (
        <>
          <p>En el iPhone o el iPad:</p>
          <ol className="steps">
            <li>Abrí Memories en <b>Safari</b>.</li>
            <li>Tocá <b>Compartir</b> (el cuadrado con la flecha).</li>
            <li>Elegí <b>Agregar a inicio</b>.</li>
          </ol>
        </>
      ) : (
        <>
          <p>Abrí el menú del navegador y elegí <b>Instalar app</b> o <b>Agregar a la pantalla de inicio</b>.</p>
          <p className="hint">En Android, ya instalada, aparece en el menú Compartir de la galería.</p>
        </>
      )}
    </section>
  );
}
