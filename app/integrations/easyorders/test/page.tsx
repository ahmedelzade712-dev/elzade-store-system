"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ConnectionResult = {
  ok: boolean;
  message: string;
  mode?: string;
  upstream_status?: number;
};

export default function EasyOrdersConnectionTestPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setSignedIn(Boolean(data.user));
        setLoadingSession(false);
      }
    }).catch(() => {
      if (active) setLoadingSession(false);
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.session) {
        setResult({ ok: false, message: "تعذر تسجيل الدخول. تحقق من بيانات حساب ERP." });
        return;
      }

      setSignedIn(true);
      setPassword("");
    } catch {
      setResult({ ok: false, message: "تعذر تسجيل الدخول. حاول مجددًا." });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setResult(null);

    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session?.access_token) {
        setSignedIn(false);
        setResult({ ok: false, message: "انتهت جلسة الدخول. سجّل الدخول مجددًا." });
        return;
      }

      const response = await fetch("/api/integrations/easyorders/test-connection", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const body: ConnectionResult = await response.json();
      setResult(body);
    } catch {
      setResult({
        ok: false,
        message: "تعذر تنفيذ الاختبار. تحقق من عنوان معاينة Vercel.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 px-4 py-12 text-white">
      <section className="mx-auto max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 sm:p-8">
        <p className="mb-2 text-sm text-neutral-400">Elzade ERP / Adora</p>
        <h1 className="mb-4 text-2xl font-bold">اختبار اتصال EasyOrders</h1>
        <p className="mb-6 leading-7 text-neutral-300">
          يفحص هذا الاختبار صلاحية قراءة المنتجات من EasyOrders فقط.
          لن يضيف منتجات، ولن يغيّر الأسعار أو المخزون أو الصور.
          مفتاح EasyOrders محفوظ على الخادم ولا يظهر في هذه الصفحة.
        </p>

        {loadingSession ? (
          <p className="text-neutral-400">جاري التحقق من تسجيل الدخول...</p>
        ) : signedIn ? (
          <button
            type="button"
            disabled={busy}
            onClick={testConnection}
            className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-black disabled:opacity-50"
          >
            {busy ? "جاري اختبار الاتصال..." : "اختبار الاتصال الآن"}
          </button>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <p className="text-sm text-neutral-300">
              سجّل الدخول بحساب مدير Elzade ERP حتى تتمكن من اختبار الاتصال.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-300">البريد الإلكتروني</span>
              <input
                type="email"
                required
                autoComplete="username"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-left text-white"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-300">كلمة المرور</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 p-3 text-left text-white"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-black disabled:opacity-50"
            >
              {busy ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </button>
          </form>
        )}

        {result && (
          <div
            role="status"
            className={`mt-5 rounded-xl border p-4 text-sm leading-7 ${
              result.ok
                ? "border-green-700 bg-green-950 text-green-200"
                : "border-amber-700 bg-amber-950 text-amber-100"
            }`}
          >
            <p className="font-semibold">
              {result.ok ? "نجح الاختبار" : "لم ينجح الاختبار"}
            </p>
            <p>{result.message}</p>
            {result.upstream_status && (
              <p>رمز استجابة EasyOrders: {result.upstream_status}</p>
            )}
          </div>
        )}

        <p className="mt-6 text-xs leading-6 text-neutral-500">
          للاختبار على Preview فقط؛ بيئة Production غير مفعّلة لهذا الاختبار.
        </p>
      </section>
    </main>
  );
}
