/**
 * The four looks a business can choose for Mikee. Each is a view model instance by the same name in
 * public/mikee/mikee.riv, with a still frame beside it (public/mikee/<id>.png) shown until the animation loads.
 */
export const MIKEE_LOOKS = [
  { id: "ice_blue", name: "כחול קרח" },
  { id: "silver_titanium", name: "טיטניום כסוף" },
  { id: "black_titanium", name: "טיטניום שחור" },
  { id: "deep_burgundy", name: "בורדו עמוק" },
] as const;

export type MikeeLook = (typeof MIKEE_LOOKS)[number]["id"];
export const DEFAULT_LOOK: MikeeLook = "ice_blue";
export const isLook = (v: unknown): v is MikeeLook => MIKEE_LOOKS.some((l) => l.id === v);
export const lookOf = (settings: { mikeeLook?: string }): MikeeLook => (isLook(settings.mikeeLook) ? settings.mikeeLook : DEFAULT_LOOK);
