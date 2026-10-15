import OpenAI from "openai";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADORA_STORE_ID = "b48d492c-e577-4d5e-9192-6bdb53f82066";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function requireAdmin(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return false;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  return !profileError && profile?.is_active === true && profile?.role === "admin";
}

type Draft = { title: string; color_name: string; description: string; visible_details: string[] };

function parseDraft(raw: string): Draft {
  const clean = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  const data = JSON.parse(clean) as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const color_name = typeof data.color_name === "string" ? data.color_name.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const visible_details = Array.isArray(data.visible_details)
    ? data.visible_details.filter((x): x is string => typeof x === "string").slice(0, 6)
    : [];

  if (!title || !color_name || !description || title.length > 120 || color_name.length > 50 || description.length > 750) {
    throw new Error("Model returned an invalid title, color or description");
  }
  return { title, color_name, description, visible_details };
}

/**
 * Admin-only Preview endpoint: generate a storefront copy suggestion based on
 * the ERP product's photo. No DB writes or EasyOrders write requests.
 */
export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return reply({ ok: false, message: "اقتراح أسماء المنتجات متاح في Preview فقط." }, 404);
  }

  if (!(await requireAdmin(request))) {
    return reply({ ok: false, message: "يجب تسجيل الدخول بحساب مدير ERP." }, 403);
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return reply({ ok: false, message: "مفتاح OpenAI غير متاح على نسخة المعاينة الحالية. أعد نشر Preview." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, message: "الطلب غير صالح." }, 400);
  }

  const id = typeof body.product_id === "string" ? body.product_id : "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    return reply({ ok: false, message: "معرف المنتج غير صالح." }, 400);
  }

  try {
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id,store_id,product_type,fabric,main_image_url")
      .eq("id", id)
      .eq("store_id", ADORA_STORE_ID)
      .maybeSingle();

    if (productError || !product) {
      return reply({ ok: false, message: "لم يُعثر على المنتج في Adora." }, 404);
    }

    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("color")
      .eq("store_id", ADORA_STORE_ID)
      .eq("product_id", id);

    if (variantsError) {
      return reply({ ok: false, message: "تعذر قراءة لون المنتج." }, 500);
    }

    const colors = Array.from(new Set((variants || []).map(v => String(v.color || "").trim()).filter(Boolean)));
    if (colors.length !== 1) {
      return reply({ ok: false, message: "يجب أن يكون للمنتج لون واحد معروف." }, 422);
    }

    const imageUrl = String(product.main_image_url || "").trim();
    const supabaseBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    // Only images already published in this ERP's product-images bucket are sent to AI.
    if (!supabaseBase || !imageUrl.startsWith(supabaseBase + "/storage/v1/object/public/product-images/")) {
      return reply({ ok: false, message: "رابط الصورة ليس صورة عامة معتمدة من مخزن منتجات ERP." }, 422);
    }

    const prompt = [
      "أنت محرر كتالوج متجر Adora للبيجامات النسائية. شاهد الصورة المحددة بعناية واكتب اسمًا ووصفًا عربيين للمتجر.",
      "القواعد الملزمة:",
      "1. الاسم التجاري: بيجامة ستان + النقشة أو السمة المرئية الواضحة (إن ظهرت) + درجة اللون، مفصول بشرطة طويلة. مثال شكلي: بيجامة ستان بنقشة قلوب – وردي بودري.",
      "2. درجة اللون يجب أن تكون أنيقة ولكن واقعية ومطابقة للصورة. لون ERP الأساسي: " + colors[0] + ".",
      "3. لا تخترع رسومات أو أزرارًا أو خامات أو تفاصيل لا تراها. إذا الصورة غير واضحة قلل الوصف ولا تتكهن.",
      "4. الخامة المسجلة: " + String(product.fabric || "ستان بوليستر") + ". لا تقل حرير طبيعي ولا تعد بفوائد غير مؤكدة.",
      "5. تجاهل أي خلفية أو أكسسوارات أو حقائب؛ ركّز على الملابس.",
      "6. لا تذكر أسماء علامات تجارية أو مصممين أو تشير إلى أصالة علامة، حتى إن كانت مطبوعة على القماش.",
      "7. لا تغير أسماء ERP الداخلية، ولا تستخدمها لصناعة الاسم. لا تضف الأسعار أو المقاسات أو المخزون أو عروضًا ترويجية.",
      "8. الوصف جملتان قصيرتان، أنيقتان وواقعيتان بدون تفاصيل مفترضة.",
      "9. أعد JSON صالحًا فقط بالمفاتيح: title، color_name، description، visible_details (مصفوفة قصيرة بما رأيته فعلًا).",
    ].join("\n");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-4o",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl, detail: "high" },
        ],
      }],
      text: { format: { type: "json_object" } },
      max_output_tokens: 500,
    });

    const draft = parseDraft(response.output_text || "");
    return reply({
      ok: true,
      product_id: id,
      draft,
      message: "الاسم والوصف مقترحان للمراجعة فقط. لم يتم نشر أي بيانات.",
    });
  } catch (error) {
    console.error("EasyOrders product suggestion:", error instanceof Error ? error.message : "unexpected error");
    return reply({
      ok: false,
      message: "تعذر تحليل صورة المنتج. تأكد من إمكانية عرض الصورة ومن توفر رصيد OpenAI ثم أعد المحاولة.",
    }, 502);
  }
}
