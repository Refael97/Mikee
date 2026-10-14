import { MikeeAvatar } from "@/components/MikeeAvatar";

/** The top of a page: the title, an optional line under it, and the page's actions on the end side. */
export function PageHeader({ title, lead, action }: { title: React.ReactNode; lead?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-6">
      <div className="min-w-0 max-w-2xl">
        <h1 className="title">{title}</h1>
        {lead && <p className="lead mt-1.5">{lead}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

export function Page({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return <main className={`mx-auto w-full px-4 pb-16 pt-6 sm:px-8 sm:pt-8 ${narrow ? "max-w-[880px]" : "max-w-[1200px]"}`}>{children}</main>;
}

/** A titled block of a page, with an optional action on its end side. */
export function Block({ title, action, children, className = "" }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="h2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A calm empty state: Mikee, one sentence, one way forward. */
export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <MikeeAvatar size={36} />
      <p className="h2 mt-4">{title}</p>
      {text && <p className="mt-1.5 max-w-md text-[15px] text-ink-2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Segmented({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="inline-flex rounded-[6px] border border-line-strong bg-surface-2 p-0.5">
      {items.map((x) => (
        <a
          key={x.key}
          href={x.href}
          aria-current={x.key === active ? "page" : undefined}
          className={`flex h-7 items-center rounded-[5px] px-3 text-[14px] font-medium transition-colors ${
            x.key === active ? "bg-surface text-ink shadow-[0_1px_2px_rgba(26,31,54,0.12)]" : "text-ink-2 hover:text-ink"
          }`}
        >
          {x.label}
        </a>
      ))}
    </nav>
  );
}
