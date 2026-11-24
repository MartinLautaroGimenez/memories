import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { sql } from 'drizzle-orm';
import { auth } from './auth';
import { db } from './db';

export type CurrentUser = { id: string; name: string; email: string; role: string };

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string };
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? 'member' };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const u = await getUser();
  if (u) return u;
  if (!(await hasUsers())) redirect('/setup');
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
}

export const hasUsers = cache(async (): Promise<boolean> => {
  const r = await db.execute<{ any: boolean }>(sql`select exists(select 1 from "user") as any`);
  return Boolean(r.rows[0]?.any);
});
