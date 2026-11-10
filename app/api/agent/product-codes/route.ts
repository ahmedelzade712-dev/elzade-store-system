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

// Code rows are maintained only by the atomic catalog-write endpoint.
// Never allow a second nontransactional write path for the same catalog entries.
export async function POST() {
  return NextResponse.json({ok:false,error:"USE_CATALOG_WRITE"},{status:405});
}
export async function PATCH() {
  return NextResponse.json({ok:false,error:"USE_CATALOG_WRITE"},{status:405});
}
