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
    <main className="s-wrap s-section s-meeting">
      <header className="s-head">
        <p className="s-kicker">ליווי אישי</p>
        <h1 className="s-h1 s-h1-sm">פגישת היכרות והקמה</h1>
        <p className="s-sub">חצי שעה בזום. מכירים את העסק, מחברים את מייקי לחשבונות ומגדירים יחד את היעדים לחודש הראשון. בחרו יום ושעה שנוחים לכם.</p>
      </header>
      <MeetingForm days={days} />
    </main>
  );
}
