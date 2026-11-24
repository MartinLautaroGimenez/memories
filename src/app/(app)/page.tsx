import { Table } from '@/components/Table';
import { listAlbumCards, onThisDay } from '@/server/albums';
import { requireUser } from '@/server/session';

export default async function HomePage() {
  const me = await requireUser();
  const [cards, memory] = await Promise.all([listAlbumCards(me.id), onThisDay(me.id)]);
  return <Table cards={cards} meId={me.id} memory={memory} />;
}
