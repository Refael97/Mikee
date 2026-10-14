import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ForgotForm } from "./ForgotForm";
import { MikeeAvatar } from "@/components/MikeeAvatar";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  if (await getSession()) redirect("/");
  const support = process.env.SUPPORT_WHATSAPP ? `https://wa.me/${process.env.SUPPORT_WHATSAPP}` : process.env.SUPPORT_EMAIL ? `mailto:${process.env.SUPPORT_EMAIL}` : null;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <MikeeAvatar size={32} />
        <span className="text-[20px] font-semibold">מייקי</span>
      </div>
      <div className="card-float w-full max-w-[440px] p-7">
        <h1 className="h2">איפוס סיסמה</h1>
        <p className="mt-1 text-[14.5px] text-ink-2">עם קוד השחזור ששמרת מהפרופיל, הסיסמה מתחלפת מיד.</p>
        <ForgotForm />
        <p className="mt-5 text-[14px] text-ink-3">
          אין לך קוד שחזור?{" "}
          {support ? (
            <a href={support} className="link" target="_blank" rel="noreferrer">
              פנו אלינו
            </a>
          ) : (
            "פנו לצוות מייקי"
          )}{" "}
          ונאפס את הסיסמה אחרי שנוודא שזה החשבון שלך.
        </p>
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
