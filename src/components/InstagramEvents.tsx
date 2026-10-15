"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

type Ev = { id: string; title: string; startTime: string; endTime?: string };
type Details = Ev & { notification_subtypes?: string[]; notification_target_time?: string };

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("he-IL", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/** The local date and time as ISO 8601 with this browser's offset, the way Meta takes a start time. */
function isoWithOffset(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00`);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}

/**
 * Upcoming events on Instagram (a launch, a sale): the list, each event's details on click, and a form to
 * create one. Followers can be reminded of an event, and a reminder ad can point to it.
 */
export function InstagramEvents({ connected }: { connected: boolean }) {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Details>>({});
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/meta/events", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setEvents(data.events ?? []);
    if (data.error) setError(data.error);
  }, []);
  useEffect(() => {
    if (connected) void load();
    else setEvents([]);
  }, [connected, load]);

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (details[id]) return;
    const res = await fetch(`/api/meta/events?id=${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (data.event) setDetails((d) => ({ ...d, [id]: data.event }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/meta/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, startTime: isoWithOffset(date, time) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "זה לא הצליח. נסי שוב.");
      setEvents(data.events);
      setTitle("");
      setDone("האירוע נוצר באינסטגרם.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!connected) return <p className="text-ink-3">קודם מחברים את האינסטגרם בהגדרות.</p>;
  return (
    <div className="space-y-4">
      {error && <p className="note note-bad">{error}</p>}
      {done && <p className="note note-good">{done}</p>}
      <div className="card divide-y divide-line">
        {events === null && <span className="skeleton m-5 block h-6 w-1/2" />}
        {events?.length === 0 && <p className="p-5 text-ink-3">אין אירועים קרובים.</p>}
        {events?.map((ev) => (
          <div key={ev.id}>
            <button type="button" className="flex w-full items-center gap-3 px-5 py-3 text-right" aria-expanded={open === ev.id} onClick={() => void toggle(ev.id)}>
              <span dir="auto" className="min-w-0 flex-1 truncate">{ev.title}</span>
              <span className="text-[14px] text-ink-3">{when(ev.startTime)}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform ${open === ev.id ? "rotate-180" : ""}`} strokeWidth={1.5} />
            </button>
            {open === ev.id && (
              <dl className="space-y-1 px-5 pb-4 text-[14.5px]">
                <div className="flex gap-2"><dt className="w-24 text-ink-3">שם</dt><dd dir="auto">{ev.title}</dd></div>
                <div className="flex gap-2"><dt className="w-24 text-ink-3">מתחיל</dt><dd>{when(ev.startTime)}</dd></div>
                {(details[ev.id]?.endTime ?? ev.endTime) && <div className="flex gap-2"><dt className="w-24 text-ink-3">נגמר</dt><dd>{when(details[ev.id]?.endTime ?? ev.endTime)}</dd></div>}
                <div className="flex gap-2"><dt className="w-24 text-ink-3">מזהה</dt><dd dir="ltr" className="num text-ink-2">{ev.id}</dd></div>
              </dl>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={create} className="card grid gap-3 p-5 sm:grid-cols-[1fr_150px_110px_auto] sm:items-end">
        <label className="space-y-1.5">
          <span className="text-[14px] text-ink-2">שם האירוע</span>
          <input dir="auto" className="field" maxLength={100} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="השקת קולקציית החורף" />
        </label>
        <label className="space-y-1.5">
          <span className="text-[14px] text-ink-2">תאריך</span>
          <input type="date" className="field" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="space-y-1.5">
          <span className="text-[14px] text-ink-2">שעה</span>
          <input type="time" className="field" required value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy || !title.trim() || !date}>
          {busy ? "יוצר…" : "ליצור אירוע"}
        </button>
      </form>
    </div>
  );
}
