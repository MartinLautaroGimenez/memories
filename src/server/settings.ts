import 'server-only';
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { setting } from './db/schema';
import { env } from './env';

/** Ajustes de la instalación que se cambian desde el panel de administración. */
export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };

export type Settings = {
  /** Mapas y Atlas (las teselas del mapa vienen de OpenStreetMap). */
  maps: boolean;
  /** Reconocimiento facial local. Usa CPU al revelar cada foto. */
  faces: boolean;
  /** Links públicos con subida de invitados. */
  guestUploads: boolean;
  smtp: SmtpSettings | null;
};

const DEFAULTS: Settings = { maps: true, faces: false, guestUploads: true, smtp: null };

type Cache = { at: number; value: Settings };
const g = globalThis as unknown as { __memoriesSettings?: Cache };

export async function getSettings(): Promise<Settings> {
  const c = g.__memoriesSettings;
  if (c && Date.now() - c.at < 5000) return c.value;
  const rows = await db.select().from(setting);
  const value: Settings = { ...DEFAULTS };
  for (const r of rows) {
    if (r.key in DEFAULTS) (value as Record<string, unknown>)[r.key] = r.value;
  }
  if (value.smtp?.pass) {
    try {
      value.smtp = { ...value.smtp, pass: await symmetricDecrypt({ key: env.AUTH_SECRET, data: value.smtp.pass }) };
    } catch {
      value.smtp = { ...value.smtp, pass: '' };
    }
  }
  g.__memoriesSettings = { at: Date.now(), value };
  return value;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  let stored: unknown = value;
  if (key === 'smtp' && value) {
    const s = value as SmtpSettings;
    stored = { ...s, pass: s.pass ? await symmetricEncrypt({ key: env.AUTH_SECRET, data: s.pass }) : '' };
  }
  await db
    .insert(setting)
    .values({ key, value: stored as object })
    .onConflictDoUpdate({ target: setting.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
  g.__memoriesSettings = undefined;
}

/** SMTP definido por variables de entorno: tiene prioridad sobre el del panel. */
export function smtpFromEnv(): SmtpSettings | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? `Memories <${process.env.SMTP_USER || 'memories@localhost'}>`,
  };
}
