---
name: Mikee
description: איש השיווק של העסק שלך. קונסולה תפעולית רגועה סביב כסף, בעברית, מימין לשמאל.
colors:
  bg: "#ffffff"
  shell: "#f7f8fa"
  surface: "#ffffff"
  surface-2: "#f5f6f8"
  ink: "#1a1f36"
  ink-2: "#545969"
  ink-3: "#8792a2"
  line: "#ebeef1"
  line-strong: "#d5dbe1"
  brand: "#4b3fe0"
  brand-hover: "#3e33c4"
  brand-tint: "#efeefd"
  on-brand: "#ffffff"
  good: "#0f6b3a"
  good-tint: "#e3f6e9"
  warn: "#9a4b00"
  warn-tint: "#fdf1d6"
  bad: "#b3093c"
  bad-tint: "#fde8ee"
  info: "#0b5cad"
  info-tint: "#e6f0fb"
typography:
  display:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "clamp(30px, 3.4vw, 40px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0"
  headline:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0"
  figure:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
    fontFeature: "\"tnum\""
  body:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
    fontFeature: "\"tnum\""
  body-sm:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0"
  label:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  caption:
    fontFamily: "Heebo, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  badge: "4px"
  control: "6px"
  card: "8px"
  conversation: "10px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
    textColor: "{colors.on-brand}"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.bad}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-sm:
    padding: "0 10px"
    height: "30px"
  button-lg:
    padding: "0 18px"
    height: "42px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "0 11px"
    height: "38px"
  tag:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.badge}"
    padding: "0 7px"
    height: "22px"
  tag-brand:
    backgroundColor: "{colors.brand-tint}"
    textColor: "{colors.brand}"
    rounded: "{rounded.badge}"
  tag-good:
    backgroundColor: "{colors.good-tint}"
    textColor: "{colors.good}"
    rounded: "{rounded.badge}"
  tag-warn:
    backgroundColor: "{colors.warn-tint}"
    textColor: "{colors.warn}"
    rounded: "{rounded.badge}"
  tag-bad:
    backgroundColor: "{colors.bad-tint}"
    textColor: "{colors.bad}"
    rounded: "{rounded.badge}"
  tag-quiet:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.badge}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
  note:
    backgroundColor: "{colors.info-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.brand-tint}"
    textColor: "{colors.brand}"
  composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.conversation}"
  bubble-owner:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.conversation}"
    padding: "8px 14px"
---

# Design System: Mikee

## Overview

**Creative North Star: "הקונסולה השקטה"**

מייקי נראה כמו הסטנדרט של הקטגוריה, משוחק ישר, ברמת הדיוק של לוח הבקרה של Stripe. משטחים לבנים על מעטפת קרירה כמעט לבנה, קווי שיער במקום קופסאות כבדות, דיו אחד לטקסט, וצבע אחד של מייקי (סגול) רק על מה שפועל. אין עולם מעוצב, אין תחפושת, אין נייר חם או סריף. האופי מגיע מהדיוק, מהסימן של מייקי ומהקול שלו.

הצפיפות היא של כלי עבודה: שורות של 32 עד 36 פיקסלים, כותרות קטנות וברורות, מספרים טבלאיים שמתיישרים בעמודה. הבעלים צריכה לראות בשנייה מה מחכה לאישור שלה, מה קרה, ואיך לדבר עם מייקי. לכן ההיררכיה נבנית ממשקל וגוון של דיו, לא מצבע ולא מגודל. העומק כמעט שטוח: כרטיסים עם קו, וצל רך רק למה שצף (תפריט, כרטיס הצעה, מגירה).

השפה מסרבת למראה ה"עריכתי" (קרם, סריף, מרקר) ולכל עולם תמטי, ובהתאם לבקשת הבעלים: בלי פינות מעוגלות מדי ובלי תגיות בצורת גלולה.

**Key Characteristics:**
- משטח לבן על מעטפת `shell`, וקווי שיער `line` כמבנה.
- דיו אחד בשלוש דרגות (`ink`, `ink-2`, `ink-3`) נושא את כל ההיררכיה.
- סגול מייקי רק על פעולה ראשית, קישור, בחירה, פוקוס, ועל מייקי עצמו.
- משפחה אחת (Heebo) בארבעה משקלים, ספרות טבלאיות בכל מקום.
- פינות קטנות ומדורגות: 4 לתגית, 6 לפקד, 8 לכרטיס.
- אייקוני Lucide בקו 1.75.
- מצב כהה מלא דרך `prefers-color-scheme`, אותם תפקידים ואותם שמות.

