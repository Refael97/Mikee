/**
 * Sends one file to /api/uploads from the browser, with real progress. The size is checked against the
 * server's current limit first, so a file that cannot be taken is refused at once instead of after minutes
 * of uploading; a dropped connection or a stall ends with a clear error, never an endless spinner.
 */
const FALLBACK_MAX = 50 * 1024 * 1024;
let limit: Promise<number> | null = null;

export function uploadLimit(): Promise<number> {
  limit ??= fetch("/api/uploads", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (typeof d?.maxBytes === "number" ? d.maxBytes : FALLBACK_MAX))
    .catch(() => {
      limit = null;
      return FALLBACK_MAX;
    });
  return limit;
}

const mb = (n: number) => `${Math.ceil(n / 1024 / 1024)}MB`;

export async function sendFile(file: File, fields: Record<string, string>, onProgress?: (fraction: number) => void): Promise<{ id: string; [k: string]: unknown }> {
  const max = await uploadLimit();
  if (file.size > max) throw new Error(`הקובץ גדול מדי (${mb(file.size)}). אפשר להעלות עד ${mb(max)}. סרטון ארוך אפשר לקצר בטלפון ולהעלות שוב.`);
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    // Generous for a large video on a phone connection, but never forever.
    xhr.timeout = 20 * 60 * 1000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.id) resolve(data);
      else reject(new Error(data.error ?? (xhr.status === 413 ? "הקובץ גדול מדי" : "ההעלאה נכשלה. נסי שוב.")));
    };
    xhr.onerror = () => reject(new Error("החיבור נקטע באמצע ההעלאה. נסי שוב, רצוי ב־Wi‑Fi."));
    xhr.ontimeout = () => reject(new Error("ההעלאה לקחה יותר מדי זמן. נסי שוב, רצוי ב־Wi‑Fi."));
    xhr.send(form);
  });
}
