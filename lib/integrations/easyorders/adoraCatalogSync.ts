import approvedData from "@/lib/integrations/easyorders/adora-approved-titles.json";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const ADORA_STORE_ID = "b48d492c-e577-4d5e-9192-6bdb53f82066";
export const CATEGORY_NAME = "بيجامة ستان";
const PRODUCTS_API = "https://api.easy-orders.net/api/v1/external-apps/products";
const CATEGORIES_API = "https://api.easy-orders.net/api/v1/external-apps/categories";
const SIZE_ORDER: Record<string, number> = { M: 1, L: 2, XL: 3, "2XL": 4, "3XL": 5 };

type Dict = Record<string, unknown>;
type P = {
  id: string; name: string | null; sku: string | null; description: string | null;
  main_image_url: string | null; default_sale_price: number | null; is_active: boolean | null;
};
type V = {
  id: string; product_id: string; size: string | null; color: string | null;
  sale_price: number | null; stock_quantity: number | null; is_active: boolean | null;
};
export type Entry = {
  id: string; approved_title: string; sku: string; slug: string;
  price: number; description: string; image: string; sizes: V[]; issues: string[];
};
export type ReadState = {
  category_id: string; category_name: string; category_slug: string;
  products: Entry[]; remote: Dict[]; unapproved_count: number; category_count: number;
};
export type ProductOutcome = {
  product_id: string; title: string; status: string; message: string;
  remote_id?: string; remote_url?: string;
};

function obj(value: unknown): Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Dict : {};
}
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function arr(value: unknown): Dict[] | null {
  if (Array.isArray(value)) return value.filter(v => typeof v === "object" && v !== null && !Array.isArray(v));
  const x = obj(value), inner = obj(x.data);
  for (const v of [x.data, x.products, x.categories, x.items, x.results, inner.data, inner.products, inner.categories, inner.items]) {
    if (Array.isArray(v)) return v.filter(o => typeof o === "object" && o !== null && !Array.isArray(o));
  }
  return null;
}
function remoteId(p: Dict) { return str(p.id); }
function remoteSlug(p: Dict) { return str(p.slug); }
function productUrl(slug: string) { return "https://adora.ly/products/" + slug; }

