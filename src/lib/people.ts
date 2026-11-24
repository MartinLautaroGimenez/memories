/** Colores de avatar: tonos medios que funcionan con texto blanco en ambos temas. */
const AVATAR_COLORS = ['#4E6B78', '#7A5A4C', '#566B47', '#7A4C5F', '#86652A', '#4F5E86', '#6B5A86', '#3F6E66'];

export function avatarColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return AVATAR_COLORS[(h >>> 0) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1 ? parts[0].slice(0, 1).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Juli, Tomi y vos" */
export function namesList(names: string[], selfIncluded: boolean): string {
  const list = selfIncluded ? [...names, 'vos'] : names;
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}
