"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = {
  erp_product_id: string;
  approved_title: string;
  erp_name: string | null;
  sku: string | null;
  image_url: string | null;
  price: number | null;
  description_preserved: boolean;
  variants: { size: string; color: string; stock: number; active: boolean }[];
  ready: boolean;
  issues: string[];
};
type Audit = { ok: boolean; message?: string; approved?: number; ready?: number; rows?: Row[] };

export default function AdoraApprovedImportPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (active) { setLoggedIn(Boolean(data.user)); setAuthLoading(false); } })
      .catch(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.session) {
      setAudit({ ok: false, message: "فشل تسجيل الدخول." });
    } else {
      setLoggedIn(true);
      setPassword("");
    }
    setBusy(false);
  }

  async function inspect() {
    setBusy(true); setAudit(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("انتهت جلسة الدخول.");
      const response = await fetch("/api/integrations/easyorders/approved-import", {
        headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store",
      });
      const result = await response.json() as Audit;
      setAudit(result);
    } catch {
      setAudit({ ok: false, message: "تعذر التحقق من ملف الأسماء المعتمدة." });
    } finally { setBusy(false); }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <h1 className="text-2xl font-bold">أسماء Adora المعتمدة — تجهيز النشر</h1>
        <p className="text-neutral-300">
          استوردنا الأسماء الـ24 التي وافقت عليها. هذه الصفحة تطابقها مع بيانات ERP الحية قبل النقل إلى EasyOrders.
          لا تغيّر الأوصاف أو أسماء ERP، ولا تنشر أي منتج.
        </p>
        {authLoading ? <p>جاري التحقق من الحساب...</p> : !loggedIn ? (
          <form onSubmit={login} className="max-w-md space-y-3">
            <input type="email" required placeholder="البريد الإلكتروني" dir="ltr" aria-label="البريد الإلكتروني"
              value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg bg-neutral-800 p-3" />
            <input type="password" required placeholder="كلمة المرور" dir="ltr" aria-label="كلمة المرور"
              value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg bg-neutral-800 p-3" />
            <button disabled={busy} className="rounded-lg bg-white px-5 py-3 font-bold text-black">تسجيل الدخول</button>
          </form>
        ) : (
          <button type="button" disabled={busy} onClick={inspect}
            className="rounded-lg bg-white px-5 py-3 font-bold text-black disabled:opacity-50">
            {busy ? "جاري التحقق..." : "فحص المنتجات الـ24 المعتمدة"}
          </button>
        )}
        {audit && <p role="status" className="rounded-lg bg-neutral-900 p-3">
          {audit.message} {audit.ok ? " | المعتمدة: " + audit.approved + " | الجاهزة: " + audit.ready : ""}
        </p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {audit?.rows?.map(p => (
            <section key={p.erp_product_id} className="flex gap-4 rounded-xl border border-neutral-800 p-3">
              {p.image_url ? <img src={p.image_url} alt={p.approved_title}
                className="h-36 w-28 shrink-0 rounded-lg bg-neutral-900 object-contain" /> : null}
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">{p.approved_title}</p>
                <p className="text-sm text-neutral-400">اسم ERP: {p.erp_name}</p>
                <p className="text-xs text-neutral-400">{p.sku} | {p.price} د.ل</p>
                <p className="text-xs text-neutral-300">
                  {p.variants.map(v => v.size + ": " + v.stock).join(" | ")}
                </p>
                <p className={"text-xs " + (p.ready ? "text-green-400" : "text-amber-400")}>
                  {p.ready ? "جاهز لفحص API قبل النشر" : p.issues.join("، ")}
                </p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
