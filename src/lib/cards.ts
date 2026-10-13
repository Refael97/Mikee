import type { BudgetRequestSpec, CampaignSpec, ChangeSpec, MediaSpec, PostSpec, ProposalCard, ProposalKind } from "./specs";

const money = (amount: number, currency = "ILS") =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency, maximumFractionDigits: amount >= 100 ? 0 : 2 }).format(amount);

const GOAL_HE: Record<CampaignSpec["goal"], string> = {
  sales: "מכירות באתר",
  leads: "פניות",
  traffic: "כניסות לאתר",
  engagement: "מעורבות",
  awareness: "שיכירו אותנו",
};

export const CTA_HE: Record<string, string> = {
  SHOP_NOW: "לקנייה",
  LEARN_MORE: "לפרטים",
  SIGN_UP: "להרשמה",
  CONTACT_US: "צרו קשר",
  BOOK_TRAVEL: "להזמנה",
  GET_OFFER: "לקבלת ההטבה",
  ORDER_NOW: "להזמנה",
  SUBSCRIBE: "להצטרפות",
  WHATSAPP_MESSAGE: "שלחו וואטסאפ",
  MESSAGE_PAGE: "שלחו הודעה",
  CALL_NOW: "התקשרו",
  APPLY_NOW: "להגשה",
  DOWNLOAD: "להורדה",
};

const dateHe = (iso?: string) =>
  iso ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }).format(new Date(iso)) : undefined;

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * The card is rendered only from the exact action that will run, so what the client approves
 * is what executes: every material detail (media, texts, link, audience, budget, dates) is on it.
 */
export function renderCard(kind: ProposalKind, action: any, currency = "ILS", extra: { credits?: number } = {}): ProposalCard {
  switch (kind) {
    case "campaign": {
      const s = action as CampaignSpec;
      const when = [s.startTime ? `מ־${dateHe(s.startTime)}` : "מיד באישור", s.endTime ? `עד ${dateHe(s.endTime)}` : "עד שנעצור"].join(" ");
      const links = [...new Set(s.ads.map((a) => host(a.link)))].join(", ");
      return {
        kind,
        title: s.title,
        why: s.why,
        rows: [
          { label: "המטרה", value: GOAL_HE[s.goal] },
          { label: "תקציב", value: `${money(s.dailyBudget, currency)} ביום` },
          { label: "למי נגיע", value: s.audience.description },
          { label: "מתי", value: when },
          { label: "לאן מגיעים", value: links },
        ],
        media: s.ads.map((a) => ({ type: a.media.type, url: a.media.url, text: a.primaryText, headline: a.headline, cta: CTA_HE[a.cta] })),
        approveLabel: "נראה טוב, קדימה",
        changeLabel: "בוא נשנה משהו",
      };
    }
    case "change": {
      const s = action as ChangeSpec;
      const c = s.change;
      const value =
        c.kind === "pause"
          ? "לעצור"
          : c.kind === "resume"
            ? "להפעיל מחדש"
            : c.kind === "end_date"
              ? `לסיים ב־${dateHe(c.endTime)}`
              : c.previous != null
                ? `מ־${money(c.previous, currency)} ל־${money(c.amount, currency)} ביום`
                : `${money(c.amount, currency)} ביום`;
      return {
        kind,
        title: s.title,
        why: s.why,
        rows: [
          { label: "על מה", value: s.target.name },
          { label: "השינוי", value },
        ],
        approveLabel: "כן, תעשה את זה",
        changeLabel: "לא עכשיו",
      };
    }
    case "post": {
      const s = action as PostSpec;
      return {
        kind,
        title: s.title,
        why: "",
        rows: [
          { label: "איפה", value: s.channels.map((c) => (c === "facebook" ? "פייסבוק" : "אינסטגרם")).join(" + ") },
          { label: "מתי", value: s.scheduleAt ? dateHe(s.scheduleAt)! : "מיד באישור" },
          ...(s.link ? [{ label: "קישור", value: host(s.link) }] : []),
        ],
        media: s.media.length
          ? s.media.map((m, i) => ({ type: m.type, url: m.url, text: i === 0 ? s.text : undefined }))
          : [{ type: "image" as const, url: "", text: s.text }],
        approveLabel: s.scheduleAt ? "מתזמנים" : "לפרסם",
        changeLabel: "בוא נשנה משהו",
      };
    }
    case "budget": {
      const s = action as BudgetRequestSpec;
      return {
        kind,
        title: "מבקש תוספת תקציב לחודש הזה",
        why: s.reason,
        rows: [{ label: "תוספת", value: money(s.amount, currency) }],
        approveLabel: "מאשרת את התוספת",
        changeLabel: "לא החודש",
      };
    }
    case "media": {
      const s = action as MediaSpec;
      return {
        kind,
        title: s.title,
        why: s.why,
        rows: [
          { label: "מה ניצור", value: `${s.count > 1 ? `${s.count} ` : ""}${s.type === "video" ? "סרטון" : "תמונה"}${s.count > 1 ? "ים" : ""}${s.duration ? ` של ${s.duration} שניות` : ""}` },
          { label: "הרעיון", value: s.prompt.length > 160 ? `${s.prompt.slice(0, 160)}…` : s.prompt },
          { label: "עלות", value: extra.credits != null ? `${extra.credits} קרדיטים` : "יחושב לפני האישור" },
        ],
        media: s.referenceUrls.map((url) => ({ type: "image" as const, url })),
        approveLabel: "יאללה, צור",
        changeLabel: "בוא נשנה משהו",
      };
    }
  }
}
