import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Las imágenes ya se sirven en versiones reducidas propias (ver src/app/media).
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores(['.next/**', 'node_modules/**', 'design/**', 'brand/**', 'drizzle/**', 'data/**', 'test-results/**', 'playwright-report/**', 'next-env.d.ts']),
]);
