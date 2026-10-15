import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PRODUCT_SLUG = "adora-ce8563f5-d387-449e-908a-1533be81322d";
const APPROVED_NAME = "بيجامة ستان بنقشة حروف – أحمر لامع";
const API = "https://api.easy-orders.net/api/v1/external-apps/products";

type R = Record<string, unknown>;

function respond(payload: R, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function isAdmin(request: Request): Promise<boolean> {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return false;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  return profile?.role === "admin" && profile.is_active === true;
}

function object(value: unknown): R {
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as R : {};
}

function list(value: unknown): R[] {
  if (Array.isArray(value)) return value.filter(x => !!x && typeof x === "object");
  const x = object(value);
  for (const p of [x.data, x.products, x.items, x.results, object(x.data).data, object(x.data).products]) {
    if (Array.isArray(p)) return p.filter(x => !!x && typeof x === "object");
  }
  return [];
}

function single(value: unknown): R {
  const root = object(value);
  const data = object(root.data);
  return Object.keys(data).length ? data : Object.keys(object(root.product)).length ? object(root.product) : root;
}

function sval(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function variationRows(p: R): R[] {
  return Array.isArray(p.variations) ? p.variations.map(object) :
    Array.isArray(p.Variations) ? p.Variations.map(object) : [];
}

function variantRows(p: R): R[] {
  return Array.isArray(p.variants) ? p.variants.map(object) :
    Array.isArray(p.Variants) ? p.Variants.map(object) : [];
}

async function remoteGet(key: string, url: URL) {
  return fetch(url, {
    method: "GET",
    headers: { "Api-Key": key, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
}

async function findProduct(key: string): Promise<R> {
  const url = new URL(API);
  url.searchParams.set("filter", "slug||eq||" + PRODUCT_SLUG);
  url.searchParams.set("join", "Variations.Props,Variants.VariationProps");
  url.searchParams.set("limit", "100");
  const res = await remoteGet(key, url);
  if (!res.ok) throw new Error("Failed to find storefront product");
  const rows = list(await res.json()).filter(x => sval(x.slug) === PRODUCT_SLUG);
  if (rows.length !== 1) throw new Error("Could not uniquely identify the approved product");

  const id = sval(rows[0].id);
  if (!id || !/^[a-zA-Z0-9-]{12,80}$/.test(id)) throw new Error("Invalid remote product id");

  const details = await remoteGet(key, new URL(API + "/" + encodeURIComponent(id)));
  if (!details.ok) throw new Error("Failed to load product details");
  const p = single(await details.json());
  if (sval(p.slug) !== PRODUCT_SLUG || sval(p.name) !== APPROVED_NAME) {
    throw new Error("Product mismatch: no changes were made");
  }
  return p;
}

function details(p: R) {
  const groups = variationRows(p);
  const sizeGroups = groups.filter(v => sval(v.name) === "المقاس");
  if (sizeGroups.length !== 1) throw new Error("Size variation not identified");
  const size = sizeGroups[0];
  const sizes = Array.isArray(size.props) ? size.props.map(object) : [];
  const variants = variantRows(p);
  return {
    id: sval(p.id), slug: sval(p.slug), name: sval(p.name),
    variationType: sval(size.type),
    sizeNames: sizes.map(x => sval(x.name)).filter(Boolean),
    sizeCount: sizes.length,
    variantCount: variants.length,
    images: Array.isArray(p.images) ? p.images.length : 0,
    protectedSnapshot: JSON.stringify({
      name: p.name, sku: p.sku, taager_code: p.taager_code, slug: p.slug,
      price: p.price, sale_price: p.sale_price, description: p.description,
      thumb: p.thumb, images: p.images, quantity: p.quantity,
      track_stock: p.track_stock, disable_orders_for_no_stock: p.disable_orders_for_no_stock,
      variants: variants.map(v => ({
        id: v.id, price: v.price, sale_price: v.sale_price, quantity: v.quantity,
        taager_code: v.taager_code, variation_props: v.variation_props,
      })),
    }),
    groups, size, variants,
  };
}

async function operation(request: Request, apply: boolean) {
  if (process.env.VERCEL_ENV !== "preview") {
    return respond({ ok: false, message: "متاح في Preview فقط." }, 404);
  }
  if (!(await isAdmin(request))) {
    return respond({ ok: false, message: "هذه العملية مخصصة لمدير ERP." }, 403);
  }
  const key = process.env.EASYORDERS_API_KEY?.trim();
  if (!key) return respond({ ok: false, message: "مفتاح EasyOrders غير مهيأ." }, 503);

  if (apply) {
    let body: R;
    try { body = object(await request.json()); }
    catch { return respond({ ok: false, message: "طلب غير صالح." }, 400); }
    if (body.confirmation !== "SET_SIZE_BUTTONS_ADORA") {
      return respond({ ok: false, message: "تأكيد المدير مطلوب." }, 400);
    }
  }

  try {
    const before = details(await findProduct(key));
    const summary = {
      name: before.name, sizes: before.sizeNames,
      variation_type: before.variationType,
      variant_count: before.variantCount, image_count: before.images,
      product_url: "https://adora.ly/products/" + PRODUCT_SLUG,
    };

    if (!apply || before.variationType === "buttons") {
      return respond({
        ok: true, status: before.variationType === "buttons" ? "already_buttons" : "ready",
        summary,
        message: before.variationType === "buttons"
          ? "المقاسات تظهر بالفعل كأزرار."
          : "تم التحقق من المنتج. يمكن الآن تغيير شكل المقاسات دون لمس السعر أو الصور.",
      });
    }

    if (before.variationType !== "dropdown" || before.sizeCount < 1 || before.variantCount < 1) {
      return respond({ ok: false, message: "نوع المقاس أو بيانات المقاسات غير متوقعة. لم يُجرَ أي تعديل." }, 422);
    }

    // Restrict the payload to the documented variation and prop fields.
    // Never echo read-only attributes from the GET response, and never send
    // price, quantity, images, descriptions, stock variants, or SKU.
    const variations = before.groups.map(v => ({
      id: sval(v.id),
      name: sval(v.name),
      product_id: sval(v.product_id) || before.id,
      type: sval(v.name) === "المقاس" ? "buttons" : sval(v.type),
      props: (Array.isArray(v.props) ? v.props.map(object) : []).map(p => ({
        id: sval(p.id),
        name: sval(p.name),
        variation_id: sval(p.variation_id) || sval(v.id),
        value: sval(p.value) || sval(p.name),
      })),
    }));
    if (variations.some(v => !v.id || !v.name || !v.type ||
      v.props.some(p => !p.id || !p.name || !p.value))) {
      return respond({ ok: false, status: "invalid_remote_variations",
        message: "حقول خيارات المقاس غير مكتملة؛ لم نرسل أي تعديل." }, 422);
    }

    const res = await fetch(API + "/" + encodeURIComponent(before.id), {
      method: "PATCH",
      headers: {
        "Api-Key": key, Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ variations }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(18000),
    });

    if (!res.ok) {
      // Report status and validation field names, not complete response bodies
      // (which can include private catalog data and must stay server-side).
      const rawError: unknown = await res.json().catch(() => null);
      const responseBody = object(rawError);
      const validationFields = Object.keys(object(responseBody.errors))
        .filter(k => /^[a-zA-Z0-9_.\\[\\]-]{1,100}$/.test(k)).slice(0, 12);
      const message = res.status === 401 || res.status === 403
        ? "مفتاح EasyOrders قد يفتقد صلاحية products:update. تحقق من صلاحياته."
        : res.status === 422 || res.status === 400
          ? "رفض EasyOrders صيغة تعديل المقاسات. راجع الحقول التي ذكرها API."
          : res.status === 405
            ? "طريقة تحديث المنتج غير مقبولة من EasyOrders."
            : "رفض EasyOrders تعديل شكل المقاسات.";
      return respond({
        ok: false, status: "api_rejected",
        http_status: res.status, validation_fields: validationFields,
        message: message + " لم نرسل حقولًا للأسعار أو المخزون أو الصور.",
      }, 422);
    }

    const after = details(await findProduct(key));
    if (after.variationType !== "buttons" ||
        after.variantCount !== before.variantCount ||
        after.sizeCount !== before.sizeCount ||
        after.images !== before.images ||
        after.protectedSnapshot !== before.protectedSnapshot) {
      return respond({
        ok: false, status: "review_required",
        message: "استجاب EasyOrders لكن نتيجة قراءة المقاسات أو الصور تحتاج مراجعة قبل أي خطوة أخرى.",
        before: summary,
        after: {
          variation_type: after.variationType,
          variant_count: after.variantCount,
          size_count: after.sizeCount,
          image_count: after.images,
        },
      }, 409);
    }

    return respond({
      ok: true, status: "updated_verified",
      message: "تم تحويل المقاسات إلى أزرار والتحقق من ثبات المقاسات والصور والسعر والمخزون والوصف.",
      summary: { ...summary, variation_type: "buttons" },
    });
  } catch (error) {
    console.error("EasyOrders size presentation verification:", error instanceof Error ? error.message : "unknown");
    return respond({
      ok: false, message: "تعذر فحص المنتج بشكل موثوق. لم نتابع التعديل.",
    }, 502);
  }
}

export async function GET(request: Request) { return operation(request, false); }
export async function POST(request: Request) { return operation(request, true); }
