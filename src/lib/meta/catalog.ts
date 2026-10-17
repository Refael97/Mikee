import "server-only";
import type { CatalogSpec } from "../specs";
import type { MetaContext } from "./context";

type Catalog = { id: string; name?: string; vertical?: string; product_count?: number };
const catalogFields = "id,name,vertical,product_count";

function supportedVertical(value?: string): "commerce" | "services" {
  if (value === "commerce" || value === "services") return value;
  throw new Error(`סוג הקטלוג ${value ?? "לא התקבל ממטא"} אינו נתמך במסלול הזה. נתמכים קטלוג מוצרי חנות וקטלוג שירותים מקצועיים.`);
}

/** A saved IG id alone is insufficient: the identity must still be linked to this business's Page. */
export async function catalogInstagram(ctx: MetaContext): Promise<string | undefined> {
  if (!ctx.pageId) throw new Error("לא נבחר עמוד פייסבוק לעסק. צריך לבחור אותו בהגדרות.");
  const page = await ctx.graph.get<{ id: string; instagram_business_account?: { id: string } }>(`/${ctx.pageId}`, { fields: "id,instagram_business_account{id}" });
  if (page.id !== ctx.pageId) throw new Error("לא ניתן לאמת את עמוד הפייסבוק המחובר לעסק.");
  const linked = page.instagram_business_account?.id;
  if (ctx.igUserId && ctx.igUserId !== linked) throw new Error("חשבון האינסטגרם שנבחר לעסק אינו מקושר כרגע לדף הפייסבוק שלו. צריך לתקן את בחירת הנכסים בהגדרות.");
  return linked;
}

/** Resolve only the catalog explicitly connected to this workspace, never any catalog the token can see. */
export async function resolveCatalog(ctx: MetaContext, spec: CatalogSpec): Promise<CatalogSpec> {
  if (!ctx.catalogId) throw new Error("לא נבחר קטלוג לעסק. צריך לבחור קטלוג בהגדרות לפני בניית קמפיין קטלוג.");
  if (spec.catalogId !== ctx.catalogId) throw new Error("הקטלוג אינו הקטלוג שנבחר לעסק הזה.");
  const [catalog, set, instagramUserId] = await Promise.all([
    ctx.graph.get<Catalog>(`/${ctx.catalogId}`, { fields: catalogFields }),
    ctx.graph.get<{ id: string; name?: string; product_catalog?: { id: string }; product_count?: number }>(`/${spec.productSetId}`, { fields: "id,name,product_catalog,product_count" }),
    catalogInstagram(ctx),
  ]);
  if (catalog.id !== ctx.catalogId || set.id !== spec.productSetId || set.product_catalog?.id !== ctx.catalogId) {
    throw new Error("סט המוצרים אינו שייך לקטלוג המחובר של העסק. בחרו סט מתוך הקטלוג הזה.");
  }
  const vertical = supportedVertical(catalog.vertical);
  if (spec.vertical && spec.vertical !== vertical) throw new Error("סוג הקטלוג במטא השתנה מאז הבחירה. צריך להכין כרטיס מעודכן.");
  // A readable set can still be empty. Never assume unknown count means products exist.
  if (set.product_count != null && Number(set.product_count) <= 0) throw new Error("סט המוצרים ריק. צריך לבחור סט שיש בו מוצרים.");
  if (set.product_count == null) {
    const edge = vertical === "services" ? "professional_services" : "products";
    const products = await ctx.graph.get<{ data?: { id: string }[] }>(`/${set.id}/${edge}`, { fields: "id", limit: 1 });
    if (!products.data?.length) throw new Error("סט המוצרים ריק. צריך לבחור סט שיש בו מוצרים.");
  }
  return { ...spec, vertical, instagramUserId, catalogName: catalog.name ?? ctx.catalogName ?? "הקטלוג המחובר", productSetName: set.name ?? "סט המוצרים שנבחר" };
}

/** Short discovery list; the caller keeps errors separate from other campaign assets. */
export async function catalogContext(ctx: MetaContext) {
  if (!ctx.catalogId) return { status: "empty" as const, reason: "לא נבחר קטלוג לעסק" };
  const [catalog, sets, instagramUserId] = await Promise.all([
    ctx.graph.get<Catalog>(`/${ctx.catalogId}`, { fields: catalogFields }),
    ctx.graph.get<{ data?: { id: string; name?: string; product_count?: number }[]; paging?: { next?: string } }>(`/${ctx.catalogId}/product_sets`, { fields: "id,name,product_count", limit: 20 }),
    catalogInstagram(ctx),
  ]);
  return { status: "ok" as const, id: catalog.id, name: catalog.name ?? ctx.catalogName, vertical: catalog.vertical, supported: catalog.vertical === "commerce" || catalog.vertical === "services", productCount: catalog.product_count, instagramUserId, platforms: instagramUserId ? ["facebook", "instagram"] : ["facebook"], productSets: sets.data ?? [], more: !!sets.paging?.next };
}
