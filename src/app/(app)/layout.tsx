import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { MikeeToast } from "@/components/MikeeToast";
import { getConnection } from "@/lib/connections";
import { pendingCount } from "@/lib/instagram/inbox";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireSession();
  if (workspace.stage === "connect") redirect("/onboarding");
  const [meta, pending] = await Promise.all([getConnection(workspace.id, "meta"), pendingCount(workspace.id)]);
  return (
    // Desktop: a 10px frame and 10px gaps around the rail and the panels. Mobile: full width, no frame.
    <div className="flex min-h-dvh flex-col lg:flex-row lg:gap-[10px] lg:p-[10px]">
      <Nav who={{ name: user.name, email: user.email, business: workspace.name }} support={{ email: process.env.SUPPORT_EMAIL, whatsapp: process.env.SUPPORT_WHATSAPP }} waiting={{ "/inbox": pending > 0 }} />
      <MikeeToast />
      <div className="flex min-w-0 flex-1 flex-col">
      {meta?.status === "broken" && (
        <Link href="/settings" className="flex items-center justify-center gap-3 bg-warn-tint px-5 py-2.5 text-[15px] text-warn lg:mb-[10px] lg:rounded-[14px]">
          <span>
            <span className="font-medium">החיבור לפייסבוק ולאינסטגרם נותק.</span> מייקי לא יכול לעבוד עד שמחברים מחדש.
          </span>
          <span className="shrink-0 underline underline-offset-4">לחבר</span>
        </Link>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
