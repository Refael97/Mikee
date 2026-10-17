"use client";

import { Picker } from "@/components/Picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useT } from "@/components/Lang";
import type { T } from "@/lib/i18n";

type Topic = "address" | "hours" | "phone" | "website" | "other";
type Fact = { topic: Topic; label: string | null; value: string };
type Settings = { enabled: boolean; topics: Topic[]; subscription?: { ok: boolean; detail: string } };
type Msg = { id: string; customerId: string; text: string | null; hasAttachment: boolean; sentAt: string; status: string; reason: string | null; reply: string | null };
type Data = { settings: Settings; facts: Fact[]; messages: Msg[]; paused: string[] };

const TOPICS: { id: Topic; label: string; hint: string }[] = [
  { id: "address", label: "כתובת", hint: "רחוב, מספר ועיר" },
  { id: "hours", label: "שעות פתיחה", hint: "למשל: א׳ עד ה׳ 10:00 עד 19:00, ו׳ 9:00 עד 14:00" },
  { id: "phone", label: "טלפון", hint: "המספר שלקוחות מתקשרים אליו" },
  { id: "website", label: "אתר", hint: "הכתובת המלאה" },
  { id: "other", label: "מידע נוסף", hint: "תשובה קצרה וקבועה" },
];
const topicLabel = (t: Topic) => TOPICS.find((x) => x.id === t)?.label ?? t;

