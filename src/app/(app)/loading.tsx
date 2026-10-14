/** Shown the moment a page is opened, while its data loads: the panel and the shape of a page, no spinner. */
export default function Loading() {
  return (
    <main className="flex-1 bg-bg lg:min-h-[calc(100dvh-20px)] lg:rounded-[18px] lg:shadow-[var(--shadow)]" aria-busy="true" aria-label="טוען">
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-14 pt-6 sm:px-7 lg:pt-7">
        <span className="skeleton block h-8 w-40" />
        <span className="skeleton mt-3 block h-4 w-72 max-w-full" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton block h-20 w-full !rounded-[18px]" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
    </main>
  );
}
