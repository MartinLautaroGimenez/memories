'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { activeLink, unlockLink } from '@/server/access';
import { findAlbumById } from '@/server/albums';
import { auth } from '@/server/auth';
import { getUser, hasUsers } from '@/server/session';
import { acceptInvite, checkLinkPassword, findInvite } from '@/server/share';

export type FormState = { error?: string; values?: Record<string, string> } | undefined;

const Signup = z.object({
  name: z.string().trim().min(1, 'Contanos cómo te llamás.').max(80),
  email: z.email('Ese email no parece válido.').trim().toLowerCase(),
  password: z.string().min(8, 'La contraseña tiene que tener al menos 8 caracteres.').max(200),
});
const Login = z.object({
  email: z.email('Ese email no parece válido.').trim().toLowerCase(),
  password: z.string().min(1, 'Escribí tu contraseña.'),
});

function fields(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

function firstIssue(err: z.ZodError) {
  return err.issues[0]?.message ?? 'Revisá los datos.';
}

/** Traduce los errores de Better Auth a mensajes que digan qué hacer. */
function authMessage(err: unknown): string {
  const e = err as { body?: { code?: string }; message?: string };
  switch (e?.body?.code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'Ya hay una cuenta con ese email. Entrá con tu contraseña.';
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'El email o la contraseña no coinciden.';
    case 'PASSWORD_TOO_SHORT':
      return 'La contraseña tiene que tener al menos 8 caracteres.';
    case 'INVALID_EMAIL':
      return 'Ese email no parece válido.';
    default:
      console.error('[memories] error de autenticación', err);
      return 'No pudimos completar el pedido. Probá de nuevo en un momento.';
  }
}

const safeNext = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/');

/** Crea la primera cuenta, que administra la instancia. */
export async function setupAction(_: FormState, fd: FormData): Promise<FormState> {
  const values = fields(fd);
  if (await hasUsers()) redirect('/login');
  const parsed = Signup.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  try {
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (err) {
    return { error: authMessage(err), values };
  }
  redirect('/');
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const values = fields(fd);
  const parsed = Login.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values: { email: values.email ?? '' } };
  try {
    await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (err) {
    return { error: authMessage(err), values: { email: values.email ?? '' } };
  }
  redirect(safeNext(values.next));
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect('/login');
}

/** Alguien con sesión acepta una invitación. */
export async function joinAction(token: string) {
  const u = await getUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  const inv = await findInvite(token);
  if (!inv) redirect(`/invite/${token}`);
  await acceptInvite(inv, u.id);
  const a = await findAlbumById(inv.albumId);
  redirect(a ? `/a/${a.slug}` : '/');
}

/** Alguien nuevo crea su cuenta desde una invitación. */
export async function inviteSignupAction(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const values = fields(fd);
  const inv = await findInvite(token);
  if (!inv) return { error: 'Esta invitación venció. Pedile a quien te invitó un link nuevo.', values };
  const parsed = Signup.safeParse(values);
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  let userId: string;
  try {
    const res = await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
    userId = res.user.id;
  } catch (err) {
    return { error: authMessage(err), values };
  }
  await acceptInvite(inv, userId);
  const a = await findAlbumById(inv.albumId);
  redirect(a ? `/a/${a.slug}` : '/');
}

/** Destraba un link público con contraseña. */
export async function unlockShareAction(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const link = await activeLink(token);
  if (!link) return { error: 'Este link ya no está activo.' };
  const password = String(fd.get('password') ?? '');
  if (!link.passwordHash || !(await checkLinkPassword(link.passwordHash, password))) {
    return { error: 'Esa no es la contraseña. Pedísela a quien te compartió el álbum.' };
  }
  await unlockLink(link);
  redirect(`/s/${token}`);
}

/* ---------- Recuperar contraseña ---------- */

export async function requestResetAction(_: FormState, fd: FormData): Promise<FormState> {
  const { mailEnabled } = await import('@/server/mail');
  const { env } = await import('@/server/env');
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { error: 'Ese email no parece válido.', values: { email } };
  if (!(await mailEnabled())) {
    return { error: 'Esta instalación todavía no tiene correo configurado. Pedile a quien la administra que te genere una contraseña nueva.', values: { email } };
  }
  try {
    await auth.api.requestPasswordReset({ body: { email, redirectTo: `${env.APP_URL}/restablecer` }, headers: await headers() });
  } catch (err) {
    console.error('[memories] no se pudo pedir el cambio de contraseña', err);
  }
  // Mismo mensaje exista o no la cuenta, para no revelar quién usa Memories.
  return { values: { sent: '1', email } };
}

export async function resetPasswordAction(token: string, _: FormState, fd: FormData): Promise<FormState> {
  const newPassword = String(fd.get('password') ?? '');
  if (newPassword.length < 8) return { error: 'La contraseña tiene que tener al menos 8 caracteres.' };
  if (newPassword !== String(fd.get('repeat') ?? '')) return { error: 'Las dos contraseñas no coinciden.' };
  try {
    await auth.api.resetPassword({ body: { newPassword, token }, headers: await headers() });
  } catch {
    return { error: 'El link venció o ya se usó. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".' };
  }
  redirect('/login?restablecida=1');
}
