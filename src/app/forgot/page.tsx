import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ForgotForm } from "./ForgotForm";
import { MikeeAvatar } from "@/components/MikeeAvatar";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <MikeeAvatar size={32} />
        <span className="text-[20px] font-semibold">מייקי</span>
      </div>
      <div className="card-float w-full max-w-[440px] p-7">
        <h1 className="h2">איפוס סיסמה</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">בוחרים סיסמה חדשה ונכנסים מיד.</p>
        <ForgotForm />
      </div>
      <p className="mt-6 text-[14.5px] text-ink-2">
        נזכרת?{" "}
        <Link href="/login" className="link">
          חזרה לכניסה
        </Link>
      </p>
    </main>
  );
}
