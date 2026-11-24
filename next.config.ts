import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Librerías nativas o con WASM que no se empaquetan
  serverExternalPackages: ['sharp', 'heic-decode', 'libheif-js', 'exifr', 'pg', 'onnxruntime-node'],
  images: { unoptimized: true },
  // Carpetas del repo que no son parte del servidor (prototipo, marca, docs, pruebas, datos locales)
  outputFileTracingExcludes: {
    '*': [
      'design/**', 'brand/**', 'docs/**', 'tests/**', 'data/**', 'scripts/**', '.claude/**',
      // ONNX Runtime trae binarios para todos los sistemas: el servidor solo usa los de Linux
      '**/onnxruntime-node/bin/napi-v*/darwin/**', '**/onnxruntime-node/bin/napi-v*/win32/**',
    ],
  },
  // El binding de ONNX Runtime carga su librería compartida al lado: hay que copiarla (solo la de esta arquitectura)
  outputFileTracingIncludes: {
    '*': [
      `./node_modules/.pnpm/onnxruntime-node@*/node_modules/onnxruntime-node/bin/napi-v*/linux/${process.arch}/*`,
      `./node_modules/onnxruntime-node/bin/napi-v*/linux/${process.arch}/*`,
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default config;
