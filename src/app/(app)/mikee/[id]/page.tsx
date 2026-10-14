import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { timeline } from "@/lib/conversation";
import { getConversation, markRead } from "@/lib/conversations";
import { Chat } from "@/components/Chat";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, workspace } = await requireSession();
  const conv = await getConversation(workspace.id, id);
  if (!conv) notFound();
  if (conv.unread) await markRead(workspace.id, id);
  const [items, meta] = await Promise.all([timeline(workspace.id, id), getConnection<MetaConfig>(workspace.id, "meta")]);
  const brand = { name: meta?.config.pageName ?? workspace.name, handle: meta?.config.igUsername, avatar: meta?.config.igUserId || meta?.config.pageId ? "/api/meta/avatar" : undefined };
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <Chat key={id} conversationId={id} initialItems={items} autoScan={false} firstName={user.name.split(" ")[0]} brand={brand} />
      {/* Runs as soon as the conversation's HTML arrives, before the app loads: the page opens at the
          latest message instead of the top. Allowed by the page's CSP nonce. */}
      <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: "history.scrollRestoration='manual';window.scrollTo(0,document.documentElement.scrollHeight)" }} />
    </>
  );
}
