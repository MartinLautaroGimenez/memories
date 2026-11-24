import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Librerías nativas o con WASM que no se empaquetan
  serverExternalPackages: ['sharp', 'heic-decode', 'libheif-js', 'exifr', 'pg'],
  images: { unoptimized: true },
  // Carpetas del repo que no son parte del servidor (prototipo, marca, docs, pruebas, datos locales)
  outputFileTracingExcludes: {
    '*': ['design/**', 'brand/**', 'docs/**', 'tests/**', 'data/**', 'scripts/**', '.claude/**'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default config;
