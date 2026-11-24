import 'server-only';
import path from 'node:path';

/**
 * Configuración leída de variables de entorno.
 * Se resuelve de forma perezosa para que `next build` funcione sin base de datos.
 */
function read(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Falta la variable de entorno ${name}. Revisá tu archivo .env (hay un ejemplo en .env.example).`);
}

export const env = {
  get APP_URL() {
    return read('APP_URL', 'http://localhost:3000').replace(/\/+$/, '');
  },
  get DATABASE_URL() {
    return read('DATABASE_URL');
  },
  get AUTH_SECRET() {
    const fallback = process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-no-usar-en-produccion-0123456789';
    return read('AUTH_SECRET', process.env.BETTER_AUTH_SECRET ?? fallback);
  },
  get STORAGE_PATH() {
    return path.resolve(read('STORAGE_PATH', './data'));
  },
  get MAX_UPLOAD_BYTES() {
    return Number(read('MAX_UPLOAD_MB', '200')) * 1024 * 1024;
  },
  get PROCESS_CONCURRENCY() {
    return Math.max(1, Number(read('PROCESS_CONCURRENCY', '2')) || 2);
  },
  get TRUSTED_ORIGINS() {
    return read('TRUSTED_ORIGINS', '')
      .split(',')
      .map(s => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
  },
};
