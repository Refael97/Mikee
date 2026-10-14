import { Page, PageHeader } from "./Page";

/**
 * A page's own frame while its data loads (the route's loading.tsx): its real title, lead and section
 * headings appear the moment it is opened; only the parts that come from the server shimmer.
 */
export function PageLoading({ title, lead, sections = [], narrow = false, grid = false }: { title: string; lead?: string; sections?: string[]; narrow?: boolean; grid?: boolean }) {
  return (
    <Page narrow={narrow}>
      <PageHeader title={title} lead={lead} />
      <div aria-busy="true" className="space-y-6">
        {grid ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <li key={i} className="card overflow-hidden">
                <span className="skeleton block aspect-square w-full !rounded-none" />
                <div className="space-y-2 px-3 py-3">
                  <span className="skeleton block h-3.5 w-3/4" />
                  <span className="skeleton block h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          (sections.length ? sections : [""]).map((s, i) => (
            <section key={i} className="space-y-3">
              {s && <h2 className="text-[16px] font-medium">{s}</h2>}
              <span className="skeleton block h-24 w-full !rounded-[18px]" />
            </section>
          ))
        )}
      </div>
    </Page>
  );
}
