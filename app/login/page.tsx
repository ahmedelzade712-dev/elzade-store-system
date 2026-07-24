"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("جاري تسجيل الدخول...");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.user) {
      setMessage("خطأ في البريد الإلكتروني أو كلمة المرور");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .single();

    if (profileError) {
      await supabase.auth.signOut();
      setMessage("تعذر قراءة صلاحيات الحساب");
      setLoading(false);
      return;
    }

    if (!profile.is_active) {
      await supabase.auth.signOut();
      setMessage("هذا الحساب موقوف. راجع مدير النظام.");
      setLoading(false);
      return;
    }

    window.location.assign("/");
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-neutral-950 p-6 text-white">
      <form onSubmit={handleLogin} className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
        <h1 className="mb-2 text-center text-3xl font-bold">تسجيل الدخول</h1>
        <p className="mb-8 text-center text-neutral-400">Elzade Store System</p>

        <input dir="ltr" type="email" placeholder="البريد الإلكتروني"
          className="mb-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-left outline-none"
          value={email} onChange={(e) => setEmail(e.target.value)} />

        <input dir="ltr" type="password" placeholder="كلمة المرور"
          className="mb-6 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-left outline-none"
          value={password} onChange={(e) => setPassword(e.target.value)} />

        <button type="submit" disabled={loading}
          className="w-full rounded-xl bg-white py-3 font-bold text-black disabled:opacity-50">
          {loading ? "جاري الدخول..." : "دخول"}
        </button>

        {message && <p className="mt-4 text-center text-sm text-red-400">{message}</p>}
      </form>
    </main>
  );
}
