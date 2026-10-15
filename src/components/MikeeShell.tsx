"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";

/**
 * Conversations on the right (in RTL, the start side), the open conversation in the middle. On mobile and
 * tablet the list opens from the conversations button in the top bar (an event, or #conversations when it
 * was pressed on another page).
 */
export function MikeeShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("mikee:open-conversations", show);
    if (window.location.hash === "#conversations") {
      setOpen(true);
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return () => window.removeEventListener("mikee:open-conversations", show);
  }, []);
  return (
    <div className="flex w-full flex-1 lg:gap-[10px]">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="relative flex min-w-0 flex-1 flex-col bg-bg lg:min-h-[calc(100dvh-20px)] lg:rounded-[18px] lg:shadow-[var(--shadow)]">{children}</div>
    </div>
  );
}