## Colors

פלטה קרירה ושקטה של דיו כחלחל על לבן, עם מבטא סגול אחד ומשפחת סטטוס של ארבעה צבעים, כל אחד בזוג עם גוון בהיר משלו.

### Primary
- **סגול מייקי** (`brand`): כפתור ראשי, קישורים, פריט ניווט פעיל, נקודת "חדש" בשיחה, קו הגרף, טבעת הפוקוס, וגוף הסימן של מייקי. בריחוף הוא מעמיק ל־`brand-hover`.
- **סגול בהיר** (`brand-tint`): רקע לפריט נבחר בניווט, לתגית "מחכה לך", לבחירת טקסט ולהבזק של פריט חדש. הטקסט עליו תמיד `brand`.
- **על הסגול** (`on-brand`): טקסט ועיניים על רקע סגול.

### Neutral
- **לבן עבודה** (`bg`, `surface`): הרקע של אזור התוכן ושל כל כרטיס.
- **מעטפת קרירה** (`shell`): הסרגל הצדדי והמגירה במובייל. ההבדל מהלבן עדין בכוונה: מסגרת, לא קופסה.
- **משטח משני** (`surface-2`): כותרת כרטיס הצעה, אריחים, בועת ההודעה של הבעלים, ריחוף על שורה, מסלול של פס התקדמות.
- **דיו** (`ink`): טקסט ראשי וכותרות.
- **דיו משני** (`ink-2`): טקסט תומך, תוויות, פריטי ניווט במנוחה.
- **דיו חלש** (`ink-3`): חותמות זמן, מונים, placeholder, אייקונים משניים, ומספר ריק ("—").
- **קו שיער** (`line`): גבולות כרטיסים, מפרידים בין שורות, קו הסרגל.
- **קו חזק** (`line-strong`): גבול של שדה ושל כפתור שקט, מסלול של מתג כבוי, פס הגלילה.

### סטטוס (Tertiary)
- **ירוק טוב** (`good` על `good-tint`): הצליח, עלה לאוויר, שינוי חיובי במספר.
- **ענבר אזהרה** (`warn` על `warn-tint`): חיבור שנותק, הודעה שדורשת תשומת לב.
- **אדום שגיאה** (`bad` על `bad-tint`): נכשל, פעולה מסוכנת, שינוי שלילי, מכסה מעל 90%.
- **כחול מידע** (`info` על `info-tint`): רקע של `.note` רגילה.

במצב כהה כל התפקידים מוגדרים מחדש תחת `@media (prefers-color-scheme: dark)` ב־`src/app/globals.css`: מעטפת `#0d0f15`, רקע `#12141c`, משטח `#171a23`, סגול מואר `#8b84ff`, והגוונים הבהירים הופכים לשקיפות של 12% עד 14% מצבע הסטטוס.

### Named Rules
**The One Violet Rule.** סגול מופיע רק על מה שפועל (כפתור ראשי, קישור, בחירה, פוקוס) ועל מייקי. כותרת, אייקון דקורטיבי או רקע של אזור לא מקבלים סגול.

**The Paired Status Rule.** סטטוס הוא תמיד זוג: טקסט בצבע הסטטוס על הגוון הבהיר שלו. אין טקסט סטטוס על לבן ואין רקע סטטוס עם טקסט דיו (חוץ מ־`.note` במידע).

**The Ink Hierarchy Rule.** היררכיה נבנית מ־`ink` / `ink-2` / `ink-3` ומשקל, לא מצבע. אם צריך להבליט, קודם משקל, אחר כך דרגת דיו.

## Typography

**Display Font:** Heebo (עם -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif)
**Body Font:** Heebo, אותה משפחה
**Label/Mono Font:** אין. מספרים הם Heebo עם `font-variant-numeric: tabular-nums` על כל ה־`body`.

**Character:** גרוטסק עברי אחד, נקי ומודרני, בארבעה משקלים (400, 500, 600, 700). בלי סריף ובלי פונט תצוגה; הדיוק עושה את העבודה.

