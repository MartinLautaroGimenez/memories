/*
 * Memories: service worker.
 * - Guarda lo que ya viste (páginas, miniaturas y fotos) para mirarlo sin conexión.
 * - Recibe las fotos que se comparten desde el celu (share_target del manifest).
 * Las llamadas a /api nunca se guardan.
 */
const VERSION = 'v1';
const SHELL = `memories-shell-${VERSION}`;
const STATIC = 'memories-static'; // /_next/static lleva hash en el nombre: no vence
const MEDIA = 'memories-media';
const PAGES = 'memories-pages';
const SHARE = 'memories-share';
const MEDIA_MAX = 900;
const PAGES_MAX = 60;

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      await shell.addAll(['/offline', '/icons/icon-192.png']);
      // Los estilos y scripts de la página sin conexión, para que se vea bien sin red
      const html = await (await shell.match('/offline')).text();
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || [])];
      const st = await caches.open(STATIC);
      await Promise.all(assets.map(a => st.add(a).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('memories-shell-') && k !== SHELL) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

/* Al cerrar sesión se borra todo lo guardado de las fotos. */
self.addEventListener('message', event => {
  if (event.data === 'logout') event.waitUntil(Promise.all([caches.delete(MEDIA), caches.delete(PAGES)]));
  // Las páginas que se abren navegando adentro de la app no pasan como "navigate": la app avisa y se guardan igual
  if (event.data && event.data.type === 'keep-page') event.waitUntil(keepPage(event.data.url));
});

async function keepPage(href) {
  const url = new URL(href, self.location.origin);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  try {
    const res = await fetch(url.pathname + url.search, { credentials: 'same-origin', headers: { accept: 'text/html' } });
    if (res.status === 200 && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
      const cache = await caches.open(PAGES);
      await cache.put(new Request(url.pathname + url.search), res);
      trim(cache, PAGES_MAX);
    }
  } catch {
    /* sin red: no pasa nada */
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.status === 200) {
    await cache.put(request, res.clone());
    if (max) trim(cache, max);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    // Solo se guardan las páginas de verdad (no los redireccionamientos al login)
    if (res.status === 200 && !res.redirected) {
      await cache.put(new Request(new URL(request.url).pathname + new URL(request.url).search), res.clone());
      trim(cache, PAGES_MAX);
    }
    return res;
  } catch {
    const url = new URL(request.url);
    return (await cache.match(url.pathname + url.search)) || (await caches.match('/offline')) || Response.error();
  }
}

/* "Compartir con Memories" desde la galería del celu: las fotos se guardan acá hasta elegir el álbum. */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('photos').filter(f => typeof f !== 'string');
    await caches.delete(SHARE);
    const cache = await caches.open(SHARE);
    await Promise.all(
      files.map((f, i) =>
        cache.put(
          `/__compartidas/${i}`,
          new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || `foto-${i + 1}.jpg`), 'x-modified': String(f.lastModified || Date.now()) } }),
        ),
      ),
    );
    return Response.redirect(`/compartir?n=${files.length}`, 303);
  } catch {
    return Response.redirect('/compartir?error=1', 303);
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === 'POST' && url.pathname === '/compartir') return event.respondWith(receiveShare(request));
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) return event.respondWith(cacheFirst(request, STATIC));
  // Miniaturas, fotos y caras (los originales no: son pesados y se piden para descargar)
  if (url.pathname.startsWith('/media/') && !url.pathname.endsWith('/original')) return event.respondWith(cacheFirst(request, MEDIA, MEDIA_MAX));
  if (request.mode === 'navigate') return event.respondWith(networkFirst(request));
});
