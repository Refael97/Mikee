/** "Updated N minutes ago" under data shown from memory while it refreshes. Nothing when it is fresh. */
export function Freshness({ ageMs, className = "" }: { ageMs: number | null; className?: string }) {
  if (ageMs == null || ageMs < 90_000) return null;
  const min = Math.round(ageMs / 60_000);
  return <p className={`text-[12.5px] text-ink-3 ${className}`}>נכון ללפני {min === 1 ? "דקה" : `${min} דקות`}. מתעדכן ברקע, ברענון הבא יופיעו המספרים החדשים.</p>;
}
