import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { signupMode } from "@/lib/signup";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getSession()) redirect("/");
  const mode = signupMode();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-shell px-4 py-12">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="orb w-8" />
        <span className="text-[20px] font-semibold">מייקי</span>
      </div>
      <div className="card-float w-full max-w-[440px] p-7">
        <h1 className="h2">פתיחת חשבון לעסק</h1>
        {mode === "closed" ? (
          <p className="mt-2 text-[15px] text-ink-2">ההרשמה סגורה כרגע. אם קיבלת הזמנה, אפשר לפנות אלינו ונפתח לך חשבון.</p>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] text-ink-2">שתי דקות, ואז מחברים את העמוד ואת חשבון המודעות.</p>
            <SignupForm invite={mode === "invite"} />
          </>
        )}
      </div>
      <p className="mt-6 text-[14.5px] text-ink-2">
        יש לך כבר חשבון?{" "}
        <Link href="/login" className="link">
          כניסה
        </Link>
      </p>
      <p className="mt-3 max-w-[400px] text-center text-[13px] text-ink-3">שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך.</p>
    </main>
  );
}
