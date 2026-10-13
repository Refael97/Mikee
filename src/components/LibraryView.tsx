"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Film, FolderInput, Search, Trash2, Upload } from "lucide-react";
import type { MediaView } from "@/lib/media";
import { PageHeader } from "./Page";

type Usage = { used: number; limit: number; plan: string };
type Pending = { localId: string; name: string; error?: string };

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)}GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/quicktime,video/webm";

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

/** Loads Google's picker script once; scripts created by our own (nonce-trusted) code are allowed by the CSP. */
function loadPicker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) return resolve();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.onload = () => window.gapi.load("picker", { callback: resolve, onerror: reject });
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function LibraryView({
  initial,
  usage: initialUsage,
  folders,
  drive,
}: {
  initial: MediaView[];
  usage: Usage;
  folders: { name: string; count: number }[];
  drive: { available: boolean; connected: boolean; justConnected: boolean };
}) {
  const [items, setItems] = useState(initial);
  const [usage, setUsage] = useState(initialUsage);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | "image" | "video">("");
  const [folder, setFolder] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState<string | null>(drive.justConnected ? "גוגל דרייב מחובר. אפשר לבחור קבצים לייבוא." : null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(kind ? { kind } : {}), ...(folder ? { folder } : {}) });
    const res = await fetch(`/api/library?${p}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items);
    setUsage((u) => ({ ...u, ...data.usage }));
  }, [q, kind, folder]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function upload(files: FileList | File[]) {
    for (const file of Array.from(files).slice(0, 30)) {
      const localId = crypto.randomUUID();
      setPending((p) => [...p, { localId, name: file.name }]);
      const form = new FormData();
      form.append("file", file);
      form.append("library", "1");
      if (folder) form.append("folder", folder);
      fetch("/api/uploads", { method: "POST", body: form })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.error ?? "ההעלאה נכשלה");
          setPending((p) => p.filter((x) => x.localId !== localId));
          await load();
        })
        .catch((e: Error) => setPending((p) => p.map((x) => (x.localId === localId ? { ...x, error: e.message } : x))));
    }
  }

  async function pickFromDrive() {
    setNotice(null);
    try {
      const auth = await fetch("/api/google/token", { cache: "no-store" }).then((r) => r.json());
      if (!auth.token) throw new Error(auth.error ?? "לא הצלחתי להתחבר לגוגל דרייב");
      await loadPicker();
      const g = window.google.picker;
      const view = new g.DocsView(g.ViewId.DOCS_IMAGES_AND_VIDEOS).setIncludeFolders(true).setSelectFolderEnabled(false);
      const picker = new g.PickerBuilder()
        .addView(view)
        .enableFeature(g.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(auth.token)
        .setDeveloperKey(auth.apiKey)
        .setAppId(auth.appId)
        .setLocale("iw")
        .setTitle("בחירת תמונות וסרטונים לספרייה")
        .setCallback(async (data: any) => {
          if (data.action !== g.Action.PICKED) return;
          const ids = data.docs.map((d: any) => d.id);
          setPending((p) => [...p, ...ids.map((id: string) => ({ localId: id, name: "מגוגל דרייב" }))]);
          const res = await fetch("/api/library/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileIds: ids }) });
          const out = await res.json().catch(() => ({}));
          setPending((p) => p.filter((x) => !ids.includes(x.localId)));
          if (!res.ok) return setNotice(out.error ?? "הייבוא נכשל");
          setNotice(`יובאו ${out.imported.length} קבצים${out.skipped.length ? `, ${out.skipped.length} דולגו (${out.skipped[0].reason})` : ""}.`);
          await load();
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הקובץ מהספרייה? מודעות שכבר עלו לא יושפעו.")) return;
    setItems((xs) => xs.filter((x) => x.id !== id));
    await fetch(`/api/library/${id}`, { method: "DELETE" });
    await load();
  }

  const pct = Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
      className="relative"
    >
      <PageHeader
        title="ספרייה"
        lead="התמונות והסרטונים של העסק. מייקי מחפש כאן לפני שהוא יוצר משהו חדש, ומוצא כל תמונה לפי מה שרואים בה."
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileInput.current?.click()} className="btn btn-primary btn-sm">
              <Upload className="h-4 w-4" strokeWidth={2} /> העלאה
            </button>
            {drive.available &&
              (drive.connected ? (
                <button onClick={pickFromDrive} className="btn btn-quiet btn-sm">
                  <FolderInput className="h-4 w-4" strokeWidth={1.8} /> מגוגל דרייב
                </button>
              ) : (
                <a href="/api/google/connect" className="btn btn-quiet btn-sm">
                  <FolderInput className="h-4 w-4" strokeWidth={1.8} /> לחבר את גוגל דרייב
                </a>
              ))}
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={1.75} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="לחפש לפי מה שרואים: שמלה אדומה, החנות, צוות" className="field ps-9" />
        </label>
        <div className="inline-flex rounded-[6px] border border-line-strong bg-surface-2 p-0.5">
          {([["", "הכל"], ["image", "תמונות"], ["video", "סרטונים"]] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`flex h-7 items-center rounded-[5px] px-3 text-[14px] font-medium ${kind === k ? "bg-surface text-ink shadow-[0_1px_2px_rgba(26,31,54,0.12)]" : "text-ink-2 hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 text-[13px] text-ink-3" title="אחסון בספרייה">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
            <span className={`block h-full rounded-full ${pct > 90 ? "bg-bad" : "bg-brand"}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="num">
            {size(usage.used)} מתוך {size(usage.limit)}
          </span>
        </div>
      </div>

      {folders.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-[14px]">
          {[{ name: "", count: 0 }, ...folders].map((f) => (
            <button
              key={f.name || "all"}
              onClick={() => setFolder(f.name)}
              className={`h-7 rounded-[6px] border px-2.5 font-medium ${folder === f.name ? "border-brand bg-brand-tint text-brand" : "border-line-strong bg-surface text-ink-2 hover:text-ink"}`}
            >
              {f.name || "כל התיקיות"}
              {f.count ? <span className="num ms-1.5 font-normal opacity-70">{f.count}</span> : null}
            </button>
          ))}
        </div>
      )}

      {notice && <p className="note mt-5 text-[15px]">{notice}</p>}

      {items.length === 0 && pending.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-[8px] border border-dashed border-line-strong px-6 py-14 text-center">
          <span className="h2">{q || kind || folder ? "לא מצאתי משהו כזה" : "הספרייה עוד ריקה"}</span>
          <p className="max-w-lg text-ink-2">
            {q || kind || folder ? "נסי מילה אחרת, או לנקות את הסינון." : "גוררים לכאן תמונות וסרטונים של המוצרים, החנות, הצוות והלקוחות. ככל שיש יותר תוכן אמיתי, המודעות טובות יותר."}
          </p>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {pending.map((p) => (
            <li key={p.localId}>
              <div className={`relative aspect-square overflow-hidden rounded-[8px] ${p.error ? "border border-bad bg-bad-tint" : "dot-grid bg-surface-2"}`}>
                {!p.error && <div className="dot-grid-lit absolute inset-0" />}
              </div>
              <p className={`mt-2 truncate text-[14px] ${p.error ? "text-bad" : "shimmer font-medium"}`}>{p.error ?? `מעלה את ${p.name}`}</p>
            </li>
          ))}
          {items.map((m) => (
            <li key={m.id} className="group rise card overflow-hidden">
              <a href={m.url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden border-b border-line bg-surface-2">
                {m.kind === "video" ? (
                  <>
                    <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-[4px] bg-ink/75 px-1.5 py-0.5 text-[12px] text-bg">
                      <Film className="h-3 w-3" /> וידאו
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.description ?? m.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                )}
              </a>
              <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{m.name}</p>
                  <p className="line-clamp-2 text-[13px] leading-snug text-ink-3">{m.description ?? (m.kind === "image" ? "מייקי עוד לא תיאר את התמונה" : m.source === "higgsfield" ? "נוצר על ידי מייקי" : "")}</p>
                </div>
                <button onClick={() => remove(m.id)} aria-label="מחיקה" className="shrink-0 rounded-[5px] p-1 text-ink-3 opacity-0 transition-opacity hover:bg-bad-tint hover:text-bad group-hover:opacity-100 max-lg:opacity-100">
                  <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
              <Link href={`/mikee?q=${encodeURIComponent(`בוא נשתמש בקובץ "${m.name}" מהספרייה`)}`} className="link mx-3 mb-3 mt-1.5 inline-block text-[13.5px]">
                להשתמש עם מייקי
              </Link>
            </li>
          ))}
        </ul>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-50 flex items-center justify-center rounded-[10px] border-2 border-dashed border-brand bg-bg/90">
          <span className="title">לשחרר כאן כדי להוסיף לספרייה</span>
        </div>
      )}
    </div>
  );
}
