
"use client";

import { useEffect, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMayarStatus(order: any) {
  return (
    order.mayar_live_status_name ||
    order.mayar_live_status_code ||
    order.status ||
    "الحالة غير متوفرة"
  );
}

export default function OrderAlertsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [privateAlerts, setPrivateAlerts] = useState<any[]>([]);
  const [mayarAlerts, setMayarAlerts] = useState<any[]>([]);
  const [counts, setCounts] = useState({
    private_tripoli: 0,
    mayar: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    setLoading(true);
    setMessage("");

    const result = await getCurrentUserProfile();

    if (result.error) {
      window.location.href = "/login";
      return;
    }

    setProfile(result.profile);

    try {
      const storeParam =
        result.profile?.role !== "admin" && result.profile?.store_id
          ? `?store_id=${encodeURIComponent(result.profile.store_id)}`
          : "";

      const response = await fetch(`/api/order-alerts${storeParam}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "فشل تحميل التنبيهات");
      }

      setPrivateAlerts(data.private_tripoli || []);
      setMayarAlerts(data.mayar || []);
      setCounts(
        data.counts || {
          private_tripoli: 0,
          mayar: 0,
          total: 0,
        }
      );
    } catch (error: any) {
      setMessage(error?.message || "فشل تحميل التنبيهات");
      setPrivateAlerts([]);
      setMayarAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-neutral-950 p-8 text-white"
      >
        جاري تحميل التنبيهات...
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">تنبيهات الطلبات</h1>
          <p className="mt-2 text-neutral-400">
            هذه الصفحة للمتابعة فقط. جميع إجراءات الإرجاع تتم من صفحة
            الاسترجاع.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={loadAlerts}
            className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white"
          >
            تحديث التنبيهات
          </button>

          <a
            href="/"
            className="rounded-xl bg-white px-5 py-3 font-bold text-black"
          >
            الصفحة الرئيسية
          </a>
        </div>
      </div>

      {message && (
        <div className="mb-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-red-200">
          {message}
        </div>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-red-800 bg-red-950/30 p-5">
          <p className="text-neutral-300">إجمالي التنبيهات</p>
          <p className="mt-2 text-4xl font-bold text-red-400">{counts.total}</p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-neutral-300">طرابلس خاصة +24 ساعة</p>
          <p className="mt-2 text-4xl font-bold">{counts.private_tripoli}</p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-neutral-300">المعيار +10 أيام</p>
          <p className="mt-2 text-4xl font-bold">{counts.mayar}</p>
        </div>
      </div>

      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">طرابلس خاصة</h2>
          <p className="mt-1 text-sm text-neutral-400">
            طلبات جاري الشحن التي مر عليها أكثر من 24 ساعة.
          </p>
        </div>

        {privateAlerts.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
            لا توجد تنبيهات طرابلس خاصة حاليًا.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full bg-neutral-900 text-sm">
              <thead className="bg-neutral-800 text-neutral-300">
                <tr>
                  <th className="p-4 text-right">الكود</th>
                  <th className="p-4 text-right">المتجر</th>
                  <th className="p-4 text-right">الزبون</th>
                  <th className="p-4 text-right">الهاتف</th>
                  <th className="p-4 text-right">المنطقة</th>
                  <th className="p-4 text-right">بدأ الشحن</th>
                  <th className="p-4 text-right">مدة الانتظار</th>
                </tr>
              </thead>
              <tbody>
                {privateAlerts.map((order) => (
                  <tr
                    key={order.id}
                    className="border-t border-neutral-800"
                  >
                    <td className="p-4 font-bold">{order.order_code}</td>
                    <td className="p-4">{order.store_name}</td>
                    <td className="p-4">{order.customer_name}</td>
                    <td className="p-4">{order.phone}</td>
                    <td className="p-4">{order.area}</td>
                    <td className="p-4">{formatDateTime(order.printed_at)}</td>
                    <td className="p-4 font-bold text-red-400">
                      {order.age_hours} ساعة
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-bold">طلبات المعيار</h2>
          <p className="mt-1 text-sm text-neutral-400">
            جميع طلبات المعيار التي مر عليها أكثر من 10 أيام ولم تُسلّم
            بالكامل أو جزئيًا ولم تُرجع بعد إلى النظام.
          </p>
        </div>

        {mayarAlerts.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
            لا توجد تنبيهات معيار حاليًا.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-neutral-800">
            <table className="min-w-full bg-neutral-900 text-sm">
              <thead className="bg-neutral-800 text-neutral-300">
                <tr>
                  <th className="p-4 text-right">الكود الداخلي</th>
                  <th className="p-4 text-right">كود المعيار</th>
                  <th className="p-4 text-right">المتجر</th>
                  <th className="p-4 text-right">الزبون</th>
                  <th className="p-4 text-right">الهاتف</th>
                  <th className="p-4 text-right">الحالة الحالية</th>
                  <th className="p-4 text-right">تاريخ الإرسال</th>
                  <th className="p-4 text-right">المدة</th>
                </tr>
              </thead>
              <tbody>
                {mayarAlerts.map((order) => (
                  <tr
                    key={order.id}
                    className="border-t border-neutral-800"
                  >
                    <td className="p-4 font-bold">{order.order_code}</td>
                    <td className="p-4">{order.mayar_code || "-"}</td>
                    <td className="p-4">{order.store_name}</td>
                    <td className="p-4">{order.customer_name}</td>
                    <td className="p-4">{order.phone}</td>
                    <td className="p-4 text-yellow-300">
                      {getMayarStatus(order)}
                    </td>
                    <td className="p-4">{formatDateTime(order.mayar_sent_at)}</td>
                    <td className="p-4 font-bold text-red-400">
                      {order.age_days} يوم
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
