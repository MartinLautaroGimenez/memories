import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { canUpload } from '../access';
import type { MemberRole } from '../db/schema';
import { db } from '../db';
import { face } from '../db/schema';
import { fail } from '../http';
import { faceWithRole, findOrCreatePerson } from '../people';
import { facesChanged, suggestFor } from '.';

/** Solo quienes pueden subir fotos al álbum dicen quién aparece. */
export async function editableFace(me: string, faceId: string) {
  const f = await faceWithRole(me, faceId);
  if (!f || !f.role) return { error: fail(404, 'Esa cara ya no está.') };
  if (!canUpload(f.role as MemberRole)) return { error: fail(403, 'Solo quienes suben fotos a este álbum pueden decir quién aparece.') };
  return { face: f };
}

/** Pone nombre a una o varias caras (confirmadas) y busca otras parecidas para sugerir. */
export async function nameFaces(me: string, faceIds: string[], target: { name?: string; personId?: string }) {
  const personId = target.personId ?? (await findOrCreatePerson(me, target.name!));
  // Si antes se sugería otra persona, esa queda descartada para estas caras
  await db
    .update(face)
    .set({
      rejected: sql`case when ${face.personId} is not null and ${face.personId} <> ${personId} and not (${face.personId} = any(${face.rejected})) then array_append(${face.rejected}, ${face.personId}) else ${face.rejected} end`,
      personId,
      confirmed: true,
      hidden: false,
    })
    .where(inArray(face.id, faceIds));
  facesChanged();
  await suggestFor(personId);
  return personId;
}

export async function rejectFace(faceId: string) {
  await db
    .update(face)
    .set({ rejected: sql`case when ${face.personId} is null or ${face.personId} = any(${face.rejected}) then ${face.rejected} else array_append(${face.rejected}, ${face.personId}) end`, personId: null, confirmed: false })
    .where(eq(face.id, faceId));
  facesChanged();
}

export async function hideFace(faceId: string, manual: boolean) {
  if (manual) await db.delete(face).where(and(eq(face.id, faceId), eq(face.source, 'manual')));
  else await db.update(face).set({ hidden: true, personId: null, confirmed: false }).where(eq(face.id, faceId));
  facesChanged();
}
