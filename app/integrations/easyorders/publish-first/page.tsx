"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Preview = {
  name: string; sku: string; slug: string; price: number; color: string;
  count_remote_before: number; sizes: { size: string; quantity: number; price: number }[];
};
type Result = {
  ok: boolean; status?: string; message?: string; preview?: Preview;
  easyorders_product_id?: string | null; invalid_fields?: string[];
  issues?: string[]; remote_status?: number;
};

const PRODUCT_ID = "ce8563f5-d387-449e-908a-1533be81322d";

export default function FirstProductPage() {
  const [initializing, setInitializing] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(Boolean(data.user)); setInitializing(false);
    }).catch(() => setInitializing(false));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    if (!error && data.session) {
      setSignedIn(true); setPassword(""); setResult(null);
    } else setResult({ ok: false, message: "تعذر تسجيل الدخول." });
    setBusy(false);
  }

  async function callApi(publish: boolean) {
    if (busy) return;
    if (publish && (!verified || result?.status !== "ready")) return;
    if (publish && !window.confirm("هل تريد إنشاء منتج حقيقي واحد في EasyOrders؟")) return;
    setBusy(true); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("انتهت جلسة الدخول.");
      const response = await fetch("/api/integrations/easyorders/publish-first", {
        method: publish ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + session.access_token,
          ...(publish ? { "Content-Type": "application/json" } : {}),
        },
        ...(publish ? { body: JSON.stringify({ product_id: PRODUCT_ID, confirmation: "PUBLISH_FIRST_ADORA" }) } : {}),
        cache: "no-store",
      });
      const data = await response.json() as Result;
      setResult(data);
      setVerified(!publish && data.ok && data.status === "ready");
    } catch {
      setVerified(false);
      setResult({ ok: false, message: "تعذر تأكيد النتيجة. افحص EasyOrders قبل أي محاولة جديدة." });
    } finally { setBusy(false); }
  }

  return <main dir="rtl" className="min-h-screen bg-neutral-950 p-5 text-white">
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">نشر أول منتج من Adora</h1>
      <p className="text-neutral-300">سنبدأ بمنتج «بيجامة ستان بنقشة حروف – أحمر لامع».
        ننقل الاسم المعتمد، وسعر ومقاسات ومخزون وصورة ووصف ERP كما هي. لا نعدّل أسماء ERP
        ولا نمسّ المنتجات التجريبية الـ33.</p>
      {initializing ? <p>جاري التحقق من الحساب...</p> : !signedIn ?
        <form onSubmit={login} className="space-y-3">
          <input type="email" required dir="ltr" aria-label="البريد الإلكتروني"
            placeholder="بريد مدير ERP" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 p-3" />
          <input type="password" required dir="ltr" aria-label="كلمة المرور"
            placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full rounded-lg bg-neutral-800 p-3" />
          <button disabled={busy} className="rounded-lg bg-white px-5 py-3 text-black">تسجيل الدخول</button>
        </form> : <div className="space-y-3">
          <button disabled={busy} onClick={() => callApi(false)}
            className="rounded-lg bg-white px-5 py-3 font-bold text-black disabled:opacity-50">
            {busy ? "جاري الاتصال..." : "1 — فحص جاهزية أول منتج"}
          </button>
          {result && <div role="status" className="space-y-2 rounded-lg border border-neutral-700 p-4">
            <p>{result.message || (result.ok ? "نجح الفحص" : "فشل الفحص")}</p>
            {result.preview && <>
              <p className="font-bold">{result.preview.name}</p>
              <p>{result.preview.price} د.ل — {result.preview.color}</p>
              <p>SKU: {result.preview.sku}</p>
              <p>المقاسات: {result.preview.sizes.map(s => s.size + " (" + s.quantity + ")").join(" | ")}</p>
              <p>منتجات EasyOrders الموجودة: {result.preview.count_remote_before}</p>
            </>}
            {result.issues?.length ? <p>{result.issues.join("، ")}</p> : null}
            {result.invalid_fields?.length ? <p>الحقول التي رفضها EasyOrders: {result.invalid_fields.join("، ")}</p> : null}
          </div>}
          {verified && result?.status === "ready" && <button disabled={busy}
            onClick={() => callApi(true)}
            className="rounded-lg bg-green-600 px-5 py-3 font-bold disabled:opacity-50">
            2 — نشر هذا المنتج فقط
          </button>}
        </div>}
      <p className="text-sm text-amber-300">لن يُنشر أي منتج قبل الضغط على زر النشر.
        لا تكرر النشر إذا ظهرت رسالة تعذر التأكد من النتيجة.</p>
    </div>
  </main>;
}
