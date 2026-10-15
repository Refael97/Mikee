import { requireSession } from "@/lib/auth";
import { listScheduledTasks } from "@/lib/schedule-list";
import { Page, PageHeader } from "@/components/Page";
import { ScheduleList } from "@/components/ScheduleList";
import { InstagramEvents } from "@/components/InstagramEvents";
import { getConnection, type MetaConfig } from "@/lib/connections";

export default async function SchedulePage() {
  const { workspace } = await requireSession();
  const [tasks, meta] = await Promise.all([listScheduledTasks(workspace.id, workspace.timezone), getConnection<MetaConfig>(workspace.id, "meta")]);
  return (
    <Page narrow>
      <PageHeader title="תזמון" lead="הפרסומים שמייקי יעלה במועד שאישרת. אפשר לבטל כל עוד הפרסום לא התחיל." />
      <ScheduleList tasks={tasks} />
      <section className="mt-[40px]">
        <h2 className="section-head">אירועים קרובים באינסטגרם</h2>
        <p className="mb-4 text-[15px] text-ink-2">השקה, מבצע או ערב פתוח. העוקבים יכולים לבקש תזכורת, ומודעת תזכורת יכולה להפנות לאירוע.</p>
        <InstagramEvents connected={!!meta?.secret && meta.status !== "broken" && !!meta.config.igUserId} />
      </section>
    </Page>
  );
}
