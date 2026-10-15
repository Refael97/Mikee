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

## הכנה לפרודקשן: הגדרות האפליקציה
ב־App Dashboard ← Settings ← Basic (הכתובות לפי הדומיין של האתר והאפליקציה):

| שדה | ערך |
|---|---|
| Privacy Policy URL | `https://mikee.co.il/privacy` |
| Terms of Service URL | `https://mikee.co.il/terms` |
| User data deletion | Data Deletion Callback URL: `https://app.mikee.co.il/api/meta/data-deletion` |
| Deauthorize callback URL (Facebook Login for Business ← Settings) | `https://app.mikee.co.il/api/meta/deauthorize` |
| App icon | 1024x1024, הדמות של מייקי |
| Category | Business and pages |

שתי הכתובות של הקריאות חוזרות בודקות את החתימה של מטא (`signed_request` עם ה־App Secret), מוחקות או מנתקות את החיבור של מי שביקש, ומחזירות קוד אישור ועמוד סטטוס (`/data-deletion?code=...`). הבדיקות ב־`tests/meta-data-deletion.test.ts`.

## חשבון לבודקים
ב־Railway shell: `npm run review-account -- mikee`. נוצר עסק בשם "Meta Review" עם החיבור לפייסבוק של העסק "mikee" ותקציב חודשי של 50, וסיסמה אקראית מודפסת פעם אחת. `--reset` נותן סיסמה חדשה.

## Data handling
- **Data processors:** Yes. Railway (hosting and database), Anthropic (AI processing of page content, results and Instagram messages; access tokens are never sent to it), Cloudflare (DNS and network), and the file storage bucket provider in use.
- **Responsible entity:** ADRT GROUP LTD, Israel.
- **National security requests in the past 12 months:** No.
- **Policies for requests from public authorities:** all four, according to `docs/GOVERNMENT-REQUESTS-POLICY.md` (only after it has actually been adopted).

## Reviewer instructions (paste into App Review)
> Mikee is a web app in Hebrew. Sign in at https://app.mikee.co.il/login with the credentials below. The test business is already connected to a Facebook Page, an Instagram professional account and an ad account through Facebook Login for Business; to see the login flow itself, open Settings ("הגדרות") and click "Connect Facebook" ("התחברות לפייסבוק").
> 1. Results ("תוצאות", left menu): campaign insights (ads_read, read_insights, instagram_manage_insights).
> 2. Chat ("שיחה חדשה"): type "Create a test campaign with 10 ILS a day". Mikee prepares a card; click approve ("לאשר"). The campaign is created PAUSED in the connected ad account (ads_management, business_management, pages_manage_ads). The monthly budget of this test business is capped at 50 ILS.
> 3. Chat: type "Write a post for Facebook and Instagram". Approve the card; the post is published to the Page and to Instagram (pages_manage_posts, instagram_content_publish).
> 4. Settings, Instagram auto reply: turn it on, then send a direct message to the connected Instagram account from another account. The reply arrives within a minute and appears in the Instagram inbox in Mikee (instagram_manage_messages, pages_manage_metadata, Business Asset User Profile Access).
> 5. Results, leads: leads from the Page's lead forms (leads_retrieval).
> 6. Settings, "Is this your business?": the Page, Instagram account, ad account, pixel and product catalog found for the business (pages_show_list, pages_read_engagement, catalog_management).
> Nothing is published or spent without the business owner approving a card.

## הגשה ראשונה: 22 הרשאות
17 ההרשאות שבטבלה למעלה, ועוד חמש שנוספו עם ניהול התגובות והאירועים:

| הרשאה | בשביל מה במייקי |
|---|---|
| `instagram_manage_comments` | קריאת התגובות על פוסטים באינסטגרם, מענה, הסתרה ומחיקה (עמוד "הודעות", "תגובות על הפוסטים") |
| `pages_manage_engagement` | מענה, לייק, הסתרה ומחיקה של תגובות על פוסטים בדף הפייסבוק |
| `instagram_manage_engagement` | לייק לתגובה של לקוחה באינסטגרם |
| `instagram_manage_contents` | מחיקת פוסט מאינסטגרם, אחרי אישור נוסף בלחיצה |
| `instagram_manage_upcoming_events` | יצירת אירוע קרוב באינסטגרם (השקה, מבצע) למודעת תזכורת, כשהלקוחה מבקשת בצ'אט |

הוסרו מהבקשה: ההרשאות של משפיענים ותוכן ממומן (`instagram_creator_marketplace_discovery`, `instagram_branded_content_brand`, `instagram_branded_content_ads_brand`, `facebook_branded_content_ads_brand`, `instagram_branded_content_creator`) ו־`instagram_shopping_tag_products` (לא זמין בישראל).

את חמש החדשות צריך גם לסמן בקונפיגורציה של Facebook Login for Business, ולהתחבר מחדש.

- **instagram_manage_comments:** Mikee shows the comments on the business's latest Instagram posts under Messages, so the owner can reply, hide or delete them in one place. Mikee only acts when the owner clicks.
- **pages_manage_engagement:** On the same screen the owner replies to, likes, hides or deletes comments on the business's Facebook Page posts.
- **instagram_manage_engagement:** The owner can like a customer's comment on the business's Instagram post from Mikee, to acknowledge it without writing a reply.
- **instagram_manage_contents:** The owner can delete one of the business's Instagram posts from Mikee. The delete button asks for a second confirmation before anything is removed.
- **instagram_manage_upcoming_events:** When the owner asks in the chat for a reminder about an upcoming launch or sale, Mikee creates an Instagram upcoming event with its title and start time, used in a reminder ad that the owner approves on a separate card.

Reviewer instructions, step 7 (add after step 6):
> 7. Comments: open Messages ("הודעות", left menu) and scroll to "תגובות על הפוסטים". Comments on the latest Facebook and Instagram posts are listed with buttons to reply, like, hide and delete; the trash icon next to an Instagram post deletes the post after a second click (instagram_manage_comments, pages_manage_engagement, instagram_manage_engagement, instagram_manage_contents). In Chats, type "Create an Instagram event reminder for our launch next Friday at 18:00" to create an upcoming event (instagram_manage_upcoming_events).
