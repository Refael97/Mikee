import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signupMode } from "@/lib/signup";
import { SignupForm } from "./SignupForm";
import { MikeeAvatar } from "@/components/MikeeAvatar";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const t = await getT();
  if (await getSession()) redirect("/");
  const mode = signupMode();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <MikeeAvatar size={64} />
        <span className="text-[20px] font-semibold">{t("מייקי")}</span>
      </div>
      <div className="card-float w-full max-w-[440px] p-7">
        <h1 className="h2">{t("פתיחת חשבון לעסק")}</h1>
        {mode === "closed" ? (
          <p className="mt-2 text-[15px] text-ink-2">{t("ההרשמה סגורה כרגע. אם קיבלת הזמנה, אפשר לפנות אלינו ונפתח לך חשבון.")}</p>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] text-ink-2">{t("שתי דקות, ואז מחברים את העמוד ואת חשבון המודעות.")}</p>
            <SignupForm />
          </>
        )}
      </div>
      <p className="mt-6 text-[14.5px] text-ink-2">
        {t("יש לך כבר חשבון?")}{" "}
        <Link href="/login" className="link">
          {t("כניסה")}
        </Link>
      </p>
      <p className="mt-3 max-w-[400px] text-center text-[13px] text-ink-3">{t("שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך.")}</p>
    </main>
  );
}
