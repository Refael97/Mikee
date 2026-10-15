import type { Metadata } from "next";
import { ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { dayLabel, meetingDays } from "@/lib/meetings";
import { MeetingForm } from "./MeetingForm";

export const metadata: Metadata = { title: "פגישת היכרות" };

export default async function MeetingPage() {
  const d = await db();
  const taken = (await d.select({ slot: schema.meetingRequests.slot }).from(schema.meetingRequests).where(ne(schema.meetingRequests.status, "cancelled"))).map((r) => r.slot);
  const days = meetingDays(new Date(), taken).map((day) => ({ ...day, label: dayLabel(day.date) }));
  return (
    <main className="s-page s-meeting">
      <header className="s-page-head">
        <h1 className="s-page-h1">פגישת היכרות והקמה</h1>
        <p className="s-statement">חצי שעה בזום. מכירים את העסק, מחברים את מייקי לחשבונות ומגדירים יחד את היעדים לחודש הראשון. בחרו יום ושעה שנוחים לכם.</p>
      </header>
      <MeetingForm days={days} />
    </main>
  );
}
