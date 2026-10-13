import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { listConversations } from "@/lib/conversations";
import { Chat } from "@/components/Chat";

/** A new conversation. It is created when the client sends the first message. */
export default async function NewConversationPage() {
  const { user, workspace } = await requireSession();
  const [meta, existing] = await Promise.all([getConnection<MetaConfig>(workspace.id, "meta"), listConversations(workspace.id, 1)]);
  const brand = { name: meta?.config.pageName ?? workspace.name, handle: meta?.config.igUsername };
  return (
    <Chat
      key="new"
      conversationId={null}
      initialItems={[]}
      autoScan={workspace.stage === "scanning" && existing.length === 0}
      firstName={user.name.split(" ")[0]}
      brand={brand}
    />
  );
}