### Hierarchy
- **Display** (700, `clamp(30px, 3.4vw, 40px)`, 1.15): כותרת גדולה במסכי פתיחה. נדיר בתוך האפליקציה.
- **Headline** (700, 26px, 1.25): כותרת עמוד (`.title` בתוך `PageHeader`).
- **Title** (600, 18px, 1.35): כותרת בלוק (`.h2`), כותרת כרטיס הצעה, כותרת מצב ריק.
- **Figure** (600, 26px, טבלאי): המספרים בעמוד התוצאות. ריק מוצג כ־"—" ב־`ink-3`.
- **Body** (400, 16px, 1.55): טקסט רץ ובועות שיחה. `.lead` מתחת לכותרת עמוד: 16px, 1.6, `ink-2`, ברוחב עד `max-w-2xl`.
- **Body small** (400, 15px): הגודל הנפוץ ביותר באפליקציה. פריטי ניווט (500), כפתורים (500), שדות, טקסט בכרטיסים.
- **Label** (500, 13.5px, `ink-2`): תווית מעל מספר ושם סוג בכרטיס הצעה. תגית: 500, 13px.
- **Caption** (400, 12 עד 13px, `ink-3`): חותמות זמן, מונים, שם העסק מתחת לשם מייקי.

### Named Rules
**The Zero Tracking Rule.** `letter-spacing: 0` בכל מקום. אותיות עבריות נדבקות בריווח שלילי, ואין אותיות רישיות לרווח.

**The Tabular Rule.** כל מספר מתיישר: `tabular-nums` על הגוף, ו־`.num` מוסיף `"tnum"` במקום שבו מספר עומד לבד (מונה, זמן, אחוז).

## Layout

מסגרת של שני אזורים. בדסקטופ (מ־1024px) סרגל צדדי דביק בצד ההתחלה (ימין ב־RTL) בגובה המסך: פס אייקונים של 64px בין 1024 ל־1280, וסרגל מלא של 232px עם תוויות מ־1280px. למעלה הסימן של מייקי ושם העסק, באמצע חמשת היעדים (שיחות, תוצאות, קמפיינים, ספרייה, העסק), ולמטה עזרה, הגדרות וחשבון. במובייל: פס עליון של 56px עם רקע זכוכית (92% רקע, blur של 8px) ומגירה של 280px שנפתחת מצד ההתחלה.

עמוד רגיל (`Page`) ממורכז ברוחב עד 1200px (או 880px בעמוד צר), עם שוליים של 16px במובייל ו־32px מ־640px, ו־24 עד 32px מלמעלה. שורת הכותרת מחזיקה את הכותרת והשורה המובילה בצד ההתחלה ואת הפעולות בצד הסוף, ונשברת לשתי שורות כשאין מקום. בלוקים בעמוד נפרדים ב־24 עד 32px; כותרת בלוק יושבת 12px מעל התוכן.

בשיחות יש עמודה של רשימת שיחות (264px בדסקטופ, מגירה של 288px במובייל) מקובצת לפי נושא, ועמודת צ'אט עם שורת כתיבה דבוקה לתחתית מעל מעבר הדרגתי לרקע.

המרווחים הולכים בצעדים של 4: 4, 8, 12, 16, 20, 24, 32. ריפוד פנימי של כרטיס הוא 16px (כרטיס הצעה) או 20px (אריח מספר). רשת המספרים בתוצאות היא 2 עמודות במובייל ו־4 מ־1024px, עם קווי שיער ביניהן במקום רווחים.

### Named Rules
**The Start-Side Frame Rule.** הניווט תמיד בצד ההתחלה והפעולות של העמוד תמיד בצד הסוף. משתמשים במאפיינים לוגיים (`start`, `end`, `ps`, `pe`, `border-s`) ולא ב־left/right.

## Elevation & Depth

