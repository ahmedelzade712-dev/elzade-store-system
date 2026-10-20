import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadState, publishOne, summarize } from "@/lib/integrations/easyorders/adoraCatalogSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resp = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

async function admin(request: Request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  return !profileError && profile?.role === "admin" && profile.is_active === true;
}
async function keyFor(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") return { error: resp({ ok: false, message: "Preview فقط؛ لم نغيّر نسخة Production." }, 404) };
  if (!(await admin(request))) return { error: resp({ ok: false, message: "يجب تسجيل الدخول بحساب مدير ERP." }, 403) };
  const key = process.env.EASYORDERS_API_KEY?.trim();
  if (!key) return { error: resp({ ok: false, message: "مفتاح EasyOrders غير متاح." }, 503) };
  return { key };
}
function safeError(e: unknown) {
  const text = e instanceof Error ? e.message : "";
  if (/categor|category|بيجامة ستان|فئة/i.test(text))
    return "تعذر التحقق من قسم «بيجامة ستان». تأكد أنه موجود وأن مفتاح EasyOrders يمتلك صلاحية قراءة الأقسام.";
  if (/GET failed \(403\)|GET failed \(401\)/.test(text))
    return "صلاحية قراءة منتجات EasyOrders أو الأقسام غير مفعّلة على المفتاح.";
  return "تعذر فحص كتالوج Adora في ERP وEasyOrders. لم ننقل أي منتج جديد.";
}

export async function GET(request: Request) {
  const auth = await keyFor(request);
  if (auth.error) return auth.error;
  try {
    const state = await loadState(auth.key!);
    const rows = summarize(state);
    return resp({
      ok: true, mode: "read_only", category: { id: state.category_id, name: state.category_name, slug: state.category_slug },
      summary: {
        approved: rows.length, variants: state.products.reduce((n, p) => n + p.sizes.length, 0),
        ready_to_create: rows.filter(r => r.status === "new").length,
        already_exists: rows.filter(r => r.status === "exists").length,
        blocked: rows.filter(r => ["conflict", "invalid"].includes(r.status)).length,
        others_in_erp: state.unapproved_count,
        remote_total: state.remote.length,
      },
      products: rows,
      message: "فحص للقراءة فقط. لا توجد أي عملية إنشاء أو تعديل.",
    });
  } catch (e) {
    console.error("Adora category scan", e instanceof Error ? e.message : "unknown");
    return resp({ ok: false, message: safeError(e) }, 502);
  }
}

export async function POST(request: Request) {
  const auth = await keyFor(request);
  if (auth.error) return auth.error;
  let body: { product_id?: unknown; category_id?: unknown; confirmation?: unknown };
  try { body = await request.json(); } catch {
    return resp({ ok: false, message: "طلب غير صالح." }, 400);
  }
  const id = typeof body.product_id === "string" ? body.product_id : "";
  const categoryId = typeof body.category_id === "string" ? body.category_id : "";
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^[a-zA-Z0-9_-]{8,128}$/.test(categoryId) ||
    body.confirmation !== "SYNC_APPROVED_ADORA_PYJAMAS") {
    return resp({ ok: false, message: "المنتج أو القسم أو التأكيد غير صالح." }, 400);
  }
  try {
    const outcome = await publishOne(auth.key!, id, categoryId);
    const okay = ["created", "already_linked", "category_linked"].includes(outcome.status);
    return resp({ ok: okay, result: outcome }, okay ? 200 : 409);
  } catch (e) {
    console.error("Adora sync product", e instanceof Error ? e.message : "unknown");
    return resp({
      ok: false, result: {
        product_id: id, status: "unknown_remote_state",
        message: safeError(e) + " تحقق من المنتج داخل EasyOrders قبل إعادة محاولة المزامنة.",
      },
    }, 502);
  }
}
