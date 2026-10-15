/**
 * Mikee's four colours. Each is a view model instance by the same name in public/mikee/mikee.riv (the file's
 * "light", "dark" and "Instance" match ice_blue and are not used), with a still frame beside it
 * (public/mikee/<id>.png) shown until the animation loads. Every user picks one on the account page.
 */
export const MIKEE_LOOKS = [
  { id: "ice_blue", name: "כחול קרח" },
  { id: "black_titanium", name: "שחור טיטניום" },
  { id: "silver_titanium", name: "כסף טיטניום" },
  { id: "deep_burgundy", name: "בורדו עמוק" },
] as const;

export type MikeeLook = (typeof MIKEE_LOOKS)[number]["id"];
export const DEFAULT_LOOK: MikeeLook = "ice_blue";
export const isLook = (v: unknown): v is MikeeLook => MIKEE_LOOKS.some((l) => l.id === v);
export const lookOf = (value: string | null | undefined): MikeeLook => (isLook(value) ? value : DEFAULT_LOOK);

/**
 * Part of every URL of Mikee's files (the .riv and the still frames), so a new character reaches everyone at
 * once instead of waiting for browser and CDN caches to expire. It is the first 8 characters of the md5 of
 * public/mikee/mikee.riv; tests/mikee-look.test.ts fails until it is updated after swapping the file.
 */
export const MIKEE_ASSET_VERSION = "3a5c46cf";

/** Fired after a save, so every Mikee on the screen changes at once. */
export const THEME_EVENT = "mikee:theme";
