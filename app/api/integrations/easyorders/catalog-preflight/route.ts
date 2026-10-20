import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adora only: never scan or alter products belonging to other ERP stores.
const ADORA_STORE_ID = "b48d492c-e577-4d5e-9192-6bdb53f82066";
const PRODUCTS_URL = "https://api.easy-orders.net/api/v1/external-apps/products";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type ErpProduct = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  main_image_url: string | null;
  default_sale_price: number | null;
  is_active: boolean | null;
};
type ErpVariant = {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  sale_price: number | null;
  stock_quantity: number | null;
  is_active: boolean | null;
};
type RemoteProduct = { id?: unknown; sku?: unknown; taager_code?: unknown; name?: unknown };

function respond(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function requireAdmin(request: Request): Promise<boolean> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return false;

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return false;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_active === true && profile.role === "admin";
}

function extractProducts(body: unknown): RemoteProduct[] | null {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;

  for (const candidate of [
    root.data,
    root.products,
    root.items,
    root.results,
    (root.data && typeof root.data === "object" && !Array.isArray(root.data))
      ? (root.data as Record<string, unknown>).data
      : null,
    (root.data && typeof root.data === "object" && !Array.isArray(root.data))
      ? (root.data as Record<string, unknown>).products
      : null,
  ]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

function nonBlank(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function loadEasyOrdersProducts(apiKey: string) {
  const products: RemoteProduct[] = [];
  let complete = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(PRODUCTS_URL);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("fields", "id,name,sku,taager_code");

    const response = await fetch(url, {
      method: "GET",
      headers: { "Api-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) throw new Error(`EasyOrders read returned status ${response.status}`);
    const body: unknown = await response.json();
    const pageItems = extractProducts(body);

    if (!pageItems) throw new Error("EasyOrders returned an unrecognized product list format");
    products.push(...pageItems);

    if (pageItems.length < PAGE_SIZE) {
      complete = true;
      break;
    }
  }

  return { products, complete };
}

/** Preview-only, read-only catalog audit. It does not create, update or approve products. */
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return respond({ ok: false, message: "متاح لبيئة المعاينة فقط." }, 404);
  }

  try {
    if (!(await requireAdmin(request))) {
      return respond({ ok: false, message: "هذه الصفحة متاحة لمدير ERP فقط." }, 403);
    }

    const apiKey = process.env.EASYORDERS_API_KEY?.trim();
    if (!apiKey) {
      return respond({ ok: false, message: "مفتاح EasyOrders غير موجود في Preview." }, 503);
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id,name,sku,product_type,main_image_url,default_sale_price,is_active")
      .eq("store_id", ADORA_STORE_ID)
      .order("name");

    if (productsError) throw new Error("Unable to read Adora ERP products");

    const productRows = (products || []) as ErpProduct[];
    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id,product_id,size,color,sale_price,stock_quantity,is_active")
      .eq("store_id", ADORA_STORE_ID);

    if (variantsError) throw new Error("Unable to read Adora ERP variants");

    const variantRows = (variants || []) as ErpVariant[];
    const easyOrders = await loadEasyOrdersProducts(apiKey);

    const remoteByCode = new Map<string, RemoteProduct[]>();
    for (const item of easyOrders.products) {
      for (const code of new Set([nonBlank(item.sku), nonBlank(item.taager_code)].filter(Boolean))) {
        remoteByCode.set(code, [...(remoteByCode.get(code) || []), item]);
      }
    }

    const skuCounts = new Map<string, number>();
    for (const item of productRows) {
      const sku = nonBlank(item.sku);
      if (sku) skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
    }

    const rows = productRows.map((product) => {
      const sizes = variantRows.filter((variant) => variant.product_id === product.id);
      const sku = nonBlank(product.sku);
      const matches = sku ? [...new Map(
        (remoteByCode.get(sku) || []).map(item => [String(item.id ?? item.sku ?? item.taager_code), item])
      ).values()] : [];
      const colors = [...new Set(sizes.map(item => nonBlank(item.color)).filter(Boolean))];
      const issues: string[] = [];

      if (!sku) issues.push("SKU مفقود");
      else if ((skuCounts.get(sku) || 0) !== 1) issues.push("SKU مكرر داخل ERP");
      if (!nonBlank(product.main_image_url)) issues.push("الصورة الرئيسية مفقودة");
      if (sizes.length === 0) issues.push("لا توجد مقاسات");
      if (colors.length !== 1) issues.push("يجب أن يكون للمنتج لون داخلي واحد");
      if (sizes.some(item => !nonBlank(item.size))) issues.push("يوجد مقاس بلا اسم");
      if (new Set(sizes.map(item => nonBlank(item.size))).size !== sizes.length) {
        issues.push("مقاس مكرر");
      }
      if (sizes.some(item => Number(item.stock_quantity) < 0 || item.stock_quantity === null)) {
        issues.push("كمية مخزون غير صالحة");
      }
      if (product.default_sale_price === null || Number(product.default_sale_price) < 0) {
        issues.push("سعر المنتج غير صالح");
      }
      if (sizes.some(item => Number(item.sale_price) !== Number(product.default_sale_price))) {
        issues.push("سعر المقاسات يختلف عن السعر الأساسي");
      }
      if (matches.length > 1) issues.push("أكثر من منتج بنفس SKU في EasyOrders");
      if (product.is_active === false) issues.push("المنتج موقوف في ERP");

      const ready = issues.length === 0;
      return {
        product_id: product.id,
        erp_name: product.name,
        sku,
        image_url: product.main_image_url,
        color: colors.length === 1 ? colors[0] : null,
        price: product.default_sale_price,
        sizes: sizes.map(item => ({
          variant_id: item.id,
          size: item.size,
          quantity: item.stock_quantity,
          active: item.is_active !== false,
        })),
        issues,
        ready,
        easyorders_matches: matches.length,
        easyorders_product_id: matches.length === 1 ? String(matches[0].id ?? "") : null,
        next_action: !ready
          ? "fix_erp_data"
          : matches.length === 1
            ? "review_existing_mapping"
            : easyOrders.complete
              ? "requires_ai_review_before_create"
              : "remote_catalog_incomplete",
      };
    });

    return respond({
      ok: true,
      mode: "read_only_preview",
      summary: {
        erp_products: rows.length,
        erp_variants: variantRows.length,
        ready: rows.filter(item => item.ready).length,
        issues: rows.filter(item => !item.ready).length,
        remote_products_scanned: easyOrders.products.length,
        remote_scan_complete: easyOrders.complete,
        remote_sku_matches: rows.filter(item => item.easyorders_matches === 1).length,
      },
      products: rows,
      message: "فحص قراءة فقط: لم يتم إنشاء أو تعديل أي منتج.",
    });
  } catch (error) {
    console.error("Adora EasyOrders catalog preflight:", error instanceof Error ? error.message : "unknown error");
    return respond({
      ok: false,
      message: "تعذر إكمال فحص الكتالوج. راجع سجلات المعاينة أو إعدادات API.",
    }, 502);
  }
}
