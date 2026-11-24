import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Memories',
    short_name: 'Memories',
    description: 'Tus fotos de viajes y eventos en un lugar propio.',
    start_url: '/',
    display: 'standalone',
    background_color: '#E9EEF0',
    theme_color: '#E9EEF0',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
