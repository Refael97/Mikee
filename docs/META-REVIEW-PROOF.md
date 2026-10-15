# חבילת ההוכחות ל־App Review

הרשאה נכנסת להגשה רק כשכל העמודות שלה מלאות ונבדקו מול המוצר החי. עמודת "בסרטון" מתמלאת אחרי הצילום (מספר התרחיש ודקה).

| הרשאה | למה מייקי צריך אותה | הפעולה בממשק | קריאת ה־API | קריאת בדיקה | בסרטון |
|---|---|---|---|---|---|
| `public_profile` | שם מי שהתחבר | התחברות לפייסבוק בהגדרות | `GET /me` | meta-review-calls | 1 |
| `business_management` | קריאת חשבונות המודעות, הפיקסלים והקטלוגים של התיק העסקי שהלקוחה חיברה | "זה העסק שלך?": בחירת התיק והנכסים | `GET /me/businesses`, `GET /{business}/owned_product_catalogs` | meta-review-calls | 1 |
| `pages_show_list` | בחירת הדף של העסק | "זה העסק שלך?" | `GET /me/accounts` | meta-review-calls | 1 |
| `catalog_management` | קריאת מוצרי הקטלוג ויצירת סטים של מוצרים למודעות דינמיות. **מייקי לא יוצר ולא מוחק קטלוגים** | "זה העסק שלך?" (שדה הקטלוג); בצ'אט: Create a product set of evening dresses | `GET /{catalog}/products`, `POST /{catalog}/product_sets` | meta-review-calls + הדגמה | 1 |
| `ads_read` | תוצאות הקמפיינים | "תוצאות"; בצ'אט: How did my ads do in the last 7 days? | `GET /{act}/insights` | meta-review-calls | 4 |
| `read_insights` | נתוני הדף (מעורבות, צפיות, עוקבים) | בצ'אט: How did my Facebook Page do this week? Show the Page insights. | `GET /{page}/insights` | meta-review-calls | 4 |
| `instagram_manage_insights` | נתוני האינסטגרם | "תוצאות" | `GET /{ig}/insights` | meta-review-calls | 4 |
| `pages_read_engagement` | פוסטים ונתוני הדף | "תוצאות", "תגובות על הפוסטים" | `GET /{page}/posts` | meta-review-calls | 4 |
| `ads_management` | יצירת קמפיין אחרי אישור | בצ'אט: Create a test campaign with 10 ILS a day ← אישור הכרטיס | `POST /{act}/campaigns` (PAUSED) | meta-review-calls + הדגמה | 5 |
| `pages_manage_ads` | הדף כזהות המודעה, טפסי לידים | אותו קמפיין | `GET /{page}/leadgen_forms` | meta-review-calls | 5 |
| `leads_retrieval` | הלידים מהטפסים | בצ'אט: Show me the latest leads from my lead forms | `GET /{form}/leads` | meta-review-calls | 4 |
| `pages_manage_posts` | יצירה, עריכה ומחיקה של פוסטים בדף | יצירה: בצ'אט ← אישור כרטיס. עריכה ומחיקה: "הודעות" ← "הפוסטים והתגובות" ← עיפרון / פח | `POST /{page}/photos`, `POST /{post}`, `DELETE /{post}` | הדגמה | 2 |
| `instagram_basic` | פרופיל ופוסטים באינסטגרם | "זה העסק שלך?", "תגובות על הפוסטים" | `GET /{ig}` | meta-review-calls | 2 |
| `instagram_content_publish` | פרסום פוסט תמונה מאושר לפיד | בצ'אט: Write an Instagram feed post with a photo of our new collection ← אישור | `POST /{ig}/media`, `/media_publish` | הדגמה | 2 |
| `pages_read_user_content` | תגובות ותיוגים בדף | "תגובות על הפוסטים" | `GET /{post}/comments` | meta-review-calls | 6 |
| `instagram_manage_comments` | תגובות על פוסטים באינסטגרם | "תגובות על הפוסטים": מענה, הסתרה, מחיקה | `GET /{media}/comments`, `POST /{comment}/replies` | meta-review-calls + הדגמה | 6 |
| `pages_manage_engagement` | מענה, לייק והסתרה בדף | "תגובות על הפוסטים" על פוסט בפייסבוק | `POST /{comment}/comments`, `/likes` | הדגמה | 6 |
| `instagram_manage_engagement` | לייק לפוסט ולתגובה באינסטגרם | "הפוסטים והתגובות": הלב ליד הפוסט, הלב ליד התגובה | `POST/DELETE /{ig}/likes` (`media_id`, `comment_id`) | הדגמה | 6 |
| `instagram_manage_contents` | מחיקת פוסט מאינסטגרם | הפח ליד פוסט ← לחיצה שנייה | `DELETE /{media}` | הדגמה | 6 |
| `instagram_manage_upcoming_events` | אירוע קרוב (השקה, מבצע) שעוקבים מקבלים עליו תזכורת | "תזמון" ← "אירועים קרובים באינסטגרם": רשימה, פתיחת פרטים, יצירת אירוע | `GET/POST /{ig}/upcoming_events`, `GET /{event}` | meta-review-calls + הדגמה | 6 |
| `instagram_manage_messages` | מענה להודעות: אוטומטי מהמידע המאושר, וידני מתוך מייקי | "הודעות": מענה ידני מתוך מייקי; הפעלת המענה האוטומטי; הודעה מחשבון אחר | webhook + `POST /{page}/messages` | meta-review-calls + הדגמה (וגם בקשת cURL מ־API Integration Helper) | 3 |
| `pages_manage_metadata` | הרשמה ל־webhooks | אותה הפעלה | `POST /{page}/subscribed_apps` | meta-review-calls | 3 |

