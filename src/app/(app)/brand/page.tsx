import { Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { listFacts, sourceLabel, TOPICS, type Topic } from "@/lib/brain";
import { addFact, decideFact, editFact } from "@/lib/actions";

export default async function BrandPage() {
  const { workspace } = await requireSession();
  const facts = await listFacts(workspace.id);
  const suggested = facts.filter((f) => f.status === "suggested" && f.kind !== "insight");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:pt-10">
      <header className="mb-9">
        <h1 className="text-[2.4rem] font-semibold tracking-[-0.02em]">העסק שלי</h1>
        <p className="mt-1 max-w-md text-ink-2">ככה מייקי מכיר את העסק. אפשר לתקן כל משפט, והוא יעבוד לפי מה שכתוב כאן.</p>
      </header>

      {suggested.length > 0 && (
        <section className="rise mb-9">
          <div className="mb-3 flex items-center gap-2.5 px-1.5">
            <span className="orb h-5 w-5" />
            <h2 className="text-[1.05rem] font-semibold tracking-tight">מייקי רוצה לוודא כמה דברים</h2>
          </div>
          <ul className="group-list">
            {suggested.slice(0, 8).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="leading-relaxed">{f.text}</p>
                  <p className="mt-0.5 text-xs text-ink-3">{sourceLabel(f)}</p>
                </div>
                <form action={decideFact} className="flex gap-1.5">
                  <input type="hidden" name="id" value={f.id} />
                  <button name="decision" value="confirm" className="btn btn-primary px-4 py-2 text-sm">
                    נכון
                  </button>
                  <button name="decision" value="reject" className="btn btn-ghost px-3 py-2 text-sm">
                    לא נכון
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-9">
        {(Object.keys(TOPICS) as Topic[]).map((topic, i) => {
          const rows = facts.filter((f) => f.topic === topic && !(f.status === "suggested" && f.kind !== "insight"));
          return (
            <section key={topic} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="mb-3 px-1.5">
                <h2 className="text-[1.05rem] font-semibold tracking-tight">{TOPICS[topic].title}</h2>
                <p className="text-sm text-ink-3">{TOPICS[topic].hint}</p>
              </div>
              <ul className="group-list">
                {rows.map((f) => (
                  <li key={f.id}>
                    <form action={editFact} className="group flex items-start gap-3 px-5 py-3.5">
                      <input type="hidden" name="id" value={f.id} />
                      <div className="min-w-0 flex-1">
                        <textarea
                          name="text"
                          defaultValue={f.text}
                          rows={1}
                          className="w-full resize-none bg-transparent leading-relaxed outline-none [field-sizing:content]"
                        />
                        <p className="text-xs text-ink-3">{sourceLabel(f)}</p>
                      </div>
                      <button className="btn btn-quiet px-3 py-1.5 text-xs opacity-0 transition-opacity group-focus-within:opacity-100">שמירה</button>
                    </form>
                  </li>
                ))}
                <li>
                  <form action={addFact} className="flex items-center gap-3 px-5 py-2">
                    <input type="hidden" name="topic" value={topic} />
                    <Plus className="h-4 w-4 shrink-0 text-ink-3" />
                    <input name="text" placeholder="להוסיף משפט" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-ink-3" />
                    <button className="btn btn-quiet shrink-0 px-3 py-1.5 text-xs">הוספה</button>
                  </form>
                </li>
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-8 text-center text-xs text-ink-3">כדי למחוק משפט, מוחקים את הטקסט ושומרים</p>
    </main>
  );
}
