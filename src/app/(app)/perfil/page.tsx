import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { user } from '@/server/db/schema';
import { mailEnabled } from '@/server/mail';
import { requireUser } from '@/server/session';
import { ProfileForms } from './ProfileForms';

export const metadata: Metadata = { title: 'Tu perfil' };

export default async function ProfilePage() {
  const me = await requireUser('/perfil');
  const [u] = await db.select({ notifications: user.emailNotifications }).from(user).where(eq(user.id, me.id));
  return (
    <section>
      <header className="page-head">
        <h1 className="page-title">Tu perfil</h1>
      </header>
      <ProfileForms name={me.name} email={me.email} notifications={u?.notifications ?? true} mail={await mailEnabled()} />
    </section>
  );
}
