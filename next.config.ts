import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Librerías nativas o con WASM que no se empaquetan
  serverExternalPackages: ['sharp', 'heic-decode', 'libheif-js', 'exifr', 'pg'],
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default config;
