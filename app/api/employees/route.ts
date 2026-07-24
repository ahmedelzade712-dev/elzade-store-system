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
    return NextResponse.json({ ok: false, error: "هذه الصفحة للمدير فقط" }, { status: 403 });
  }
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

async function listAuthUsers() {
  const users: any[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw new Error("خطأ في قراءة الحسابات: " + error.message);
    users.push(...(data.users || []));

    if (!data.users || data.users.length < 1000) break;
    page += 1;
  }

  return users;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(`
          id,
          full_name,
          phone,
          role,
          store_id,
          is_active,
          stores(id, name)
        `)
        .order("full_name"),
      listAuthUsers(),
    ]);

    if (profilesError) throw new Error(profilesError.message);

    const authMap = new Map(
      authUsers.map((user: any) => [
        user.id,
        {
          email: user.email || "",
          last_sign_in_at: user.last_sign_in_at || null,
        },
      ])
    );

    return NextResponse.json({
      ok: true,
      employees: (profiles || []).map((profile: any) => ({
        ...profile,
        email: authMap.get(profile.id)?.email || "",
        last_sign_in_at: authMap.get(profile.id)?.last_sign_in_at || null,
      })),
    });
  } catch (error: any) {
    return respondError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();

    const fullName = String(body?.full_name || "").trim();
    const phone = String(body?.phone || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = String(body?.role || "store_manager");
    const storeId = body?.store_id ? String(body.store_id) : null;

    if (!fullName) throw new Error("اسم الموظف مطلوب");
    if (!phone) throw new Error("رقم الهاتف مطلوب");
    if (!email) throw new Error("البريد الإلكتروني مطلوب");
    if (password.length < 6) throw new Error("كلمة المرور يجب ألا تقل عن 6 أحرف");
    if (!["admin", "store_manager"].includes(role)) throw new Error("الصلاحية غير صحيحة");
    if (role === "store_manager" && !storeId) throw new Error("يجب اختيار متجر");

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone },
      });

    if (createError || !created.user) {
      throw new Error("فشل إنشاء حساب الموظف: " + (createError?.message || ""));
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      full_name: fullName,
      phone,
      role,
      store_id: role === "admin" ? null : storeId,
      is_active: true,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("فشل إنشاء ملف الموظف: " + profileError.message);
    }

    return NextResponse.json({ ok: true, message: "تم إنشاء الموظف بنجاح" });
  } catch (error: any) {
    return respondError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const currentAdmin = await requireAdmin(request);
    const body = await request.json();

    const id = String(body?.id || "").trim();
    const fullName = String(body?.full_name || "").trim();
    const phone = String(body?.phone || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = String(body?.role || "store_manager");
    const storeId = body?.store_id ? String(body.store_id) : null;
    const isActive = Boolean(body?.is_active);

    if (!id) throw new Error("معرف الموظف مطلوب");
    if (!fullName) throw new Error("اسم الموظف مطلوب");
    if (!phone) throw new Error("رقم الهاتف مطلوب");
    if (!email) throw new Error("البريد الإلكتروني مطلوب");
    if (!["admin", "store_manager"].includes(role)) throw new Error("الصلاحية غير صحيحة");
    if (role === "store_manager" && !storeId) throw new Error("يجب اختيار متجر");

    if (id === currentAdmin.id && (!isActive || role !== "admin")) {
      throw new Error("لا يمكنك إيقاف حسابك أو إزالة صلاحية المدير من نفسك");
    }

    const authUpdate: Record<string, any> = {
      email,
      user_metadata: { full_name: fullName, phone },
    };

    if (password) {
      if (password.length < 6) throw new Error("كلمة المرور الجديدة قصيرة");
      authUpdate.password = password;
    }

    const { error: authError } =
      await supabaseAdmin.auth.admin.updateUserById(id, authUpdate);

    if (authError) throw new Error("فشل تحديث حساب الدخول: " + authError.message);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        role,
        store_id: role === "admin" ? null : storeId,
        is_active: isActive,
      })
      .eq("id", id);

    if (profileError) throw new Error("فشل تحديث الموظف: " + profileError.message);

    return NextResponse.json({ ok: true, message: "تم تحديث الموظف بنجاح" });
  } catch (error: any) {
    return respondError(error);
  }
}