async function post(body: unknown) {
  const res = await fetch("/api/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error ?? "זה לא הצליח. נסי שוב.");
  return data;
}

/** Why a message waits for the client, in her words (the stored reason is technical). */
function why(m: Msg, t: T): string {
  const r = m.reason ?? "";
  if (m.status === "sending") return t("מייקי התחיל לשלוח ולא קיבל אישור ממטא. כדאי לבדוק באפליקציה אם התשובה יצאה.");
  if (r.startsWith("not sent")) return t("מייקי ניסה לענות ומטא לא קיבלה את ההודעה.");
  if (r.includes("attachment") || r === "no text") return t("נשלחה תמונה או קובץ בלי טקסט.");
  if (r.includes("wrote again")) return t("הלקוחה כתבה שוב מיד אחרי, ומייקי מתייחס להודעה האחרונה.");
  if (r.includes("no approved facts")) return t("אין מידע מאושר בנושאים שבחרת.");
  if (r.startsWith("could not decide")) return t("מייקי לא הצליח לבדוק את ההודעה הזאת.");
  return t("אין לשאלה הזאת תשובה ברורה במידע שאישרת.");
}

const when = (iso: string) => new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

export function InstagramInbox({ connected }: { connected: boolean }) {
  const t = useT();
  const [data, setData] = useState<Data | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The topics change on the screen at once; the save goes out quietly a moment later.
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const saveTopics = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/instagram", { cache: "no-store" });
    if (!res.ok) return;
    const d: Data = await res.json();
    setData(d);
    setFacts(d.facts);
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function run(body: unknown, done?: string) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await post(body);
      if (done) setSaved(done);
      await load();
    } catch (e) {
      setError(t((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <div className="space-y-[28px]" aria-busy="true">
        <span className="skeleton block h-36 w-full !rounded-[18px]" />
        <span className="skeleton block h-28 w-full !rounded-[18px]" />
      </div>
    );
  const s = data.settings;
  const shown = topics ?? s.topics;
  const savedTopics = new Set(data.facts.map((f) => f.topic));
  const missing = shown.filter((t) => !savedTopics.has(t));

  function toggleTopic(id: Topic) {
    const on = shown.includes(id);
    const next = on ? shown.filter((x) => x !== id) : [...shown, id];
    setTopics(next);
    setError(null);
    setSaved(null);
    // A new topic with nothing written for it gets an empty line below, ready to fill.
    if (!on && !facts.some((f) => f.topic === id)) setFacts((x) => [...x, { topic: id, label: "", value: "" }]);
    if (saveTopics.current) clearTimeout(saveTopics.current);
    saveTopics.current = setTimeout(() => {
      post({ action: "settings", enabled: s.enabled, topics: next }).catch((e) => {
        setTopics(null);
        setError(t((e as Error).message));
      });
    }, 500);
  }
  const pending = data.messages.filter((m) => m.status === "pending" || m.status === "sending");
  const answered = data.messages.filter((m) => m.status === "answered");
  const mine = data.messages.filter((m) => m.status === "handled" || m.status === "human");

  return (
    <div className="space-y-[28px]">
      {error && <p className="note note-bad">{error}</p>}
      {saved && !(data?.settings.enabled && data.settings.subscription && !data.settings.subscription.ok) && <p className="note note-good">{saved}</p>}

      <section className="card p-6">
        <label className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <span className="block">{t("מענה אוטומטי לשאלות על העסק")}</span>
            <span className="text-[15px] text-ink-2">{t("מייקי עונה מיד ובקצרה, רק מהמידע שאישרת למטה ורק בנושאים שבחרת. כשחסר מידע או שהשאלה לא ברורה הוא לא שולח כלום, וההודעה מחכה לך כאן.")}</span>
          </span>
          <input
            type="checkbox"
            className="switch mt-1"
            checked={s.enabled}
            disabled={busy || !connected}
            onChange={(e) => void run({ action: "settings", enabled: e.target.checked, topics: shown }, e.target.checked ? t("המענה האוטומטי פעיל.") : t("המענה האוטומטי כבוי."))}
          />
        </label>
        <div className="mt-5">
          <p className="text-[15px] text-ink">{t("נושאים שמייקי עונה עליהם")}</p>
          <p className="mb-3 text-[13.5px] text-ink-3">{t("לחיצה מוסיפה או מסירה נושא. אפשר לבחור כמה.")}</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((topic) => {
              const on = shown.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={on}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-[background-color,border-color,transform] duration-150 active:scale-[.97] ${
                    on ? "border-ink bg-surface text-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                  }`}
                  onClick={() => toggleTopic(topic.id)}
                >
                  {on ? <Check className="h-4 w-4" strokeWidth={1.75} /> : <Plus className="h-4 w-4 text-ink-3" strokeWidth={1.5} />}
                  {t(topic.label)}
                </button>
              );
            })}
          </div>
          {missing.length > 0 && (
            <p className="note note-warn mt-4 text-[14.5px]">
              {t("על {topics} מייקי עוד לא יענה, כי אין עליהם מידע מאושר. כתבי אותו למטה ולחצי על שמירה ואישור.", { topics: missing.map((x) => t(topicLabel(x))).join(", ") })}
            </p>
          )}
        </div>
        {s.enabled && s.subscription && !s.subscription.ok && (
          <div className="note note-warn mt-4 text-[14.5px]">
            <p>{t("המענה עוד לא פעיל: מטא לא אישרה למייקי לקבל את ההודעות החדשות מהעמוד. אפשר לכבות ולהדליק שוב כדי לנסות מחדש.")}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-[13.5px]">{t("פרטים טכניים")}</summary>
              <p className="mt-1 break-words text-[13px]" dir="ltr">
                {s.subscription.detail}
              </p>
            </details>
          </div>
        )}
      </section>

      <section>
        <h2 className="section-head">{t("המידע המאושר")}</h2>
        <p className="mb-3 text-[15px] text-ink-2">{t("רק מה שכתוב כאן נשלח ללקוחות, מילה במילה. מידע שמייקי מצא באתר לא נשלח עד שתכתבי אותו כאן. כשיש כמה סניפים, כותבים כל אחד בשורה משלו עם שם הסניף.")}</p>
        <div className="card divide-y divide-line">
          {facts.length === 0 && <p className="p-5 text-ink-3">{t("עוד אין מידע מאושר.")}</p>}
          {facts.map((f, i) => (
            <div key={i} className="grid gap-2 p-4 sm:grid-cols-[150px_150px_1fr_auto] sm:items-center">
              <Picker label={t("נושא")} value={f.topic} options={TOPICS.map((x) => [x.id, t(x.label)])} onChange={(v) => setFacts((x) => x.map((y, j) => (j === i ? { ...y, topic: v as Topic } : y)))} />
              <input className="field" placeholder={f.topic === "other" ? t("נושא") : t("סניף (לא חובה)")} maxLength={60} value={f.label ?? ""} onChange={(e) => setFacts((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
              <input className="field" placeholder={t(TOPICS.find((x) => x.id === f.topic)?.hint ?? "")} maxLength={400} value={f.value} onChange={(e) => setFacts((x) => x.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} />
              <button type="button" aria-label={t("הסרה")} className="btn btn-quiet btn-sm justify-self-end" onClick={() => setFacts((x) => x.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => setFacts((x) => [...x, { topic: "address", label: "", value: "" }])}>
            <Plus className="h-[18px] w-[18px]" strokeWidth={1.5} />
            {t("הוספה")}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run({ action: "facts", facts: facts.filter((f) => f.value.trim()) }, t("המידע נשמר ואושר לשליחה."))}>
            {t("שמירה ואישור")}
          </button>
        </div>
      </section>

      <section>
        <h2 className="section-head">{t("מחכות לך")} {pending.length > 0 && <span className="num text-ink-3">{pending.length}</span>}</h2>
        {pending.length === 0 ? <p className="text-ink-3">{t("אין הודעות שמחכות לך.")}</p> : <div className="space-y-3">{pending.map((m) => <Waiting key={m.id} m={m} busy={busy} run={run} />)}</div>}
      </section>

      {answered.length > 0 && (
        <section>
          <h2 className="section-head">{t("מייקי ענה")}</h2>
          <div className="card divide-y divide-line">
            {answered.map((m) => (
              <div key={m.id} className="space-y-1 p-4">
                <p className="meta">{when(m.sentAt)}</p>
                <p>{m.text}</p>
                <p className="text-[15px] text-ink-2">{t("התשובה:")} {m.reply}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(mine.length > 0 || data.paused.length > 0) && (
        <section>
          <h2 className="section-head">{t("בטיפול שלך")}</h2>
          <p className="mb-3 text-[15px] text-ink-2">{t("בשיחות שבהן ענית בעצמך מייקי לא עונה, עד שמחזירים אותן אליו.")}</p>
          <div className="card divide-y divide-line">
            {mine.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="meta">{when(m.sentAt)}</p>
                  <p>{m.text ?? t("תמונה או קובץ")}</p>
                  {m.reply && <p className="text-[15px] text-ink-2">{t("ענית:")} {m.reply}</p>}
                </div>
                {data.paused.includes(m.customerId) && (
                  <button type="button" className="btn btn-quiet btn-sm shrink-0" disabled={busy} onClick={() => void run({ action: "resume", customerId: m.customerId }, t("השיחה חזרה למייקי."))}>
                    {t("להחזיר למייקי")}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="meta">{t("הנושאים:")} {shown.length ? shown.map((x) => t(topicLabel(x))).join(", ") : t("לא נבחרו")}.</p>
    </div>
  );
}

function Waiting({ m, busy, run }: { m: Msg; busy: boolean; run: (body: unknown, done?: string) => Promise<void> }) {
  const t = useT();
  const [text, setText] = useState("");
  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="meta">{when(m.sentAt)}</span>
        <span className="tag tag-warn">{t("מחכה לך")}</span>
      </div>
      <p className="whitespace-pre-line">{m.text ?? t("תמונה או קובץ בלי טקסט")}</p>
      <p className="text-[15px] text-ink-2">{why(m, t)}</p>
      <textarea className="field min-h-20 py-2.5" rows={2} maxLength={1000} placeholder={t("התשובה שלך")} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={() => void run({ action: "reply", messageId: m.id, text }, t("התשובה נשלחה."))}>
          {t("שליחה")}
        </button>
        <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void run({ action: "handled", messageId: m.id })}>
          {t("טיפלתי בזה")}
        </button>
      </div>
    </div>
  );
}