## לא בהגשה
- **Business Asset User Profile Access:** מייקי לא קורא פרופילים של לקוחות (שם או תמונה), אז אין לו הצדקה. מורידים אותו מהבקשה.
- **catalog_management:** בהגשה, עם תיאור כן: קריאה ויצירת סטים של מוצרים. רשימת הצילום של מטא מתארת יצירה, עדכון ומחיקה של קטלוג, ולכן יש סיכון שתידחה. דחייה שלה לא פוגעת בשאר ההרשאות.

## כללי ההודעות שמומשו
- כל תשובה אוטומטית נפתחת ב"תשובה אוטומטית:" (או "Automated reply:" כשכותבים באנגלית).
- לקוחה שכותבת "תפסיקו", "די", "stop" וכדומה לא מקבלת יותר תשובות אוטומטיות, והשיחה עוברת לבעלת העסק.
- מענה רק בתוך 24 שעות מההודעה האחרונה של הלקוחה; אין הודעות יזומות, ואין שימוש ב־Human Agent.

## הסרטונים (קצרים, אחד לכל תרחיש, כתוביות באנגלית)
1. **חיבור העסק:** מחשבון בדיקה שעוד לא אישר את האפליקציה, כדי שמסך ההסכמה יופיע: כניסה למייקי ← "התחברות עם פייסבוק" ← מסך ההרשאות ← בחירת הנכסים ← "זה העסק שלך?" עם שם הדף, האינסטגרם, חשבון המודעות והקטלוג. לא מנתקים חשבון של לקוחה בשביל הצילום.
2. **סושיאל:** בקשה בצ'אט ← כרטיס ← אישור ← הפוסט בדף ובאינסטגרם, בטאב נוסף.
3. **הודעות:** שני צדי השיחה במסך מפוצל: טלפון של "לקוחה" שולח "Where is the store?", ההודעה מופיעה ב"הודעות" במייקי, התשובה מהמידע המאושר מגיעה לטלפון.
4. **תוצאות:** בקשה בצ'אט ומסך "תוצאות" עם המספרים ושם החשבון; הלידים.
5. **קמפיינים:** אישור כרטיס ← הקמפיין מושהה ב־Ads Manager עם אותו שם.
6. **פוסטים, תגובות ואירועים:** עריכת פוסט בדף ומחיקת פוסט בדיקה (פייסבוק ואינסטגרם), לייק לפוסט ולתגובה, מענה, הסתרה ומחיקה של תגובה של משתמש אחר, ובעמוד "תזמון": רשימת האירועים, פתיחת אירוע ויצירת אירוע חדש.

## לפני ההגשה
1. `npm run review-account -- mikee` (5000 קרדיטים ותקציב 50, כדי שהבודק לא ייתקע).
2. `npm run review-rehearsal`: כל בקשה מההוראות לבודק צריכה להגיע לכלי הנכון בלי שאלות ובלי "אין לי יכולת". בקשה שנכשלת יוצאת מההוראות עד שמתקנים.
3. `npm run meta-review-calls -- mikee`: הכל `ok`.
4. חזרה מלאה מדפדפן נקי, על ידי מישהו שלא בנה את המערכת, רק עם פרטי הגישה וההוראות באנגלית.
