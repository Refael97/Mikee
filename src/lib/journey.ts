import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { getConnection, type MetaConfig, type StoreConfig } from "./connections";
import { getSettings, updateSettings } from "./settings";

/**
 * The marketing path of a small business, the way an experienced marketer thinks about it: first the
 * foundations, then new customers, then turning visitors into buyers, then keeping them, then growing.
 * Mikee always knows where the business is on this path, what is done, what is missing and what the
 * client wants to focus on, and suggests the next move when the current one is in place.
 */

export type BusinessType = "ecommerce" | "services" | "local" | "content";
export type ItemStatus = "done" | "active" | "next" | "skipped" | "open";

export const PHASES = [
  { id: "foundations", title: "יסודות", hint: "מה שחייב לעבוד לפני שמשקיעים בפרסום" },
  { id: "reach", title: "קהל חדש", hint: "להגיע לאנשים שעוד לא מכירים את העסק" },
  { id: "convert", title: "מהתעניינות לקנייה", hint: "להחזיר את מי שכבר התעניין" },
  { id: "keep", title: "לקוחות חוזרים", hint: "לשמור על מי שכבר קנה" },
  { id: "grow", title: "צמיחה", hint: "להגדיל את מה שעובד" },
] as const;
export type PhaseId = (typeof PHASES)[number]["id"];

type Item = { id: string; phase: PhaseId; title: string; why: string; fits: BusinessType[] | "all"; how: string };

const ALL = "all" as const;
export const ITEMS: Item[] = [
  { id: "tracking", phase: "foundations", title: "מעקב באתר שמדווח על רכישות ופניות", why: "בלי זה אי אפשר לדעת מה עובד, ומטא לא יכולה ללמוד למי להראות את המודעות", fits: ALL, how: "Check the pixel fires Purchase/Lead events (meta_read pixel stats). If not, explain simply what to install and offer to guide." },
  { id: "catalog", phase: "foundations", title: "קטלוג מוצרים מחובר", why: "מאפשר מודעות שמראות לכל אחד את המוצרים שהוא ראה", fits: ["ecommerce"], how: "Connect the store catalog in Commerce Manager; the client picks it in settings." },
  { id: "profile", phase: "foundations", title: "פרופיל אינסטגרם ופייסבוק מסודר", why: "מי שרואה מודעה בודק את הפרופיל לפני שהוא קונה או פונה", fits: ALL, how: "Review bio, link, highlights and last 9 posts (read_social); suggest concrete fixes." },
  { id: "offer", phase: "foundations", title: "הצעה ברורה: למה דווקא אצלנו", why: "מודעה טובה מתחילה במשפט אחד שהלקוח מבין מיד", fits: ALL, how: "Agree with the client on the main promise and save it in the brain as a client fact." },
  { id: "first_campaign", phase: "reach", title: "קמפיין ראשון לקהל חדש", why: "לגלות מי הקהל שמגיב ובאיזה מחיר", fits: ALL, how: "Sales campaign (ecommerce) or leads campaign (services/local) with broad targeting and 2-3 creatives." },
  { id: "creative_test", phase: "reach", title: "בדיקה של כמה כיווני מודעה", why: "הקריאייטיב משפיע על התוצאות יותר מכל הגדרה אחרת", fits: ALL, how: "3 different angles (benefit, social proof, offer) in one campaign; keep the winner after a week." },
  { id: "short_video", phase: "reach", title: "סרטונים קצרים לקמפיינים", why: "סרטון קצר עולה פחות לכל פנייה ומחזיק את העין", fits: ALL, how: "Use client videos from the library or generate one; 9:16 for reels and stories." },
  { id: "retargeting", phase: "convert", title: "רימרקטינג למי שביקר ולא קנה", why: "מי שכבר התעניין קונה הרבה יותר בזול מקהל חדש", fits: ["ecommerce", "services"], how: "Website visitors 30 days (excluding buyers) plus Instagram engagers; reminder creative with social proof or a small incentive." },
  { id: "catalog_ads", phase: "convert", title: "מודעות קטלוג שמראות את המוצר שנצפה", why: "כל אחד רואה בדיוק את מה שהוא התלבט עליו", fits: ["ecommerce"], how: "Advantage+ catalog ads on viewed/added-to-cart, after the catalog is connected." },
  { id: "lead_form", phase: "convert", title: "טופס פנייה מהיר בתוך פייסבוק", why: "פחות צעדים, יותר פניות, בלי לצאת מהאפליקציה", fits: ["services", "local"], how: "Create an instant form (meta_write leadgen_forms) with 2-3 qualifying questions." },
  { id: "landing", phase: "convert", title: "דף נחיתה שמתאים למודעה", why: "אם הדף לא ממשיך את ההבטחה של המודעה, הכסף הולך לאיבוד", fits: ALL, how: "Read the landing page (scan_website) and suggest concrete fixes: headline, speed, one clear action." },
  { id: "email_club", phase: "keep", title: "מועדון חברים או איסוף אימיילים באתר", why: "רשימה משלך, בלי לשלם על כל פנייה מחדש", fits: ["ecommerce", "local", "content"], how: "A signup offer (first-order discount, early access) on the site, promoted with a small lead campaign." },
  { id: "customer_list", phase: "keep", title: "רשימת הלקוחות כקהל", why: "להחריג קונים ממודעות לקהל חדש ולבנות מהם קהל דומה", fits: ALL, how: "Customer list audience from the store (with the client's approval), used for exclusion and lookalikes." },
  { id: "repeat_offer", phase: "keep", title: "הצעה ללקוחות חוזרים", why: "לקוח שכבר קנה קונה שוב בזול מכל לקוח חדש", fits: ["ecommerce", "local"], how: "A campaign or post for past buyers: new collection preview, loyalty offer, refill reminder." },
  { id: "organic_rhythm", phase: "keep", title: "קצב קבוע של פוסטים", why: "פרופיל חי בונה אמון ומחזק את הקמפיינים", fits: ALL, how: "Three posts or reels a week from a monthly plan; Mikee prepares them as cards." },
  { id: "lookalike", phase: "grow", title: "קהלים דומים ללקוחות הטובים", why: "מטא מוצאת עוד אנשים שדומים למי שכבר קנה", fits: ALL, how: "1-3% lookalike of purchasers or best leads (meta_write customaudiences with lookalike_spec)." },
  { id: "scale", phase: "grow", title: "להגדיל את מה שעובד", why: "כשיש מודעה מנצחת, תוספת הדרגתית מביאה עוד תוצאות באותו מחיר", fits: ALL, how: "Raise the winner's budget 20-30% every few days within the monthly ceiling; request an increase if it clearly pays." },
  { id: "seasonal", phase: "grow", title: "לוח שיווק עונתי", why: "חגים ועונות הם הזמנים שבהם אנשים קונים, כדאי להגיע מוכנים", fits: ALL, how: "Plan 6-8 weeks ahead for the next Israeli holidays and seasons; prepare creative early." },
  { id: "social_proof", phase: "grow", title: "ביקורות ותוכן של לקוחות", why: "לקוחות אחרים משכנעים יותר מכל מודעה", fits: ALL, how: "Collect reviews and customer photos; turn them into ads and posts." },
];

