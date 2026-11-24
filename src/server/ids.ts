import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/** Id aleatorio corto y apto para URLs (sin caracteres ambiguos como l, I u O). */
export function newId(length = 16): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Token largo para links públicos e invitaciones. */
export function newToken(): string {
  return randomBytes(18).toString('base64url');
}

/** "Bariloche, invierno 2026" -> "bariloche-invierno-2026" */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '') || 'album'
  );
}

export function albumSlug(title: string): string {
  return `${slugify(title)}-${newId(4).toLowerCase()}`;
}
