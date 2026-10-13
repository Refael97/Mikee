import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import Link from "next/link";
import { getConnection } from "@/lib/connections";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { workspace } = await requireSession();
  if (workspace.stage === "connect") redirect("/onboarding");
  const meta = await getConnection(workspace.id, "meta");
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav business={workspace.name} />
      {meta?.status === "broken" && (
        <Link href="/settings" className="float-sm rise mx-auto mt-3 flex max-w-xl items-center gap-3 rounded-2xl px-4 py-3 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full bg-warn" />
          <span className="text-ink-2">
            <span className="font-medium text-ink">החיבור לפייסבוק ולאינסטגרם נותק.</span> מייקי לא יכול לעבוד עד שמחברים מחדש.
          </span>
          <span className="ms-auto shrink-0 font-medium text-accent">לחבר</span>
        </Link>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
