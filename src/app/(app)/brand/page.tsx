import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, CircleDashed, CircleDot, MinusCircle, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { listFacts, sourceLabel, TOPICS, type Topic } from "@/lib/brain";
import { addFact, decideFact, editFact } from "@/lib/actions";
import { type ItemStatus, journeyStatus } from "@/lib/journey";
import { Block, Page, PageHeader } from "@/components/Page";

const STATUS: Record<ItemStatus, { label: string; icon: typeof Circle; cls: string }> = {
  done: { label: "קיים", icon: CheckCircle2, cls: "text-good" },
  active: { label: "בעבודה", icon: CircleDot, cls: "text-brand" },
  next: { label: "הבא בתור", icon: CircleDashed, cls: "text-warn" },
  skipped: { label: "לא רלוונטי", icon: MinusCircle, cls: "text-ink-3" },
  open: { label: "עוד לא", icon: Circle, cls: "text-ink-3" },
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
      <PageHeader title="העסק" lead="התוכנית השיווקית, צעד אחרי צעד, וכל מה שמייקי למד על העסק. אפשר לתקן כל משפט, ומייקי עובד לפי מה שכתוב כאן." />

      <Block
        title="התוכנית"
        action={
          <span className="text-[14px] text-ink-2">
            {journey.businessType ? `${TYPE_HE[journey.businessType]} · ` : ""}
            {journey.focus ? (
              <>
                הפוקוס: <span className="font-medium text-ink">{journey.focus.text}</span>
              </>
            ) : (
              "מייקי ישאל מה הכי חשוב עכשיו"
            )}
          </span>
        }
      >
        <div className="card">
          <ol className="grid grid-cols-5 border-b border-line">
            {journey.phases.map((p, i) => {
              const isCurrent = i === currentIndex;
              const pct = p.total ? (p.done / p.total) * 100 : 0;
              return (
                <li key={p.id} className={`px-3 py-3.5 sm:px-4 ${i > 0 ? "border-s border-line" : ""}`}>
                  <p className={`text-[13.5px] leading-tight sm:text-[14.5px] ${isCurrent ? "font-semibold text-ink" : i < currentIndex ? "text-ink-2" : "text-ink-3"}`}>{p.title}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full rounded-full ${i < currentIndex ? "bg-good" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="num mt-1.5 hidden text-[12.5px] text-ink-3 sm:block">
                    {p.done} מתוך {p.total}
                  </p>
                </li>
              );
            })}
          </ol>

          <div className="grid lg:grid-cols-2">
            <div className="p-4 sm:p-5 lg:border-e lg:border-line">
              <h3 className="font-semibold">{current?.title}</h3>
              <p className="text-[14px] text-ink-3">{current?.hint}</p>
              <ul className="mt-3 space-y-0.5">
                {current?.items.map((it) => {
                  const st = STATUS[it.status];
                  return (
                    <li key={it.id} className="flex items-start gap-2.5 py-1.5">
                      <st.icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${st.cls}`} strokeWidth={1.75} aria-label={st.label} />
                      <div className="min-w-0">
                        <p className={`text-[15px] ${it.status === "done" || it.status === "skipped" ? "text-ink-3" : "font-medium"}`}>{it.title}</p>
                        {it.note && <p className="text-[13.5px] text-ink-2">{it.note}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="border-t border-line p-4 sm:p-5 lg:border-t-0">
              <h3 className="font-semibold">הצעדים הבאים שמייקי מציע</h3>
              <ul className="mt-2 divide-y divide-line">
                {journey.nextUp.map((it) => (
                  <li key={it.id} className="py-3">
                    <p className="font-medium">{it.title}</p>
                    <p className="mt-0.5 text-[14.5px] text-ink-2">{it.why}</p>
                    <Link href={`/mikee?q=${encodeURIComponent(`בוא נדבר על הצעד הבא: ${it.title}`)}`} className="link mt-1.5 inline-flex items-center gap-1 text-[14.5px]">
                      לדבר על זה עם מייקי <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                    </Link>
                  </li>
                ))}
                {journey.nextUp.length === 0 && <li className="py-3 text-[15px] text-ink-2">אין כרגע צעד פתוח. מייקי יציע את הבא בזמן הנכון.</li>}
              </ul>
            </div>
          </div>
        </div>
      </Block>

      {suggested.length > 0 && (
        <Block title="מייקי רוצה לוודא כמה דברים" className="mt-8">
          <ul className="group-list">
            {suggested.slice(0, 8).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{f.text}</p>
                  <p className="mt-0.5 text-[13px] text-ink-3">{sourceLabel(f)}</p>
                </div>
                <form action={decideFact} className="flex gap-1.5">
                  <input type="hidden" name="id" value={f.id} />
                  <button name="decision" value="confirm" className="btn btn-primary btn-sm">
                    נכון
                  </button>
                  <button name="decision" value="reject" className="btn btn-quiet btn-sm">
                    לא נכון
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {(Object.keys(TOPICS) as Topic[]).map((topic) => {
          const rows = facts.filter((f) => f.topic === topic && !(f.status === "suggested" && f.kind !== "insight"));
          return (
            <section key={topic} className="card overflow-hidden">
              <div className="border-b border-line px-4 py-3">
                <h2 className="font-semibold">{TOPICS[topic].title}</h2>
                <p className="text-[13.5px] text-ink-3">{TOPICS[topic].hint}</p>
              </div>
              <ul className="divide-y divide-line">
                {rows.map((f) => (
                  <li key={f.id}>
                    <form action={editFact} className="group flex items-start gap-3 px-4 py-2.5 focus-within:bg-surface-2">
                      <input type="hidden" name="id" value={f.id} />
                      <div className="min-w-0 flex-1">
                        <textarea name="text" defaultValue={f.text} rows={1} maxLength={500} className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none [field-sizing:content]" />
                        <p className="text-[12.5px] text-ink-3">{sourceLabel(f)}</p>
                      </div>
                      <button className="btn btn-quiet btn-sm opacity-0 transition-opacity group-focus-within:opacity-100">שמירה</button>
                    </form>
                  </li>
                ))}
                <li>
                  <form action={addFact} className="flex items-center gap-2 px-4 py-2">
                    <input type="hidden" name="topic" value={topic} />
                    <Plus className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.75} />
                    <input name="text" maxLength={500} placeholder="להוסיף משפט" className="min-w-0 flex-1 bg-transparent py-1 text-[15px] outline-none placeholder:text-ink-3" />
                    <button className="btn btn-quiet btn-sm shrink-0">הוספה</button>
                  </form>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-[13px] text-ink-3">כדי למחוק משפט, מוחקים את הטקסט ושומרים.</p>
    </Page>
  );
}
