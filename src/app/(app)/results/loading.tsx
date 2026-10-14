import Link from "next/link";
import { Block, Page, PageHeader } from "@/components/Page";
import { Sk } from "@/components/Skeleton";

/** The results page's own frame, at once: only the numbers and the chart shimmer while Meta answers. */
export default function Loading() {
  return (
    <Page>
      <PageHeader title="תוצאות" lead="החודש עד היום, בהשוואה לאותם ימים בחודש שעבר" action={<Link href="/campaigns" className="btn btn-quiet btn-sm">כל הקמפיינים</Link>} />
      <section className="card grid grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`p-5 ${i % 2 ? "border-s border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${i === 2 ? "lg:border-s" : ""}`}>
            <Sk w="4.5rem" h="12px" />
            <div className="mt-3">
              <Sk w="5.5rem" h="24px" />
            </div>
            <div className="mt-3">
              <Sk w="7rem" h="11px" />
            </div>
          </div>
        ))}
      </section>
      <Block title="תוצאות בכל יום החודש" className="mt-8">
        <div className="card p-5">
          <span aria-hidden className="skeleton block h-44 w-full" />
        </div>
      </Block>
    </Page>
  );
}
