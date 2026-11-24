import { Table } from '@/components/Table';
import { listAlbumCards } from '@/server/albums';
import { requireUser } from '@/server/session';

export default async function HomePage() {
  const me = await requireUser();
  const cards = await listAlbumCards(me.id);
  return <Table cards={cards} meId={me.id} />;
}
