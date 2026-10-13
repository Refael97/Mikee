import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { listConversations } from "@/lib/conversations";
import { Chat } from "@/components/Chat";
import { journeyStatus } from "@/lib/journey";

/** A new conversation. It is created when the client sends the first message. */
export default async function NewConversationPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { user, workspace } = await requireSession();
  const { q } = await searchParams;
  const [meta, existing, journey] = await Promise.all([getConnection<MetaConfig>(workspace.id, "meta"), listConversations(workspace.id, 1), journeyStatus(workspace.id).catch(() => null)]);
  const brand = { name: meta?.config.pageName ?? workspace.name, handle: meta?.config.igUsername };
  return (
    <Chat
      key="new"
      conversationId={null}
      initialItems={[]}
      autoScan={workspace.stage === "scanning" && existing.length === 0}
      firstName={user.name.split(" ")[0]}
      brand={brand}
      draft={q?.slice(0, 300)}
      nextMoves={workspace.stage === "active" ? (journey?.nextUp ?? []).slice(0, 2).map((i) => ({ title: i.title, why: i.why })) : []}
    />
  );
}
