import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { timeline } from "@/lib/conversation";
import { getConversation } from "@/lib/conversations";
import { Chat } from "@/components/Chat";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace } = await requireSession();
  const conv = await getConversation(workspace.id, id);
  if (!conv) notFound();
  const [items, meta] = await Promise.all([timeline(workspace.id, id), getConnection<MetaConfig>(workspace.id, "meta")]);
  const brand = { name: meta?.config.pageName ?? workspace.name, handle: meta?.config.igUsername };
  return <Chat key={id} conversationId={id} initialItems={items} autoScan={false} firstName={user.name.split(" ")[0]} brand={brand} />;
}
