# בקשת Advanced Access במטא (App Review)

## למה זה נחוץ
כל עוד להרשאה יש רק Standard Access, מטא נותן אותה רק לעסקים שיש להם תפקיד באפליקציה (כמו אדרט). לעסק של לקוחה, כמו רחל סיטבון, מטא משמיט אותה בשקט מהטוקן. כך קרה ב־15.10: הדף והאינסטגרם עברו, אבל `ads_read`, `ads_management`, `business_management` ו־`leads_retrieval` נשמטו. הפתרון הוא Advanced Access לכל הרשאה שמייקי צריך.

## מה להשאיר בבקשה ומה להסיר
כל הרשאה בבקשה דורשת תיאור וסרטון, וכל הרשאה מיותרת מגדילה את הסיכוי לדחייה. ב־"edit your submission" כדאי להשאיר רק את הרשימה הזו. היא זהה ל־`NEEDED_SCOPES` ב־`src/lib/meta/graph.ts`, ועוד `read_insights` ו־`public_profile`:

| להשאיר | בשביל מה במייקי |
|---|---|
| `ads_read` | קריאת תוצאות הקמפיינים, הוצאה ופילוחים |
| `ads_management` | יצירה ועדכון של קמפיינים, רק אחרי שהלקוחה אישרה כרטיס |
| `business_management` | גישה לחשבון המודעות, הפיקסל והקטלוג שבתיק העסקי של הלקוחה |
| `pages_show_list` | הצגת הדפים כדי שהלקוחה תאשר מהו העסק שלה |
| `pages_read_engagement` | נתוני הדף והפוסטים |
| `pages_read_user_content` | תגובות ותיוגים בדף (תלות של `instagram_basic`) |
| `pages_manage_posts` | פרסום פוסט מאושר בדף |
| `pages_manage_metadata` | הרשמה ל־webhooks של הודעות אינסטגרם למענה האוטומטי |
| `pages_manage_ads` | טפסי לידים של הדף |
| `leads_retrieval` | קריאת הלידים שהגיעו מהטפסים. **חסרה בבקשה הנוכחית, צריך להוסיף** |
| `read_insights` | נתוני הדף לאורך זמן |
| `instagram_basic` | פרופיל האינסטגרם והפוסטים |
| `instagram_content_publish` | פרסום פוסט מאושר באינסטגרם |
| `instagram_manage_insights` | נתוני האינסטגרם |
| `instagram_manage_messages` | המענה האוטומטי להודעות באינסטגרם |
| `catalog_management` | קריאת קטלוג המוצרים לקמפיינים דינמיים |
| `public_profile` | שם המשתמש שהתחבר |
| Marketing API Access Tier | Advanced Access ל־Marketing API, בלעדיו אין `ads_management` לעסקים חיצוניים |
| Business Asset User Profile Access | שם ותמונה של מי שכתב הודעה באינסטגרם, בתיבת ההודעות |

**להסיר:** כל ה־`instagram_business_*` (הם ל־Instagram Login, ומייקי עובד דרך Facebook Login), `instagram_manage_comments`, `instagram_manage_contents`, `instagram_manage_engagement`, `instagram_manage_upcoming_events`, `instagram_shopping_tag_products`, כל ה־branded content וה־creator marketplace, `pages_manage_engagement`, Human Agent, Instagram Public Content Access. אם בעתיד נצטרך אחת מהן, מגישים בקשה נפרדת.

## "עליך לוודא שביצעת את קריאות הבדיקה הנדרשות"
מטא דורש קריאה מוצלחת אחת לכל הרשאה ב־30 הימים האחרונים. ב־Railway shell של השירות:

```
npm run meta-review-calls -- "אדרט"
```

השם יכול להיות של העסק במייקי, או של הדף, חשבון המודעות או האינסטגרם שמחוברים אליו. אם אין התאמה, הסקריפט מדפיס את כל העסקים במייקי ומה מחובר בכל אחד.

הסקריפט קורא פעם אחת לכל הרשאה עם החיבור של אדרט. הוא לא מפרסם, לא משנה ולא מוציא כסף, ומדפיס מה הצליח. מטא מעדכן את הסימון תוך כיממה. הרשאות שמסומנות "skipped" צריכות נכס מתאים: טופס לידים בדף בשביל `leads_retrieval`, וקטלוג שנבחר בשביל `catalog_management`.

