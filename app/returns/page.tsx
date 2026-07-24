"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";
import QrScannerModal from "@/app/components/QrScannerModal";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} د.ل`;
}


function orderStatusText(order: any) {
  const isMayar = Boolean(
    order?.mayar_code ||
    order?.mayar_live_status_code ||
    order?.mayar_live_status_name
  );

  if (isMayar) {
    return order.mayar_live_status_name || "لم يتم تحديث حالة المعيار";
  }

  if (order.status === "delivered") return "تم التسليم";
  if (order.status === "shipped") return "تم الشحن";
  if (order.status === "new") return "جديد";
  return order.status || "-";
}

function mayarStatusText(order: any) {
  return order?.mayar_live_status_name || "لم يتم تحديث حالة المعيار";
}

export default function ReturnsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [alreadyReturned, setAlreadyReturned] = useState(false);
  const [isExchangeReturn, setIsExchangeReturn] = useState(false);
  const [exchangeOrder, setExchangeOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const result = await getCurrentUserProfile();

      if (result.error) {
        window.location.href = "/login";
        return;
      }

      setProfile(result.profile);
      setTimeout(() => inputRef.current?.focus(), 100);
    }

    loadProfile();
  }, []);

  async function runSearch(rawValue: string) {
    const value = rawValue.trim();

    if (!value) {
      setMessage("أدخل كود الطلب أو كود المعيار");
      return;
    }

    setLoading(true);
    setMessage("");
    setOrder(null);
    setAlreadyReturned(false);
    setIsExchangeReturn(false);
    setExchangeOrder(null);

    try {
      const response = await fetch(
        `/api/returns?code=${encodeURIComponent(value)}`,
        {
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "لم يتم العثور على الطلب");
      }

      setOrder(result.order);
      setAlreadyReturned(Boolean(result.already_returned));
      setIsExchangeReturn(Boolean(result.is_exchange_return));
      setExchangeOrder(result.exchange_order || null);
    } catch (error: any) {
      setMessage(error.message || "حدث خطأ أثناء البحث");
    } finally {
      setLoading(false);
    }
  }

  async function searchOrder(event?: FormEvent) {
    event?.preventDefault();
    await runSearch(code);
  }

  function handleQrScan(scannedValue: string) {
    setScannerOpen(false);
    setCode(scannedValue);
    void runSearch(scannedValue);
  }

  async function executeReturn() {
    if (!order || executing || alreadyReturned) return;

    const confirmed = window.confirm(
      isExchangeReturn
        ? `الطلب ${order.order_code} هو القطعة القديمة في استبدال ${exchangeOrder?.order_code || ""}. سيتم فقط إعادة القطعة المستبدلة إلى المخزون دون خصم أي مبلغ من الرصيد. هل وصلت القطعة فعليًا؟`
        : `هل أنت متأكد من استرجاع الطلب ${order.order_code} وإعادة كل منتجاته إلى المخزون؟`
    );

    if (!confirmed) return;

    setExecuting(true);
    setMessage("");

    try {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: order.order_code,
          reason: reason.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "فشل تنفيذ الاسترجاع");
      }

      setAlreadyReturned(true);
      setMessage(
        result.is_exchange_return
          ? result.message || "تمت إعادة القطعة المستبدلة إلى المخزون دون تعديل الرصيد"
          : "تم استرجاع الطلب وإعادة المنتجات إلى المخزون بنجاح"
      );
    } catch (error: any) {
      setMessage(error.message || "حدث خطأ أثناء الاسترجاع");
    } finally {
      setExecuting(false);
    }
  }

  function resetPage() {
    setCode("");
    setReason("");
    setOrder(null);
    setAlreadyReturned(false);
    setIsExchangeReturn(false);
    setExchangeOrder(null);
    setMessage("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

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
          <h1 className="text-3xl font-bold">استرجاع الطلب</h1>
          <p className="mt-2 text-neutral-400">
            ابحث بكود الطلب أو كود المعيار أو امسح QR
          </p>
        </div>

        <a
          href="/"
          className="rounded-xl bg-white px-5 py-3 font-bold text-black"
        >
          لوحة التحكم
        </a>
      </div>

      <form
        onSubmit={searchOrder}
        className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            ref={inputRef}
            dir="ltr"
            className="rounded-xl bg-neutral-800 p-4 text-left"
            placeholder="Order code / Mayar code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-green-500 px-6 py-4 font-bold text-black disabled:opacity-50"
          >
            {loading ? "جاري البحث..." : "بحث"}
          </button>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="rounded-xl bg-blue-600 px-6 py-4 font-bold"
          >
            فتح الكاميرا وقراءة QR
          </button>

          <button
            type="button"
            onClick={resetPage}
            className="rounded-xl border border-neutral-700 px-6 py-4"
          >
            طلب جديد
          </button>
        </div>
      </form>

      {message && (
        <p
          className={`mb-5 rounded-xl p-4 ${
            message.includes("بنجاح")
              ? "bg-green-950/40 text-green-300"
              : "bg-red-950/40 text-red-300"
          }`}
        >
          {message}
        </p>
      )}

      {order && (
        <div className="grid gap-6">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-neutral-400">كود الطلب</p>
                <h2 dir="ltr" className="text-3xl font-black">
                  {order.order_code}
                </h2>
              </div>

              <div className="text-left">
                <p className="text-neutral-400">كود المعيار</p>
                <p dir="ltr" className="text-xl font-bold">
                  {order.mayar_code || "-"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">المتجر</p>
                <p className="mt-1 font-bold">{order.store_name}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">العميل</p>
                <p className="mt-1 font-bold">{order.customer.name}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">الهاتف</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {order.customer.phone}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">المدينة / المنطقة</p>
                <p className="mt-1 font-bold">
                  {order.customer.city} / {order.customer.area}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">قيمة المنتجات</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {money(order.total_amount)}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">قيمة التوصيل</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {money(order.shipping_fee)}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">حالة الطلب</p>
                <p className="mt-1 font-bold">{orderStatusText(order)}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">حالة المعيار</p>
                <p className="mt-1 font-bold">{mayarStatusText(order)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <h2 className="mb-4 text-2xl font-bold">
              {isExchangeReturn
                ? "القطع القديمة التي ستعود للمخزون"
                : "المنتجات التي ستعود للمخزون"}
            </h2>

            {isExchangeReturn && (
              <div className="mb-4 rounded-xl border border-yellow-600 bg-yellow-950/40 p-4 text-yellow-100">
                <p className="font-bold">هذا طلب بيع ناجح مرتبط بعملية استبدال.</p>
                <p className="mt-1 text-sm">
                  الطلب الأصلي: <span dir="ltr">{order.order_code}</span> — طلب الاستبدال: <span dir="ltr">{exchangeOrder?.order_code || "-"}</span>
                </p>
                <p className="mt-1 text-sm">
                  سيتم فقط إعادة القطعة القديمة إلى المخزون. لن يتم خصم قيمة الطلب أو عكس أي حركة مالية.
                </p>
              </div>
            )}

            <div className="grid gap-3">
              {(isExchangeReturn ? exchangeOrder?.items || [] : order.items || []).map((item: any) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-neutral-800 p-4"
                >
                  <div className="flex items-center gap-4">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt="product"
                        className="h-20 w-20 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-xl bg-neutral-700" />
                    )}

                    <div>
                      <p className="font-bold">{item.product_name}</p>
                      <p className="text-sm text-neutral-400">
                        {item.model} / {item.color} / {item.size}
                      </p>
                    </div>
                  </div>

                  <div className="text-left">
                    <p className="text-sm text-neutral-400">الكمية</p>
                    <p dir="ltr" className="text-2xl font-black">
                      {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <label className="mb-2 block text-sm text-neutral-400">
              سبب الاسترجاع — اختياري
            </label>

            <textarea
              className="min-h-28 w-full rounded-xl bg-neutral-800 p-4"
              placeholder="مثال: الزبون لم يرد، تغيير رأي، رفض الاستلام..."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />

            {alreadyReturned ? (
              <div className="mt-5 rounded-xl bg-green-950/40 p-4 font-bold text-green-300">
                تم استرجاع هذا الطلب سابقًا
              </div>
            ) : (
              <button
                type="button"
                onClick={executeReturn}
                disabled={executing}
                className="mt-5 w-full rounded-xl bg-red-600 p-4 text-lg font-bold disabled:opacity-50"
              >
                {executing
                  ? "جاري تنفيذ العملية..."
                  : isExchangeReturn
                  ? "تأكيد وصول القطعة وإعادتها للمخزون فقط"
                  : "تنفيذ الاسترجاع وإعادة المخزون"}
              </button>
            )}
          </section>
        </div>
      )}
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
        title="قراءة QR والبحث عن طلب الاسترجاع"
      />
    </main>
  );
}
