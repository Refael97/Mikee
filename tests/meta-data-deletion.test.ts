import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getConnection, saveConnection } from "@/lib/connections";
import { confirmationCode, deauthorize, deleteMetaData, parseSignedRequest } from "@/lib/meta/data-deletion";
import { POST as deletionCallback } from "@/app/api/meta/data-deletion/route";
import { createBusiness } from "./support/setup";

const SECRET = "test-app-secret";
const sign = (payload: object, secret = SECRET) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${createHmac("sha256", secret).update(body).digest("base64url")}.${body}`;
};

describe("Meta data deletion", () => {
  it("accepts only a signed_request signed with the app secret", () => {
    const good = sign({ algorithm: "HMAC-SHA256", user_id: "42" });
    expect(parseSignedRequest(good, SECRET)?.user_id).toBe("42");
    expect(parseSignedRequest(good, "another-secret")).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: "none", user_id: "42" }), SECRET)).toBeNull();
    expect(parseSignedRequest("garbage", SECRET)).toBeNull();
  });

  it("deletes the connection and the Instagram messages of the person who asked, and nobody else's", async () => {
    const mine = await createBusiness();
    const other = await createBusiness();
    await saveConnection(mine, "meta", { metaUserId: "777" });
    const d = await db();
    await d.insert(schema.igMessages).values({ workspaceId: mine, mid: `m-${mine}`, customerId: "c1", direction: "in", text: "שלום", sentAt: new Date() });

    expect(await deleteMetaData("777")).toBe(1);
    expect(await getConnection(mine, "meta")).toBeNull();
    expect(await d.select().from(schema.igMessages).where(eq(schema.igMessages.workspaceId, mine))).toHaveLength(0);
    expect(await getConnection(other, "meta")).not.toBeNull();
  });

  it("the callback answers Meta with a status page and a confirmation code", async () => {
    const saved = { secret: process.env.META_APP_SECRET, app: process.env.APP_URL };
    process.env.META_APP_SECRET = SECRET;
    process.env.APP_URL = "https://app.example.com";
    try {
    const form = new FormData();
    form.set("signed_request", sign({ algorithm: "HMAC-SHA256", user_id: "555" }));
    const res = await deletionCallback(new Request("https://app.example.com/api/meta/data-deletion", { method: "POST", body: form }));
    const json = await res.json();
    expect(json.confirmation_code).toBe(confirmationCode("555", SECRET));
    expect(json.url).toContain(`data-deletion?code=${json.confirmation_code}`);

    const bad = new FormData();
    bad.set("signed_request", sign({ algorithm: "HMAC-SHA256", user_id: "555" }, "wrong"));
    expect((await deletionCallback(new Request("https://app.example.com/api/meta/data-deletion", { method: "POST", body: bad }))).status).toBe(400);
    } finally {
      if (saved.secret === undefined) delete process.env.META_APP_SECRET;
      else process.env.META_APP_SECRET = saved.secret;
      if (saved.app === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = saved.app;
    }
  });

  it("removing the app on Facebook drops the stored token and asks for a reconnect", async () => {
    const ws = await createBusiness();
    await saveConnection(ws, "meta", { metaUserId: "888" });
    expect(await deauthorize("888")).toBe(1);
    const conn = await getConnection(ws, "meta");
    expect(conn?.secret).toBeFalsy();
  });
});
