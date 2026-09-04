"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { getCurrentUserProfile } from "@/lib/auth";
import QrScannerModal from "@/app/components/QrScannerModal";

function normalizeWhatsappTarget(value: string) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (raw.startsWith("@")) {
    const username = raw.slice(1).trim();

    if (!username || /\s/.test(username)) return "";

    return `https://wa.me/${encodeURIComponent(username)}`;
  }

  const compact = raw.replace(/\s+/g, "");

  if (
    /^[A-Za-z0-9._-]+$/.test(compact) &&
    /[A-Za-z._-]/.test(compact)
  ) {
    return `https://wa.me/${encodeURIComponent(compact)}`;
  }

  const digits = raw.replace(/\D/g, "");

  if (/^09\d{8}$/.test(digits)) {
    return `https://wa.me/218${digits.slice(1)}`;
  }

  if (/^218\d{9}$/.test(digits)) {
    return `https://wa.me/${digits}`;
  }

  if (/^\d{8,15}$/.test(digits)) {
    return `https://wa.me/${digits}`;
  }

  return "";
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} د.ل`;
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

function isMayarOrder(order: any) {
  return Boolean(
    order?.mayar_code ||
      order?.mayar_live_status_code ||
      order?.mayar_live_status_name
  );
}

function displayedStatus(order: any) {
  if (isMayarOrder(order)) {
    return order.mayar_live_status_name || "لم يتم تحديث حالة المعيار";
  }

  if (order.status === "new") return "جديد";
  if (order.status === "shipped") return "تم الشحن";
  if (order.status === "delivered") return "تم التسليم";

  return order.status || "-";
}

export default function OrderSearchPage() {
  const [profile, setProfile] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [loading, setLoading] = useState(false);
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
    const raw = String(rawValue || "").trim();

    if (!raw) {
      setMessage("أدخل كود الطلب أو كود المعيار أو رقم الهاتف");
      return;
    }

    setLoading(true);
    setMessage("");
    setResults([]);

    try {
      const normalized = raw.replace(/\s+/g, "");
      const candidates: string[] = [];

      const addCandidate = (value: string) => {
        const clean = String(value || "").trim();
        if (clean && !candidates.includes(clean)) candidates.push(clean);
      };

      // 1) البحث كما كتبه المستخدم.
      addCandidate(normalized);

      // 2) أكوادنا A / D / B ... بدون حساسية للحروف.
      if (/^[a-zA-Z]+\d+$/.test(normalized)) {
        addCandidate(normalized.toUpperCase());
        addCandidate(normalized.toLowerCase());
      }

      // 3) كود المعيار: يقبل N أو n أو الرقم فقط.
      if (/^[nN]\d+$/.test(normalized)) {
        addCandidate(`N${normalized.slice(1)}`);
        addCandidate(`n${normalized.slice(1)}`);
      } else if (/^\d+$/.test(normalized)) {
        // نحاول الرقم نفسه أولاً حتى يظل البحث برقم الهاتف يعمل،
        // ثم نجربه ككود معيار بإضافة N تلقائياً.
        addCandidate(`N${normalized}`);
        addCandidate(`n${normalized}`);
      }

      const merged = new Map<string, any>();

      for (const candidate of candidates) {
        const response = await fetch(
          `/api/search-orders?q=${encodeURIComponent(candidate)}`,
          { cache: "no-store" }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.error || "فشل البحث");
        }

        for (const order of result.results || []) {
          if (order?.id) merged.set(order.id, order);
        }

        // إذا وجدنا نتيجة دقيقة، لا نحتاج إكمال كل الاحتمالات.
        if (merged.size > 0) break;
      }

      const foundResults = Array.from(merged.values());

      setResults(foundResults);
      setSelectedOrderId(foundResults.length === 1 ? foundResults[0].id : "");

      if (foundResults.length === 0) {
        setMessage("لا توجد طلبات مطابقة");
      }
    } catch (error: any) {
      setMessage(error.message || "حدث خطأ أثناء البحث");
    } finally {
      setLoading(false);
    }
  }

  async function searchOrders(event?: FormEvent) {
    event?.preventDefault();
    await runSearch(query);
  }

  function handleQrScan(scannedValue: string) {
    setScannerOpen(false);
    setQuery(scannedValue);
    void runSearch(scannedValue);
  }

  function resetSearch() {
    setQuery("");
    setResults([]);
    setSelectedOrderId("");
    setMessage("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function selectedOrder() {
    if (results.length === 1) return results[0];
    return results.find((order) => order.id === selectedOrderId) || null;
  }

  async function copyOrderCode(orderCode: string) {
    try {
      await navigator.clipboard.writeText(orderCode);
      setMessage(`تم نسخ كود الطلب ${orderCode}`);
    } catch {
      setMessage("تعذر نسخ كود الطلب");
    }
  }

  const activeOrder = selectedOrder();

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
          <h1 className="text-3xl font-bold">البحث عن الطلبات</h1>
          <p className="mt-2 text-neutral-400">
            بحث بكودنا أو كود المعيار أو رقم الهاتف أو قارئ QR
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
        onSubmit={searchOrders}
        className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            ref={inputRef}
            dir="ltr"
            className="rounded-xl bg-neutral-800 p-4 text-left"
            placeholder="Order code / Mayar code / Phone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
            onClick={resetSearch}
            className="rounded-xl border border-neutral-700 px-6 py-4"
          >
            مسح
          </button>
        </div>
      </form>

      {message && (
        <p className="mb-5 rounded-xl bg-neutral-900 p-4 text-yellow-400">
          {message}
        </p>
      )}

      {results.length > 1 && (
        <section className="mb-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-xl font-bold">الطلبات المطابقة</h2>

          <div className="grid gap-3">
            {results.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedOrderId(order.id)}
                className={`grid gap-2 rounded-xl border p-4 text-right md:grid-cols-4 ${
                  selectedOrderId === order.id
                    ? "border-white bg-neutral-800"
                    : "border-neutral-800 bg-neutral-950"
                }`}
              >
                <span dir="ltr" className="font-black text-left">
                  {order.order_code}
                </span>
                <span>{displayedStatus(order)}</span>
                <span dir="ltr" className="text-left">
                  {formatDateTime(order.created_at)}
                </span>
                <span>{order.store_name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6">
        {activeOrder && (
          <section
            key={activeOrder.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-400">كود الطلب</p>
                <h2 dir="ltr" className="text-3xl font-black">
                  {activeOrder.order_code}
                </h2>
              </div>

              <div className="text-left">
                <p className="text-sm text-neutral-400">كود المعيار</p>
                <p dir="ltr" className="text-xl font-bold">
                  {activeOrder.mayar_code || "-"}
                </p>
              </div>
            </div>

            <div className="mb-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => copyOrderCode(activeOrder.order_code)}
                className="rounded-xl border border-neutral-700 px-4 py-3 font-bold"
              >
                نسخ كود الطلب
              </button>

              <a
                href={`/returns?code=${encodeURIComponent(activeOrder.order_code)}`}
                className="rounded-xl bg-red-600 px-4 py-3 font-bold"
              >
                الذهاب إلى الاسترجاع
              </a>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">الحالة</p>
                <p className="mt-1 font-bold">{displayedStatus(activeOrder)}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">المتجر</p>
                <p className="mt-1 font-bold">{activeOrder.store_name}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">العميل</p>
                <p className="mt-1 font-bold">{activeOrder.customer.name}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">الهاتف</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {activeOrder.customer.phone}
                </p>
                {activeOrder.customer.phone2 && (
                  <p dir="ltr" className="mt-1 text-sm text-neutral-400 text-right">
                    {activeOrder.customer.phone2}
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">المدينة / المنطقة</p>
                <p className="mt-1 font-bold">
                  {activeOrder.customer.city} / {activeOrder.customer.area}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4 md:col-span-2">
                <p className="text-sm text-neutral-400">العنوان</p>
                <p className="mt-1 font-bold">{activeOrder.customer.address}</p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4 md:col-span-2">
                <p className="mb-3 text-sm text-neutral-400">المحادثات</p>

                <div className="flex flex-wrap gap-3">
                  {activeOrder.customer.meta_link ? (
                    <a
                      href={activeOrder.customer.meta_link}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-blue-600 px-5 py-3 font-bold"
                    >
                      فتح Messenger
                    </a>
                  ) : (
                    <span className="rounded-xl bg-neutral-700 px-5 py-3 text-neutral-400">
                      لا يوجد رابط Messenger
                    </span>
                  )}

                  {activeOrder.customer.whatsapp_link ? (
                    <a
                      href={normalizeWhatsappTarget(activeOrder.customer.whatsapp_link)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-green-600 px-5 py-3 font-bold"
                    >
                      فتح WhatsApp
                    </a>
                  ) : (
                    <span className="rounded-xl bg-neutral-700 px-5 py-3 text-neutral-400">
                      لا يوجد رابط WhatsApp
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">قيمة المنتجات</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {money(activeOrder.total_amount)}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">قيمة التوصيل</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {money(activeOrder.shipping_fee)}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">تاريخ الطلب</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {formatDateTime(activeOrder.created_at)}
                </p>
              </div>

              <div className="rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">تاريخ الطباعة</p>
                <p dir="ltr" className="mt-1 font-bold text-right">
                  {formatDateTime(activeOrder.printed_at)}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-xl font-bold">المنتجات</h3>

              <div className="grid gap-3">
                {(activeOrder.items || []).map((item: any) => (
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
            </div>


            {activeOrder.notes && (
              <div className="mt-6 rounded-xl bg-neutral-800 p-4">
                <p className="text-sm text-neutral-400">ملاحظات</p>
                <p className="mt-1">{activeOrder.notes}</p>
              </div>
            )}
          </section>
        )}
      </div>
      <QrScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
        title="قراءة QR والبحث عن الطلب"
      />
    </main>
  );
}
