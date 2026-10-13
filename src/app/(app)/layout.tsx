import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { workspace } = await requireSession();
  if (workspace.stage === "connect") redirect("/onboarding");
  return (
    <div className="flex min-h-dvh flex-col">
      <Nav business={workspace.name} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
