import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function requireAdmin(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED");

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error("UNAUTHORIZED");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) throw new Error("UNAUTHORIZED");
  if (profile.role !== "admin") throw new Error("FORBIDDEN");

  return user;
}

function respondError(error: any) {
  const message = error?.message || "حدث خطأ غير معروف";
  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ ok: false, error: "غير مصرح بالدخول" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ ok: false, error: "هذه العملية للمدير فقط" }, { status: 403 });
  }
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const { data, error } = await supabaseAdmin
      .from("couriers")
      .select("id, name, sort_order, is_active, created_at, updated_at")
      .order("sort_order", { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, couriers: data || [] });
  } catch (error: any) {
    return respondError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const name = String(body?.name || "").trim();

    if (!name) throw new Error("اسم المندوب مطلوب");

    const { data: lastCourier, error: lastCourierError } = await supabaseAdmin
      .from("couriers")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastCourierError) throw new Error(lastCourierError.message);

    const nextSortOrder = Number(lastCourier?.sort_order || 0) + 1;

    const { data, error } = await supabaseAdmin
      .from("couriers")
      .insert({
        name,
        sort_order: nextSortOrder,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, name, sort_order, is_active")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, courier: data, message: "تمت إضافة المندوب بنجاح" });
  } catch (error: any) {
    return respondError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const id = String(body?.id || "").trim();
    const name = String(body?.name || "").trim();
    const isActive = body?.is_active !== false;

    if (!id) throw new Error("معرف المندوب مطلوب");
    if (!name) throw new Error("اسم المندوب مطلوب");

    const { data, error } = await supabaseAdmin
      .from("couriers")
      .update({
        name,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, sort_order, is_active")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, courier: data, message: "تم تحديث المندوب بنجاح" });
  } catch (error: any) {
    return respondError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();

    if (!id) throw new Error("معرف المندوب مطلوب");

    const { count, error: countError } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("courier_id", id);

    if (countError) throw new Error(countError.message);

    if (Number(count || 0) > 0) {
      const { error } = await supabaseAdmin
        .from("couriers")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw new Error(error.message);

      return NextResponse.json({
        ok: true,
        message: "تم إيقاف المندوب وإزالته من الاختيار. احتفظ النظام باسمه للطلبات القديمة.",
      });
    }

    const { error } = await supabaseAdmin.from("couriers").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, message: "تم حذف المندوب بنجاح" });
  } catch (error: any) {
    return respondError(error);
  }
}
