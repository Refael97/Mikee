import "server-only";
import type { CatalogSpec } from "../specs";
import type { MetaContext } from "./context";

/** Resolve only the catalog explicitly connected to this workspace, never any catalog the token can see. */
export async function resolveCatalog(ctx: MetaContext, spec: CatalogSpec): Promise<CatalogSpec> {
  if (!ctx.catalogId) throw new Error("לא נבחר קטלוג לעסק. צריך לבחור קטלוג בהגדרות לפני בניית קמפיין קטלוג.");
  if (spec.catalogId !== ctx.catalogId) throw new Error("הקטלוג אינו הקטלוג שנבחר לעסק הזה.");
  const [catalog, set] = await Promise.all([
    ctx.graph.get<{ id: string; name?: string }>(`/${ctx.catalogId}`, { fields: "id,name" }),
    ctx.graph.get<{ id: string; name?: string; product_catalog?: { id: string }; product_count?: number }>(`/${spec.productSetId}`, { fields: "id,name,product_catalog,product_count" }),
  ]);
  if (catalog.id !== ctx.catalogId || set.id !== spec.productSetId || set.product_catalog?.id !== ctx.catalogId) {
    throw new Error("סט המוצרים אינו שייך לקטלוג המחובר של העסק. בחרו סט מתוך הקטלוג הזה.");
  }
  // A readable set can still be empty. Never assume unknown count means products exist.
  if (set.product_count != null && Number(set.product_count) <= 0) throw new Error("סט המוצרים ריק. צריך לבחור סט שיש בו מוצרים.");
  if (set.product_count == null) {
    const products = await ctx.graph.get<{ data?: { id: string }[] }>(`/${set.id}/products`, { fields: "id", limit: 1 });
    if (!products.data?.length) throw new Error("סט המוצרים ריק. צריך לבחור סט שיש בו מוצרים.");
  }
  return { ...spec, catalogName: catalog.name ?? ctx.catalogName ?? "הקטלוג המחובר", productSetName: set.name ?? "סט המוצרים שנבחר" };
}

/** Short discovery list; the caller keeps errors separate from other campaign assets. */
export async function catalogContext(ctx: MetaContext) {
  if (!ctx.catalogId) return { status: "empty" as const, reason: "לא נבחר קטלוג לעסק" };
  const [catalog, sets] = await Promise.all([
    ctx.graph.get<{ id: string; name?: string }>(`/${ctx.catalogId}`, { fields: "id,name" }),
    ctx.graph.get<{ data?: { id: string; name?: string; product_count?: number }[]; paging?: { next?: string } }>(`/${ctx.catalogId}/product_sets`, { fields: "id,name,product_count", limit: 20 }),
  ]);
  return { status: "ok" as const, id: catalog.id, name: catalog.name ?? ctx.catalogName, productSets: sets.data ?? [], more: !!sets.paging?.next };
}
