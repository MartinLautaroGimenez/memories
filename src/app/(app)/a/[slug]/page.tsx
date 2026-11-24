import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlbumView } from '@/components/AlbumView';
import { albumRole } from '@/server/access';
import { findAlbumBySlug, loadAlbum } from '@/server/albums';
import { requireUser } from '@/server/session';

type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ foto?: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const a = await findAlbumBySlug(slug);
  return { title: a?.title ?? 'Álbum' };
}

export default async function AlbumPage({ params, searchParams }: P) {
  const { slug } = await params;
  const { foto } = await searchParams;
  const me = await requireUser(`/a/${slug}`);
  const a = await findAlbumBySlug(slug);
  if (!a) notFound();
  const role = await albumRole(a.id, me.id);
  if (!role) notFound();
  const album = await loadAlbum(a, role, { includePending: true, userId: me.id });
  return <AlbumView album={album} me={{ id: me.id, name: me.name }} openPhoto={foto} />;
}
