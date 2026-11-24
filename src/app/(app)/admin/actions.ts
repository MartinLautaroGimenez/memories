'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createAccount, deleteAccount, setPassword, setRole, tempPassword } from '@/server/admin';
import { auth } from '@/server/auth';
import { env } from '@/server/env';
import { mailEnabled, sendMail, transportFor } from '@/server/mail';
import { requireAdmin } from '@/server/session';
import { getSettings, setSetting, type Settings } from '@/server/settings';

export type AdminResult = { ok?: string; error?: string; secret?: string } | undefined;

const fail = (e: unknown): AdminResult => ({ error: e instanceof Error ? e.message : 'No pudimos guardar el cambio.' });

const NewUser = z.object({
  name: z.string().trim().min(1, 'Falta el nombre.').max(80),
  email: z.email('Ese email no parece válido.').trim().toLowerCase(),
  send: z.enum(['on']).optional(),
});

export async function createUserAction(_: AdminResult, fd: FormData): Promise<AdminResult> {
  await requireAdmin();
  const p = NewUser.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const sendLink = p.data.send === 'on' && (await mailEnabled());
  const password = tempPassword();
  try {
    await createAccount(p.data.name, p.data.email, password);
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/admin');
  if (sendLink) {
    await auth.api.requestPasswordReset({ body: { email: p.data.email, redirectTo: `${env.APP_URL}/restablecer` }, headers: await headers() });
    return { ok: `Cuenta creada. Le mandamos a ${p.data.email} un link para elegir su contraseña.` };
  }
  return { ok: `Cuenta creada. Pasale esta contraseña temporal a ${p.data.name.split(' ')[0]}:`, secret: password };
}

export async function resetPasswordAction(userId: string, mode: 'temp' | 'email'): Promise<AdminResult> {
  await requireAdmin();
  const ctx = await auth.$context;
  const u = await ctx.internalAdapter.findUserById(userId);
  if (!u) return { error: 'Esa cuenta ya no existe.' };
  if (mode === 'email') {
    if (!(await mailEnabled())) return { error: 'Primero configurá el correo (SMTP) más abajo.' };
    await auth.api.requestPasswordReset({ body: { email: u.email, redirectTo: `${env.APP_URL}/restablecer` }, headers: await headers() });
    return { ok: `Le mandamos a ${u.email} un link para elegir una contraseña nueva.` };
  }
  const password = tempPassword();
  await setPassword(userId, password);
  return { ok: `Nueva contraseña para ${u.name.split(' ')[0]}. Se cerraron sus sesiones abiertas:`, secret: password };
}

export async function setRoleAction(userId: string, role: 'admin' | 'member'): Promise<AdminResult> {
  const me = await requireAdmin();
  if (userId === me.id) return { error: 'No podés cambiar tu propio permiso.' };
  try {
    await setRole(userId, role);
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/admin');
  return { ok: role === 'admin' ? 'Ahora administra la instalación.' : 'Ya no administra la instalación.' };
}

export async function deleteUserAction(userId: string): Promise<AdminResult> {
  const me = await requireAdmin();
  if (userId === me.id) return { error: 'No podés borrar tu propia cuenta desde acá.' };
  const { removedAlbums } = await deleteAccount(userId);
  revalidatePath('/admin');
  return { ok: removedAlbums ? `Cuenta borrada, junto con ${removedAlbums} álbum${removedAlbums === 1 ? '' : 'es'} que eran solo suyos.` : 'Cuenta borrada.' };
}

export async function toggleSettingAction(key: 'maps' | 'faces' | 'guestUploads', value: boolean): Promise<AdminResult> {
  await requireAdmin();
  await setSetting(key, value);
  revalidatePath('/', 'layout');
  const label: Record<typeof key, string> = { maps: 'Mapas', faces: 'Reconocimiento facial', guestUploads: 'Subidas de invitados' };
  return { ok: `${label[key]}: ${value ? 'activado' : 'desactivado'}` };
}

const Smtp = z.object({
  host: z.string().trim().min(1, 'Falta el servidor.'),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.enum(['on']).optional(),
  user: z.string().trim().optional().default(''),
  pass: z.string().optional().default(''),
  from: z.string().trim().min(3, 'Falta el remitente, por ejemplo Memories <fotos@tudominio.com>.'),
});

async function smtpFromForm(fd: FormData) {
  const p = Smtp.safeParse(Object.fromEntries(fd));
  if (!p.success) throw new Error(p.error.issues[0].message);
  const current = (await getSettings()).smtp;
  return {
    host: p.data.host, port: p.data.port, secure: p.data.secure === 'on', user: p.data.user,
    pass: p.data.pass || current?.pass || '', from: p.data.from,
  } satisfies NonNullable<Settings['smtp']>;
}

export async function saveSmtpAction(_: AdminResult, fd: FormData): Promise<AdminResult> {
  await requireAdmin();
  try {
    const s = await smtpFromForm(fd);
    await setSetting('smtp', s);
  } catch (e) {
    return fail(e);
  }
  revalidatePath('/admin');
  return { ok: 'Correo guardado.' };
}

export async function testSmtpAction(fd: FormData): Promise<AdminResult> {
  const me = await requireAdmin();
  try {
    const s = await smtpFromForm(fd);
    await transportFor(s).verify();
    await sendMail(
      { to: me.email, subject: 'Prueba de correo de Memories', title: 'El correo anda', lines: ['Si estás leyendo esto, Memories ya puede mandar invitaciones, avisos y links para recuperar contraseñas.'] },
      s,
    );
    return { ok: `Listo, mandamos un mail de prueba a ${me.email}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `No pudimos mandar el mail: ${msg}. Revisá el servidor, el puerto y la contraseña.` };
  }
}

export async function removeSmtpAction(): Promise<AdminResult> {
  await requireAdmin();
  await setSetting('smtp', null);
  revalidatePath('/admin');
  return { ok: 'Se borró la configuración de correo.' };
}
