"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserProfile } from "@/lib/auth";

export default function TrialOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedKept, setSelectedKept] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

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

    let query = supabase
      .from("orders")
      .select(`
        id,
        order_code,
        status,
        total_amount,
        shipping_fee,
        notes,
        created_at,
        trial_due_at,
        trial_status,
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
          variant_id,
          quantity,
          trial_group_key,
          trial_kept,
          product_variants(
            id,
            color,
            size,
            image_url,
            stock_quantity,
            products(
              id,
              name,
              model,
              main_image_url
            )
          )
        )
      `)
      .eq("is_trial_order", true)
      .eq("trial_status", "open")
      .order("created_at", { ascending: false });

    if (result.profile && result.profile.role !== "admin") {
      query = query.eq("store_id", result.profile.store_id);
    }

    const { data, error } = await query;

    if (error) {
      setMessage("خطأ في تحميل طلبات التجربة: " + error.message);
      setOrders([]);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }

  function groupItems(order: any) {
    const groups = new Map<string, any[]>();

    (order.order_items || []).forEach((item: any) => {
      const variant = item.product_variants;
      const product = variant?.products;
      const key =
        item.trial_group_key ||
        `${product?.id || "product"}-${variant?.color || "color"}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(item);
    });

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      items,
      productName: items[0]?.product_variants?.products?.name || "-",
      model: items[0]?.product_variants?.products?.model || "-",
      color: items[0]?.product_variants?.color || "-",
      image:
        items[0]?.product_variants?.image_url ||
        items[0]?.product_variants?.products?.main_image_url,
    }));
  }

  function isLate(order: any) {
    if (!order.trial_due_at) return false;
    return new Date(order.trial_due_at).getTime() <= Date.now();
  }

  const lateCount = useMemo(() => orders.filter(isLate).length, [orders]);

  async function completeTrial(order: any) {
    setMessage("");

    const groups = groupItems(order);

    for (const group of groups) {
      if (!selectedKept[group.key]) {
        setMessage(`اختر القطعة التي أخذها الزبون للمجموعة: ${group.model} / ${group.color}`);
        return;
      }
    }

    for (const group of groups) {
      const keptItemId = selectedKept[group.key];

      for (const item of group.items) {
        const isKept = item.id === keptItemId;

        const { error: keptError } = await supabase
          .from("order_items")
          .update({ trial_kept: isKept })
          .eq("id", item.id);

        if (keptError) {
          setMessage("خطأ في تحديث قطعة التجربة: " + keptError.message);
          return;
        }

        if (!isKept) {
          const variantId = item.variant_id;
          const returnQty = Number(item.quantity || 0);

          const { data: variant, error: variantError } = await supabase
            .from("product_variants")
            .select("stock_quantity")
            .eq("id", variantId)
            .single();

          if (variantError) {
            setMessage("خطأ في قراءة المخزون: " + variantError.message);
            return;
          }

          const beforeQty = Number(variant.stock_quantity || 0);
          const afterQty = beforeQty + returnQty;

          const { error: stockError } = await supabase
            .from("product_variants")
            .update({ stock_quantity: afterQty })
            .eq("id", variantId);

          if (stockError) {
            setMessage("خطأ في إرجاع المخزون: " + stockError.message);
            return;
          }

          await supabase.from("inventory_movements").insert({
            variant_id: variantId,
            movement_type: "trial_return",
            quantity_change: returnQty,
            quantity_before: beforeQty,
            quantity_after: afterQty,
            reason: `إرجاع تجربة - ${order.order_code}`,
          });
        }
      }
    }

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        trial_status: "closed",
        trial_closed_at: new Date().toISOString(),
        status: "delivered",
      })
      .eq("id", order.id);

    if (orderError) {
      setMessage("تم إرجاع المخزون لكن حدث خطأ في إغلاق الطلب: " + orderError.message);
      return;
    }

    setMessage(`تم إغلاق طلب التجربة ${order.order_code} وإرجاع القطع غير المختارة للمخزون`);
    await loadData();
  }

  if (loading) {
    return (
      <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
        جاري التحميل...
      </main>
    );
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">طلبات التجربة</h1>
          <p className="mt-2 text-neutral-400">
            اختر القطع التي أخذها الزبون، وسيتم إرجاع باقي المقاسات للمخزون.
          </p>
        </div>

        <a href="/orders" className="rounded-xl bg-white px-5 py-3 font-bold text-black">
          الرجوع للطلبات
        </a>
      </div>

      <div className="mb-6 rounded-xl bg-neutral-900 p-4">
        الطلبات المفتوحة: <b>{orders.length}</b>
        <span className="mx-3">|</span>
        المتأخرة أكثر من 10 ساعات: <b className="text-red-400">{lateCount}</b>
      </div>

      {message && <p className="mb-6 rounded-xl bg-neutral-900 p-4">{message}</p>}

      <div className="grid gap-6">
        {orders.length === 0 && (
          <div className="rounded-xl bg-neutral-900 p-6 text-neutral-300">
            لا توجد طلبات تجربة مفتوحة.
          </div>
        )}

        {orders.map((order) => {
          const groups = groupItems(order);

          return (
            <div
              key={order.id}
              className={`rounded-2xl border p-5 ${
                isLate(order) ? "border-red-600 bg-red-950/30" : "border-neutral-800 bg-neutral-900"
              }`}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">{order.order_code}</h2>
                  <p className="text-neutral-300">
                    {order.customers?.phone || "-"} - {order.customers?.areas?.name || "-"}
                  </p>
                </div>

                <div className="text-left">
                  <p>قيمة الطلب: {order.total_amount} د.ل</p>
                  <p>الشحن: {order.shipping_fee || 0} د.ل</p>
                </div>
              </div>

              <div className="grid gap-4">
                {groups.map((group) => (
                  <div key={group.key} className="rounded-xl bg-neutral-950 p-4">
                    <div className="mb-3 flex items-center gap-3">
                      {group.image && (
                        <img
                          src={group.image}
                          className="h-16 w-16 rounded-xl object-cover"
                          alt=""
                        />
                      )}
                      <div>
                        <b>{group.productName}</b>
                        <p className="text-neutral-400">
                          {group.model} / {group.color}
                        </p>
                      </div>
                    </div>

                    <p className="mb-2 text-sm text-yellow-300">
                      اختر المقاس/القطعة التي أخذها الزبون:
                    </p>

                    <div className="flex flex-wrap gap-3">
                      {group.items.map((item: any) => {
                        const variant = item.product_variants;

                        return (
                          <label
                            key={item.id}
                            className="flex cursor-pointer items-center gap-2 rounded-xl bg-neutral-800 px-4 py-3"
                          >
                            <input
                              type="radio"
                              name={`kept-${order.id}-${group.key}`}
                              checked={selectedKept[group.key] === item.id}
                              onChange={() =>
                                setSelectedKept((prev) => ({
                                  ...prev,
                                  [group.key]: item.id,
                                }))
                              }
                            />
                            <span>
                              {variant?.size || "-"} - الكمية: {item.quantity}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => completeTrial(order)}
                className="mt-5 rounded-xl bg-green-500 px-5 py-3 font-bold text-black"
              >
                إغلاق طلب التجربة وإرجاع الباقي للمخزون
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
