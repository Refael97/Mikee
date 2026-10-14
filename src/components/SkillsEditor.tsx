"use client";

import { useRef, useState } from "react";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { AGENT_NAMES } from "@/lib/progress";

export type SkillView = { id: string; name: string; whenToUse: string; body: string; agents: string[]; enabled: boolean; source: "written" | "file" };
type Draft = { id?: string; name: string; whenToUse: string; body: string; agents: string[]; source: "written" | "file" };

const WHO = [{ id: "mikee", label: "מייקי" }, ...Object.entries(AGENT_NAMES).map(([id, label]) => ({ id, label }))];
const whoLabel = (id: string) => WHO.find((w) => w.id === id)?.label ?? id;
const EMPTY: Draft = { name: "", whenToUse: "", body: "", agents: ["mikee"], source: "written" };
const BODY_MAX = 8000;
const FILE_MAX = 32 * 1024;

async function post(body: unknown) {
  const res = await fetch("/api/skills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error ?? "זה לא הצליח. נסי שוב.");
  return data;
}

/**
 * The client's skills: her own ways of doing a piece of work, which Mikee and the team follow when a task
 * matches. Written here or read from a SKILL.md file; a file only fills the form, and is saved after she
 * reads it and presses save.
 */
export function SkillsEditor({ initial }: { initial: SkillView[] }) {
  const [skills, setSkills] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const res = await fetch("/api/skills", { cache: "no-store" });
    if (res.ok) setSkills((await res.json()).skills);
  };

  async function run(body: unknown, done?: string, after?: () => void) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await post(body);
      after?.();
      if (done) setSaved(done);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(f: File) {
    setError(null);
    setSaved(null);
    if (f.size > FILE_MAX) return setError("הקובץ גדול מדי. סקיל הוא קובץ טקסט קצר, עד 32KB.");
    if (!/\.(md|markdown|txt)$/i.test(f.name)) return setError("אפשר להעלות קובץ SKILL.md או קובץ טקסט. קבצים אחרים, כמו סקריפטים או ZIP, לא נקראים.");
    try {
      const { draft: d } = await post({ action: "parse", filename: f.name, text: await f.text() });
      setDraft({ ...EMPTY, ...d, source: "file" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const toggleWho = (id: string) =>
    draft && setDraft({ ...draft, agents: draft.agents.includes(id) ? draft.agents.filter((a) => a !== id) : [...draft.agents, id] });

  return (
    <div className="space-y-5">
      {skills.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {skills.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className={`truncate ${s.enabled ? "" : "text-ink-3"}`}>{s.name}</p>
                <p className="line-clamp-2 text-[14px] text-ink-3">{s.whenToUse}</p>
                <p className="mt-1 text-[13px] text-ink-3">{s.agents.map(whoLabel).join(", ")}</p>
              </div>
              <button type="button" aria-label={`עריכת ${s.name}`} className="btn btn-quiet btn-sm !px-2" onClick={() => setDraft({ ...s })}>
                <Pencil className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label={`מחיקת ${s.name}`}
                className="btn btn-quiet btn-sm !px-2"
                disabled={busy}
                onClick={() => confirm(`למחוק את הסקיל "${s.name}"?`) && run({ action: "delete", id: s.id }, "הסקיל נמחק")}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <input
                type="checkbox"
                className="switch mt-1"
                aria-label={s.enabled ? `לכבות את ${s.name}` : `להפעיל את ${s.name}`}
                checked={s.enabled}
                disabled={busy}
                onChange={(e) => run({ action: "enabled", id: s.id, enabled: e.target.checked })}
              />
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: "save", ...draft }, draft.id ? "הסקיל עודכן" : "הסקיל נשמר", () => setDraft(null));
          }}
        >
          {draft.source === "file" && !draft.id && <p className="note">קראנו את הקובץ. עברי על ההוראות לפני השמירה: מייקי יעבוד לפיהן.</p>}
          <label className="block space-y-1.5">
            <span className="text-[15px] text-ink-2">שם</span>
            <span className="block text-[13px] text-ink-3">קצר וברור, למשל: פוסט השקה לקולקציה</span>
            <input className="field" value={draft.name} maxLength={60} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[15px] text-ink-2">מתי להשתמש בו</span>
            <span className="block text-[13px] text-ink-3">משפט אחד. לפיו מייקי יודע לבחור בסקיל</span>
            <input className="field" value={draft.whenToUse} maxLength={300} required onChange={(e) => setDraft({ ...draft, whenToUse: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[15px] text-ink-2">ההוראות</span>
            <span className="block text-[13px] text-ink-3">איך לעשות את העבודה: שלבים, סגנון, מה תמיד ומה אף פעם. בלי קישורים ובלי סיסמאות</span>
            <textarea className="field min-h-48 py-2.5 leading-relaxed" value={draft.body} maxLength={BODY_MAX} required onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <span dir="ltr" className="block text-left text-[12px] text-ink-3 num">
              {draft.body.length.toLocaleString("he-IL")} / {BODY_MAX.toLocaleString("he-IL")}
            </span>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-[15px] text-ink-2">מי משתמש בו</legend>
            <div className="flex flex-wrap gap-2">
              {WHO.map((w) => (
                <label key={w.id} className={`tag cursor-pointer ${draft.agents.includes(w.id) ? "tag-good" : "tag-quiet"}`}>
                  <input type="checkbox" className="sr-only" checked={draft.agents.includes(w.id)} onChange={() => toggleWho(w.id)} />
                  {w.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "שומר…" : "שמירה"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => (setDraft(null), setError(null))}>
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => (setDraft({ ...EMPTY }), setSaved(null))} disabled={skills.length >= 20}>
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            סקיל חדש
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => file.current?.click()} disabled={skills.length >= 20}>
            <FileUp className="h-4 w-4" strokeWidth={1.5} />
            מקובץ SKILL.md
          </button>
          <input
            ref={file}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </div>
      )}

      {error && <p className="note note-warn" role="alert">{error}</p>}
      {saved && <p className="text-[14px] text-good" role="status">{saved}</p>}
      <p className="text-[13px] text-ink-3">
        סקיל הוא הוראות בטקסט בלבד. הוא לא מריץ קוד, לא נותן למייקי גישה חדשה, ולא עוקף את כרטיסי האישור, את רמת השליטה שבחרת או את תקרת התקציב.
      </p>
    </div>
  );
}
