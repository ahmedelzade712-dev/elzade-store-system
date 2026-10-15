import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import approvedTitles from "@/lib/integrations/easyorders/adora-approved-titles.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADORA_ID = "b48d492c-e577-4d5e-9192-6bdb53f82066";
const API_URL = "https://api.easy-orders.net/api/v1/external-apps/products";
const FIRST_ID = "ce8563f5-d387-449e-908a-1533be81322d";
const MAX_PAGES = 20;
const PAGE_SIZE = 100;
const SIZE_SORT: Record<string, number> = { M: 1, L: 2, XL: 3, "2XL": 4, "3XL": 5 };

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function requireAdmin(request: Request) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return false;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.role === "admin" && profile.is_active === true;
}

function getRemoteRows(body: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const nested = root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? root.data as Record<string, unknown> : {};
  for (const value of [root.data, root.products, root.items, root.results, nested.data, nested.products]) {
    if (Array.isArray(value)) return value as Record<string, unknown>[];
  }
  return null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function productSlug(id: string): string {
  // Deterministic and unique: prevents two parallel publish attempts from
  // successfully creating different storefront products for the same ERP id.
  return "adora-" + id;
}

async function remoteCatalog(apiKey: string) {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(API_URL);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(PAGE_SIZE));
    const res = await fetch(url, {
      headers: { "Api-Key": apiKey, Accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error("Could not verify existing EasyOrders catalog (" + res.status + ")");
    const records = getRemoteRows(await res.json());
    if (!records) throw new Error("Unexpected EasyOrders catalog response");
    rows.push(...records);
    if (records.length < PAGE_SIZE) return rows;
  }
  throw new Error("EasyOrders catalog is too large to verify safely");
}

type VariantRow = {
  id: string;
  color: string | null;
  size: string | null;
  stock_quantity: number | null;
  sale_price: number | null;
  is_active: boolean | null;
};

function unwrapOneProduct(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const root = value as Record<string, unknown>;
  if (root.data && typeof root.data === "object" && !Array.isArray(root.data))
    return root.data as Record<string, unknown>;
  if (root.product && typeof root.product === "object" && !Array.isArray(root.product))
    return root.product as Record<string, unknown>;
  return root;
}

async function run(request: Request, publish: boolean) {
  if (process.env.VERCEL_ENV !== "preview") {
    return reply({ ok: false, message: "متاح في Preview فقط." }, 404);
  }
  if (!(await requireAdmin(request))) {
    return reply({ ok: false, message: "حساب مدير ERP مطلوب." }, 403);
  }
  const apiKey = process.env.EASYORDERS_API_KEY?.trim();
  if (!apiKey) return reply({ ok: false, message: "مفتاح EasyOrders غير مهيأ." }, 503);

  if (publish) {
    let submitted: unknown;
    try { submitted = await request.json(); } catch { return reply({ ok: false, message: "طلب غير صالح." }, 400); }
    const body = submitted as { product_id?: unknown; confirmation?: unknown };
    if (body?.product_id !== FIRST_ID || body?.confirmation !== "PUBLISH_FIRST_ADORA") {
      return reply({ ok: false, message: "عملية النشر مقيدة بالمنتج الأول وموافقة المدير." }, 400);
    }
  }

  try {
    const approval = approvedTitles.approved_products.find(a => a.erp_product_id === FIRST_ID);
    if (!approval) return reply({ ok: false, message: "اسم المنتج الأول غير معتمد." }, 422);

    const { data: product, error: pError } = await supabaseAdmin
      .from("products")
      .select("id,store_id,sku,name,description,main_image_url,default_sale_price,is_active")
      .eq("store_id", ADORA_ID).eq("id", FIRST_ID).maybeSingle();
    if (pError || !product) return reply({ ok: false, message: "المنتج الأول غير موجود في ERP." }, 404);

    const { data: variantData, error: vError } = await supabaseAdmin
      .from("product_variants")
      .select("id,color,size,stock_quantity,sale_price,is_active")
      .eq("store_id", ADORA_ID).eq("product_id", FIRST_ID);
    if (vError) throw vError;

    const variants = (variantData || []) as VariantRow[];
    const sku = str(product.sku);
    const price = Number(product.default_sale_price);
    const image = str(product.main_image_url);
    const supabaseBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const colors = [...new Set(variants.map(v => str(v.color)).filter(Boolean))];
    const activeSizes = [...variants].sort((a, b) => (SIZE_SORT[str(a.size)] || 99) - (SIZE_SORT[str(b.size)] || 99));
    const issues: string[] = [];

    if (product.is_active !== true) issues.push("المنتج غير نشط");
    if (!sku) issues.push("SKU مفقود");
    if (!Number.isFinite(price) || price <= 0) issues.push("السعر غير صالح");
    if (!supabaseBase || !image.startsWith(supabaseBase + "/storage/v1/object/public/product-images/"))
      issues.push("رابط الصورة الرئيسية غير صالح");
    if (colors.length !== 1) issues.push("المنتج يجب أن يحتوي على لون واحد");
    if (variants.length === 0) issues.push("المقاسات مفقودة");
    if (new Set(variants.map(v => str(v.size))).size !== variants.length) issues.push("مقاسات مكررة");
    if (variants.some(v => !str(v.size) || !Number.isInteger(Number(v.stock_quantity)) || Number(v.stock_quantity) < 0))
      issues.push("كمية أو اسم مقاس غير صالح");
    if (variants.some(v => Number(v.sale_price) !== price)) issues.push("تفاوت بين سعر المنتج والمقاسات");

    if (issues.length) return reply({ ok: false, message: "بيانات المنتج غير مكتملة.", issues }, 422);

    const remote = await remoteCatalog(apiKey);
    const slug = productSlug(product.id);
    const matches = remote.filter(item =>
      str(item.sku) === sku || str(item.taager_code) === sku || str(item.slug) === slug
    );

    if (matches.length > 1) return reply({
      ok: false, message: "وجدنا أكثر من مطابقة للمنتج داخل EasyOrders. النشر متوقف لتجنب التكرار.",
      matches: matches.length,
    }, 409);

    if (matches.length === 1) {
      return reply({
        ok: true,
        status: "already_exists",
        message: "هذا المنتج موجود بالفعل في EasyOrders؛ لم ننشئ نسخة ثانية.",
        erp_product_id: FIRST_ID,
        easyorders_product_id: matches[0].id ?? null,
        sku,
        title: approval.display_title,
      });
    }

    const stocks = activeSizes.map(v => ({
      size: str(v.size),
      stock: v.is_active === false ? 0 : Number(v.stock_quantity),
      price: Number(v.sale_price),
      variant_erp_id: v.id,
    }));

    const preview = {
      name: approval.display_title,
      sku, slug, price,
      image_url: image,
      color: colors[0],
      sizes: stocks.map(v => ({ size: v.size, quantity: v.stock, price: v.price })),
      description_source: "ERP (unchanged)",
      count_remote_before: remote.length,
    };
    if (!publish) return reply({
      ok: true, status: "ready",
      message: "المنتج الأول جاهز للنشر. لم نعدّل أي بيانات بعد.",
      preview,
    });

    const payload = {
      name: approval.display_title,
      price,
      sale_price: 0,
      description: typeof product.description === "string" ? product.description : "",
      slug,
      sku,
      taager_code: sku,
      thumb: image,
      images: [image],
      quantity: stocks.reduce((n, v) => n + v.stock, 0),
      track_stock: true,
      disable_orders_for_no_stock: true,
      variations: [{
        name: "المقاس",
        type: "buttons",
        props: stocks.map(v => ({ name: v.size, value: v.size })),
      }],
      variants: stocks.map(v => ({
        price: v.price,
        sale_price: 0,
        quantity: v.stock,
        taager_code: v.variant_erp_id,
        variation_props: [{ variation: "المقاس", variation_prop: v.size }],
      })),
    };

    const result = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    // The response may be a validation error, never leak request/header secrets.
    if (!result.ok) {
      let fields: string[] = [];
      try {
        const errorBody = await result.json() as Record<string, unknown>;
        if (errorBody.errors && typeof errorBody.errors === "object") {
          fields = Object.keys(errorBody.errors as Record<string, unknown>).slice(0, 12);
        }
      } catch { /* unsupported response */ }
      return reply({
        ok: false,
        status: "remote_rejected",
        message: "رفض EasyOrders إنشاء المنتج. لم يتم تفعيل النشر الجماعي.",
        remote_status: result.status, invalid_fields: fields,
      }, 422);
    }

    const created = unwrapOneProduct(await result.json());
    // The response is not enough to guarantee variant persistence: verify
    // storefront readback before marking this product as fully published.
    const nowRemote = await remoteCatalog(apiKey);
    const persisted = nowRemote.find(item =>
      str(item.sku) === sku || str(item.taager_code) === sku || str(item.slug) === slug
    );
    return reply({
      ok: true,
      status: persisted ? "created_and_found" : "created_pending_readback",
      message: persisted
        ? "تم إنشاء المنتج الأول ووجدناه في EasyOrders. افحص مقاساته وصورته قبل نشر البقية."
        : "استجاب EasyOrders للإنشاء، لكن لم نتحقق من ظهوره في القراءة التالية. لا تعاود النشر قبل الفحص.",
      erp_product_id: FIRST_ID,
      easyorders_product_id: persisted?.id ?? created.id ?? null,
      sku, title: approval.display_title,
      verified_in_list: Boolean(persisted),
    });
  } catch (error) {
    console.error("Adora first-product publish", error instanceof Error ? error.message : "unknown error");
    return reply({
      ok: false,
      status: "unknown_remote_state",
      message: "تعذر التأكد من حالة النشر. لا تعاود الإرسال قبل فحص EasyOrders لمنع التكرار.",
    }, 502);
  }
}

export async function GET(request: Request) {
  return run(request, false);
}

export async function POST(request: Request) {
  return run(request, true);
}
