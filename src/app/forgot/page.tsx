import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ForgotForm } from "./ForgotForm";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const t = await getT();
  if (await getSession()) redirect("/");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <MikeeAvatar size={64} />
        <span className="text-[20px] font-semibold">{t("מייקי")}</span>
      </div>
      <div className="card-float w-full max-w-[440px] p-7">
        <h1 className="h2">{t("איפוס סיסמה")}</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">{t("בוחרים סיסמה חדשה ונכנסים מיד.")}</p>
        <ForgotForm />
      </div>
      <p className="mt-6 text-[14.5px] text-ink-2">
        {t("נזכרת?")}{" "}
        <Link href="/login" className="link">
          {t("חזרה לכניסה")}
        </Link>
      </p>
    </main>
  );
}
