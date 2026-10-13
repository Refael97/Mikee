"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { refreshConversations } from "./Sidebar";

type Unread = { id: string; title: string; preview?: string };

const SEEN_KEY = "mikee:toasted";
function seenIds(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function remember(ids: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-50)));
  } catch {
    // Private mode: the toast may show again after a refresh, which is harmless.
  }
}

/**
 * When Mikee reaches out on his own, a small note slides in wherever the client is in the app:
 * Mikee's orb, the topic, and the first words, one tap from the conversation.
 */
export function MikeeToast() {
  const path = usePathname();
  const router = useRouter();
  const [note, setNote] = useState<Unread | null>(null);
  const [leaving, setLeaving] = useState(false);
  const known = useRef<Set<string> | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setNote(null);
      setLeaving(false);
    }, 200);
  }, []);

  useEffect(() => {
    known.current ??= seenIds();
    let stop = false;
    async function check() {
      const res = await fetch("/api/conversations", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || stop) return;
      const unread = ((await res.json()).conversations as (Unread & { unread?: boolean })[]).filter((c) => c.unread && c.preview);
      const fresh = unread.find((c) => !known.current!.has(c.id) && pathRef.current !== `/mikee/${c.id}`);
      if (!fresh) return;
      known.current!.add(fresh.id);
      remember(known.current!);
      setNote(fresh);
      refreshConversations();
    }
    void check();
    const t = setInterval(check, 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(close, 14_000);
    return () => clearTimeout(t);
  }, [note, close]);

  if (!note) return null;
  return (
    <div className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 lg:justify-end lg:px-6 ${path.startsWith("/mikee") ? "bottom-[150px] lg:bottom-[150px]" : "bottom-4 lg:bottom-6"}`}>
      <div
        role="status"
        className={`pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-[8px] bg-surface p-3.5 pe-2 shadow-[0_0_0_1px_rgba(26,31,54,0.08),var(--shadow-float)] ${leaving ? "toast-out" : "toast-in"}`}
      >
        <button
          onClick={() => {
            close();
            router.push(`/mikee/${note.id}`);
          }}
          className="flex min-w-0 flex-1 items-start gap-3 text-start"
        >
          <span className="orb mt-0.5 w-7 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[14px] font-semibold">
              מייקי כתב לך
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            <span className="mt-0.5 block truncate text-[13.5px] text-ink-3">{note.title}</span>
            <span className="mt-1 line-clamp-2 text-[15px] leading-snug">{note.preview}</span>
          </span>
        </button>
        <button onClick={close} aria-label="סגירה" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
