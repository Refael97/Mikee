"use client";

import { useState } from "react";
import { PanelRight } from "lucide-react";
import { Sidebar } from "./Sidebar";

/** Conversations on the right (in RTL, the start side), the open conversation in the middle. */
export function MikeeShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <button
          onClick={() => setOpen(true)}
          className="glass sticky top-[84px] z-30 mx-5 mt-1 flex h-10 w-fit items-center gap-2 rounded-[20px] px-3.5 text-[15px] font-medium text-ink-2 shadow-[var(--shadow)] lg:hidden"
        >
          <PanelRight className="h-4 w-4" />
          השיחות
        </button>
        {children}
      </div>
    </div>
  );
}
