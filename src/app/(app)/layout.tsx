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
        <Link href="/settings" className="rise mx-5 mt-1 flex items-center gap-3 rounded-[16px] bg-warn-tint px-4 py-3 text-[15px] sm:mx-auto sm:w-full sm:max-w-xl">
          <span className="text-warn">
            <span className="font-semibold">החיבור לפייסבוק ולאינסטגרם נותק.</span> מייקי לא יכול לעבוד עד שמחברים מחדש.
          </span>
          <span className="ms-auto shrink-0 font-semibold text-brand">לחבר</span>
        </Link>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
