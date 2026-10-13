import { requireSession } from "@/lib/auth";
import { timeline } from "@/lib/conversation";
import { Chat } from "@/components/Chat";

export default async function MikeePage() {
  const { user, workspace } = await requireSession();
  const items = await timeline(workspace.id);
  return <Chat initialItems={items} stage={workspace.stage} firstName={user.name.split(" ")[0]} />;
}
