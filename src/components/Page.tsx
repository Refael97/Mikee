/** The top of a page: a small label, a serif title, an optional line under it and an action on the side. */
export function PageHeader({ kicker, title, lead, action }: { kicker?: string; title: React.ReactNode; lead?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-8">
      <div className="min-w-0 max-w-2xl">
        {kicker && <span className="kicker">{kicker}</span>}
        <h1 className="title mt-3">{title}</h1>
        {lead && <p className="lead mt-3">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

export function Page({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return <main className={`mx-auto w-full px-5 pb-20 pt-8 sm:pt-12 ${narrow ? "max-w-[860px]" : "max-w-[1160px]"}`}>{children}</main>;
}

/** A calm empty state: Mikee, one sentence, one way forward. */
export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="rise flex flex-col items-start border-y border-line py-12">
      <span className="orb orb-breathe w-10" />
      <p className="h2 mt-5">{title}</p>
      {text && <p className="mt-2 max-w-md text-ink-2">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Segmented({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="flex gap-1 rounded-[8px] border border-line-strong p-1">
      {items.map((x) => (
        <a
          key={x.key}
          href={x.href}
          aria-current={x.key === active ? "page" : undefined}
          className={`flex h-8 items-center rounded-[5px] px-3 text-[15px] font-semibold transition-colors ${x.key === active ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"}`}
        >
          {x.label}
        </a>
      ))}
    </nav>
  );
}
