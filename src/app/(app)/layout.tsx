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
        <Link href="/settings" className="block bg-warn/10 px-4 py-2.5 text-center text-sm text-warn">
          החיבור לפייסבוק ולאינסטגרם נותק, אז מייקי לא יכול לעבוד. לחצי כאן כדי לחבר מחדש.
        </Link>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