## הסרטונים
אפשר להקליט סרטון אחד ארוך ולהעלות אותו לכל ההרשאות, אם רואים בו כל שימוש. מטא מבקש ממשק באנגלית או כתוביות באנגלית, אז מוסיפים כתוביות קצרות. הסדר:
1. כניסה למייקי, ולחיצה על "התחברות לפייסבוק". רואים את חלון ההרשאות של מטא ואת האישור.
2. שלב "זה העסק שלך?": הדף, האינסטגרם וחשבון המודעות שנמצאו, ולחיצה על "כן, זה העסק שלי".
3. עמוד התוצאות: נתוני הקמפיינים (`ads_read`, `read_insights`, `instagram_manage_insights`).
4. בקשה בצ'אט להכין קמפיין, הכרטיס שמופיע, האישור, והקמפיין שנוצר ב־Ads Manager (`ads_management`, `business_management`, `catalog_management`).
5. בקשה לפוסט, אישור הכרטיס, והפוסט שעלה בדף ובאינסטגרם (`pages_manage_posts`, `instagram_content_publish`).
6. הדלקת המענה האוטומטי בהגדרות, שליחת הודעה לאינסטגרם מטלפון אחר, והתשובה שחוזרת. בתיבת ההודעות רואים את שם השולח (`instagram_manage_messages`, `pages_manage_metadata`, Business Asset User Profile Access).
7. הלידים מטופס הלידים בעמוד התוצאות (`pages_manage_ads`, `leads_retrieval`).

## הטקסטים לשדה "Describe how your app uses this permission"
פתיח משותף, מעל כל תיאור:

> Mikee is a SaaS marketing manager for small businesses. The business owner connects their own Facebook Page, Instagram account and ad account through Facebook Login for Business, then talks to Mikee in a chat. Mikee prepares campaigns, posts and replies, and every action that publishes content or spends money is shown first as a card the owner must approve. Mikee only acts on the assets of the business that connected it.

- **ads_read:** Mikee reads the connected ad account's campaigns, ad sets, ads and insights (spend, results, breakdowns by age, placement and region) to report performance to the business owner in plain language and to base its recommendations on real data.
- **ads_management:** After the business owner approves a proposal card in Mikee, Mikee creates or updates campaigns, ad sets and ads in the business's own ad account, and pauses or adjusts them on request. It also sets the account spend cap to the monthly budget the owner chose, so spending can never exceed it. Nothing is created or changed without the owner's explicit approval.
- **business_management:** The business connects with a business integration system user token. Mikee uses this permission to read the business portfolio's ad accounts, pixels and product catalogs, so the owner can confirm which assets belong to the business, and to renew the system user token before it expires.
- **pages_show_list:** Mikee lists the Pages the business connected so the owner can confirm which Page is theirs during onboarding.
- **pages_read_engagement:** Mikee reads the Page's posts, followers and engagement to show the owner how their organic content performs and to learn the business's voice before writing new posts.
- **pages_read_user_content:** Mikee reads comments and visitor posts on the business's Page to summarize what customers are saying. It is also required for instagram_basic.
- **pages_manage_posts:** When the owner approves a post card in Mikee, Mikee publishes that post to the business's Page, or schedules it for the time the owner chose.
- **pages_manage_metadata:** Mikee subscribes the business's Page to webhooks so it receives Instagram messages in real time for the auto reply feature the owner turns on in Settings.
- **pages_manage_ads:** Mikee reads the Page's lead forms and uses the Page as the identity of ads the owner approved.
- **leads_retrieval:** Mikee retrieves the leads submitted through the business's own lead forms and shows them to the owner, so they can follow up with customers quickly.
- **read_insights:** Mikee reads Page insights (reach, engagement over time) to report organic performance to the owner next to the paid results.
- **instagram_basic:** Mikee reads the connected Instagram professional account's profile and media, to show performance and to write new posts in the account's style.
- **instagram_content_publish:** When the owner approves a post card in Mikee, Mikee publishes the approved image, carousel or Reel to the business's Instagram account.
- **instagram_manage_insights:** Mikee reads Instagram account and media insights (reach, interactions) to report organic performance to the owner.
- **instagram_manage_messages:** The owner can turn on an auto reply in Settings. When a customer messages the business's Instagram account, Mikee answers within the 24 hour window using only the business information the owner provided (hours, address, prices), and hands the conversation to the owner when it cannot answer. The owner can see every conversation in Mikee and turn the feature off at any time.
- **catalog_management:** Mikee reads the business's product catalog to build dynamic product ads the owner approves, and keeps product sets in sync with the online store.
- **Marketing API Access Tier:** Mikee manages ads for many independent small businesses, each in their own ad account, so it needs Advanced Access to the Marketing API. Calls are rate limited per business and every write follows an explicit approval by the business owner.
- **Business Asset User Profile Access:** In Mikee's Instagram inbox the owner sees the name and profile picture of the customer who wrote to the business, so they know who they are answering.

## אחרי האישור
לא צריך לשנות שום דבר בקוד. מבקשים מרחל להתחבר מחדש דרך הכפתור, מריצים `npm run meta-diagnose -- רחל`, ובודקים שארבע ההרשאות מופיעות. אחר כך בוחרים את חשבון המודעות בהגדרות.
