"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Size = { variant_id: string; size: string | null; quantity: number | null; active: boolean };
type Product = {
  product_id: string; erp_name: string | null; sku: string; color: string | null;
  price: number | null; sizes: Size[]; issues: string[]; ready: boolean;
  easyorders_matches: number; next_action: string;
};
type Audit = {
  ok: boolean; message: string;
  summary?: { erp_products: number; erp_variants: number; ready: number; issues: number;
    remote_products_scanned: number; remote_scan_complete: boolean; remote_sku_matches: number };
  products?: Product[];
};

export default function CatalogAuditPage() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (active) { setLoggedIn(Boolean(data.user)); setSessionLoading(false); } })
      .catch(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setAudit(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      });
      if (error || !data.session) {
        setAudit({ ok: false, message: "تعذر تسجيل الدخول. تحقق من حساب مدير ERP." });
      } else {
        setLoggedIn(true); setPassword("");
      }
    } catch {
      setAudit({ ok: false, message: "تعذر تسجيل الدخول." });
    } finally {
      setBusy(false);
    }
  }

  async function inspect() {
    setBusy(true); setAudit(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoggedIn(false);
        setAudit({ ok: false, message: "انتهت جلسة الدخول." });
        return;
      }
      const response = await fetch("/api/integrations/easyorders/catalog-preflight", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result: Audit = await response.json();
      setAudit(result);
    } catch {
      setAudit({ ok: false, message: "فشل الاتصال بخدمة فحص الكتالوج." });
    } finally { setBusy(false); }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-5 text-white">
      <section className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm text-neutral-400">Adora / EasyOrders — Preview only</p>
          <h1 className="mt-2 text-2xl font-bold">تدقيق الكتالوج قبل المزامنة</h1>
          <p className="mt-3 text-neutral-400">
            قراءة فقط: يقارن رموز منتجات Adora بين ERP وEasyOrders، ويكشف النواقص والتكرارات.
            لا ينشئ منتجات ولا يغير المخزون أو الصور أو الأسماء.
          </p>
        </div>
        {sessionLoading ? <p>جاري فحص تسجيل الدخول...</p> : !loggedIn ? (
          <form onSubmit={login} className="max-w-md space-y-3 rounded-xl border border-neutral-700 p-4">
            <input aria-label="البريد الإلكتروني" placeholder="بريد مدير ERP" required type="email" dir="ltr"
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 p-3 text-left" />
            <input aria-label="كلمة المرور" placeholder="كلمة المرور" required type="password" dir="ltr"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg bg-neutral-800 p-3 text-left" />
            <button disabled={busy} className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-50">
              تسجيل الدخول
            </button>
          </form>
        ) : (
          <button onClick={inspect} disabled={busy}
            className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-50">
            {busy ? "جاري التدقيق..." : "فحص منتجات Adora الآن"}
          </button>
        )}
        {audit && <div role="status" className="rounded-xl border border-neutral-700 p-4">
          <p className={audit.ok ? "text-green-300" : "text-amber-300"}>{audit.message}</p>
        </div>}
        {audit?.summary && (
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {([
              ["منتجات ERP", audit.summary.erp_products],
              ["المقاسات", audit.summary.erp_variants],
              ["جاهزة من ناحية البيانات", audit.summary.ready],
              ["بها مشاكل", audit.summary.issues],
              ["منتجات EasyOrders المقروءة", audit.summary.remote_products_scanned],
              ["تطابق SKU واحد", audit.summary.remote_sku_matches],
              ["قراءة المتجر كاملة", audit.summary.remote_scan_complete ? "نعم" : "لا"],
            ] as [string, string | number][]).map(([label,value]) => (
              <div key={label} className="rounded-lg bg-neutral-900 p-3">
                <p className="text-neutral-400">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>
        )}
        {audit?.products && <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full min-w-[800px] text-right text-sm">
            <thead className="bg-neutral-900"><tr>
              <th className="p-3">المنتج الداخلي</th><th className="p-3">SKU</th>
              <th className="p-3">اللون</th><th className="p-3">السعر</th>
              <th className="p-3">المقاسات</th><th className="p-3">الحالة</th>
            </tr></thead>
            <tbody>
              {audit.products.map(p => <tr key={p.product_id} className="border-t border-neutral-800">
                <td className="p-3">{p.erp_name || "—"}</td>
                <td className="p-3 font-mono text-xs" dir="ltr">{p.sku || "—"}</td>
                <td className="p-3">{p.color || "—"}</td><td className="p-3">{p.price ?? "—"}</td>
                <td className="p-3">{p.sizes.map(s => `${s.size} (${s.quantity})`).join("، ")}</td>
                <td className="p-3">{p.issues.length ? p.issues.join("، ") : p.easyorders_matches === 1
                  ? "يحتاج مراجعة الربط" : p.next_action === "remote_catalog_incomplete"
                    ? "قراءة EasyOrders غير مكتملة" : "جاهز لمراجعة الاسم التجاري"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </main>
  );
}