המערכת כמעט שטוחה. רוב המשטחים הם כרטיס לבן עם קו `line` בלי צל. עומק מופיע רק כשמשהו צף מעל התוכן: תפריט נפתח, כרטיס הצעה בשיחה, מגירה במובייל, הודעה של מייקי. לצל הצף יש תמיד גם טבעת של 1px (`rgba(26,31,54,0.06)`) במקום קו, כדי שהקצה יישאר חד. בכפתורים ובשדות יש צל זעיר של 1px שנותן להם משקל פיזי.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 1px rgba(26,31,54,0.04), 0 2px 5px rgba(26,31,54,0.04)`): שורת הכתיבה.
- **Float** (`box-shadow: 0 0 0 1px rgba(26,31,54,0.06), 0 7px 14px rgba(26,31,54,0.08), 0 3px 6px rgba(26,31,54,0.06)`): `.card-float` ו־`.pop-over`. כרטיס הצעה, תפריטים, מגירה.
- **Control** (`box-shadow: 0 1px 1px rgba(26,31,54,0.05)`): כפתור שקט ושדה (0.04).
- **Primary press** (`box-shadow: 0 1px 1px rgba(26,31,54,0.12), inset 0 -1px 0 rgba(0,0,0,0.12)`): הכפתור הראשי.
- **Focus ring** (`box-shadow: 0 0 0 4px rgba(75,63,224,0.18)`): פוקוס מקלדת, שדה בפוקוס, שורת כתיבה בפוקוס או בגרירה.

### Named Rules
**The Line-First Rule.** כרטיס במנוחה הוא קו, לא צל. צל נשמר למה שצף מעל משהו אחר.

## Shapes

פינות קטנות ומדורגות לפי גודל: 4px לתגית סטטוס, 6px לכפתור, שדה, פריט ניווט, הודעה ואריח, 8px לכרטיס, לרשימה מקובצת ולכרטיס צף. משטחי השיחה (שורת הכתיבה ובועת ההודעה של הבעלים) מקבלים 10px. עיגול מלא שמור לדברים שהם עגולים מטבעם: אווטאר של אות, נקודת "חדש", מתג, ופסי התקדמות דקים. אף פעם לא לתגית או לכפתור עם טקסט.

הצורה החריגה היחידה היא מייקי עצמו: בועת דיבור סגולה (`border-radius: 50% 50% 14% 50%`) עם שתי עיניים שממצמצות כל 6 שניות ומסתכלות לצדדים כשהוא עובד (`.orb`, `.orb-live`).

### Named Rules
**The No-Pill Rule.** אין תגית או תווית בצורת גלולה. תגית היא מלבן של 22px עם פינה של 4px, כמו סימון בפנקס חשבונות.

## Components

### Buttons
כפתורים מדויקים וקומפקטיים, בגובה קבוע ולא בריפוד אנכי.
- **Shape:** פינה של 6px, גובה 36px, ריפוד אופקי 14px, 15px במשקל 500, רווח 6px בין אייקון לטקסט.
- **Primary:** רקע סגול, טקסט לבן, צל לחיצה זעיר. פעולה אחת ראשית לאזור: "שיחה חדשה", אישור הצעה, חיבור.
- **Hover / Focus:** מעבר של 120ms על רקע, גבול, צל וצבע. הראשי מעמיק ל־`brand-hover`; פוקוס מקבל את טבעת הסגול של 4px. מושבת: שקיפות 45%.
- **Quiet:** רקע לבן, גבול `line-strong`, טקסט דיו. בריחוף הגבול מתכהה ל־`ink-3`. הפעולה המשנית לצד הראשי ("לא הפעם"), ופעולות בכותרת עמוד.
- **Ghost:** בלי רקע, טקסט `ink-2`; בריחוף רקע `surface-2`. כפתורי אייקון (תפריט, עזרה, סגירה).
- **Danger:** כמו שקט, עם טקסט `bad`.
- **Sizes:** קטן 30px / 10px / 14px; גדול 42px / 18px / 16px (כפתורי האישור בכרטיס הצעה).

### Tags (סטטוס)
- **Style:** מלבן של 22px, פינה של 4px, ריפוד 7px, 13px במשקל 500, אייקון אופציונלי של 14px.
- **State:** `tag-brand` למחכה לך ולמייקי על זה; `tag-good` להצליח ולשינוי חיובי; `tag-bad` לנכשל ולשינוי שלילי; `tag-warn`; `tag-quiet` לבוטל, הוחלף, לא הפעם.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** `surface` עם קו `line`.
- **Shadow Strategy:** אין במנוחה; `.card-float` לכרטיסים צפים (ראו Elevation & Depth).
- **Border:** 1px `line`. רשימה מקובצת (`.group-list`) היא כרטיס אחד עם קו בין כל שתי שורות.
- **Internal Padding:** 16 עד 20px.

### Inputs / Fields
- **Style:** גובה 38px, רקע לבן, גבול `line-strong`, פינה של 6px, ריפוד 11px, 15px, צל של 1px.
- **Focus:** הגבול הופך ל־`brand` ונוספת טבעת הסגול. בריחוף הגבול מתכהה ל־`ink-3`. ה־caret וה־accent סגולים.
- **Switch:** מסלול 34×20 בעיגול מלא, `line-strong` כבוי וסגול דולק, ידית לבנה שזזה ב־200ms לכיוון הנכון ב־RTL וב־LTR.
- **Note:** הודעה בתוך טופס או כרטיס: פינה של 6px, ריפוד 10×12, רקע `info-tint`; `note-warn` ו־`note-bad` צובעות גם את הטקסט.

### Navigation
- **Style:** פריט בגובה 36px, פינה של 6px, אייקון Lucide של 18px בקו 1.75, טקסט 15px במשקל 500 ב־`ink-2`.
- **States:** ריחוף: רקע `surface-2` וטקסט דיו. פעיל: רקע `brand-tint` וטקסט סגול, עם `aria-current="page"`.
- **Mobile:** פס עליון מזוגג עם הסימן, שם מייקי ושם העסק, ומגירה מצד ההתחלה על רקע `shell` עם כיסוי `ink` ב־30%.
- **Segmented:** מתג תצוגה בגובה 28px על `surface-2` עם גבול `line-strong`; הנבחר עולה לרקע לבן עם צל של 1px.

### Proposal Card (כרטיס הצעה)
הרכיב שמגדיר את המוצר. כרטיס צף ברוחב עד 480px: כותרת על `surface-2` עם אייקון וסוג ההצעה ותגית סטטוס בצד הסוף, כותרת 18px ו"למה" ב־`ink-2`, תצוגה מקדימה של הפוסט כפי שיופיע בפיד, טבלת פרטים (תווית `ink-2` מול ערך במשקל 500, קו בין שורות, פינה של 6px), ובתחתית כפתור אישור גדול וכפתור שקט. בזמן ביצוע רץ פס אור סגול בתחתית הכותרת והמילה "מבצע" מנצנצת; בסיום הכרטיס מבזיק פעם אחת ב־`brand-tint` והוי קופץ. כרטיס שנדחה, בוטל או הוחלף יורד לשקיפות 60%.

### Mikee (הסימן)
בועת דיבור סגולה עם עיניים, בגדלים של 28px בניווט ובתוצאות ו־36px במצב ריק. הוא מופיע בכל מקום שמייקי מדבר: במצב ריק (מייקי, משפט אחד, דרך אחת קדימה), בהודעה של מייקי, ובשורת הסיכום שלו בעמוד התוצאות.

### Motion
עקומה אחת, `cubic-bezier(0.16, 1, 0.3, 1)`: רכה, אף פעם לא קופצנית. פקדים משתנים ב־120ms. רכיבים חדשים עולים 8px ב־380ms (`.rise`), מילים של מייקי נכנסות מטשטוש ב־420ms, תמונה מוכנה מתחדדת מטשטוש ב־900ms, ותמונה בהכנה היא רשת נקודות שפס אור סגול חוצה אותה. הכל נעצר תחת `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** להשתמש בתפקידים מ־`src/app/globals.css` (`bg-surface`, `text-ink-2`, `border-line`) ולא בערכי צבע גולמיים.
- **Do** לשמור סגול לפעולה הראשית, לקישור, לבחירה, לפוקוס ולמייקי.
- **Do** להציג סטטוס כתגית מלבנית (4px) בזוג טקסט על גוון בהיר מאותו צבע.
- **Do** לבנות כרטיס במנוחה מקו של 1px `line` ופינה של 8px, ולהוסיף צל רק למה שצף.
- **Do** להשתמש בפקדים בגובה קבוע: 30, 36 או 42px לכפתור, 38px לשדה, 36px לפריט ניווט.
- **Do** להשתמש באייקוני Lucide בקו 1.75 (18px בניווט, 16px בכפתור).
- **Do** לכתוב במאפיינים לוגיים (`start`/`end`) כדי שהמסגרת תעבוד ב־RTL.
- **Do** להציג מספר ריק כ־"—" ב־`ink-3`, ולא להמציא מספר.

### Don't:
- **Don't** לחזור לנייר החם, לסריף העברי, למרקר הצהוב או לכפתור בשחור דיו של השפה הקודמת.
- **Don't** לעגל תגית או כפתור עם טקסט לגלולה; עיגול מלא רק לאווטאר, נקודה, מתג ופס התקדמות.
- **Don't** להגדיל פינה מעבר ל־10px.
- **Don't** להוסיף ריווח אותיות (חיובי או שלילי) לטקסט עברי.
- **Don't** לצבוע כותרות, רקעים של אזורים או אייקונים דקורטיביים בסגול.
- **Don't** להוסיף צל לכרטיס במנוחה או לערום כמה צללים צפים זה על זה.
- **Don't** להוסיף פונט שני; היררכיה נבנית ממשקל ודרגת דיו של Heebo.