export type JourneyItem = Item & { status: ItemStatus; note: string | null; updatedAt: string | null; auto?: boolean };

export async function setJourney(workspaceId: string, item: string, status: Exclude<ItemStatus, "open">, note?: string) {
  if (!ITEMS.some((i) => i.id === item)) return false;
  const d = await db();
  await d
    .insert(schema.journey)
    .values({ workspaceId, item, status, note: note?.slice(0, 300) })
    .onConflictDoUpdate({ target: [schema.journey.workspaceId, schema.journey.item], set: { status, note: note?.slice(0, 300) ?? null, updatedAt: new Date() } });
  return true;
}

export async function setFocus(workspaceId: string, focus: string | null, businessType?: BusinessType) {
  await updateSettings(workspaceId, {
    ...(focus !== undefined ? { focus: focus ? { text: focus.slice(0, 200), since: new Date().toISOString() } : undefined } : {}),
    ...(businessType ? { businessType } : {}),
  });
}

/** How long and how deeply the business has worked with Mikee: a first visit and a tenth one need different things. */
async function relationship(workspaceId: string) {
  const d = await db();
  const ws = await d.query.workspaces.findFirst({ where: eq(schema.workspaces.id, workspaceId) });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [[convs], [msgs], doneCards] = await Promise.all([
    d.select({ n: count() }).from(schema.conversations).where(eq(schema.conversations.workspaceId, workspaceId)),
    d.select({ n: count(), last: sql<Date | null>`max(${schema.messages.createdAt})` }).from(schema.messages).where(and(eq(schema.messages.workspaceId, workspaceId), eq(schema.messages.role, "user"), eq(schema.messages.kind, "chat"))),
    d
      .select({ kind: schema.proposals.kind, n: count(), recent: sql<number>`count(*) filter (where ${schema.proposals.finishedAt} >= ${since.toISOString()}::timestamptz)::int` })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.workspaceId, workspaceId), eq(schema.proposals.status, "done")))
      .groupBy(schema.proposals.kind),
  ]);
  const by = Object.fromEntries(doneCards.map((r) => [r.kind, { all: Number(r.n), recent: Number(r.recent) }]));
  const days = ws ? Math.max(1, Math.round((Date.now() - ws.createdAt.getTime()) / 86_400_000)) : 1;
  return {
    days,
    conversations: Number(convs.n),
    clientMessages: Number(msgs.n),
    lastClientMessage: msgs.last ? new Date(msgs.last).toISOString().slice(0, 10) : null,
    campaignsLaunched: by.campaign?.all ?? 0,
    postsPublished: by.post?.all ?? 0,
    postsLast30: by.post?.recent ?? 0,
    stage: days <= 7 ? "new" : days <= 45 ? "settling" : "established",
  } as const;
}

