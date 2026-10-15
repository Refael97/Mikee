import { requireSession } from "@/lib/auth";
import { listScheduledTasks } from "@/lib/schedule-list";
import { Page, PageHeader } from "@/components/Page";
import { ScheduleList } from "@/components/ScheduleList";

export default async function SchedulePage() {
  const { workspace } = await requireSession();
  const tasks = await listScheduledTasks(workspace.id, workspace.timezone);
  return (
    <Page narrow>
      <PageHeader title="תזמון" lead="הפרסומים שמייקי יעלה במועד שאישרת. אפשר לבטל כל עוד הפרסום לא התחיל." />
      <ScheduleList tasks={tasks} />
    </Page>
  );
}
