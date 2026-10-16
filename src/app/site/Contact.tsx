import Link from "next/link";
import { LEGAL } from "./legal";
import { sitePath } from "./links";

/** How to reach the operator, with whatever details are filled in (src/app/site/legal.ts). */
export function Contact() {
  return (
    <ul>
      <li>
        {LEGAL.companyHe} ({LEGAL.company}){LEGAL.companyNumber ? `, ח.פ. ${LEGAL.companyNumber}` : ""}
        {LEGAL.address ? `, ${LEGAL.address}` : ""}
      </li>
      <li>איש קשר: {LEGAL.contactName}</li>
      {LEGAL.email && (
        <li>
          דוא״ל: <a href={`mailto:${LEGAL.email}`} dir="ltr">{LEGAL.email}</a>
        </li>
      )}
      {LEGAL.phone && (
        <li>
          טלפון: <a href={`tel:${LEGAL.phone.replace(/[^\d+]/g, "")}`} dir="ltr">{LEGAL.phone}</a>
        </li>
      )}
      <li>
        לקוחות רשומים יכולים לפנות גם דרך חלונית העזרה בשירות. אפשר לפנות גם בטופס <Link href={sitePath("/meeting")}>פגישת ההיכרות</Link>.
      </li>
    </ul>
  );
}
