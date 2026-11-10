import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Profile = { id: string; role: string; store_id: string | null; is_active: boolean };

async function requireUser(request: Request, adminOnly = false): Promise<Profile> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error("UNAUTHORIZED");
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles").select("id,role,store_id,is_active").eq("id", user.id).single();
  if (profileError || !profile || !profile.is_active) throw new Error("UNAUTHORIZED");
  if (adminOnly && profile.role !== "admin") throw new Error("FORBIDDEN");
  return profile as Profile;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "حدث خطأ غير معروف";
  const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403
    : /^(بيانات|الكود|التصميم|المنتج|البراند|اللون|لا يمكن|يجب)/.test(message) ? 400 : 500;
  const safeMessage = status === 500 ? "تعذر حفظ البيانات، راجع السجل أو تواصل مع المسؤول" : message;
  console.error("Agent codes API:", error);
  return NextResponse.json({ ok: false, error: safeMessage }, { status });
}

function nextDesignCode(codes: string[], design: string): string {
  const used = new Set(codes);
  for (let i = 1; i <= 999999; i++) {
    const candidate = design + String(i).padStart(2, "0");
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("لا توجد أكواد متاحة لهذا التصميم");
}

export async function GET(request: Request) {
  try {
    const profile = await requireUser(request);
    const designQuery = new URL(request.url).searchParams.get("next_design")?.trim().toUpperCase();
    if (designQuery) {
      if (!/^[A-Z]$/.test(designQuery)) throw new Error("التصميم يجب أن يكون حرفًا إنجليزيًا واحدًا");
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("agent_product_codes").select("code,brand_name")
        .eq("design_code", designQuery).order("code").limit(10000);
      if (existingError) throw existingError;
      return NextResponse.json({
        ok: true, suggested_code: nextDesignCode((existing || []).map(row => row.code), designQuery),
        existing_brand: existing?.[0]?.brand_name || null,
      });
    }
    const { data: allStores, error: storesError } = await supabaseAdmin
      .from("stores").select("id,name").order("name");
    if (storesError) throw storesError;
    const stores = profile.role === "admin"
      ? (allStores || [])
      : (allStores || []).filter(store => store.id === profile.store_id);
    let query = supabaseAdmin.from("products")
      .select("id,store_id,name,sku,product_type,main_image_url,is_active")
      .order("name").limit(2000);
    if (profile.role !== "admin") {
      if (!profile.store_id) throw new Error("FORBIDDEN");
      query = query.eq("store_id", profile.store_id);
    }
    const { data: products, error: productsError } = await query;
    if (productsError) throw productsError;
    const ids = (products || []).map((p) => p.id as string);
    if (ids.length === 0) return NextResponse.json({ ok: true, stores, products: [], codes: [] });

    const [{ data: variants, error: variantsError }, { data: codes, error: codesError }] =
      await Promise.all([
        supabaseAdmin.from("product_variants")
          .select("product_id,color").in("product_id", ids).limit(10000),
        supabaseAdmin.from("agent_product_codes")
          .select("id,code,design_code,brand_name,color_name,product_id,is_active,created_at,updated_at")
          .in("product_id", ids).order("code"),
      ]);
    if (variantsError) throw variantsError;
    if (codesError) throw codesError;
    const colorMap = new Map<string, Set<string>>();
    for (const variant of variants || []) {
      const color = String(variant.color || "").trim();
      if (!colorMap.has(variant.product_id)) colorMap.set(variant.product_id, new Set());
      if (color) colorMap.get(variant.product_id)!.add(color);
    }
    return NextResponse.json({
      ok: true,
      stores,
      products: (products || []).map((p) => ({
        ...p, colors: [...(colorMap.get(p.id) || new Set())],
      })),
      codes: codes || [],
    });
  } catch (error) { return errorResponse(error); }
}

async function save(request: Request, update: boolean) {
  try {
    await requireUser(request, true);
    const body = await request.json();
    const id = String(body.id || "").trim();
    let code = String(body.code || "").trim().toUpperCase();
    const autoCode = !update && body.auto_code === true;
    const designCode = String(body.design_code || "").trim().toUpperCase();
    const brandName = String(body.brand_name || "").trim();
    const colorName = String(body.color_name || "").trim();
    const productId = String(body.product_id || "").trim();
    const isActive = body.is_active !== false;
    if (update && !id) throw new Error("بيانات السجل غير مكتملة");
    if (autoCode) {
      if (!/^[A-Z]$/.test(designCode)) throw new Error("التصميم يجب أن يكون حرفًا واحدًا");
    } else if (!/^[A-Z][0-9]{2,}$/.test(code)) {
      throw new Error("الكود يجب أن يكون مثل D01 أو R02");
    }
    if (!/^[A-Z]$/.test(designCode) || (!autoCode && code[0] !== designCode)) {
      throw new Error("التصميم يجب أن يطابق الحرف الأول في الكود");
    }
    if (!brandName || !colorName || !productId) throw new Error("بيانات البراند واللون والمنتج مطلوبة");

    const { data: product, error: productError } = await supabaseAdmin
      .from("products").select("id,store_id,product_type").eq("id", productId).single();
    if (productError || !product) throw new Error("المنتج غير موجود في ERP");
    if (product.product_type !== "بيجامة") throw new Error("المنتج المختار ليس بيجامة");

    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants").select("color,store_id").eq("product_id", productId);
    if (variantsError) throw variantsError;
    const colors = [...new Set((variants || []).map(v => String(v.color || "").trim()).filter(Boolean))];
    if (colors.length !== 1) throw new Error("المنتج يجب أن يحتوي على لون واحد فقط في المخزون");
    if (colors[0] !== colorName) throw new Error("اللون يجب أن يطابق لون المنتج في المخزون");
    if ((variants || []).some(v => v.store_id !== product.store_id)) {
      throw new Error("المنتج ومقاساته ليست في المخزن نفسه");
    }

    const { data: sameDesign, error: designError } = await supabaseAdmin
      .from("agent_product_codes").select("id,brand_name").eq("design_code", designCode);
    if (designError) throw designError;
    if ((sameDesign || []).some(row =>
      row.id !== id && row.brand_name.trim().toLocaleLowerCase() !== brandName.toLocaleLowerCase())) {
      throw new Error("التصميم مستخدم بالفعل مع براند مختلف");
    }
    const { data: sameColor, error: colorError } = await supabaseAdmin
      .from("agent_product_codes")
      .select("id,color_name,product_id").eq("design_code", designCode);
    if (colorError) throw colorError;
    if ((sameColor || []).some(row =>
      row.id !== id && row.color_name.trim().toLocaleLowerCase() === colorName.toLocaleLowerCase()
    )) throw new Error("هذا اللون مسجل بالفعل للتصميم نفسه");

    if (autoCode) {
      // The unique code index is the final concurrency guard. Retry after a collision.
      for (let attempt = 0; attempt < 8; attempt++) {
        const { data: used, error: usedError } = await supabaseAdmin
          .from("agent_product_codes").select("code")
          .eq("design_code", designCode).limit(10000);
        if (usedError) throw usedError;
        code = nextDesignCode((used || []).map(row => row.code), designCode);
        const { data, error } = await supabaseAdmin.from("agent_product_codes").insert({
          code, design_code: designCode, brand_name: brandName,
          color_name: colorName, product_id: productId, is_active: isActive,
        }).select("id,code").single();
        if (!error) return NextResponse.json({ ok: true, code: data });
        if (error.code !== "23505") throw error;
        // A different constraint might have failed: check for an existing code on this product.
        const { data: linked, error: linkedError } = await supabaseAdmin
          .from("agent_product_codes").select("code").eq("product_id", productId).maybeSingle();
        if (linkedError) throw linkedError;
        if (linked) throw new Error("المنتج مرتبط بالفعل بالكود " + linked.code);
      }
      throw new Error("تعذر تخصيص رقم للكود بسبب طلبات متزامنة، أعد المحاولة");
    }
    const payload = {
      code, design_code: designCode, brand_name: brandName,
      color_name: colorName, product_id: productId, is_active: isActive,
    };
    const query = update
      ? supabaseAdmin.from("agent_product_codes").update(payload).eq("id", id)
      : supabaseAdmin.from("agent_product_codes").insert(payload);
    const { data, error } = await query.select("id,code").single();
    if (error?.code === "23505") throw new Error("الكود مستخدم أو المنتج مرتبط بكود آخر");
    if (error) throw error;
    return NextResponse.json({ ok: true, code: data });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) { return save(request, false); }
export async function PATCH(request: Request) { return save(request, true); }
