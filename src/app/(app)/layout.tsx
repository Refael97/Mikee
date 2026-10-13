import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { MikeeToast } from "@/components/MikeeToast";
import { getConnection } from "@/lib/connections";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireSession();
  if (workspace.stage === "connect") redirect("/onboarding");
  const meta = await getConnection(workspace.id, "meta");
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav who={{ name: user.name, email: user.email, business: workspace.name }} support={{ email: process.env.SUPPORT_EMAIL, whatsapp: process.env.SUPPORT_WHATSAPP }} />
      <MikeeToast />
      {meta?.status === "broken" && (
        <Link href="/settings" className="flex items-center justify-center gap-3 border-b border-line bg-warn-tint px-5 py-2.5 text-[15px] text-warn">
          <span>
            <span className="font-semibold">החיבור לפייסבוק ולאינסטגרם נותק.</span> מייקי לא יכול לעבוד עד שמחברים מחדש.
          </span>
          <span className="shrink-0 font-semibold underline underline-offset-4">לחבר</span>
        </Link>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