/** Where the business stands: every building block with its status, the current phase and the next moves. */
export async function journeyStatus(workspaceId: string) {
  const d = await db();
  const [rows, settings, meta, store, rel] = await Promise.all([
    d.select().from(schema.journey).where(eq(schema.journey.workspaceId, workspaceId)),
    getSettings(workspaceId),
    getConnection<MetaConfig>(workspaceId, "meta"),
    getConnection<StoreConfig>(workspaceId, "store"),
    relationship(workspaceId),
  ]);
  const type: BusinessType | undefined = settings.businessType ?? (store?.config.domain ? "ecommerce" : undefined);
  const saved = new Map(rows.map((r) => [r.item, r]));
  // Facts the platform can see for itself, used when Mikee has not marked the item yet.
  const auto: Record<string, boolean> = {
    tracking: !!meta?.config.pixelId,
    catalog: !!meta?.config.catalogId,
    first_campaign: rel.campaignsLaunched > 0,
    organic_rhythm: rel.postsLast30 >= 8,
  };
  // Until the business type is known, only the steps every business needs are shown.
  const items: JourneyItem[] = ITEMS.filter((i) => i.fits === "all" || (!!type && i.fits.includes(type))).map((i) => {
    const r = saved.get(i.id);
    if (r) return { ...i, status: r.status as ItemStatus, note: r.note, updatedAt: r.updatedAt.toISOString() };
    return { ...i, status: auto[i.id] ? "done" : "open", note: null, updatedAt: null, auto: !!auto[i.id] };
  });
  const isOpen = (i: JourneyItem) => i.status !== "done" && i.status !== "skipped";
  const currentPhase = PHASES.find((p) => items.some((i) => i.phase === p.id && isOpen(i)))?.id ?? "grow";
  const active = items.filter((i) => i.status === "active");
  const marked = items.filter((i) => i.status === "next");
  const nextUp = [...marked, ...items.filter((i) => i.status === "open" && PHASES.findIndex((p) => p.id === i.phase) <= PHASES.findIndex((p) => p.id === currentPhase) + 1)].slice(0, 3);
  return {
    businessType: type ?? null,
    focus: settings.focus ?? null,
    relationship: rel,
    currentPhase,
    phases: PHASES.map((p) => {
      const list = items.filter((i) => i.phase === p.id);
      return { ...p, items: list, done: list.filter((i) => i.status === "done").length, total: list.filter((i) => i.status !== "skipped").length };
    }),
    active,
    nextUp,
  };
}

/** The part of the brief that tells every agent where the business stands. */
export async function journeyAsText(workspaceId: string) {
  const j = await journeyStatus(workspaceId);
  const r = j.relationship;
  const line = (i: JourneyItem) => `- ${i.id}: ${i.title}${i.note ? ` (${i.note})` : ""}`;
  const relation =
    r.stage === "new"
      ? `New with Mikee (${r.days} days). Build trust with quick, visible wins; explain briefly what you do and why.`
      : r.stage === "settling"
        ? `Working together ${r.days} days. Build the missing foundations and the first repeatable wins.`
        : `Working together ${r.days} days. Think long term: owned audiences (email list, club), lookalikes, seasonal planning, scaling winners.`;
  return [
    `Business type: ${j.businessType ?? "unknown (find out and save it with update_journey)"}`,
    `Client's current focus: ${j.focus ? `"${j.focus.text}" (since ${j.focus.since.slice(0, 10)})` : "not set yet (ask what matters most now)"}`,
    `Relationship: ${relation} Conversations: ${r.conversations}, campaigns launched through Mikee: ${r.campaignsLaunched}, posts published: ${r.postsPublished}, last client message: ${r.lastClientMessage ?? "never"}.`,
    `Current phase: ${PHASES.find((p) => p.id === j.currentPhase)?.title} (${j.currentPhase})`,
    "Done: " + (j.phases.flatMap((p) => p.items.filter((i) => i.status === "done").map((i) => i.id)).join(", ") || "nothing yet"),
    j.active.length ? `In progress:\n${j.active.map(line).join("\n")}` : "In progress: nothing",
    j.nextUp.length ? `Natural next moves (suggest one when the moment is right, with why now):\n${j.nextUp.map((i) => `${line(i)}. Why: ${i.why}. How: ${i.how}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const recentActivityCount = async (workspaceId: string, days: number) => {
  const d = await db();
  const [r] = await d
    .select({ n: count() })
    .from(schema.proposals)
    .where(and(eq(schema.proposals.workspaceId, workspaceId), gte(schema.proposals.decidedAt, new Date(Date.now() - days * 86_400_000))));
  return Number(r.n);
};
