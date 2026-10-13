"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, MoreHorizontal, Plus, Search, X } from "lucide-react";

type Category = "campaigns" | "content" | "results" | "business" | "general";
type Conv = { id: string; title: string; category: Category; auto: boolean; updatedAt: string; unread?: boolean };

export const CATEGORY_UI: Record<Category, { title: string }> = {
  campaigns: { title: "קמפיינים" },
  content: { title: "תוכן ופוסטים" },
  results: { title: "תוצאות ונתונים" },
  business: { title: "העסק" },
  general: { title: "כללי" },
};
const ORDER: Category[] = ["campaigns", "content", "results", "business", "general"];

const rtf = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
function when(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  if (diff > -60) return "עכשיו";
  if (diff > -3600) return rtf.format(Math.round(diff / 60), "minute");
  if (diff > -86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (diff > -86400 * 7) return rtf.format(Math.round(diff / 86400), "day");
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" }).format(new Date(iso));
}

/** Tells the sidebar to reload (a new conversation, or Mikee filed one). */
export const refreshConversations = (activeId?: string) => window.dispatchEvent(new CustomEvent("mikee:conversations", { detail: activeId }));

/** Conversation history, grouped by topic. Mikee files each conversation; the client can move it. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Conv[] | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Partial<Record<Category, boolean>>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // A new conversation gets its address without a navigation, so it announces itself as active.
  const [announced, setAnnounced] = useState<string | null>(null);
  const activeId = params.id ?? announced;

  const load = useCallback(async () => {
    const res = await fetch("/api/conversations", { cache: "no-store" });
    if (res.ok) setItems((await res.json()).conversations);
  }, []);

  useEffect(() => {
    setAnnounced(null);
    // Opening a conversation reads it (the server marks it on the same request).
    if (params.id) setItems((xs) => xs?.map((x) => (x.id === params.id ? { ...x, unread: false } : x)) ?? null);
  }, [params.id]);

  useEffect(() => {
    void load();
    const h = (e: Event) => {
      const id = (e as CustomEvent<string | undefined>).detail;
      if (id) setAnnounced(id);
      void load();
    };
    window.addEventListener("mikee:conversations", h);
    return () => window.removeEventListener("mikee:conversations", h);
  }, [load]);

  const groups = useMemo(() => {
    const q = query.trim();
    const list = (items ?? []).filter((c) => !q || c.title.includes(q));
    return ORDER.map((cat) => ({ cat, list: list.filter((c) => c.category === cat) })).filter((g) => g.list.length);
  }, [items, query]);

  async function patch(id: string, body: Record<string, unknown>) {
    setMenuFor(null);
    // Immediate feedback, then sync with the server.
    setItems((xs) => (body.archived ? xs?.filter((x) => x.id !== id) : xs?.map((x) => (x.id === id ? { ...x, ...body, auto: false } as Conv : x))) ?? null);
    await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (body.archived && activeId === id) router.push("/mikee");
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-ink/25 transition-opacity duration-300 lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 start-0 z-50 flex w-[300px] flex-col border-e border-line bg-bg p-4 transition-transform duration-[380ms] ease-[var(--ease)] lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100dvh-64px)] lg:w-[280px] lg:translate-x-0 lg:px-4 lg:pt-6 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-3 flex items-center gap-2 lg:hidden">
          <span className="serif text-[22px]">שיחות</span>
          <button onClick={onClose} aria-label="סגירה" className="btn btn-ghost btn-sm ms-auto px-2">
            <X className="h-5 w-5" />
          </button>
        </div>

        <Link href="/mikee" onClick={onClose} className="btn btn-primary btn-sm w-full justify-start">
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          שיחה חדשה
        </Link>

        <label className="mt-3 flex h-9 items-center gap-2 border-b border-line-strong px-1 focus-within:border-ink">
          <Search className="h-4 w-4 text-ink-3" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש בשיחות" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
        </label>

        <nav className="no-scrollbar -mx-1 mt-4 flex-1 overflow-y-auto px-1 pb-6">
          {items === null && <p className="px-2 text-[14px] text-ink-3">טוען…</p>}
          {items?.length === 0 && <p className="px-2 text-[14px] leading-relaxed text-ink-3">כאן יופיעו השיחות שלך, מסודרות לפי נושא.</p>}
          {groups.map(({ cat, list }) => {
            const { title } = CATEGORY_UI[cat];
            const isCollapsed = collapsed[cat];
            return (
              <section key={cat} className="mb-5">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                  className="flex w-full items-center gap-2 px-1 py-1.5 text-[13px] font-semibold text-ink-3 hover:text-ink"
                >
                  {title}
                  <span className="num font-normal">{list.length}</span>
                  <ChevronDown className={`ms-auto h-4 w-4 text-ink-3 transition-transform duration-300 ${isCollapsed ? "rotate-90" : ""}`} />
                </button>
                {!isCollapsed && (
                  <ul className="mt-1 space-y-0.5">
                    {list.map((c) => {
                      const active = activeId === c.id;
                      return (
                        <li key={c.id} className="group relative">
                          <Link
                            href={`/mikee/${c.id}`}
                            onClick={onClose}
                            className={`flex h-9 items-center gap-2 rounded-[6px] pe-9 ps-2.5 transition-colors duration-150 ${
                              active ? "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-surface/60 hover:text-ink"
                            }`}
                          >
                            {c.unread && !active && <span className="pop h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="חדש" />}
                            <span className={`min-w-0 flex-1 truncate text-[15px] ${active || c.unread ? "font-semibold text-ink" : ""}`}>{c.title}</span>
                            <span className="num shrink-0 text-[12.5px] text-ink-3 transition-opacity group-hover:opacity-0">{when(c.updatedAt)}</span>
                          </Link>
                          <button
                            aria-label="אפשרויות"
                            onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                            className={`absolute end-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[5px] text-ink-3 transition-opacity hover:bg-surface-2 hover:text-ink ${
                              menuFor === c.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 max-lg:opacity-100"
                            }`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menuFor === c.id && (
                            <div className="pop-over rise absolute end-0 top-full z-30 mt-1 w-56 p-1.5" onMouseLeave={() => setMenuFor(null)}>
                              <p className="px-3 pb-1 pt-1.5 text-[12.5px] text-ink-3">להעביר ל־</p>
                              {ORDER.filter((x) => x !== c.category).map((x) => {
                                const { title: t } = CATEGORY_UI[x];
                                return (
                                  <button key={x} onClick={() => patch(c.id, { category: x })} className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-start text-[15px] hover:bg-surface-2">
                                    {t}
                                  </button>
                                );
                              })}
                              <div className="my-1 h-px bg-line" />
                              <button onClick={() => patch(c.id, { archived: true })} className="flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-start text-[15px] text-bad hover:bg-bad-tint">
                                <X className="h-4 w-4" />
                                הסרה מהרשימה
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
