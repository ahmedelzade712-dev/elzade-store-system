"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";

type OrderItem = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  product_name: string;
  model: string;
  color: string;
  size: string;
  image_url: string;
};

type PrivateTripoliOrder = {
  id: string;
  order_code: string;
  store_id: string;
  store_name: string;
  status: string;
  total_amount: number;
  total_cost: number;
  shipping_fee: number;
  notes: string;
  is_selection_order: boolean;
  is_exchange_order: boolean;
  customer: {
    name: string;
    phone: string;
    phone2: string;
    city: string;
    area: string;
    address: string;
  };
  items: OrderItem[];
};

type ActionType = "" | "delivered" | "partial" | "returned" | "selection";

export default function PrivateTripoliPage() {
  const [orders, setOrders] = useState<PrivateTripoliOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [busyOrderId, setBusyOrderId] = useState("");
  const [actions, setActions] = useState<Record<string, ActionType>>({});
  const [partialAmounts, setPartialAmounts] = useState<Record<string, string>>({});
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [keptQty, setKeptQty] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<any>(null);

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

    const storeParam =
      result.profile?.role !== "admin" && result.profile?.store_id
        ? `?store_id=${encodeURIComponent(result.profile.store_id)}`
        : "";

    try {
      const response = await fetch(`/api/private-tripoli${storeParam}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data.error || "فشل تحميل طلبات طرابلس خاصة");
        setOrders([]);
      } else {
        setOrders(data.orders || []);
      }
    } catch (error: any) {
      setMessage("فشل الاتصال بالخادم: " + (error?.message || "خطأ غير معروف"));
    }

    setLoading(false);
  }

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((order) => {
      const itemText = order.items
        .map((item) => `${item.product_name} ${item.model} ${item.color} ${item.size}`)
        .join(" ");

      const text = `${order.order_code} ${order.customer.name} ${order.customer.phone} ${order.customer.phone2} ${order.customer.area} ${order.store_name} ${itemText}`.toLowerCase();
      return text.includes(q);
    });
  }, [orders, search]);

  function setAction(order: PrivateTripoliOrder, value: ActionType) {
    setActions((prev) => ({ ...prev, [order.id]: value }));

    if (value === "selection") {
      setKeptQty((prev) => {
        const next = { ...prev };
        for (const item of order.items) {
          const key = `${order.id}:${item.id}`;
          if (next[key] === undefined) next[key] = 0;
        }
        return next;
      });
    }

    if (value === "partial") {
      setReturnQty((prev) => {
        const next = { ...prev };
        for (const item of order.items) {
          const key = `${order.id}:${item.id}`;
          if (next[key] === undefined) next[key] = 0;
        }
        return next;
      });
    }
  }

  async function submitOrder(order: PrivateTripoliOrder) {
    const action = actions[order.id] || (order.is_selection_order ? "selection" : "");

    if (!action) {
      setMessage(`اختر نتيجة الطلب ${order.order_code}`);
      return;
    }

    if (order.is_selection_order && action !== "selection" && action !== "returned") {
      setMessage("طلب الاختيار يجب تحديد القطع التي أخذها الزبون أو تحويله إلى مرتجع");
      return;
    }

    if (action === "returned") {
      const ok = window.confirm(
        `هل أنت متأكد أن الطلب ${order.order_code} مرتجع بالكامل؟ سيتم إرجاع كل القطع للمخزن بدون أي حركة مالية.`
      );
      if (!ok) return;
    }

    const body: any = {
      order_id: order.id,
      action,
    };

    if (action === "partial") {
      const amount = Number(partialAmounts[order.id] || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        setMessage("أدخل القيمة التي استلمها الموظف من الزبون");
        return;
      }

      const returnedItems = order.items
        .map((item) => ({
          order_item_id: item.id,
          quantity: Number(returnQty[`${order.id}:${item.id}`] || 0),
        }))
        .filter((row) => row.quantity > 0);

      if (returnedItems.length === 0) {
        setMessage("حدد القطع التي رجعت إلى المخزن");
        return;
      }

      body.received_amount = amount;
      body.returned_items = returnedItems;
    }

    if (action === "selection") {
      const keptItems = order.items
        .map((item) => ({
          order_item_id: item.id,
          quantity: Number(keptQty[`${order.id}:${item.id}`] || 0),
        }))
        .filter((row) => row.quantity > 0);

      if (keptItems.length === 0) {
        setMessage("حدد القطعة أو القطع التي أخذها الزبون");
        return;
      }

      body.kept_items = keptItems;
    }

    setBusyOrderId(order.id);
    setMessage("");

    try {
      const response = await fetch("/api/private-tripoli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        setMessage(result.error || "فشل تحديث الطلب");
        return;
      }

      setMessage(result.message || "تم تحديث الطلب بنجاح");
      setActions((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      await loadData();
    } catch (error: any) {
      setMessage("فشل الاتصال بالخادم: " + (error?.message || "خطأ غير معروف"));
    } finally {
      setBusyOrderId("");
    }
  }

  function selectionTotal(order: PrivateTripoliOrder) {
    return order.items.reduce((sum, item) => {
      const qty = Number(keptQty[`${order.id}:${item.id}`] || 0);
      return sum + qty * Number(item.unit_price || 0);
    }, 0);
  }

  if (loading) {
    return (
      <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
        جاري تحميل طلبات طرابلس خاصة...
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-6 text-white md:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">طلبات طرابلس خاصة</h1>
          <p className="mt-2 text-neutral-400">
            تظهر هنا فقط الطلبات تحت حالة جاري الشحن. لا تسجل أي حركة مالية إلا بعد تحديد النتيجة الفعلية.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={loadData}
            className="rounded-xl border border-neutral-700 px-5 py-3 font-bold"
          >
            تحديث
          </button>
          <a href="/orders" className="rounded-xl bg-white px-5 py-3 font-bold text-black">
            الرجوع للطلبات
          </a>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالكود / الاسم / الهاتف / المنطقة / المنتج"
          className="rounded-xl bg-neutral-900 p-4 outline-none"
        />
        <div className="rounded-xl bg-neutral-900 px-5 py-4">
          جاري الشحن: <b>{filteredOrders.length}</b>
        </div>
      </div>

      {message && (
        <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          {message}
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl bg-neutral-900 p-8 text-center text-neutral-400">
          لا توجد طلبات طرابلس خاصة تحت حالة جاري الشحن.
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredOrders.map((order) => {
            const action = actions[order.id] || (order.is_selection_order ? "selection" : "");
            const busy = busyOrderId === order.id;

            return (
              <section key={order.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold">{order.order_code}</h2>
                      <span className="rounded-full bg-purple-900/60 px-3 py-1 text-sm text-purple-200">
                        جاري الشحن
                      </span>
                      {order.is_selection_order && (
                        <span className="rounded-full bg-yellow-900/60 px-3 py-1 text-sm text-yellow-200">
                          طلب اختيار
                        </span>
                      )}
                      {order.is_exchange_order && (
                        <span className="rounded-full bg-blue-900/60 px-3 py-1 text-sm text-blue-200">
                          استبدال
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-neutral-300">
                      {order.customer.name} — {order.customer.phone}
                    </p>
                    <p className="text-neutral-400">
                      {order.customer.area} / {order.customer.address}
                    </p>
                    <p className="text-neutral-500">المتجر: {order.store_name}</p>
                  </div>

                  <div className="text-left">
                    <p>قيمة الطلب: <b>{order.total_amount} د.ل</b></p>
                    <p className="text-neutral-400">التوصيل: {order.shipping_fee} د.ل</p>
                  </div>
                </div>

                <div className="mb-5 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-right">
                    <thead className="text-sm text-neutral-400">
                      <tr className="border-b border-neutral-800">
                        <th className="p-3">المنتج</th>
                        <th className="p-3">اللون</th>
                        <th className="p-3">المقاس</th>
                        <th className="p-3">الكمية</th>
                        <th className="p-3">السعر</th>
                        {action === "partial" && <th className="p-3">الراجع</th>}
                        {action === "selection" && <th className="p-3">أخذ الزبون</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.id} className="border-b border-neutral-800/60">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              {item.image_url && (
                                <img src={item.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                              )}
                              <div>
                                <b>{item.product_name}</b>
                                <div className="text-sm text-neutral-400">{item.model}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">{item.color}</td>
                          <td className="p-3">{item.size}</td>
                          <td className="p-3">{item.quantity}</td>
                          <td className="p-3">{item.unit_price} د.ل</td>

                          {action === "partial" && (
                            <td className="p-3">
                              <input
                                type="number"
                                min={0}
                                max={item.quantity}
                                value={returnQty[`${order.id}:${item.id}`] ?? 0}
                                onChange={(e) => {
                                  const value = Math.max(0, Math.min(item.quantity, Number(e.target.value || 0)));
                                  setReturnQty((prev) => ({
                                    ...prev,
                                    [`${order.id}:${item.id}`]: value,
                                  }));
                                }}
                                className="w-20 rounded-lg bg-neutral-950 p-2"
                              />
                            </td>
                          )}

                          {action === "selection" && (
                            <td className="p-3">
                              <input
                                type="number"
                                min={0}
                                max={item.quantity}
                                value={keptQty[`${order.id}:${item.id}`] ?? 0}
                                onChange={(e) => {
                                  const value = Math.max(0, Math.min(item.quantity, Number(e.target.value || 0)));
                                  setKeptQty((prev) => ({
                                    ...prev,
                                    [`${order.id}:${item.id}`]: value,
                                  }));
                                }}
                                className="w-20 rounded-lg bg-neutral-950 p-2"
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {order.notes && (
                  <div className="mb-5 rounded-xl bg-neutral-950 p-3 text-sm text-neutral-300">
                    ملاحظات: {order.notes}
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-[260px_1fr_auto] lg:items-end">
                  <label>
                    <span className="mb-2 block text-sm text-neutral-400">نتيجة الطلب</span>
                    <select
                      value={action}
                      onChange={(e) => setAction(order, e.target.value as ActionType)}
                      className="w-full rounded-xl bg-neutral-950 p-3"
                    >
                      <option value="">اختر الحالة</option>
                      {order.is_selection_order ? (
                        <>
                          <option value="selection">تم الاختيار / التسليم</option>
                          <option value="returned">مرتجع / لم يتم التسليم</option>
                        </>
                      ) : order.is_exchange_order ? (
                        <>
                          <option value="delivered">تم التسليم</option>
                          <option value="returned">مرتجع / لم يتم التسليم</option>
                        </>
                      ) : (
                        <>
                          <option value="delivered">تم التسليم</option>
                          <option value="partial">تسليم جزئي</option>
                          <option value="returned">مرتجع / لم يتم التسليم</option>
                        </>
                      )}
                    </select>
                  </label>

                  <div>
                    {action === "partial" && (
                      <label>
                        <span className="mb-2 block text-sm text-neutral-400">
                          القيمة التي تم تحصيلها فعليًا
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={partialAmounts[order.id] || ""}
                          onChange={(e) =>
                            setPartialAmounts((prev) => ({ ...prev, [order.id]: e.target.value }))
                          }
                          placeholder="مثال: 200"
                          className="w-full rounded-xl bg-neutral-950 p-3"
                        />
                      </label>
                    )}

                    {action === "selection" && (
                      <div className="rounded-xl bg-neutral-950 p-3">
                        قيمة القطع التي اختارها الزبون: <b>{selectionTotal(order)} د.ل</b>
                      </div>
                    )}

                    {action === "delivered" && (
                      <div className="rounded-xl bg-neutral-950 p-3 text-green-300">
                        سيتم إضافة قيمة الطلب إلى الرصيد وتطبيق منطق المندوب الحالي.
                      </div>
                    )}

                    {action === "returned" && (
                      <div className="rounded-xl bg-neutral-950 p-3 text-red-300">
                        سيتم إرجاع كل القطع للمخزن بدون أي حركة مالية.
                      </div>
                    )}
                  </div>

                  <button
                    disabled={busy}
                    onClick={() => submitOrder(order)}
                    className="rounded-xl bg-green-500 px-6 py-3 font-bold text-black disabled:opacity-50"
                  >
                    {busy ? "جاري الحفظ..." : "تأكيد الحالة"}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
