import "server-only";
import { metaContext } from "./context";

export type UpcomingEvent = { id: string; title: string; startTime: string; endTime?: string };

/** The Instagram account's upcoming events (a launch, a sale), the ones a reminder ad can point to. */
export async function listEvents(workspaceId: string): Promise<UpcomingEvent[]> {
  const ctx = await metaContext(workspaceId);
  if (!ctx.igUserId) return [];
  const res = await ctx.graph.get<{ data: any[] }>(`/${ctx.igUserId}/upcoming_events`, { fields: "id,title,start_time,end_time", limit: 25 });
  return (res.data ?? []).map((e) => ({ id: e.id, title: e.title ?? "", startTime: e.start_time, endTime: e.end_time }));
}

/** One event's details, only when it is one of this account's events. */
export async function eventDetails(workspaceId: string, id: string): Promise<UpcomingEvent & Record<string, unknown>> {
  const ctx = await metaContext(workspaceId);
  if (!(await listEvents(workspaceId)).some((e) => e.id === id)) throw new Error("not this account's event");
  const e = await ctx.graph.get<any>(`/${id}`, { fields: "id,title,start_time,end_time,notification_subtypes,notification_target_time" });
  return { ...e, id: e.id, title: e.title ?? "", startTime: e.start_time, endTime: e.end_time };
}

/** Creates an upcoming event on the business's own Instagram account, when the owner asked for it. */
export async function createEvent(workspaceId: string, input: { title: string; startTime: string; endTime?: string }): Promise<string> {
  const ctx = await metaContext(workspaceId);
  if (!ctx.igUserId) throw new Error("Instagram is not connected");
  const res = await ctx.graph.post<{ id: string }>(`/${ctx.igUserId}/upcoming_events`, {
    title: input.title,
    start_time: input.startTime,
    ...(input.endTime ? { end_time: input.endTime } : {}),
  });
  return res.id;
}
