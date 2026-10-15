/**
 * Addresses used by the site's pages. On mikee.co.il (SITE_URL set) the pages live at clean paths; in local
 * development they stay under /site. Account pages always live on the app (APP_URL).
 */
export const sitePath = (p: string) => (process.env.SITE_URL ? p : `/site${p === "/" ? "" : p}`);
export const appPath = (p: string) => `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${p}`;
