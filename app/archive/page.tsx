"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import EnglishDatePicker from "@/app/components/EnglishDatePicker";

export default function ArchivePage() {
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");

    const result = await getCurrentUserProfile();

    if (result.error) {
      window.location.href = "/login";
      return;
    }

    setProfile(result.profile);

    const { data: storesData, error: storesError } = await supabase
      .from("stores")
      .select("id, name")
      .order("name");

    if (storesError) {
      setMessage("خطأ في تحميل المتاجر: " + storesError.message);
      setLoading(false);
      return;
    }

    setStores(storesData || []);

    let query = supabase
      .from("orders")
      .select(`
        id,
        order_code,
        status,
        total_amount,
        shipping_fee,
        created_at,
        printed_at,
        mayar_status,
        mayar_live_status_code,
        mayar_live_status_name,
        mayar_status_updated_at,
        mayar_code,
        mayar_shipment_code,
        store_id,
        stores(id, name),
        customers(
          id,
          name,
          phone,
          phone2,
          address,
          cities(name),
          areas(name)
        ),
        order_items(
          id,
          quantity,
          product_variants(
            id,
            color,
            size,
            products(
              id,
              name,
              model
            )
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (result.profile && result.profile.role !== "admin") {
      query = query.eq("store_id", result.profile.store_id);
    }

    const { data, error } = await query;

    if (error) {
      setMessage("خطأ في تحميل سجل الطلبات: " + error.message);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }

  function statusText(status: string) {
    if (status === "new") return "جديد";
    if (status === "processing") return "قيد التجهيز";
    if (status === "sold") return "مباع";
    if (status === "shipped") return "تم الشحن";
    if (status === "delivered") return "تم التسليم";
    if (status === "returned") return "مرتجع";
    return status || "-";
  }

  function statusClass(status: string) {
    if (status === "new") return "text-blue-400";
    if (status === "processing") return "text-yellow-400";
    if (status === "sold") return "text-green-400";
    if (status === "shipped") return "text-purple-400";
    if (status === "delivered") return "text-green-400";
    if (status === "returned") return "text-red-400";
    return "text-neutral-400";
  }

  function getMayarCode(order: any) {
    return order.mayar_code || order.mayar_shipment_code || "-";
  }


  function isMayarOrder(order: any) {
    return Boolean(
      order.mayar_code ||
      order.mayar_shipment_code ||
      order.mayar_status ||
      order.mayar_live_status_code ||
      order.mayar_live_status_name
    );
  }

  function displayedOrderStatus(order: any) {
    if (isMayarOrder(order)) {
      return order.mayar_live_status_name || "لم يتم تحديث حالة المعيار";
    }

    return statusText(order.status);
  }

  function displayedOrderStatusClass(order: any) {
    if (!isMayarOrder(order)) {
      return statusClass(order.status);
    }

    const text = String(order.mayar_live_status_name || "");

    if (text.includes("تم التسليم")) return "text-green-400";
    if (text.includes("تعذر")) return "text-red-400";
    if (text.includes("إرجاع") || text.includes("الإرجاع")) return "text-orange-400";
    if (text.includes("قيد التوصيل")) return "text-purple-400";
    if (text.includes("إعادة توصيل")) return "text-yellow-400";
    if (text.includes("المخزن")) return "text-blue-400";
    if (text.includes("طلب شحن") || text.includes("انتظار الشحن")) {
      return "text-yellow-400";
    }

    return "text-neutral-400";
  }

  function formatDateTime(value: string | null) {
    if (!value) return "-";

    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const productsText = (order.order_items || [])
        .map((item: any) => {
          const variant = item.product_variants;
          const product = variant?.products;

          return [
            product?.name || "",
            product?.model || "",
            variant?.color || "",
            variant?.size || "",
          ].join(" ");
        })
        .join(" ");

      const searchableText = [
        order.order_code || "",
        order.customers?.name || "",
        order.customers?.phone || "",
        order.customers?.phone2 || "",
        order.customers?.cities?.name || "",
        order.customers?.areas?.name || "",
        order.stores?.name || "",
        getMayarCode(order),
        productsText,
      ]
        .join(" ")
        .toLowerCase();

      const createdDate = String(order.created_at || "").slice(0, 10);

      const matchesSearch = searchableText.includes(search.trim().toLowerCase());
      const matchesStore = !storeFilter || order.store_id === storeFilter;
      const matchesStatus =
        !statusFilter ||
        (!isMayarOrder(order) && order.status === statusFilter) ||
        (isMayarOrder(order) &&
          String(order.mayar_live_status_name || "").includes(statusFilter));
      const matchesDateFrom = !dateFrom || createdDate >= dateFrom;
      const matchesDateTo = !dateTo || createdDate <= dateTo;

      return (
        matchesSearch &&
        matchesStore &&
        matchesStatus &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [orders, search, storeFilter, statusFilter, dateFrom, dateTo]);

  const totalVisibleAmount = filteredOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

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
          <h1 className="text-3xl font-bold">السجل / الأرشيف</h1>
          <p className="mt-2 text-neutral-400">
            جميع الطلبات محفوظة للعرض والبحث فقط
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={loadData}
            className="rounded-xl border border-neutral-700 px-5 py-3 font-bold"
          >
            تحديث
          </button>

          <a
            href="/"
            className="rounded-xl bg-white px-5 py-3 font-bold text-black"
          >
            لوحة التحكم
          </a>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-6">
        <input
          className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
          placeholder="بحث بالكود / الهاتف / الاسم / المدينة / المنتج"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="rounded-xl bg-neutral-900 p-4"
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
        >
          <option value="">كل المتاجر</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl bg-neutral-900 p-4"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">كل الحالات</option>
          <option value="new">جديد</option>
          <option value="processing">قيد التجهيز</option>
          <option value="sold">مباع</option>
          <option value="shipped">تم الشحن</option>
          <option value="delivered">تم التسليم</option>
          <option value="returned">مرتجع</option>
          <option value="طلب شحن">انتظار الشحن - المعيار</option>
          <option value="المخزن">في المخزن - المعيار</option>
          <option value="قيد التوصيل">قيد التوصيل - المعيار</option>
          <option value="إعادة توصيل">إعادة توصيل - المعيار</option>
          <option value="تم التسليم">تم التسليم - المعيار</option>
          <option value="تعذر">تعذر التسليم - المعيار</option>
          <option value="إرجاع">إرجاع للراسل - المعيار</option>
        </select>

        <EnglishDatePicker
          value={dateFrom}
          onChange={setDateFrom}
          placeholder="DD/MM/YYYY"
        />

        <EnglishDatePicker
          value={dateTo}
          onChange={setDateTo}
          placeholder="DD/MM/YYYY"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={() => {
            setSearch("");
            setStoreFilter("");
            setStatusFilter("");
            setDateFrom("");
            setDateTo("");
          }}
          className="rounded-xl border border-neutral-700 px-4 py-3"
        >
          مسح الفلاتر
        </button>

        <div className="rounded-xl bg-neutral-900 px-4 py-3 text-neutral-300">
          عدد الطلبات الظاهرة:{" "}
          <b className="text-white">{filteredOrders.length}</b>
        </div>

        <div className="rounded-xl bg-neutral-900 px-4 py-3 text-neutral-300">
          إجمالي قيمة الطلبات الظاهرة:{" "}
          <b className="text-white">{Number(totalVisibleAmount || 0).toLocaleString("en-US")} د.ل</b>
        </div>
      </div>

      {message && <p className="mb-4 text-red-400">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900">
        <table className="w-full min-w-[1800px] text-right">
          <thead className="bg-neutral-800 text-sm text-neutral-300">
            <tr>
              <th className="p-4">كود الطلب</th>
              <th className="p-4">العميل</th>
              <th className="p-4">الهاتف</th>
              <th className="p-4">المدينة / المنطقة</th>
              <th className="p-4">المتجر</th>
              <th className="p-4">المنتجات</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">كود المعيار</th>
              <th className="p-4">المبلغ</th>
              <th className="p-4">تاريخ ووقت الطلب</th>
              <th className="p-4">تاريخ ووقت الطباعة</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-neutral-400">
                  جاري تحميل السجل...
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-8 text-center text-neutral-400">
                  لا توجد طلبات مطابقة
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-t border-neutral-800 align-top"
                >
                  <td className="p-4 font-bold" dir="ltr">
                    {order.order_code || "-"}
                  </td>

                  <td className="p-4">{order.customers?.name || "-"}</td>

                  <td className="p-4" dir="ltr">
                    <p>{order.customers?.phone || "-"}</p>
                    {order.customers?.phone2 && (
                      <p className="mt-1 text-sm text-neutral-400">
                        {order.customers.phone2}
                      </p>
                    )}
                  </td>

                  <td className="p-4">
                    <p>{order.customers?.cities?.name || "-"}</p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {order.customers?.areas?.name || "-"}
                    </p>
                  </td>

                  <td className="p-4">{order.stores?.name || "-"}</td>

                  <td className="p-4">
                    <div className="grid gap-2">
                      {(order.order_items || []).map((item: any) => {
                        const variant = item.product_variants;
                        const product = variant?.products;

                        return (
                          <div
                            key={item.id}
                            className="rounded-xl bg-neutral-800 p-3"
                          >
                            <p className="font-bold">{product?.name || "-"}</p>
                            <p className="text-sm text-neutral-400">
                              {product?.model || "-"} / {variant?.color || "-"} /{" "}
                              {variant?.size || "-"}
                            </p>
                            <p className="text-sm text-neutral-400">
                              الكمية: {item.quantity || 0}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </td>

                  <td
                    className={`p-4 font-bold ${displayedOrderStatusClass(order)}`}
                  >
                    {displayedOrderStatus(order)}
                  </td>

                  <td className="p-4 font-bold" dir="ltr">
                    {getMayarCode(order)}
                  </td>

                  <td className="p-4 font-bold">
                    {Number(order.total_amount || 0).toLocaleString("en-US")} د.ل
                  </td>

                  <td className="p-4">{formatDateTime(order.created_at)}</td>

                  <td className="p-4">{formatDateTime(order.printed_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
