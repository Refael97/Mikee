import { requireSession } from "@/lib/auth";
import { listFacts, sourceLabel, TOPICS, type Topic } from "@/lib/brain";
import { addFact, decideFact, editFact } from "@/lib/actions";

export default async function BrandPage() {
  const { workspace } = await requireSession();
  const facts = await listFacts(workspace.id);
  const suggested = facts.filter((f) => f.status === "suggested" && f.kind !== "insight");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight">העסק שלי</h1>
        <p className="mt-2 text-ink-2">ככה מייקי מכיר את העסק. אפשר לתקן כל משפט, והוא יעבוד לפי מה שכתוב כאן.</p>
      </header>

      {suggested.length > 0 && (
        <section className="card mb-6 p-6">
          <h2 className="text-lg font-semibold">מייקי לא בטוח בכמה דברים</h2>
          <p className="mb-4 text-sm text-ink-3">הוא הבין אותם מהאתר או מהתוצאות. נכון?</p>
          <ul className="divide-y divide-line">
            {suggested.slice(0, 8).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="leading-relaxed">{f.text}</p>
                  <p className="mt-0.5 text-xs text-ink-3">{sourceLabel(f)}</p>
                </div>
                <form action={decideFact} className="flex gap-2">
                  <input type="hidden" name="id" value={f.id} />
                  <button name="decision" value="confirm" className="btn btn-quiet py-1.5 text-sm">
                    נכון
                  </button>
                  <button name="decision" value="reject" className="btn py-1.5 text-sm text-ink-3">
                    לא נכון
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-4">
        {(Object.keys(TOPICS) as Topic[]).map((topic) => {
          const rows = facts.filter((f) => f.topic === topic && !(f.status === "suggested" && f.kind !== "insight"));
          return (
            <section key={topic} className="card p-6">
              <h2 className="text-lg font-semibold">{TOPICS[topic].title}</h2>
              <p className="mb-3 text-sm text-ink-3">{TOPICS[topic].hint}</p>
              <ul className="space-y-1">
                {rows.map((f) => (
                  <li key={f.id}>
                    <form action={editFact} className="group flex items-start gap-2">
                      <input type="hidden" name="id" value={f.id} />
                      <span className="mt-3 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                      <div className="min-w-0 flex-1">
                        <textarea
                          name="text"
                          defaultValue={f.text}
                          rows={1}
                          className="w-full resize-none rounded-lg bg-transparent px-1 py-1.5 leading-relaxed outline-none [field-sizing:content] focus:bg-surface-2"
                        />
                        <p className="px-1 text-xs text-ink-3">{sourceLabel(f)}</p>
                      </div>
                      <button className="btn btn-quiet py-1 text-xs opacity-0 transition-opacity group-focus-within:opacity-100">שמירה</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addFact} className="mt-3 flex gap-2">
                <input type="hidden" name="topic" value={topic} />
                <input name="text" placeholder="להוסיף משפט…" className="field py-2 text-[0.95rem]" />
                <button className="btn btn-quiet shrink-0 py-2 text-sm">הוספה</button>
              </form>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-ink-3">כדי למחוק משפט, מוחקים את הטקסט ושומרים.</p>
    </main>
  );
}
