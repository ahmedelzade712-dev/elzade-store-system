"use client";

import { useEffect, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";

export default function HomePage() {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    async function loadProfileAndCounts() {
      const result = await getCurrentUserProfile();

      if (result.error) {
        window.location.href = "/login";
        return;
      }

      setProfile(result.profile);

    }

    loadProfileAndCounts();
  }, []);

  if (!profile) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-neutral-950 text-white"
      >
        جاري التحميل...
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-10">
        <h1 className="mb-2 text-4xl font-bold">لوحة التحكم</h1>
        <p className="text-neutral-400">
          مرحبًا {profile.full_name} — الصلاحية: {profile.role}
        </p>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <p className="mb-2 text-neutral-400">طلبات اليوم</p>
          <h2 className="text-3xl font-bold">0</h2>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <p className="mb-2 text-neutral-400">قيد التجهيز</p>
          <h2 className="text-3xl font-bold">0</h2>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
          <p className="mb-2 text-neutral-400">استبدالات</p>
          <h2 className="text-3xl font-bold">0</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <a
          href="/orders/new"
          className="rounded-2xl bg-white p-6 text-center font-bold text-black"
        >
          + إضافة طلب
        </a>

        <a
          href="/orders"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          الطلبات
        </a>

        <a
          href="/archive"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          السجل / الأرشيف
        </a>

        <a
          href="/mayar-status"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          حالة طلبات المعيار
        </a>

        {profile.role === "admin" && (
          <a
            href="/reports"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
          >
            التقارير المالية
          </a>
        )}

        <a
          href="/returns"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          الاسترجاع
        </a>

        <a
          href="/search"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          البحث
        </a>

        {profile.role === "admin" && (
          <a
            href="/employees"
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
          >
            إدارة الموظفين
          </a>
        )}

        <a
          href="/private-tripoli"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          طرابلس خاصة
        </a>

        <a
          href="/products"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          المنتجات
        </a>

        <a
          href="/inventory"
          className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center font-bold"
        >
          المخزون
        </a>
      </div>
    </main>
  );
}
