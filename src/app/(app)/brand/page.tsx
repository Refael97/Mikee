import { requireSession } from "@/lib/auth";
import { type BrainSection, getBrain } from "@/lib/brain";
import { saveBrainSection } from "@/lib/actions";

const SECTIONS: { key: BrainSection; title: string; hint: string }[] = [
  { key: "business", title: "העסק", hint: "מה אנחנו, מה מוכרים, מה מייחד אותנו" },
  { key: "audience", title: "הלקוחות", hint: "מי קונה, מה חשוב להם, מה עוצר אותם" },
  { key: "voice", title: "הסגנון שלנו", hint: "איך אנחנו כותבים ומדברים" },
  { key: "products", title: "מוצרים ושירותים", hint: "מה הכי חשוב לקדם, עונתיות" },
  { key: "goals", title: "מטרות", hint: "מה נחשב הצלחה החודש והרבעון" },
  { key: "history", title: "מה עבד ומה לא", hint: "לקחים מקמפיינים ופוסטים קודמים" },
  { key: "rules", title: "מה אף פעם לא", hint: "דברים שמייקי לא יעשה" },
  { key: "notes", title: "עוד דברים שכדאי לזכור", hint: "אירועים, השקות, העדפות" },
];

export default async function BrandPage() {
  const { workspace } = await requireSession();
  const brain = await getBrain(workspace.id);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight">העסק שלי</h1>
        <p className="mt-2 text-ink-2">כל מה שמייקי יודע על העסק. משהו לא מדויק? פשוט לתקן, הוא יעבוד לפי זה.</p>
      </header>
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <form key={s.key} action={saveBrainSection} className="card group p-6">
            <input type="hidden" name="section" value={s.key} />
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <p className="text-sm text-ink-3">{s.hint}</p>
              </div>
              <button className="btn btn-quiet py-1.5 text-sm opacity-0 transition-opacity group-focus-within:opacity-100">שמירה</button>
            </div>
            <textarea
              name="content"
              defaultValue={brain[s.key] ?? ""}
              placeholder="מייקי עוד לא כתב כאן"
              rows={Math.min(14, Math.max(3, (brain[s.key] ?? "").split("\n").length + 1))}
              className="w-full resize-y bg-transparent leading-relaxed outline-none placeholder:text-ink-3"
            />
          </form>
        ))}
      </div>
    </main>
  );
}
