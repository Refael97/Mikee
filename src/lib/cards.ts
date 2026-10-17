import { totalSeconds, VIDEO_FORMATS, VIDEO_STYLES, type VideoSpec } from "./video/spec";
import { type ActivateSpec, type AdsetAddSpec, type AdsetCopySpec, adsetsOf, type BudgetRequestSpec, type CampaignSpec, type ChangeSpec, type MediaSpec, type PostSpec, type ProposalCard, type ProposalKind, totalDaily } from "./specs";

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

const dateHe = (iso?: string, timeZone = "Asia/Jerusalem") =>
  iso ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso)) : undefined;

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
export function renderCard(kind: ProposalKind, action: any, currency = "ILS", extra: { credits?: number; timezone?: string } = {}): ProposalCard {
  switch (kind) {
    case "campaign": {
      const s = action as CampaignSpec;
      const when = [s.startTime ? `מ־${dateHe(s.startTime)}` : "מיד באישור", s.endTime ? `עד ${dateHe(s.endTime)}` : "עד שנעצור"].join(" ");
      const sets = adsetsOf(s);
      const allAds = sets.flatMap((x) => x.ads);
      const links = [...new Set(allAds.map((a) => host(a.link)))].join(", ");
      const several = sets.length > 1;
      return {
        kind,
        title: s.title,
        why: s.why,
        rows: [
          { label: "המטרה", value: s.catalog ? "מכירות מהקטלוג" : GOAL_HE[s.goal] },
          ...(s.catalog ? [
            { label: "המוצרים", value: `${s.catalog.catalogName ?? "הקטלוג המחובר"} · ${s.catalog.productSetName ?? "סט המוצרים שנבחר"}` },
            { label: "סוג הקטלוג", value: s.catalog.vertical === "services" ? "שירותים מקצועיים" : "מוצרי חנות" },
            { label: "איפה יוצג", value: s.catalog.instagramUserId ? "פייסבוק ואינסטגרם" : "פייסבוק בלבד" },
            { label: "איך המודעה תיראה", value: `${s.catalog.format === "single_image" ? "מוצר אחד בכל מודעה" : "קרוסלת מוצרים"}. התמונות והמחירים מגיעים מהקטלוג ועשויים להתעדכן.` },
            ...allAds.map((a, i) => ({ label: `מודעה ${i + 1}`, value: `${a.primaryText} · ${a.headline ?? (s.catalog?.vertical === "services" ? "השירותים שלנו" : "שם המוצר מהקטלוג")} · ${CTA_HE[a.cta]}` })),
          ] : []),
          { label: "תקציב", value: `${money(totalDaily(s), currency)} ביום בממוצע${several ? `, לכל הסדרות יחד` : ""}` },
          ...(several
            ? sets.map((x, i) => ({
                label: `סדרה ${i + 1}`,
                value: `${x.name ?? x.audience.description}: ${x.audience.description}, ${money(x.dailyBudget, currency)} ביום, ${x.ads.length === 1 ? "מודעה אחת" : `${x.ads.length} מודעות`}`,
              }))
            : [{ label: "למי נגיע", value: s.audience.description }]),
          { label: "מתי", value: when },
          s.leadFormId ? { label: "טופס הלידים", value: `${s.leadFormName ?? "טופס"} (מזהה ${s.leadFormId})` } : { label: "לאן מגיעים", value: s.catalog ? `לדפי המוצרים מהקטלוג. קישור גיבוי: ${links}` : links },
          { label: "מה יקרה באישור", value: s.buildOnly ? "בדיקה בלבד: הקמפיין ייבנה מושהה ולא יופעל אוטומטית." : "מייקי בונה את הקמפיין במצב מושהה ובודק אותו. הוא יעלה לאוויר רק אחרי אישור נוסף שלך." },
        ],
        media: allAds.filter((a) => a.media).map((a) => ({
          type: a.media!.type,
          url: a.media!.url,
          metaImageHash: a.media!.metaImageHash,
          metaVideoId: a.media!.metaVideoId,
          text: a.primaryText,
          headline: a.headline,
          cta: CTA_HE[a.cta],
        })),
        approveLabel: "נראה טוב, לבנות",
        changeLabel: "בוא נשנה משהו",
      };
    }
    case "activate": {
      const s = action as ActivateSpec;
      const when = [s.startTime ? `מ־${dateHe(s.startTime)}` : "מרגע האישור", s.endTime ? `עד ${dateHe(s.endTime)}` : "עד שנעצור"].join(" ");
      const adsets = s.scope === "adsets";
      return {
        kind,
        ...(adsets ? { label: "הפעלת סדרה" } : {}),
        title: s.title,
        why: adsets
          ? "הסדרה בנויה בתוך הקמפיין הקיים, מושהית, ובדקתי מול מטא שהיא תואמת בדיוק למה שאישרת. היא תתחיל לרוץ רק אחרי האישור הזה; שאר הקמפיין נשאר כמו שהוא."
          : "הקמפיין בנוי, מושהה, ובדקתי מול מטא שהוא תואם בדיוק למה שאישרת. הוא יתחיל להוציא כסף רק אחרי האישור הזה.",
        rows: [
          {
            label: "תקציב",
            value:
              s.dailyBudget > 0
                ? `${money(s.dailyBudget, currency)} ביום בממוצע. ביום מסוים מטא יכולה להוציא קצת יותר, והתקרה החודשית נשמרת`
                : "מתקציב הקמפיין הקיים, בלי תוספת",
          },
          { label: "מתי", value: when },
          { label: "בדיקת מטא", value: s.review },
          ...(s.catalog ? [{ label: "המוצרים", value: `${s.catalog.catalogName ?? "הקטלוג המחובר"} · ${s.catalog.productSetName ?? "סט המוצרים שנבחר"}. התמונות והמחירים מתעדכנים מהקטלוג.` }] : []),
          ...(s.catalog ? [{ label: "איפה יוצג", value: s.catalog.instagramUserId ? "פייסבוק ואינסטגרם" : "פייסבוק בלבד" }] : []),
        ],
        media: s.media,
        approveLabel: adsets ? "להפעיל את הסדרה" : "להפעיל עכשיו",
        changeLabel: "עוד לא",
      };
    }
    case "adset": {
      const s = action as AdsetAddSpec;
      const b = s.adset.dailyBudget;
      return {
        kind,
        title: s.title,
        why: s.why,
        rows: [
          { label: "בתוך הקמפיין", value: `${s.campaignName ?? s.campaignId} (קמפיין קיים, לא נוצר קמפיין חדש)` },
          { label: "הסדרה החדשה", value: s.adset.name },
          { label: "למי נגיע", value: s.adset.audience.description },
          { label: "תקציב", value: s.campaignBudget || b == null ? "מתקציב הקמפיין הקיים" : `${money(b, currency)} ביום בממוצע` },
          { label: "מודעות", value: s.adset.ads.length === 1 ? "מודעה אחת" : `${s.adset.ads.length} מודעות` },
          { label: "מה יקרה באישור", value: "מייקי בונה את הסדרה בתוך הקמפיין, מושהית, ובודק אותה. היא תעלה לאוויר רק אחרי אישור נוסף שלך." },
        ],
        media: s.adset.ads.map((a) => ({
          type: a.media.type,
          url: a.media.url,
          metaImageHash: a.media.metaImageHash,
          metaVideoId: a.media.metaVideoId,
          text: a.primaryText,
          headline: a.headline,
          cta: CTA_HE[a.cta],
        })),
        approveLabel: "נראה טוב, לבנות",
        changeLabel: "בוא נשנה משהו",
      };
    }
    case "adset_copy": {
      const s = action as AdsetCopySpec;
      const same = !s.targetCampaignId || s.targetCampaignId === s.sourceCampaignId;
      const c = s.changes;
      const changes = [c?.audience && `קהל חדש: ${c.audience.description}`, c?.dailyBudget != null && `תקציב ${money(c.dailyBudget, currency)} ביום`, c?.name && `שם: ${c.name}`].filter(Boolean).join("; ");
      const n = s.sourceAdCount ?? 0;
      return {
        kind,
        title: s.title,
        why: s.why,
        rows: [
          { label: "הסדרה המקורית", value: s.sourceName ?? s.sourceAdsetId },
          { label: "לאן", value: same ? `אותו קמפיין${s.targetCampaignName ? ` (${s.targetCampaignName})` : ""}, לא נוצר קמפיין חדש` : `הקמפיין הקיים ${s.targetCampaignName ?? s.targetCampaignId}` },
          { label: "מודעות", value: s.includeAds ? (n === 1 ? "המודעה מועתקת" : `${n} המודעות מועתקות`) : "בלי מודעות" },
          { label: "מה משתנה בעותק", value: changes || "שום דבר, עותק זהה" },
          {
            label: "תקציב",
            value: c?.dailyBudget != null ? `${money(c.dailyBudget, currency)} ביום` : s.copyDailyBudget ? `${money(s.copyDailyBudget, currency)} ביום, כמו המקור` : "מתקציב הקמפיין",
          },
          { label: "מה יקרה באישור", value: "מייקי משכפל את הסדרה במצב מושהה ובודק את העותק. הוא יעלה לאוויר רק אחרי אישור נוסף שלך." },
        ],
        approveLabel: "נראה טוב, לשכפל",
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
        ...(s.format === "story" ? { label: "סטורי" } : {}),
        title: s.title,
        why: "",
        rows: [
          { label: "איפה", value: s.format === "story" ? "סטורי באינסטגרם" : s.channels.map((c) => (c === "facebook" ? "פייסבוק" : "אינסטגרם")).join(" + ") },
          { label: "מתי", value: s.scheduleAt ? `${dateHe(s.scheduleAt, extra.timezone)} (${new Intl.DateTimeFormat("he-IL", { timeZone: extra.timezone ?? "Asia/Jerusalem", timeZoneName: "long" }).formatToParts(new Date(s.scheduleAt)).find((p) => p.type === "timeZoneName")?.value})` : "מיד באישור" },
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
        ],
        media: s.referenceUrls.map((url) => ({ type: "image" as const, url })),
        generate: { type: s.type, count: s.count, ratio: s.aspectRatio.replace(":", "/") },
        approveLabel: "יאללה, צור",
        changeLabel: "בוא נשנה משהו",
      };
    }
    case "video": {
      const s = action as VideoSpec;
      const f = VIDEO_FORMATS[s.format];
      const secs = totalSeconds(s);
      return {
        kind,
        title: s.title,
        why: s.why,
        rows: [
          { label: "פורמט", value: f.label },
          { label: "אורך", value: `${secs} שניות, ${s.scenes.length} סצנות` },
          { label: "סגנון", value: VIDEO_STYLES[s.style].label },
          ...(s.scenes.some((x) => x.type === "clip") ? [{ label: "קטעי וידאו", value: `${s.scenes.filter((x) => x.type === "clip").length} מהספרייה${s.scenes.some((x) => x.type === "clip" && x.sound) ? ", עם הקול המקורי" : ""}` }] : []),
          { label: "מוזיקה", value: s.music ? "מוזיקת רקע מהספרייה" : "בלי מוזיקה" },
          { label: "מה יקרה באישור", value: "מייקי יערוך את הסרטון וישמור אותו בספרייה. שום דבר לא יעלה לאוויר בלי אישור נפרד." },
        ],
        preview: { ratio: f.ratio, seconds: secs },
        generate: { type: "video", count: 1, ratio: f.ratio },
        approveLabel: "נראה טוב, לרנדר",
        changeLabel: "בוא נשנה משהו",
      };
    }
  }
}
