/** Shown the moment a page is opened, while its data loads: the panel and the shape of a page, no spinner. */
export default function Loading() {
  return (
    <main className="flex-1 bg-bg lg:min-h-[calc(100dvh-20px)] lg:rounded-[18px] lg:shadow-[var(--shadow)]" aria-busy="true" aria-label="טוען">
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-14 pt-6 sm:px-7 lg:pt-7">
        <div className="h-8 w-40 animate-pulse rounded-[8px] bg-surface-2" />
        <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-[6px] bg-surface-2" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[18px] bg-surface-2" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    </main>
  );
}
