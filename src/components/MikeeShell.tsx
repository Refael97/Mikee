"use client";

import { useState } from "react";
import { PanelRight } from "lucide-react";
import { Sidebar } from "./Sidebar";

/** Conversations on the right (in RTL, the start side), the open conversation in the middle. */
export function MikeeShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full flex-1">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="relative flex min-w-0 flex-1 flex-col">
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
