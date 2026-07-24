"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const emptyForm = {
  id: "",
  full_name: "",
  phone: "",
  email: "",
  password: "",
  role: "store_manager",
  store_id: "",
  is_active: true,
};

function formatDate(value: string | null) {
  if (!value) return "لم يسجل الدخول";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function EmployeesPage() {
  const [profile, setProfile] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPage();
  }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  async function loadPage() {
    setLoading(true);
    setMessage("");

    const result = await getCurrentUserProfile();

    if (result.error) {
      window.location.href = "/login";
      return;
    }

    if (result.profile?.role !== "admin") {
      window.location.href = "/";
      return;
    }

    setProfile(result.profile);

    const [{ data: storesData, error: storesError }, token] = await Promise.all([
      supabase.from("stores").select("id, name").order("name"),
      getToken(),
    ]);

    if (storesError) {
      setMessage(storesError.message);
      setLoading(false);
      return;
    }

    const response = await fetch("/api/employees", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      setMessage(data.error || "فشل تحميل الموظفين");
      setLoading(false);
      return;
    }

    setStores(storesData || []);
    setEmployees(data.employees || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return employees;

    return employees.filter((employee) =>
      [
        employee.full_name,
        employee.phone,
        employee.email,
        employee.role,
        employee.stores?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [employees, search]);

  function openCreate() {
    setForm(emptyForm);
    setShowForm(true);
    setMessage("");
  }

  function openEdit(employee: any) {
    setForm({
      id: employee.id,
      full_name: employee.full_name || "",
      phone: employee.phone || "",
      email: employee.email || "",
      password: "",
      role: employee.role || "store_manager",
      store_id: employee.store_id || "",
      is_active: employee.is_active !== false,
    });
    setShowForm(true);
    setMessage("");
  }

  async function saveEmployee() {
    if (saving) return;

    if (!form.full_name.trim()) return setMessage("اسم الموظف مطلوب");
    if (!form.phone.trim()) return setMessage("رقم الهاتف مطلوب");
    if (!form.email.trim()) return setMessage("البريد الإلكتروني مطلوب");
    if (!form.id && form.password.length < 6) {
      return setMessage("كلمة المرور يجب ألا تقل عن 6 أحرف");
    }
    if (form.role === "store_manager" && !form.store_id) {
      return setMessage("اختر متجر الموظف");
    }

    setSaving(true);
    setMessage("");

    try {
      const token = await getToken();

      const response = await fetch("/api/employees", {
        method: form.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "فشل حفظ الموظف");
      }

      setShowForm(false);
      setForm(emptyForm);
      setMessage(data.message);
      await loadPage();
    } catch (error: any) {
      setMessage(error.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        جاري التحميل...
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">إدارة الموظفين</h1>
          <p className="mt-2 text-neutral-400">الحسابات والمتاجر والصلاحيات</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={openCreate} className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black">
            + إضافة موظف
          </button>
          <button onClick={loadPage} className="rounded-xl border border-neutral-700 px-5 py-3 font-bold">
            تحديث
          </button>
          <a href="/" className="rounded-xl bg-white px-5 py-3 font-bold text-black">
            لوحة التحكم
          </a>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <input
          className="w-full rounded-xl bg-neutral-800 p-4"
          placeholder="بحث بالاسم أو الهاتف أو البريد أو المتجر"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {message && <p className="mb-5 rounded-xl bg-neutral-900 p-4 text-yellow-400">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900">
        <table className="w-full min-w-[1100px] text-right">
          <thead className="bg-neutral-800 text-sm text-neutral-300">
            <tr>
              <th className="p-4">الاسم</th>
              <th className="p-4">البريد</th>
              <th className="p-4">الهاتف</th>
              <th className="p-4">الصلاحية</th>
              <th className="p-4">المتجر</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">آخر دخول</th>
              <th className="p-4">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-8 text-center text-neutral-400">جاري التحميل...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-neutral-400">لا يوجد موظفون</td></tr>
            ) : (
              filtered.map((employee) => (
                <tr key={employee.id} className="border-t border-neutral-800">
                  <td className="p-4 font-bold">{employee.full_name}</td>
                  <td dir="ltr" className="p-4 text-left">{employee.email || "-"}</td>
                  <td dir="ltr" className="p-4 text-left">{employee.phone || "-"}</td>
                  <td className="p-4">{employee.role === "admin" ? "مدير النظام" : "مدير متجر"}</td>
                  <td className="p-4">{employee.role === "admin" ? "كل المتاجر" : employee.stores?.name || "-"}</td>
                  <td className={`p-4 font-bold ${employee.is_active ? "text-green-400" : "text-red-400"}`}>
                    {employee.is_active ? "نشط" : "موقوف"}
                  </td>
                  <td dir="ltr" className="p-4 text-left">{formatDate(employee.last_sign_in_at)}</td>
                  <td className="p-4">
                    <button onClick={() => openEdit(employee)} className="rounded-lg border border-neutral-700 px-4 py-2 font-bold">
                      تعديل
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto my-6 w-full max-w-2xl rounded-2xl bg-neutral-900 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-bold">{form.id ? "تعديل الموظف" : "إضافة موظف"}</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg border border-neutral-700 px-4 py-2">إغلاق</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input className="rounded-xl bg-neutral-800 p-4" placeholder="الاسم الكامل"
                value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <input dir="ltr" className="rounded-xl bg-neutral-800 p-4 text-left" placeholder="رقم الهاتف"
                value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input dir="ltr" type="email" className="rounded-xl bg-neutral-800 p-4 text-left" placeholder="البريد الإلكتروني"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input dir="ltr" type="password" className="rounded-xl bg-neutral-800 p-4 text-left"
                placeholder={form.id ? "كلمة مرور جديدة — اتركها فارغة" : "كلمة المرور"}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

              <select className="rounded-xl bg-neutral-800 p-4" value={form.role}
                onChange={(e) => setForm({
                  ...form,
                  role: e.target.value,
                  store_id: e.target.value === "admin" ? "" : form.store_id,
                })}>
                <option value="store_manager">مدير متجر</option>
                <option value="admin">مدير النظام</option>
              </select>

              <select className="rounded-xl bg-neutral-800 p-4 disabled:opacity-50"
                disabled={form.role === "admin"} value={form.store_id}
                onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                <option value="">{form.role === "admin" ? "كل المتاجر" : "اختر المتجر"}</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>

              <label className="flex items-center gap-3 rounded-xl bg-neutral-800 p-4 md:col-span-2">
                <input type="checkbox" checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <span>الحساب نشط ويسمح له بالدخول</span>
              </label>
            </div>

            <button onClick={saveEmployee} disabled={saving}
              className="mt-5 w-full rounded-xl bg-white p-4 font-bold text-black disabled:opacity-50">
              {saving ? "جاري الحفظ..." : "حفظ الموظف"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
