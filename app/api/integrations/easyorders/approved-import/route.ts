import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import approvals from "@/lib/integrations/easyorders/adora-approved-titles.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADORA_ID = "b48d492c-e577-4d5e-9192-6bdb53f82066";

function reply(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") return reply({ ok: false, message: "Preview only" }, 404);
  const bearer = request.headers.get("authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
  if (!token) return reply({ ok: false, message: "يرجى تسجيل الدخول." }, 401);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return reply({ ok: false, message: "غير مصرح." }, 403);
  const { data: profile } = await supabaseAdmin.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" || profile?.is_active !== true)
    return reply({ ok: false, message: "صلاحية المدير مطلوبة." }, 403);

  try {
    const approved = approvals.approved_products;
    if (approved.length !== 24 || new Set(approved.map(p => p.erp_product_id)).size !== approved.length)
      return reply({ ok: false, message: "ملف الموافقات غير صالح." }, 422);

    const ids = approved.map(p => p.erp_product_id);
    const { data: products, error: productError } = await supabaseAdmin
      .from("products")
      .select("id,name,sku,main_image_url,default_sale_price,is_active,description")
      .eq("store_id", ADORA_ID).in("id", ids);

    if (productError) throw productError;
    const { data: variants, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .select("id,product_id,color,size,stock_quantity,sale_price,is_active")
      .eq("store_id", ADORA_ID).in("product_id", ids);
    if (variantError) throw variantError;

    const byId = new Map((products || []).map(p => [p.id, p]));
    const rows = approved.map(a => {
      const p = byId.get(a.erp_product_id);
      const sizes = (variants || []).filter(v => v.product_id === a.erp_product_id);
      const issues: string[] = [];
      if (!p) issues.push("المنتج غير موجود في ERP");
      if (p?.is_active === false) issues.push("المنتج موقوف");
      if (!p?.main_image_url) issues.push("الصورة مفقودة");
      if (!p?.sku) issues.push("SKU مفقود");
      if (p?.default_sale_price == null || Number(p.default_sale_price) <= 0) issues.push("سعر غير صالح");
      if (!sizes.length) issues.push("لا توجد مقاسات");
      if (new Set(sizes.map(v => v.size)).size !== sizes.length) issues.push("مقاسات مكررة");
      if (new Set(sizes.map(v => v.color)).size !== 1) issues.push("ألوان غير متطابقة");
      if (sizes.some(v => !v.size || v.stock_quantity == null || Number(v.stock_quantity) < 0)) issues.push("كمية أو مقاس غير صالح");
      if (sizes.some(v => Number(v.sale_price) !== Number(p?.default_sale_price))) issues.push("سعر المقاس يختلف");
      return {
        erp_product_id: a.erp_product_id,
        approved_title: a.display_title,
        erp_name: p?.name || null,
        sku: p?.sku || null,
        image_url: p?.main_image_url || null,
        price: p?.default_sale_price ?? null,
        description_preserved: Boolean(p?.description),
        variants: sizes.map(v => ({ size: v.size, color: v.color, stock: v.stock_quantity, active: v.is_active !== false })),
        ready: issues.length === 0,
        issues,
      };
    });
    return reply({ ok: true, mode: "pre_publish_read_only", approved: rows.length, ready: rows.filter(r => r.ready).length, rows,
      message: "تم ربط موافقات الأسماء بمنتجات ERP. لم تُنشأ منتجات في EasyOrders." });
  } catch (error) {
    console.error("Adora title import audit", error instanceof Error ? error.message : "unknown");
    return reply({ ok: false, message: "تعذر مطابقة ملف الموافقات مع قاعدة ERP." }, 500);
  }
}
