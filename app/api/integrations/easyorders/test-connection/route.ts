import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EASYORDERS_PRODUCTS_URL =
  "https://api.easy-orders.net/api/v1/external-apps/products";

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Read-only diagnostic, deliberately unavailable in production.
 *
 * The EasyOrders API key stays on the server. Only an authenticated, active
 * Elzade ERP administrator can trigger the request. No product data, API key,
 * or upstream response body is returned to the browser.
 */
export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return json({ ok: false, message: "اختبار الاتصال متاح في بيئة المعاينة فقط." }, 404);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return json({ ok: false, message: "يرجى تسجيل الدخول إلى ERP أولًا." }, 401);
  }

  try {
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return json({ ok: false, message: "جلسة الدخول غير صالحة." }, 401);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.is_active || profile.role !== "admin") {
      return json({ ok: false, message: "الاختبار متاح لمدير النظام فقط." }, 403);
    }

    const apiKey = process.env.EASYORDERS_API_KEY?.trim();

    if (!apiKey) {
      return json(
        {
          ok: false,
          message: "مفتاح EASYORDERS_API_KEY غير موجود في إعدادات معاينة Vercel.",
        },
        503
      );
    }

    try {
      const upstream = await fetch(EASYORDERS_PRODUCTS_URL, {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
          Accept: "application/json",
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });

      if (!upstream.ok) {
        const hint =
          upstream.status === 401 || upstream.status === 403
            ? "مفتاح EasyOrders غير صالح أو لا يملك صلاحية قراءة المنتجات."
            : "تعذر قراءة المنتجات من EasyOrders.";

        return json(
          { ok: false, message: hint, upstream_status: upstream.status },
          502
        );
      }

      const contentType = upstream.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("json")) {
        return json(
          { ok: false, message: "استجابة EasyOrders غير متوقعة (ليست JSON)." },
          502
        );
      }

      // Parse to verify the API returned JSON, but never reveal its content.
      try {
        await upstream.json();
      } catch {
        return json(
          { ok: false, message: "تعذر قراءة استجابة EasyOrders." },
          502
        );
      }

      return json(
        {
          ok: true,
          message: "نجح الاتصال بـ EasyOrders وتم التحقق من صلاحية قراءة المنتجات.",
          mode: "read_only",
        },
        200
      );
    } catch {
      return json(
        {
          ok: false,
          message: "تعذر الاتصال بـ EasyOrders. تحقق من الخدمة وحاول مجددًا.",
        },
        502
      );
    }
  } catch {
    return json(
      { ok: false, message: "تعذر تنفيذ اختبار الاتصال. راجع إعدادات ERP." },
      500
    );
  }
}