async function apiGet(url: string, key: string) {
  const response = await fetch(url, {
    method: "GET", headers: { "Api-Key": key, Accept: "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("EasyOrders GET failed (" + response.status + ")");
  return response.json() as Promise<unknown>;
}

async function getList(url: string, key: string, maxPages = 15): Promise<Dict[]> {
  const all: Dict[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const next = new URL(url);
    next.searchParams.set("page", String(page));
    next.searchParams.set("limit", "100");
    const rows = arr(await apiGet(next.toString(), key));
    if (!rows) throw new Error("EasyOrders returned an unexpected list response");
    all.push(...rows);
    if (rows.length < 100) return all;
  }
  throw new Error("EasyOrders result pagination is incomplete; sync halted");
}

function flattenCategoryTree(categories: Dict[]): Dict[] {
  const result: Dict[] = [];
  const visit = (category: Dict, depth: number) => {
    if (depth > 12) return;
    result.push(category);
    if (Array.isArray(category.children)) {
      for (const child of category.children) if (Object.keys(obj(child)).length) visit(obj(child), depth + 1);
    }
  };
  for (const cat of categories) visit(cat, 0);
  return [...new Map(result.filter(x => remoteId(x)).map(x => [remoteId(x), x])).values()];
}

export async function loadState(key: string): Promise<ReadState> {
  const approved = approvedData.approved_products;
  const titles = new Map(approved.map(x => [x.erp_product_id, x.display_title]));
  if (approved.length !== 24 || titles.size !== approved.length) {
    throw new Error("The approved-title list is inconsistent");
  }
  const [{ data: products, error: productError }, { data: variants, error: variantError }, categories, remote] = await Promise.all([
    supabaseAdmin.from("products")
      .select("id,name,sku,description,main_image_url,default_sale_price,is_active")
      .eq("store_id", ADORA_STORE_ID),
    supabaseAdmin.from("product_variants")
      .select("id,product_id,size,color,sale_price,stock_quantity,is_active")
      .eq("store_id", ADORA_STORE_ID),
    getList(CATEGORIES_API, key),
    getList(PRODUCTS_API, key),
  ]);
  if (productError || variantError) throw new Error("Could not read Adora catalog from ERP");

  const allProducts = (products || []) as P[];
  const allVariants = (variants || []) as V[];
  const byId = new Map(allProducts.map(p => [p.id, p]));
  const categoriesExpanded = flattenCategoryTree(categories);
  const targets = categoriesExpanded.filter(c => str(c.name).normalize("NFC") === CATEGORY_NAME);
  if (targets.length !== 1) {
    throw new Error(targets.length
      ? "More than one category called 'بيجامة ستان' exists in EasyOrders"
      : "Category 'بيجامة ستان' not found in EasyOrders (or API access missing)");
  }
  const targetId = remoteId(targets[0]);
  if (!targetId) throw new Error("Target EasyOrders category has no ID");
  const skuCounts = new Map<string, number>();
  for (const p of allProducts) {
    const sku = str(p.sku);
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }

  const origin = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const entries: Entry[] = approved.map(a => {
    const p = byId.get(a.erp_product_id);
    const sizes = allVariants.filter(v => v.product_id === a.erp_product_id)
      .sort((x, y) => (SIZE_ORDER[str(x.size)] || 99) - (SIZE_ORDER[str(y.size)] || 99));
    const sku = str(p?.sku);
    const image = str(p?.main_image_url);
    const price = Number(p?.default_sale_price);
    const colorNames = new Set(sizes.map(s => str(s.color)).filter(Boolean));
    const errors: string[] = [];
    if (!p) errors.push("المنتج لم يعد موجودًا في ERP");
    if (p && p.is_active !== true) errors.push("المنتج غير نشط");
    if (!sku || skuCounts.get(sku) !== 1) errors.push("SKU مفقود أو مكرر");
    if (!origin || !image.startsWith(origin + "/storage/v1/object/public/product-images/"))
      errors.push("الصورة الرئيسية غير صالحة");
    if (!Number.isFinite(price) || price <= 0) errors.push("سعر البيع غير صالح");
    if (!sizes.length) errors.push("لا توجد مقاسات");
    if (colorNames.size !== 1) errors.push("المنتج يجب أن يحتوي على لون واحد");
    if (new Set(sizes.map(s => str(s.size))).size !== sizes.length) errors.push("مقاس مكرر");
    if (sizes.some(s => !str(s.size) || !Number.isInteger(Number(s.stock_quantity)) || Number(s.stock_quantity) < 0))
      errors.push("المقاسات أو المخزون غير صالح");
    if (sizes.some(s => Number(s.sale_price) !== price)) errors.push("سعر المقاسات يختلف عن السعر الأساسي");
    if (!str(a.display_title)) errors.push("اسم غير معتمد");
    return {
      id: a.erp_product_id, approved_title: a.display_title,
      sku, slug: "adora-" + a.erp_product_id, image, price,
      description: typeof p?.description === "string" ? p.description : "",
      sizes, issues: errors,
    };
  });
  return {
    category_id: targetId, category_name: CATEGORY_NAME,
    category_slug: str(targets[0].slug), category_count: categoriesExpanded.length,
    products: entries, remote,
    unapproved_count: allProducts.filter(p => !titles.has(p.id)).length,
  };
}

function identifyRemote(state: ReadState, entry: Entry): { kind: "new" | "exists" | "conflict"; product?: Dict } {
  const bySlug = state.remote.filter(p => remoteSlug(p) === entry.slug);
  const bySku = state.remote.filter(p => str(p.sku) === entry.sku || str(p.taager_code) === entry.sku);
  const combined = [...new Map([...bySlug, ...bySku].map((p, i) => [remoteId(p) || "missing-" + i, p])).values()];
  if (combined.length > 1) return { kind: "conflict" };
  if (combined.length === 1) {
    // Never treat an unrelated listing with a coincidentally matching SKU as ours.
    if (remoteSlug(combined[0]) !== entry.slug) return { kind: "conflict" };
    return { kind: "exists", product: combined[0] };
  }
  return { kind: "new" };
}

function categoryIds(product: Dict): string[] | null {
  const categories = product.categories ?? product.Categories;
  if (!Array.isArray(categories)) return null;
  return categories.map(x => str(obj(x).id)).filter(Boolean);
}

async function getRemoteProduct(key: string, id: string): Promise<Dict> {
  const response = obj(await apiGet(PRODUCTS_API + "/" + encodeURIComponent(id), key));
  const candidate = obj(response.data);
  return Object.keys(candidate).length ? candidate : Object.keys(obj(response.product)).length
    ? obj(response.product) : response;
}

export function summarize(state: ReadState) {
  return state.products.map(entry => {
    const found = identifyRemote(state, entry);
    const status = entry.issues.length ? "invalid"
      : found.kind === "conflict" ? "conflict"
      : found.kind === "exists" ? "exists"
      : "new";
    return {
      product_id: entry.id, title: entry.approved_title, sku: entry.sku,
      status, issues: entry.issues,
      url: found.kind === "exists" ? productUrl(entry.slug) : null,
    };
  });
}

async function verifyRemote(key: string, slug: string, sku: string): Promise<Dict | null> {
  const url = new URL(PRODUCTS_API);
  url.searchParams.set("filter", "slug||eq||" + slug);
  url.searchParams.set("limit", "100");
  const list = arr(await apiGet(url.toString(), key));
  if (!list) throw new Error("Unable to verify remote product safely");
  const matches = list.filter(p => remoteSlug(p) === slug);
  if (matches.length > 1) throw new Error("Duplicate product slugs in EasyOrders");
  if (matches.length === 1 && str(matches[0].sku) && str(matches[0].sku) !== sku) {
    throw new Error("Product slug and SKU conflict");
  }
  return matches[0] || null;
}

function payload(entry: Entry, categoryId: string) {
  const color = str(entry.sizes[0]?.color);
  return {
    name: entry.approved_title, price: entry.price, sale_price: 0,
    description: entry.description,
    slug: entry.slug, sku: entry.sku, taager_code: entry.sku,
    thumb: entry.image, images: [entry.image],
    categories: [{ id: categoryId }],
    quantity: entry.sizes.reduce((n, v) => n + (v.is_active === false ? 0 : Number(v.stock_quantity)), 0),
    track_stock: true, disable_orders_for_no_stock: true,
    variations: [{
      name: "المقاس", type: "buttons",
      props: entry.sizes.map(v => ({ name: str(v.size), value: str(v.size) })),
    }],
    variants: entry.sizes.map(v => ({
      price: entry.price, sale_price: 0,
      quantity: v.is_active === false ? 0 : Number(v.stock_quantity),
      taager_code: v.id,
      variation_props: [{ variation: "المقاس", variation_prop: str(v.size) }],
    })),
    // The product is a single ERP color; no extra color choices need creation.
    color_name_for_review: color,
  };
}

async function remoteWrite(key: string, method: "POST" | "PATCH", url: string, body: Dict) {
  const response = await fetch(url, {
    method, headers: { "Api-Key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body), cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let content: Dict = {};
  try { content = obj(JSON.parse(raw)); } catch { /* non-JSON response */ }
  return { ok: response.ok, status: response.status, content };
}

function createdId(result: Dict): string {
  return str(obj(result.data).id) || str(obj(result.product).id) || str(result.id);
}

export async function publishOne(key: string, productId: string, requestedCategory: string): Promise<ProductOutcome> {
  const state = await loadState(key);
  const entry = state.products.find(x => x.id === productId);
  if (!entry) throw new Error("This product has not received title approval");
  if (requestedCategory !== state.category_id) throw new Error("Category has changed; scan again first");
  const base = { product_id: entry.id, title: entry.approved_title };
  if (entry.issues.length) return { ...base, status: "invalid", message: entry.issues.join("، ") };
  const existing = identifyRemote(state, entry);
  if (existing.kind === "conflict") {
    return { ...base, status: "conflict", message: "تضارب SKU أو أكثر من منتج مطابق؛ لم يُرسل أي تعديل." };
  }

  if (existing.kind === "exists") {
    const id = remoteId(existing.product || {});
    if (!id) return { ...base, status: "conflict", message: "المنتج موجود لكن معرّفه غير متاح؛ توقفنا." };
    const remote = await getRemoteProduct(key, id);
    if (remoteSlug(remote) !== entry.slug) {
      return { ...base, status: "conflict", message: "تعذر مطابقة المنتج المنشور بأمان." };
    }
    const cats = categoryIds(remote);
    if (cats?.includes(state.category_id)) {
      return { ...base, status: "already_linked", message: "المنتج موجود في القسم الصحيح؛ لم يتم تكراره.", remote_id: id, remote_url: productUrl(entry.slug) };
    }
    if (!cats) {
      return { ...base, status: "needs_review", message: "تعذر قراءة أقسام المنتج الموجود. لن نغيّر بياناته أو صوره تلقائيًا.", remote_id: id };
    }

    // Only associate OUR deterministic-slug product; don't include images,
    // title, description, stock, price, or variants in this PATCH.
    const result = await remoteWrite(key, "PATCH", PRODUCTS_API + "/" + encodeURIComponent(id), {
      categories: [...new Set([...cats, state.category_id])].map(id => ({ id })),
    });
    if (!result.ok) {
      return { ...base, status: "category_update_rejected",
        message: "رفض EasyOrders إضافة المنتج الموجود للقسم (HTTP " + result.status + "). يحتاج مراجعة من لوحة المتجر." };
    }
    const verify = await getRemoteProduct(key, id);
    const check = categoryIds(verify);
    if (!check?.includes(state.category_id)) {
      return { ...base, status: "needs_review", message: "تلقى EasyOrders تعديل القسم، لكن لم يتم التحقق من حفظه؛ توقفنا." };
    }
    return { ...base, status: "category_linked", message: "تم ربط المنتج المنشور بالقسم دون تغيير الصور أو المخزون.", remote_id: id, remote_url: productUrl(entry.slug) };
  }

  // Recheck exact unique slug immediately before creation. If API can't
  // confirm absence, never send POST: retries must not create duplicates.
  if (await verifyRemote(key, entry.slug, entry.sku)) {
    return { ...base, status: "needs_review", message: "ظهر المنتج قبل الإنشاء؛ أعد الفحص بدل تكراره." };
  }
  const candidate = payload(entry, state.category_id);
  const { color_name_for_review: _color, ...clean } = candidate;
  void _color;
  const result = await remoteWrite(key, "POST", PRODUCTS_API, clean);
  if (!result.ok) {
    return { ...base, status: "create_rejected",
      message: "رفض EasyOrders إنشاء المنتج (HTTP " + result.status + "). تم إيقاف النشر." };
  }
  const responseId = createdId(result.content);
  // Never repeat POST for any ambiguous response. Some EasyOrders list
  // responses lag successful publication.
  let remote: Dict | null = null;
  if (responseId) {
    try { remote = await getRemoteProduct(key, responseId); } catch { /* eventual consistency */ }
  }
  if (!remote) {
    try { remote = await verifyRemote(key, entry.slug, entry.sku); } catch { /* fail safely */ }
  }
  if (!remote || remoteSlug(remote) !== entry.slug) {
    return { ...base, status: "created_unverified",
      message: "EasyOrders استجاب للإنشاء، لكن التحقق من ظهور المنتج أو قسمه لم يكتمل. توقفنا لمنع التكرار.",
      remote_id: responseId || undefined };
  }
  const categories = categoryIds(remote);
  if (!categories?.includes(state.category_id)) {
    return { ...base, status: "created_unverified",
      message: "تم إنشاء المنتج لكن ربطه بقسم بيجامة ستان لم يُؤكد. لا تعاود النشر.",
      remote_id: remoteId(remote) || responseId };
  }
  return { ...base, status: "created", message: "تم إنشاء المنتج وربطه بقسم بيجامة ستان.",
    remote_id: remoteId(remote), remote_url: productUrl(entry.slug) };
}
