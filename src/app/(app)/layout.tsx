import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { Nav } from "@/components/Nav";
import { MikeeToast } from "@/components/MikeeToast";
import { getConnection } from "@/lib/connections";
import { pendingCount } from "@/lib/instagram/inbox";
import { hasUnread } from "@/lib/conversations";
import { connectedAssets } from "@/lib/meta/assets";
import { ConnectedAccount } from "@/components/ConnectedAccount";
import { NavScroll } from "@/components/NavScroll";
import { UsageWatcher } from "@/components/Usage";
import { MikeeLookProvider } from "@/components/MikeeLook";
import { getSettings } from "@/lib/settings";
import { lookOf } from "@/lib/mikee-look";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, workspace } = await requireSession();
  if (workspace.stage === "connect") redirect("/onboarding");
  const [meta, pending, assets, unread, settings] = await Promise.all([
    getConnection(workspace.id, "meta"),
    pendingCount(workspace.id),
    connectedAssets(workspace.id, workspace.name),
    hasUnread(workspace.id),
    getSettings(workspace.id),
  ]);
  return (
    // Desktop: a 10px frame and 10px gaps around the rail and the panels. Mobile: full width, no frame.
    <MikeeLookProvider look={lookOf(settings)}>
      <div className="flex min-h-dvh flex-col lg:flex-row lg:gap-[10px] lg:p-[10px]">
        <Nav
          who={{ name: user.name, email: user.email, business: workspace.name }}
          support={{
            email: process.env.SUPPORT_EMAIL,
            whatsapp: process.env.SUPPORT_WHATSAPP,
          }}
          waiting={{ "/inbox": pending > 0, "/mikee": unread }}
          assets={assets}
        />
        {/* Desktop: the connected account, at the top corner of the main panel on every page. */}
        <div className="fixed end-[26px] top-[22px] z-30 hidden lg:block">
          <ConnectedAccount initial={assets} />
        </div>
        <MikeeToast />
        <UsageWatcher />
        <div className="flex min-w-0 flex-1 flex-col">
          {meta?.status === "broken" && (
            <Link
              href="/settings"
              className="flex items-center justify-center gap-3 bg-warn-tint px-5 py-2.5 text-[15px] text-warn lg:mb-[10px] lg:rounded-[14px]"
            >
              <span>
                <span className="font-medium">
                  החיבור לפייסבוק ולאינסטגרם נותק.
                </span>{" "}
                מייקי לא יכול לעבוד עד שמחברים מחדש.
              </span>
              <span className="shrink-0 underline underline-offset-4">
                לחבר
              </span>
            </Link>
          )}
          <div className="flex flex-1 flex-col">{children}</div>
          {/* After the page, so its scroll rule runs last on every navigation. */}
          <NavScroll />
        </div>
      </div>
    </MikeeLookProvider>
  );
}
