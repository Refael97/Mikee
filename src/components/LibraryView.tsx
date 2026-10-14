"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Film, FolderInput, Music, Search, Trash2, Upload } from "lucide-react";
import type { MediaView } from "@/lib/media";
import { PageHeader } from "./Page";

type Usage = { used: number; limit: number; plan: string };
type Pending = { localId: string; name: string; error?: string };

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)}GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,.mp3,.m4a,.wav";

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
  // Everything the page loaded. Type and folder filter it right here, at once; only a text search (by meaning)
  // asks the server, and a newer choice always wins over an older answer.
  const [all, setAll] = useState(initial);
  const [usage, setUsage] = useState(initialUsage);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | "image" | "video" | "audio">("");
  const [folder, setFolder] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState<string | null>(drive.justConnected ? "גוגל דרייב מחובר. אפשר לבחור קבצים לייבוא." : null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // The page loads at most this many; past it, a type or folder filter also asks the server for the rest.
  const truncated = initial.length >= 120;
  const want = { q: q.trim(), kind, folder };
  const wantKey = JSON.stringify(want);
  const needServer = !!want.q || (truncated && (!!kind || !!folder));
  const [remote, setRemote] = useState<{ key: string; items: MediaView[] } | null>(null);
  const [remoteState, setRemoteState] = useState<{ key: string; status: "loading" | "error" } | null>(null);
  const request = useRef<AbortController | null>(null);

  /** The full list again (after an upload, an import or a delete). */
  const reload = useCallback(async () => {
    const res = await fetch("/api/library", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setAll(data.items);
    setUsage((u) => ({ ...u, ...data.usage }));
  }, []);

  const fetchRemote = useCallback((key: string) => {
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    const w = JSON.parse(key) as { q: string; kind: string; folder: string };
    const params = new URLSearchParams({ ...(w.q ? { q: w.q } : {}), ...(w.kind ? { kind: w.kind } : {}), ...(w.folder ? { folder: w.folder } : {}) });
    setRemoteState({ key, status: "loading" });
    fetch(`/api/library?${params}`, { cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (request.current !== ctrl) return; // an older answer never replaces a newer choice
        setRemote({ key, items: data.items });
        setRemoteState(null);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError" || request.current !== ctrl) return;
        setRemoteState({ key, status: "error" });
      });
  }, []);

  useEffect(() => {
    if (!needServer) {
      request.current?.abort();
      setRemoteState(null);
      return;
    }
    // Typing waits for a short pause; a click on a filter asks at once.
    const t = setTimeout(() => fetchRemote(wantKey), want.q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantKey, needServer, fetchRemote]);

  const local = all.filter((m) => (!kind || m.kind === kind) && (!folder || m.folder === folder));
  const searching = !!want.q;
  const current = remote?.key === wantKey ? remote.items : null;
  // Filters show the local result at once (and the server's when it comes); a search shows its own answer.
  const items = current ?? (searching ? null : local);
  const loading = remoteState?.key === wantKey && remoteState.status === "loading";
  const failed = remoteState?.key === wantKey && remoteState.status === "error";

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
          await reload();
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
      const music = new g.DocsView(g.ViewId.DOCS).setMimeTypes("audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg").setIncludeFolders(true).setLabel("מוזיקה");
      const picker = new g.PickerBuilder()
        .addView(view)
        .addView(music)
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
          await reload();
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק את הקובץ מהספרייה? מודעות שכבר עלו לא יושפעו.")) return;
    const removed = all.find((x) => x.id === id);
    setAll((xs) => xs.filter((x) => x.id !== id));
    setRemote((r) => (r ? { ...r, items: r.items.filter((x) => x.id !== id) } : r));
    const res = await fetch(`/api/library/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      // The server kept it: put it back and say so, rather than pretending it is gone.
      if (removed) setAll((xs) => [removed, ...xs]);
      setNotice("המחיקה לא הצליחה. נסי שוב.");
      return;
    }
    await reload();
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
        lead="התמונות, הסרטונים והמוזיקה של העסק. מייקי מחפש כאן לפני שהוא יוצר משהו חדש, ובונה מכאן את הסרטונים."
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
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-3" strokeWidth={1.5} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="לחפש לפי מה שרואים: שמלה אדומה, החנות, צוות" className="field rounded-full ps-10" />
        </label>
        <div className="inline-flex flex-wrap gap-1">
          {([["", "הכל"], ["image", "תמונות"], ["video", "סרטונים"], ["audio", "מוזיקה"]] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className="tab"
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 text-[13px] text-ink-3" title="אחסון בספרייה">
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
            <span className={`block h-full rounded-full ${pct > 90 ? "bg-coral" : "bg-mint"}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="num">
            {size(usage.used)} מתוך {size(usage.limit)}
          </span>
        </div>
      </div>

      {folders.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1">
          {[{ name: "", count: 0 }, ...folders].map((f) => (
            <button
              key={f.name || "all"}
              onClick={() => setFolder(f.name)}
              aria-pressed={folder === f.name}
              className="tab tab-sm"
            >
              {f.name || "כל התיקיות"}
              {f.count ? <span className="num text-[14px] text-ink-3">{f.count}</span> : null}
            </button>
          ))}
        </div>
      )}

      {notice && <p className="note mt-5 text-[15px]">{notice}</p>}

      {failed ? (
        // A failed search is not an empty library: say so, and retry only the search.
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-warn-tint px-4 py-3 text-[14.5px] text-warn">
          <span>החיפוש לא הצליח כרגע. מה שכבר בספרייה לא נפגע.</span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => fetchRemote(wantKey)}>
            לנסות שוב
          </button>
        </div>
      ) : items === null ? (
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="מחפש בספרייה">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="card overflow-hidden">
              <span className="skeleton block aspect-square w-full !rounded-none" />
              <div className="space-y-2 px-3 py-3">
                <span className="skeleton block h-3.5 w-3/4" />
                <span className="skeleton block h-3 w-1/2" />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 && pending.length === 0 && !loading ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-[8px] border border-dashed border-line-strong px-6 py-14 text-center">
          <span className="h2">{q || kind || folder ? "לא מצאתי משהו כזה" : "הספרייה עוד ריקה"}</span>
          <p className="max-w-lg text-ink-2">
            {q || kind || folder ? "נסי מילה אחרת, או לנקות את הסינון." : "גוררים לכאן תמונות וסרטונים של המוצרים, החנות, הצוות והלקוחות, וגם מוזיקה לסרטונים. ככל שיש יותר תוכן אמיתי, המודעות טובות יותר."}
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
              {m.kind === "audio" ? (
                <div className="flex aspect-square flex-col items-center justify-center gap-4 border-b border-line bg-surface-2 px-3">
                  <Music className="h-9 w-9 text-ink-3" strokeWidth={1.5} />
                  <audio src={m.url} controls preload="none" className="w-full" />
                </div>
              ) : (
              <a href={m.url} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden border-b border-line bg-surface-2">
                {m.kind === "video" ? (
                  <>
                    <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-full bg-ink/75 px-1.5 py-0.5 text-[12px] text-bg">
                      <Film className="h-3 w-3" /> וידאו
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.description ?? m.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                )}
              </a>
              )}
              <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{m.name}</p>
                  <p className="line-clamp-2 text-[13px] leading-snug text-ink-3">{m.description ?? (m.kind === "image" ? "מייקי עוד לא תיאר את התמונה" : m.source === "higgsfield" ? "נוצר על ידי מייקי" : "")}</p>
                </div>
                <button onClick={() => remove(m.id)} aria-label="מחיקה" className="shrink-0 rounded-[8px] p-1 text-ink-3 opacity-0 transition-opacity hover:bg-bad-tint hover:text-bad group-hover:opacity-100 max-lg:opacity-100">
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
