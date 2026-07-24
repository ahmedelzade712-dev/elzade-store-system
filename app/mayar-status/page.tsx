"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";

type Shipment = {
  id: number;
  mayar_code: string;
  order_code: string;
  customer_name: string;
  phone: string;
  city: string;
  area: string;
  address: string;
  status_key: string;
  status_label: string;
  raw_status_code: string;
  raw_status_name: string;
  attempts: number;
  created_at: string;
  updated_at: string;
  tracking_url: string;
};

export default function MayarStatusPage() {
  const [profile, setProfile] = useState<any>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const result = await getCurrentUserProfile();

      if (result.error) {
        window.location.href = "/login";
        return;
      }

      setProfile(result.profile);
      await loadShipments();
    }

    loadProfile();
  }, []);

  async function loadShipments() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/mayar/order-status?first=100&page=1", {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "فشل تحميل حالات المعيار");
      }

      setShipments(result.shipments || []);
    } catch (error: any) {
      setMessage(error.message || "حدث خطأ أثناء تحميل حالات المعيار");
    } finally {
      setLoading(false);
    }
  }

  const filteredShipments = useMemo(() => {
    const term = search.trim().toLowerCase();

    return shipments.filter((shipment) => {
      const text = [
        shipment.order_code,
        shipment.mayar_code,
        shipment.customer_name,
        shipment.phone,
        shipment.city,
        shipment.area,
        shipment.raw_status_name,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!term || text.includes(term)) &&
        (!statusFilter || shipment.status_key === statusFilter)
      );
    });
  }, [shipments, search, statusFilter]);

  function formatDateTime(value: string) {
    if (!value) return "-";

    return new Date(value).toLocaleString("ar-LY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusClass(statusKey: string) {
    if (statusKey === "waiting_shipping") {
      return "border-yellow-700 bg-yellow-950/40 text-yellow-300";
    }

    if (statusKey === "warehouse") {
      return "border-blue-700 bg-blue-950/40 text-blue-300";
    }

    if (statusKey === "out_for_delivery") {
      return "border-purple-700 bg-purple-950/40 text-purple-300";
    }

    if (statusKey === "redelivery") {
      return "border-orange-700 bg-orange-950/40 text-orange-300";
    }

    if (statusKey === "delivered") {
      return "border-green-700 bg-green-950/40 text-green-300";
    }

    if (statusKey === "failed_delivery") {
      return "border-red-700 bg-red-950/40 text-red-300";
    }

    if (statusKey === "return_to_sender") {
      return "border-amber-700 bg-amber-950/40 text-amber-300";
    }

    if (statusKey === "returned_to_sender") {
      return "border-stone-700 bg-stone-900/60 text-stone-300";
    }

    return "border-neutral-700 bg-neutral-900 text-neutral-300";
  }

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      waiting_shipping: 0,
      warehouse: 0,
      out_for_delivery: 0,
      redelivery: 0,
      delivered: 0,
      failed_delivery: 0,
      return_to_sender: 0,
      returned_to_sender: 0,
    };

    shipments.forEach((shipment) => {
      if (counts[shipment.status_key] !== undefined) {
        counts[shipment.status_key] += 1;
      }
    });

    return counts;
  }, [shipments]);

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
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">حالة طلبات المعيار</h1>
          <p className="mt-2 text-neutral-400">
            عرض الحالات فقط دون تعديل أو إلغاء أو إعادة إرسال
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={loadShipments}
            disabled={loading}
            className="rounded-xl bg-green-500 px-5 py-3 font-bold text-black disabled:opacity-50"
          >
            {loading ? "جاري التحديث..." : "تحديث الحالات"}
          </button>

          <a
            href="/"
            className="rounded-xl bg-white px-5 py-3 font-bold text-black"
          >
            لوحة التحكم
          </a>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="rounded-xl border border-yellow-800 bg-yellow-950/30 p-4">
          <p className="text-sm text-yellow-300">انتظار الشحن</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.waiting_shipping}</p>
        </div>

        <div className="rounded-xl border border-blue-800 bg-blue-950/30 p-4">
          <p className="text-sm text-blue-300">في المخزن</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.warehouse}</p>
        </div>

        <div className="rounded-xl border border-purple-800 bg-purple-950/30 p-4">
          <p className="text-sm text-purple-300">قيد التوصيل</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.out_for_delivery}</p>
        </div>

        <div className="rounded-xl border border-orange-800 bg-orange-950/30 p-4">
          <p className="text-sm text-orange-300">إعادة توصيل</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.redelivery}</p>
        </div>

        <div className="rounded-xl border border-green-800 bg-green-950/30 p-4">
          <p className="text-sm text-green-300">تم التسليم</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.delivered}</p>
        </div>

        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4">
          <p className="text-sm text-red-300">تعذر التسليم</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.failed_delivery}</p>
        </div>

        <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-4">
          <p className="text-sm text-amber-300">إرجاع للراسل</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.return_to_sender}</p>
        </div>

        <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-4">
          <p className="text-sm text-stone-300">تم الإرجاع للراسل</p>
          <p className="mt-1 text-2xl font-bold">{statusCounts.returned_to_sender}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <input
          className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
          placeholder="بحث بكودنا / كود المعيار / الهاتف / المدينة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="rounded-xl bg-neutral-900 p-4"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">كل الحالات</option>
          <option value="waiting_shipping">انتظار الشحن</option>
          <option value="warehouse">في المخزن</option>
          <option value="out_for_delivery">قيد التوصيل</option>
          <option value="redelivery">إعادة توصيل</option>
          <option value="delivered">تم التسليم</option>
          <option value="failed_delivery">تعذر التسليم</option>
          <option value="return_to_sender">إرجاع للراسل</option>
          <option value="returned_to_sender">تم الإرجاع للراسل</option>
        </select>

        <button
          onClick={() => {
            setSearch("");
            setStatusFilter("");
          }}
          className="rounded-xl border border-neutral-700 p-4"
        >
          مسح الفلاتر
        </button>
      </div>

      {message && <p className="mb-4 text-red-400">{message}</p>}

      <div className="mb-4 rounded-xl bg-neutral-900 p-4 text-neutral-300">
        عدد الشحنات الظاهرة:{" "}
        <b className="text-white">{filteredShipments.length}</b>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900">
        <table className="w-full min-w-[1500px] text-right">
          <thead className="bg-neutral-800 text-sm text-neutral-300">
            <tr>
              <th className="p-4">كودنا</th>
              <th className="p-4">كود المعيار</th>
              <th className="p-4">العميل</th>
              <th className="p-4">الهاتف</th>
              <th className="p-4">المدينة / المنطقة</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">حالة المعيار الأصلية</th>
              <th className="p-4">المحاولات</th>
              <th className="p-4">آخر تحديث</th>
              <th className="p-4">التتبع</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-neutral-400">
                  جاري تحميل حالات المعيار...
                </td>
              </tr>
            ) : filteredShipments.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-neutral-400">
                  لا توجد شحنات مطابقة
                </td>
              </tr>
            ) : (
              filteredShipments.map((shipment) => (
                <tr
                  key={shipment.id}
                  className="border-t border-neutral-800 align-top"
                >
                  <td className="p-4 font-bold" dir="ltr">
                    {shipment.order_code || "-"}
                  </td>

                  <td className="p-4 text-lg font-black" dir="ltr">
                    {shipment.mayar_code || "-"}
                  </td>

                  <td className="p-4">{shipment.customer_name || "-"}</td>

                  <td className="p-4 font-bold" dir="ltr">
                    {shipment.phone || "-"}
                  </td>

                  <td className="p-4">
                    <p>{shipment.city || "-"}</p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {shipment.area || "-"}
                    </p>
                  </td>

                  <td className="p-4">
                    <span
                      className={`inline-flex rounded-full border px-3 py-2 text-sm font-bold ${statusClass(
                        shipment.status_key
                      )}`}
                    >
                      {shipment.status_label}
                    </span>
                  </td>

                  <td className="p-4">
                    <p>{shipment.raw_status_name || "-"}</p>
                    <p className="mt-1 text-sm text-neutral-500" dir="ltr">
                      {shipment.raw_status_code || "-"}
                    </p>
                  </td>

                  <td className="p-4 text-center font-bold">
                    {shipment.attempts || 0}
                  </td>

                  <td className="p-4">{formatDateTime(shipment.updated_at)}</td>

                  <td className="p-4">
                    {shipment.tracking_url ? (
                      <a
                        href={shipment.tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold"
                      >
                        فتح التتبع
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
