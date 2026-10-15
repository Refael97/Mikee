"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Eye, Heart, Reply, Trash2, ExternalLink } from "lucide-react";

type ReplyItem = { id: string; author: string; text: string; at: string; mine: boolean };
type Comment = { id: string; author: string; text: string; at: string; hidden: boolean; likes: number; liked: boolean; replies: ReplyItem[] };
type Post = { platform: "facebook" | "instagram"; postId: string; text: string; at: string; link?: string; image?: string; comments: Comment[] };

const when = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The comments on the latest Facebook and Instagram posts, in one list: the owner replies, hides, likes or
 * deletes, and can delete an Instagram post. Each click is the owner's own action, so it runs at once; deleting
 * asks once more. A failed action says so and changes nothing on the screen.
 */
export function CommentsInbox({ connected }: { connected: boolean }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/meta/comments", { cache: "no-store" });
    if (!res.ok) return setPosts((p) => p ?? []);
    setPosts((await res.json()).posts ?? []);
  }, []);
  useEffect(() => {
    if (!connected) return setPosts([]);
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [connected, load]);

  async function act(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/meta/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "זה לא הצליח. נסי שוב.");
      setPosts(data.posts);
      setConfirm(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sendReply(id: string) {
    if (await act(`reply:${id}`, { action: "reply", id, text })) {
      setReplyTo(null);
      setText("");
    }
  }

  if (!connected) return <p className="text-ink-3">קודם מחברים את פייסבוק ואינסטגרם בהגדרות.</p>;
  if (!posts)
    return (
      <div className="space-y-4" aria-busy="true">
        <span className="skeleton block h-28 w-full !rounded-[18px]" />
        <span className="skeleton block h-28 w-full !rounded-[18px]" />
      </div>
    );
  const withComments = posts.filter((p) => p.comments.length > 0);

  return (
    <div className="space-y-4">
      {error && <p className="note note-bad">{error}</p>}
      {withComments.length === 0 && <p className="card p-6 text-ink-3">אין תגובות חדשות על הפוסטים האחרונים.</p>}
      {withComments.map((p) => (
        <article key={p.postId} className="card overflow-hidden">
          <header className="flex items-center gap-3 border-b border-line px-5 py-3">
            {p.image && <img src={p.image} alt="" className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink-3">
                {p.platform === "instagram" ? "אינסטגרם" : "פייסבוק"} · {when(p.at)}
              </p>
              <p dir="auto" className="truncate text-[15px]">{p.text || "פוסט בלי טקסט"}</p>
            </div>
            {p.link && (
              <a href={p.link} target="_blank" rel="noreferrer noopener" className="btn btn-quiet btn-sm" aria-label="לפתוח את הפוסט">
                <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
              </a>
            )}
            {p.platform === "instagram" &&
              (confirm === `post:${p.postId}` ? (
                <button className="btn btn-sm bg-bad text-white" disabled={!!busy} onClick={() => void act(`post:${p.postId}`, { action: "delete_post", id: p.postId })}>
                  למחוק את הפוסט
                </button>
              ) : (
                <button className="btn btn-quiet btn-sm" aria-label="מחיקת הפוסט מאינסטגרם" onClick={() => setConfirm(`post:${p.postId}`)}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </button>
              ))}
          </header>
          <ul className="divide-y divide-line">
            {p.comments.map((c) => (
              <li key={c.id} className={`px-5 py-3.5 ${c.hidden ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-3">
                      <span dir="auto" className="text-ink-2">{c.author || "משתמש"}</span> · {when(c.at)}
                      {c.hidden && " · מוסתרת"}
                    </p>
                    <p dir="auto" className="mt-0.5 whitespace-pre-wrap text-[15px]">{c.text}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="btn btn-quiet btn-sm" aria-label="לענות" disabled={!!busy} onClick={() => (setReplyTo(replyTo === c.id ? null : c.id), setText(""))}>
                      <Reply className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                    <button className="btn btn-quiet btn-sm" aria-label={c.liked ? "לבטל לייק" : "לייק"} aria-pressed={c.liked} disabled={!!busy} onClick={() => void act(`like:${c.id}`, { action: "like", id: c.id, liked: !c.liked })}>
                      <Heart className={`h-4 w-4 ${c.liked ? "fill-coral text-coral" : ""}`} strokeWidth={1.5} />
                    </button>
                    <button className="btn btn-quiet btn-sm" aria-label={c.hidden ? "להציג" : "להסתיר"} disabled={!!busy} onClick={() => void act(`hide:${c.id}`, { action: "hide", id: c.id, hidden: !c.hidden })}>
                      {c.hidden ? <Eye className="h-4 w-4" strokeWidth={1.5} /> : <EyeOff className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                    {confirm === c.id ? (
                      <button className="btn btn-sm bg-bad text-white" disabled={!!busy} onClick={() => void act(`delete:${c.id}`, { action: "delete", id: c.id })}>
                        למחוק
                      </button>
                    ) : (
                      <button className="btn btn-quiet btn-sm" aria-label="למחוק את התגובה" disabled={!!busy} onClick={() => setConfirm(c.id)}>
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
                {c.replies.length > 0 && (
                  <ul className="mt-2 space-y-1.5 border-s-2 border-line ps-3">
                    {c.replies.map((r) => (
                      <li key={r.id} className="text-[14.5px]">
                        <span className="text-[13px] text-ink-3">{r.mine ? "את" : r.author} · </span>
                        <span dir="auto">{r.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {replyTo === c.id && (
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (text.trim()) void sendReply(c.id);
                    }}
                  >
                    <input dir="auto" autoFocus className="field flex-1" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="התשובה שלך" />
                    <button className="btn btn-primary" disabled={!text.trim() || busy === `reply:${c.id}`}>
                      {busy === `reply:${c.id}` ? "שולח…" : "לשלוח"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}
