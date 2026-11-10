"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserProfile } from "@/lib/auth";

type Store = { id: string; name: string };
type Product = {
  id: string;
  store_id: string;
  name: string;
  sku: string | null;
  product_type: string | null;
  main_image_url: string | null;
  is_active: boolean;
  colors: string[];
};
type ProductCode = {
  id: string;
  code: string;
  design_code: string;
  brand_name: string;
  color_name: string;
  product_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
type Form = {
  id: string;
  code: string;
  brand_name: string;
  color_name: string;
  product_id: string;
  is_active: boolean;
};
const emptyForm: Form = {
  id: "", code: "", brand_name: "", color_name: "", product_id: "", is_active: true,
};

export default function AgentProductCodesPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [codes, setCodes] = useState<ProductCode[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form>(emptyForm);

  async function api(method: "GET" | "POST" | "PATCH", payload?: object) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) throw new Error("يرجى تسجيل الدخول من جديد");
    const response = await fetch("/api/agent/product-codes", {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "تعذر تحميل البيانات");
    return result;
  }

  async function refresh() {
    const result = await api("GET");
    setProducts(result.products || []);
    setCodes(result.codes || []);
    setStores(result.stores || []);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { profile, error: authError } = await getCurrentUserProfile();
        if (!active) return;
        if (authError || !profile) {
          window.location.href = "/login";
          return;
        }
        if (profile.role !== "admin") {
          setError("هذه الصفحة متاحة للمدير فقط");
          return;
        }
        setAuthorized(true);
        const result = await api("GET");
        if (!active) return;
        setProducts(result.products || []);
        setCodes(result.codes || []);
        setStores(result.stores || []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "تعذر قراءة الأكواد");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const chosenProduct = products.find((product) => product.id === form.product_id);
  const designCode = form.code.trim().toUpperCase().slice(0, 1);
  const existingDesign = codes.find((c) => c.design_code === designCode && c.id !== form.id);
  const suggestions = useMemo(() => {
    return products.filter((p) =>
      p.product_type === "بيجامة" &&
      (!storeFilter || p.store_id === storeFilter) &&
      (p.id === form.product_id || !codes.some((c) => c.product_id === p.id))
    );
  }, [products, codes, form.product_id, storeFilter]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return codes.filter((c) => {
      const product = products.find((p) => p.id === c.product_id);
      if (storeFilter && product?.store_id !== storeFilter) return false;
      return [c.code, c.design_code, c.brand_name, c.color_name, product?.name, product?.sku]
        .some((v) => String(v || "").toLocaleLowerCase().includes(q));
    });
  }, [codes, products, search, storeFilter]);

  function selectProduct(id: string) {
    const product = products.find((p) => p.id === id);
    setForm((prev) => ({
      ...prev,
      product_id: id,
      color_name: product?.colors.length === 1 ? product.colors[0] : "",
    }));
  }

  function edit(code: ProductCode) {
    const product = products.find((p) => p.id === code.product_id);
    setStoreFilter(product?.store_id || "");
    setForm({
      id: code.id, code: code.code, brand_name: code.brand_name,
      color_name: code.color_name, product_id: code.product_id, is_active: code.is_active,
    });
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setError("");
    setNotice("");
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z][0-9]{2,}$/.test(code)) {
      setError("صيغة الكود يجب أن تكون مثل D01 أو R02");
      return;
    }
    if (!form.product_id || !form.color_name || !form.brand_name.trim()) {
      setError("يرجى اختيار المنتج وتحديد البراند واللون");
      return;
    }
    if (chosenProduct?.colors.length !== 1 || chosenProduct.colors[0] !== form.color_name) {
      setError("اللون يجب أن يطابق لون المنتج في المخزون");
      return;
    }
    setSaving(true);
    try {
      await api(form.id ? "PATCH" : "POST", {
        ...form,
        code,
        design_code: code.charAt(0),
        brand_name: form.brand_name.trim(),
        color_name: form.color_name,
      });
      await refresh();
      setForm(emptyForm);
      setNotice("تم حفظ الكود وربطه بالمنتج بنجاح");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل حفظ الكود");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: ProductCode) {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await api("PATCH", { ...item, is_active: !item.is_active });
      await refresh();
      setNotice(item.is_active ? "تم إيقاف الكود" : "تم تفعيل الكود");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تغيير حالة الكود");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">جاري تحميل الأكواد...</main>;
  if (!authorized) return <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">{error || "لا تملك صلاحية الوصول"}</main>;

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-4 text-white md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">أكواد بيجامات Adora</h1>
          <p className="mt-2 text-sm text-neutral-400">
            الحرف يحدد التصميم، والرقم يحدد اللون، والبراند يمكن أن يحتوي على عدة تصاميم.
          </p>
        </div>
        <a href="/" className="rounded-xl border border-neutral-700 px-4 py-2">لوحة التحكم</a>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-800 bg-red-950 p-3 text-red-200">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-green-800 bg-green-950 p-3 text-green-200">{notice}</p>}

      <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 text-xl font-bold">{form.id ? "تعديل كود" : "إضافة كود جديد"}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">المتجر
            <select className="mt-2 w-full rounded-xl bg-neutral-800 p-3" value={storeFilter}
              onChange={(e) => { setStoreFilter(e.target.value); setForm(emptyForm); }}>
              <option value="">اختر المتجر لعرض منتجاته</option>
              {stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">كود المنتج (مثل D01)
            <input
              className="mt-2 w-full rounded-xl bg-neutral-800 p-3 uppercase"
              value={form.code}
              onChange={(e) => setForm((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
              placeholder="D01"
              dir="ltr"
              maxLength={12}
            />
          </label>
          <label className="block text-sm">كود التصميم (يُستخرج من الحرف)
            <input className="mt-2 w-full rounded-xl bg-neutral-800 p-3 text-neutral-400"
              value={designCode} disabled dir="ltr" />
          </label>
          <label className="block text-sm">البراند
            <input className="mt-2 w-full rounded-xl bg-neutral-800 p-3"
              value={form.brand_name}
              onChange={(e) => setForm((v) => ({ ...v, brand_name: e.target.value }))}
              placeholder="مثال: Dior" />
          </label>
          <label className="block text-sm">ربط بمنتج موجود في ERP
            <select
              className="mt-2 w-full rounded-xl bg-neutral-800 p-3"
              value={form.product_id}
              onChange={(e) => selectProduct(e.target.value)}
            >
              <option value="">اختر المنتج</option>
              {suggestions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.colors.join(" / ") || "بدون لون"} ({p.sku || "بدون SKU"})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">اللون من مخزون المنتج
            <input
              className="mt-2 w-full rounded-xl bg-neutral-800 p-3 text-neutral-400"
              value={form.color_name} disabled placeholder="اختر المنتج أولًا"
            />
          </label>
          <label className="flex items-center gap-3 self-end rounded-xl bg-neutral-800 p-3 text-sm">
            <input type="checkbox" checked={form.is_active}
              onChange={(e) => setForm((v) => ({ ...v, is_active: e.target.checked }))} />
            الكود نشط
          </label>
        </div>
        {existingDesign && (
          <p className="mt-3 text-sm text-neutral-400">
            التصميم {designCode} مرتبط حاليًا بالبراند: {existingDesign.brand_name}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={saving} onClick={save}
            className="rounded-xl bg-white px-6 py-3 font-bold text-black disabled:opacity-50">
            {saving ? "جاري الحفظ..." : form.id ? "حفظ التعديل" : "إضافة الكود"}
          </button>
          <button type="button" disabled={saving} onClick={() => { setForm(emptyForm); setError(""); }}
            className="rounded-xl border border-neutral-700 px-6 py-3">إلغاء / كود جديد</button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">الأكواد المسجلة ({visible.length})</h2>
          <input className="rounded-xl bg-neutral-800 p-3" placeholder="بحث بالكود أو اللون أو البراند"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="bg-neutral-800 text-neutral-300">
              <tr>
                <th className="p-3">الكود</th><th className="p-3">التصميم</th>
                <th className="p-3">البراند</th><th className="p-3">اللون</th>
                <th className="p-3">المنتج في ERP</th><th className="p-3">الحالة</th>
                <th className="p-3">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const product = products.find((p) => p.id === c.product_id);
                return <tr key={c.id} className="border-t border-neutral-800">
                  <td className="p-3 font-bold">{c.code}</td>
                  <td className="p-3">{c.design_code}</td>
                  <td className="p-3">{c.brand_name}</td>
                  <td className="p-3">{c.color_name}</td>
                  <td className="p-3">{product?.name || "منتج غير موجود"}</td>
                  <td className="p-3">{c.is_active ? "نشط" : "موقوف"}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button disabled={saving} onClick={() => edit(c)}
                        className="rounded-lg border border-neutral-600 px-3 py-2">تعديل</button>
                      <button disabled={saving} onClick={() => toggle(c)}
                        className="rounded-lg border border-neutral-600 px-3 py-2">
                        {c.is_active ? "إيقاف" : "تفعيل"}
                      </button>
                    </div>
                  </td>
                </tr>;
              })}
              {visible.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-neutral-400">لا توجد أكواد مطابقة</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
