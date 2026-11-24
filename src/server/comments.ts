import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { avatarColor } from '@/lib/people';
import type { CommentDTO } from '@/lib/types';
import { db } from './db';
import { comment, user } from './db/schema';

export async function listComments(photoId: string, meId: string, owner: boolean): Promise<CommentDTO[]> {
  const rows = await db
    .select({ c: comment, name: user.name })
    .from(comment)
    .leftJoin(user, eq(user.id, comment.userId))
    .where(eq(comment.photoId, photoId))
    .orderBy(asc(comment.createdAt));
  return rows.map(({ c, name }) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    author: { name: name ?? c.guestName ?? 'Alguien', color: avatarColor(c.userId ?? c.guestName ?? c.id), guest: !c.userId },
    mine: c.userId === meId,
    canDelete: c.userId === meId || owner,
  }));
}
