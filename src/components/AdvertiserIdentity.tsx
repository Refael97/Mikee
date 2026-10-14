"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

type Who = { id: string; name: string };
type Saved = { id: string; scope: "ad_account" | "workspace" | "proposal"; adAccountId: string | null; proposalId: string | null; beneficiary: Who; payer: Who; nameSource: string; confirmedAt: string };
type Candidate = { id: string; name: string | null; nameUnavailable?: string; roles: string[]; adsets: number };
type Discovery = { status: "ok" | "empty"; candidates: Candidate[]; scanned: number } | { status: "error"; error: string };

const SCOPE_LABEL: Record<Saved["scope"], string> = {
  ad_account: "לקמפיינים בחשבון המודעות הזה",
  workspace: "לכל הקמפיינים של העסק",
  proposal: "לקמפיין אחד",
};

async function call(method: "POST" | "DELETE", url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error ?? "השמירה לא הצליחה. נסי שוב.");
  return data;
}

/**
 * Choosing who Meta lists as the advertiser and the payer. The options are only identities the business's
 * own ad account already uses; a name Meta does not return is confirmed by the client as Meta shows it.
 * With a proposalId it also offers "only this campaign" (used inside a failed campaign card).
 */
export function IdentityPicker({ proposalId, onSaved }: { proposalId?: string; onSaved?: (s: Saved) => void }) {
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [beneficiary, setBeneficiary] = useState<string>("");
  const [payer, setPayer] = useState<string>("");
  const [separatePayer, setSeparatePayer] = useState(false);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<Saved["scope"]>("ad_account");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDiscovery(null);
    setError(null);
    const res = await fetch("/api/meta/identities?discover=1", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    const d: Discovery = data?.discovery ?? { status: "error", error: "לא הצלחנו לקרוא את חשבון המודעות." };
    setDiscovery(d);
    // Nothing is picked for the client: with one option it is shown selected, with several she picks.
    if (d.status === "ok" && d.candidates.length === 1) setBeneficiary(d.candidates[0].id);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!discovery) return <p className="text-[14.5px] text-ink-3">בודק אילו זהויות כבר קיימות בחשבון המודעות…</p>;
  if (discovery.status === "error") {
    return (
      <div className="space-y-2">
        <p className="note note-bad text-[14.5px]">לא הצלחנו לקרוא את חשבון המודעות: {discovery.error}</p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void load()}>
          לנסות שוב
        </button>
      </div>
    );
  }
  if (discovery.status === "empty") {
    return (
      <div className="space-y-2 text-[14.5px]">
        <p className="text-ink-2">
          לא מצאנו מפרסם ומשלם בקבוצות המודעות הקיימות ({discovery.scanned} נבדקו). צריך להגדיר אותם פעם אחת ב־Ads Manager, בהגדרות הפרסום של חשבון המודעות, ואז לחפש שוב.
        </p>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void load()}>
          לחפש שוב
        </button>
      </div>
    );
  }

  const byId = new Map(discovery.candidates.map((c) => [c.id, c]));
  const nameOf = (id: string) => byId.get(id)?.name ?? typed[id]?.trim() ?? "";
  const payerId = separatePayer ? payer : beneficiary;
  const ready = !!beneficiary && !!payerId && !!nameOf(beneficiary) && !!nameOf(payerId);

  async function save() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await call("POST", "/api/meta/identities", {
        scope,
        proposalId: scope === "proposal" ? proposalId : undefined,
        beneficiary: { id: beneficiary, name: nameOf(beneficiary) },
        payer: { id: payerId, name: nameOf(payerId) },
      });
      onSaved?.(data.saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const options = (selected: string, pick: (id: string) => void, group: string) => (
    <div role="radiogroup" className="space-y-2">
      {discovery.candidates.map((c) => {
        const on = selected === c.id;
        return (
          <div key={c.id} className={`rounded-[6px] border transition-colors ${on ? "border-brand bg-brand/5" : "border-line hover:border-ink-3"}`}>
            <button type="button" role="radio" aria-checked={on} name={group} onClick={() => pick(c.id)} className="flex w-full items-start gap-3 px-3 py-3 text-start">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-brand bg-brand text-on-brand" : "border-ink-3"}`}>
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.name ?? "זהות בלי שם במטא"}</span>
                <span className="block text-[13px] text-ink-3">
                  מזהה <span className="num">{c.id}</span> · כבר בשימוש ב־{c.adsets} קבוצות מודעות בחשבון
                </span>
              </span>
              <span className={`shrink-0 text-[13px] font-medium ${on ? "text-brand" : "text-ink-3"}`}>{on ? "נבחר" : "לבחירה"}</span>
            </button>
            {on && !c.name && (
              <label className="block space-y-1.5 border-t border-line px-3 pb-3 pt-2.5">
                <span className="block text-[13.5px] text-ink-2">מטא לא מחזירה את השם של הזהות הזאת. כתבו אותו כפי שהוא מופיע ב־Ads Manager, בשדה המפרסם והמשלם:</span>
                <input
                  className="field h-9 text-[14.5px]"
                  placeholder="למשל: אדרט גרופ בע״מ"
                  maxLength={120}
                  value={typed[c.id] ?? ""}
                  onChange={(e) => setTyped((t) => ({ ...t, [c.id]: e.target.value }))}
                  autoFocus
                />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4 text-[15px]">
      <div className="space-y-2">
        <p className="font-medium">מי המפרסם?</p>
        <p className="text-[13.5px] text-ink-2">אלה הזהויות שכבר מופיעות בקבוצות המודעות בחשבון שלך. בוחרים אחת בלחיצה.</p>
        {options(beneficiary, setBeneficiary, "beneficiary")}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={separatePayer} onChange={(e) => setSeparatePayer(e.target.checked)} />
        המשלם שונה מהמפרסם
      </label>
      {separatePayer && (
        <div className="space-y-2">
          <p className="font-medium">מי המשלם?</p>
          {options(payer, setPayer, "payer")}
        </div>
      )}
      {beneficiary && nameOf(beneficiary) && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">
            להשתמש ב{nameOf(beneficiary)} {separatePayer ? "כמפרסם" : "כמפרסם וכמשלם"} כברירת מחדל?
          </legend>
          {(["ad_account", "workspace", ...(proposalId ? (["proposal"] as const) : [])] as Saved["scope"][]).map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === s} onChange={() => setScope(s)} />
              {s === "ad_account" ? "רק לקמפיינים בחשבון המודעות הזה" : s === "workspace" ? "לכל הקמפיינים של העסק במייקי" : "רק לקמפיין הזה"}
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="note note-bad text-[14px]">{error}</p>}
      {!ready && (
        <p className="text-[13.5px] text-ink-3">
          {!beneficiary ? "כדי לשמור, בוחרים מפרסם מהרשימה." : !nameOf(beneficiary) ? "כדי לשמור, כותבים את שם המפרסם כפי שהוא מופיע במטא." : separatePayer && !payer ? "כדי לשמור, בוחרים גם משלם." : "כדי לשמור, כותבים את שם המשלם כפי שהוא מופיע במטא."}
        </p>
      )}
      <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void save()}>
        {busy ? "שומרים…" : "שמירה"}
      </button>
    </div>
  );
}

/** Settings: the saved choices, each removable, and the picker to add or change one. */
export function AdvertiserIdentitySettings() {
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/meta/identities", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setSaved((data?.saved ?? []).filter((s: Saved) => s.scope !== "proposal"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!saved) return null;
  return (
    <div className="space-y-3">
      <h4 className="font-semibold">המפרסם והמשלם במטא</h4>
      <p className="text-[14px] text-ink-2">חלק מהחשבונות והמיקומים דורשים לציין מי המפרסם ומי המשלם בכל קבוצת מודעות. בוחרים פעם אחת, ומייקי משתמש בזה בכל קמפיין.</p>
      {saved.length > 0 && (
        <ul className="divide-y divide-line rounded-[6px] border border-line">
          {saved.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14.5px]">
              <span className="min-w-0">
                <span className="block font-medium">
                  {s.beneficiary.name}
                  {s.payer.id !== s.beneficiary.id && <> · משלם: {s.payer.name}</>}
                </span>
                <span className="block text-[13px] text-ink-3">
                  {SCOPE_LABEL[s.scope]}
                  {s.nameSource === "client" && " · השם אושר ידנית"}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={async () => {
                  await call("DELETE", `/api/meta/identities?id=${s.id}`).catch(() => undefined);
                  void load();
                }}
              >
                הסרה
              </button>
            </li>
          ))}
        </ul>
      )}
      {picking ? (
        <IdentityPicker
          onSaved={() => {
            setPicking(false);
            void load();
          }}
        />
      ) : (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicking(true)}>
          {saved.length ? "לשנות" : "לבחור מפרסם ומשלם"}
        </button>
      )}
    </div>
  );
}
