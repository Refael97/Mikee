# Mikee: Design System

Every screen in the product follows these rules. They come from the approved mockup (Codex style, in Hebrew).
When building a new feature, don't invent new styles. Pick from the components and tokens below.

## 1. Principles
1. **White and calm.** White panels on a very light background. Color comes from the content (images, ads, charts) and from small accents.
2. **Light text, clear hierarchy.** One big title per screen, calm text everywhere else. Hierarchy comes from size and grey, not from boldness.
3. **Thin icons.** Outline only, stroke width 1.4–1.5, no fill.
4. **Color in small doses.** Pastel colors only inside icon tiles, status dots and badges. Never a colored area larger than a button.
5. **Black is the action.** The primary button is a black capsule. Never a colored button.
6. **Real content.** Real images, real numbers, real copy. No made-up colored shapes, no ✨, no gradient backgrounds.
7. **RTL Hebrew.** Everything right to left. Icons with a direction (arrows, back) are mirrored.

## 2. Tokens (CSS)
```css
:root {
  /* surfaces */
  --ground: #f6f6f4;   /* app background */
  --panel:  #ffffff;   /* panels and cards */
  --hover:  #f3f3f1;   /* hover, active item, active tab, soft background */
  --line:   #e7e7e4;   /* thin lines and borders */
  /* text */
  --ink:   #1b1b1b;    /* primary text, primary button */
  --ink-2: #5c5c5f;    /* secondary text */
  --ink-3: #9a9a9d;    /* section headings, meta, placeholder */
  /* soft accents: color + tint pairs */
  --mint:   #3fae9f;  --mint-tint:   #e6f6f3;   /* Mikee, "live", success */
  --sun:    #d9a23e;  --sun-tint:    #fbf3e2;   /* awaiting, draft, warning */
  --coral:  #ee8a72;  --coral-tint:  #fdeee9;   /* ended, error */
  --violet: #9580f2;  --violet-tint: #f0ecfe;   /* content, posts, ideas */
  --blue:   #4a8df6;                              /* notification dot, focus */
  /* shape */
  --r-panel: 18px; --r-card: 18px; --r-item: 10px; --r-tile: 8px; --r-pill: 999px;
  --shadow: 0 0 0 1px rgba(0,0,0,.035), 0 8px 30px rgba(0,0,0,.04);
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --font: -apple-system, BlinkMacSystemFont, "Heebo", "Segoe UI", system-ui, sans-serif;
}
```
Dark mode: ground `#0f0f0f`, panel `#1b1b1b`, hover `#262626`, line `#2c2c2c`, ink `#f1f1ef`, ink-2 `#b2b2b5`, ink-3 `#747477`. The tints become the color at 18% opacity.

## 3. Type scale (only these sizes)
| Role | Size | Weight | Color |
|---|---|---|---|
| Screen title ("Library", campaign name) | 34px (26px on mobile) | 500 | ink |
| Product name in the sidebar | 28px | 500 | ink |
| Big number (results) | 30px | 400 | ink, tabular numbers |
| List item, body text, button | 17px (buttons 16–16.5) | 300 | ink |
| Section heading ("קמפיינים", "אחרונות") | 17px | 300 | ink-3 |
| Secondary text, description | 15px | 300 | ink-2 |
| Meta (time, status, count) | 13.5px | 300 | ink-3 |

Rules: line height 1.5–1.55. Titles `letter-spacing: -0.01em`. Numbers use `font-variant-numeric: tabular-nums`. No 700, and no 600 except inside ad creatives.

## 4. Layout
- **Desktop:** icon rail (68px) | sidebar panel (300px) | main panel. 10px gaps and a 10px frame around everything.
- **Panel:** white, radius 18, `--shadow`, no visible border.
- **Main panel:** header (title on the right, search and black button on the left), tabs row, content up to 820px wide, composer at the bottom.
- **Mobile (<640px):** rail and sidebar hidden, main panel full width with no radius, 16px side margins.
- **Spacing:** 4 / 8 / 12 / 22 / 28. Between blocks 22px, panel padding 18–28px.

## 5. Components
**Icon rail:** 48px icons, radius 14. Active: background `rgba(0,0,0,.06)`. Notification: an 8px blue dot at the top corner. Profile circle at the bottom (40px, grey, initials).

**Sidebar row:** height ~38, padding 6–8, radius 10, text 17/300. On hover and when active: background `--hover`. Optional: an icon tile (26px, radius 8, tint background, colored icon) and meta on the left.

**Section heading:** 17px, ink-3, 6px above the list. Not uppercase, not bold.

**Primary button:** black capsule, height 44–48, padding 18–22, text 16/400 in panel color. Press: `scale(.97)`.
**Secondary button:** capsule, background `--hover`, ink text.
**Tabs:** capsule, height 40, padding 18. Active: background `--hover`. Count in ink-3, 14px.
**Search:** capsule with a 1.5px line border, icon in ink-3.

**Status badge:** capsule, height 34, tint background, colored text, 8px dot. Live: mint with a pulsing dot. Awaiting: sun. Working: hover + ink-2.

**Media card (ad, image, video):** radius 18, 4:5 (or the platform's ratio), `--shadow`, image `object-fit: cover`. On top: a white "Version A" tag. Below: a meta row (description on the right, number on the left). Hover: the image zooms to 1.02.

**Info tile (plan, settings):** background `--hover`, radius 14, colored icon tile + small grey label + value 16/400.
**Result tile:** background `--hover`, radius 14, big number 30/400 + label 14px ink-2.

**Composer:** white, 1.5px line border, radius 24, `--shadow`. Text 17/300, placeholder ink-3. Microphone when empty, a black round send button once there's text. A fade from white above it.

**Popover menu:** white, radius 20, shadow `0 18px 50px rgba(0,0,0,.12)` + 1px line. Rows of 40px with a 20px thin icon + text 17/300 + shortcut in ink-3 on the left. Separator: 1px line.

**AI work in progress:** a thin line with a moving mint stripe, or the text "מייקי עובד על זה" with a status dot. No sparkles, no spinner.
**Mikee's steps:** a grey line "מייקי עשה 4 שלבים ⌄" that opens a list.

## 6. Motion
- One curve: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Entry 220–420ms, exit 200ms. Menus: from 96% + 6px down.
- Button press: `scale(.97)`. Immediate feedback, before the server responds.
- Respect `prefers-reduced-motion`.

## 7. Copy
- Hebrew of a real person, short sentences. Specific: "12 פניות, ₪9.40 לפנייה" and not "תוצאות מעולות!".
- The action button says exactly what happens: "אשר והעלה לאוויר · ₪60 ליום".
- Trust: "שום דבר לא עולה לאוויר ושום שקל לא יוצא בלי האישור שלך".
- No dashes, no "AI magic", no exclamation marks.

## 8. Before shipping a screen
- [ ] One title only, everything else 17 and below
- [ ] Text 300, nothing heavier than 500
- [ ] All icons thin and the same size
- [ ] Only one black button on the screen
- [ ] Color only in tiles, dots and badges
- [ ] Real content instead of placeholders
- [ ] RTL works, and the mobile view has no sideways scroll
- [ ] Dark mode works
