import "server-only";
import { getConnection, markConnection, saveConnection } from "./connections";
import { maxBytes } from "./filetype";
import { MediaRejected, type MediaView, storeBytes } from "./media";

/**
 * Google Drive, with the narrowest permission Google offers (drive.file): Mikee sees only the files the
 * client picks in Google's own file picker, never the rest of her Drive. Picked files are copied into the
 * content library, so they keep working in ads even if they are moved in Drive.
 *
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   OAuth client (Web application), redirect: {APP_URL}/api/google/callback
 *   GOOGLE_API_KEY, GOOGLE_APP_ID            Picker developer key and the Cloud project number
 */

export type DriveConfig = { email?: string; connectedAt: string };

const SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];

export const driveConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function driveAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.APP_URL}/api/google/callback`,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error ?? `Google token error (HTTP ${res.status})`);
  return json;
}

export async function connectDrive(workspaceId: string, code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: `${process.env.APP_URL}/api/google/callback` });
  if (!t.refresh_token) throw new Error("Google did not return offline access");
  let email: string | undefined;
  try {
    email = JSON.parse(Buffer.from(t.id_token!.split(".")[1], "base64url").toString()).email;
  } catch {
    email = undefined;
  }
  await saveConnection(workspaceId, "google_drive", { email, connectedAt: new Date().toISOString() } satisfies DriveConfig, t.refresh_token);
}

/** A short-lived access token (one hour) for the picker in the browser and for downloading picked files. */
export async function driveAccessToken(workspaceId: string): Promise<string | null> {
  const conn = await getConnection<DriveConfig>(workspaceId, "google_drive");
  if (!conn?.secret) return null;
  try {
    return (await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.secret })).access_token!;
  } catch (e) {
    await markConnection(workspaceId, "google_drive", "broken", (e as Error).message);
    return null;
  }
}

/** Copies the files the client picked into the library. Google Docs/Sheets (not real files) are skipped. */
export async function importFromDrive(workspaceId: string, fileIds: string[]) {
  const token = await driveAccessToken(workspaceId);
  if (!token) throw new MediaRejected("החיבור לגוגל דרייב לא פעיל. אפשר לחבר מחדש בהגדרות.");
  const auth = { Authorization: `Bearer ${token}` };
  const imported: MediaView[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const id of fileIds.slice(0, 50)) {
    if (!/^[A-Za-z0-9_-]{10,100}$/.test(id)) continue;
    const meta = (await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType,size&supportsAllDrives=true`, { headers: auth, cache: "no-store" }).then((r) => r.json())) as {
      name?: string;
      mimeType?: string;
      size?: string;
    };
    const name = meta.name ?? id;
    if (!meta.size || meta.mimeType?.startsWith("application/vnd.google-apps")) {
      skipped.push({ name, reason: "קובץ של גוגל (מסמך/גיליון) ולא תמונה או סרטון" });
      continue;
    }
    if (Number(meta.size) > maxBytes("video")) {
      skipped.push({ name, reason: "גדול מדי" });
      continue;
    }
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: auth, cache: "no-store" });
    if (!res.ok) {
      skipped.push({ name, reason: `לא הצלחתי להוריד (${res.status})` });
      continue;
    }
    try {
      imported.push(await storeBytes(workspaceId, Buffer.from(await res.arrayBuffer()), { filename: name, source: "drive", sourceRef: id, inLibrary: true, folder: "מגוגל דרייב" }));
    } catch (e) {
      if (e instanceof MediaRejected) skipped.push({ name, reason: e.message });
      else throw e;
    }
  }
  return { imported, skipped };
}
