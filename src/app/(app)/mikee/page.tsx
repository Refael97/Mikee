import { requireSession } from "@/lib/auth";
import { getConnection, type MetaConfig } from "@/lib/connections";
import { timeline } from "@/lib/conversation";
import { Chat } from "@/components/Chat";

export default async function MikeePage() {
  const { user, workspace } = await requireSession();
  const [items, meta] = await Promise.all([timeline(workspace.id), getConnection<MetaConfig>(workspace.id, "meta")]);
  const brand = { name: meta?.config.pageName ?? workspace.name, handle: meta?.config.igUsername };
  return <Chat initialItems={items} stage={workspace.stage} firstName={user.name.split(" ")[0]} brand={brand} />;
}
