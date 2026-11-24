import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Memories',
    short_name: 'Memories',
    description: 'Tus fotos de viajes y eventos en un lugar propio.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    categories: ['photo', 'travel', 'lifestyle'],
    background_color: '#E9EEF0',
    theme_color: '#E9EEF0',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // "Compartir con Memories" desde la galería: el service worker guarda las fotos y abre /compartir
    share_target: {
      action: '/compartir',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', files: [{ name: 'photos', accept: ['image/*', '.heic', '.heif'] }] },
    },
    shortcuts: [
      { name: 'Personas', url: '/personas', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Atlas', url: '/atlas', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  } as MetadataRoute.Manifest;
}
