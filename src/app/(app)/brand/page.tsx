import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { listFacts, sourceLabel, TOPICS, type Topic } from "@/lib/brain";
import { addFact, decideFact, editFact } from "@/lib/actions";
import { type ItemStatus, journeyStatus } from "@/lib/journey";
import { Page, PageHeader } from "@/components/Page";

const STATUS: Record<ItemStatus, { label: string; cls: string }> = {
  done: { label: "קיים", cls: "tag-good" },
  active: { label: "בעבודה", cls: "tag-brand" },
  next: { label: "הבא בתור", cls: "tag-warn" },
  skipped: { label: "לא רלוונטי", cls: "tag-quiet" },
  open: { label: "עוד לא", cls: "tag-quiet" },
};

const TYPE_HE: Record<string, string> = { ecommerce: "חנות אונליין", services: "נותני שירות", local: "עסק מקומי", content: "יוצרי תוכן" };

export default async function BrandPage() {
  const { workspace } = await requireSession();
  const [facts, journey] = await Promise.all([listFacts(workspace.id), journeyStatus(workspace.id)]);
  const suggested = facts.filter((f) => f.status === "suggested" && f.kind !== "insight");
  const currentIndex = journey.phases.findIndex((p) => p.id === journey.currentPhase);
  const current = journey.phases[currentIndex];

  return (
    <Page>
      <PageHeader
        kicker="העסק שלך"
        title={
          <>
            לאן אנחנו <span className="marked">הולכים</span>, ומה מייקי יודע
          </>
        }
        lead="התוכנית השיווקית של העסק, צעד אחרי צעד, וכל מה שמייקי למד עליו. אפשר לתקן כל משפט, והוא עובד לפי מה שכתוב כאן."
      />

      {/* The plan */}
      <section className="rise border-t border-line pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="h2">התוכנית</h2>
          <p className="text-[15.5px] text-ink-2">
            {journey.businessType ? `${TYPE_HE[journey.businessType]} · ` : ""}
            {journey.focus ? (
              <>
                הפוקוס עכשיו: <span className="font-semibold text-ink">{journey.focus.text}</span>
              </>
            ) : (
              "מייקי ישאל מה הכי חשוב לך עכשיו"
            )}
          </p>
        </div>

        <ol className="mt-6 grid grid-cols-5 border-y border-line">
          {journey.phases.map((p, i) => {
            const isCurrent = i === currentIndex;
            const past = i < currentIndex;
            return (
              <li key={p.id} className={`relative px-2 py-4 sm:px-4 ${i > 0 ? "border-s border-line" : ""} ${isCurrent ? "bg-surface" : ""}`}>
                {isCurrent && <span className="absolute inset-x-0 -top-px h-[2px] bg-ink" />}
                <span className={`num text-[13px] ${past ? "text-good" : "text-ink-3"}`}>{past ? "✓" : String(i + 1).padStart(2, "0")}</span>
                <p className={`mt-1 text-[14px] leading-tight sm:text-[17px] ${isCurrent ? "font-semibold" : past ? "text-ink-2" : "text-ink-3"}`}>{p.title}</p>
                <p className="num mt-1 hidden text-[13px] text-ink-3 sm:block">
                  {p.done} מתוך {p.total}
                </p>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <span className="kicker">{current?.title}: {current?.hint}</span>
            <ul className="mt-3 border-t border-line">
              {current?.items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-4 border-b border-line py-3.5">
                  <div className="min-w-0">
                    <p className={`font-semibold ${it.status === "done" || it.status === "skipped" ? "text-ink-3" : ""}`}>{it.title}</p>
                    {it.note && <p className="mt-0.5 text-[14px] text-ink-2">{it.note}</p>}
                  </div>
                  <span className={`tag ${STATUS[it.status].cls} shrink-0`}>{STATUS[it.status].label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="kicker">הצעדים הבאים שמייקי מציע</span>
            <ol className="mt-3 border-t border-line">
              {journey.nextUp.map((it, i) => (
                <li key={it.id} className="border-b border-line py-4">
                  <div className="flex items-baseline gap-3">
                    <span className="num text-[13px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="text-[18px] font-semibold">{it.title}</p>
                      <p className="mt-1 text-[15.5px] text-ink-2">{it.why}</p>
                      <Link href={`/mikee?q=${encodeURIComponent(`בוא נדבר על הצעד הבא: ${it.title}`)}`} className="link mt-2 inline-block text-[15px]">
                        לדבר על זה עם מייקי
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
              {journey.nextUp.length === 0 && <li className="py-4 text-ink-2">אין כרגע צעד פתוח. מייקי יציע את הבא בזמן הנכון.</li>}
            </ol>
          </div>
        </div>
      </section>

      {suggested.length > 0 && (
        <section className="rise mt-14 border-t border-line pt-8">
          <div className="flex items-center gap-3">
            <span className="orb w-6" />
            <h2 className="h2">מייקי רוצה לוודא כמה דברים</h2>
          </div>
          <ul className="mt-4 border-t border-line">
            {suggested.slice(0, 8).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="leading-relaxed">{f.text}</p>
                  <p className="mt-0.5 text-[13px] text-ink-3">{sourceLabel(f)}</p>
                </div>
                <form action={decideFact} className="flex gap-1.5">
                  <input type="hidden" name="id" value={f.id} />
                  <button name="decision" value="confirm" className="btn btn-primary btn-sm">
                    נכון
                  </button>
                  <button name="decision" value="reject" className="btn btn-ghost btn-sm">
                    לא נכון
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The brain */}
      <section className="mt-14">
        {(Object.keys(TOPICS) as Topic[]).map((topic) => {
          const rows = facts.filter((f) => f.topic === topic && !(f.status === "suggested" && f.kind !== "insight"));
          return (
            <div key={topic} className="rise grid gap-x-10 gap-y-3 border-t border-line py-8 lg:grid-cols-[260px_1fr]">
              <div>
                <h2 className="h2">{TOPICS[topic].title}</h2>
                <p className="mt-1.5 text-[15px] text-ink-2">{TOPICS[topic].hint}</p>
              </div>
              <ul className="border-t border-line lg:border-t-0">
                {rows.map((f) => (
                  <li key={f.id} className="border-b border-line">
                    <form action={editFact} className="group flex items-start gap-3 py-3">
                      <input type="hidden" name="id" value={f.id} />
                      <div className="min-w-0 flex-1">
                        <textarea name="text" defaultValue={f.text} rows={1} maxLength={500} className="w-full resize-none bg-transparent leading-relaxed outline-none [field-sizing:content]" />
                        <p className="text-[13px] text-ink-3">{sourceLabel(f)}</p>
                      </div>
                      <button className="btn btn-quiet btn-sm opacity-0 transition-opacity group-focus-within:opacity-100">שמירה</button>
                    </form>
                  </li>
                ))}
                <li>
                  <form action={addFact} className="flex items-center gap-3 py-2">
                    <input type="hidden" name="topic" value={topic} />
                    <Plus className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={2} />
                    <input name="text" maxLength={500} placeholder="להוסיף משפט" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-ink-3" />
                    <button className="btn btn-quiet btn-sm shrink-0">הוספה</button>
                  </form>
                </li>
              </ul>
            </div>
          );
        })}
        <p className="border-t border-line pt-6 text-[13px] text-ink-3">כדי למחוק משפט, מוחקים את הטקסט ושומרים</p>
      </section>
    </Page>
  );
}
