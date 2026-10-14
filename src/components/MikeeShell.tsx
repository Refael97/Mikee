"use client";

import { useState } from "react";
import { PanelRight } from "lucide-react";
import { Sidebar } from "./Sidebar";

/** Conversations on the right (in RTL, the start side), the open conversation in the middle. */
export function MikeeShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-1 lg:gap-[10px]">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="relative flex min-w-0 flex-1 flex-col bg-bg lg:min-h-[calc(100dvh-20px)] lg:rounded-[18px] lg:shadow-[var(--shadow)]">
        <button
          onClick={() => setOpen(true)}
          className="btn btn-quiet btn-sm sticky top-[64px] z-30 mx-4 mt-2 w-fit lg:hidden"
        >
          <PanelRight className="h-4 w-4" />
          השיחות
        </button>
        {children}
      </div>
    </div>
  );
}
