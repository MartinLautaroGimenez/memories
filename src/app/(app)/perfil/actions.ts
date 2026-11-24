'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { user } from '@/server/db/schema';
import { requireUser } from '@/server/session';

export type ProfileResult = { ok?: string; error?: string } | undefined;

export async function updateNameAction(_: ProfileResult, fd: FormData): Promise<ProfileResult> {
  await requireUser('/perfil');
  const name = String(fd.get('name') ?? '').trim();
  if (!name || name.length > 80) return { error: 'Escribí tu nombre (hasta 80 caracteres).' };
  await auth.api.updateUser({ body: { name }, headers: await headers() });
  revalidatePath('/', 'layout');
  return { ok: 'Nombre guardado.' };
}

export async function changePasswordAction(_: ProfileResult, fd: FormData): Promise<ProfileResult> {
  await requireUser('/perfil');
  const currentPassword = String(fd.get('current') ?? '');
  const newPassword = String(fd.get('next') ?? '');
  if (newPassword.length < 8) return { error: 'La contraseña nueva tiene que tener al menos 8 caracteres.' };
  if (newPassword !== String(fd.get('repeat') ?? '')) return { error: 'Las dos contraseñas nuevas no coinciden.' };
  try {
    await auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    const code = (e as { body?: { code?: string } }).body?.code;
    return { error: code === 'INVALID_PASSWORD' ? 'La contraseña actual no es correcta.' : 'No pudimos cambiar la contraseña. Probá de nuevo.' };
  }
  return { ok: 'Contraseña cambiada. Se cerraron tus sesiones en otros dispositivos.' };
}

export async function setNotificationsAction(on: boolean): Promise<ProfileResult> {
  const me = await requireUser('/perfil');
  await db.update(user).set({ emailNotifications: on }).where(eq(user.id, me.id));
  return { ok: on ? 'Vas a recibir avisos por mail.' : 'Ya no vas a recibir avisos por mail.' };
}
