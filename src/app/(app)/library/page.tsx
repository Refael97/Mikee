import { requireSession } from "@/lib/auth";
import { getConnection } from "@/lib/connections";
import { driveConfigured } from "@/lib/google";
import { libraryFolders, listLibrary } from "@/lib/library";
import { storageUsage } from "@/lib/media";
import { LibraryView } from "@/components/LibraryView";
import { Page } from "@/components/Page";

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ connected?: string }> }) {
  const { workspace } = await requireSession();
  const { connected } = await searchParams;
  const [items, usage, folders, drive] = await Promise.all([
    listLibrary(workspace.id, { limit: 120 }),
    storageUsage(workspace.id),
    libraryFolders(workspace.id),
    getConnection(workspace.id, "google_drive"),
  ]);
  return (
    <Page>
      <LibraryView
        initial={items}
        usage={{ used: usage.used, limit: usage.limit, plan: usage.plan.name }}
        folders={folders}
        drive={{ available: driveConfigured(), connected: !!drive?.secret && drive.status !== "broken", justConnected: connected === "drive" }}
      />
    </Page>
  );
}
