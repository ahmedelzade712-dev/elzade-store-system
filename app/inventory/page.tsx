"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function InventoryPage() {

  function getSizeSortValue(size: string) {
    const normalized = String(size || "").trim().toUpperCase();
    const order: Record<string, number> = {
      M: 1,
      L: 2,
      XL: 3,
      "2XL": 4,
      "3XL": 5,
    };

    return order[normalized] || 999;
  }

  function sortBySize(a: any, b: any) {
    const sizeDiff = getSizeSortValue(a.size) - getSizeSortValue(b.size);
    if (sizeDiff !== 0) return sizeDiff;

    return String(a.size || "").localeCompare(String(b.size || ""), "en");
  }

  const [items, setItems] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [stockOperation, setStockOperation] = useState<"add" | "subtract">("add");
  const [addQty, setAddQty] = useState("");

  useEffect(() => {
    loadInventory();
    loadStores();
  }, []);

  async function loadStores() {
    const { data } = await supabase
      .from("stores")
      .select("id, name")
      .order("name");

    setStores(data || []);
  }

  async function loadInventory() {
    setLoading(true);

    const { data, error } = await supabase
      .from("product_variants")
      .select(`
        id,
        color,
        size,
        cost_price,
        sale_price,
        stock_quantity,
        is_active,
        stores(name),
        products(
          id,
          sku,
          name,
          model,
          product_type,
          fabric,
          main_image_url
        )
      `)
      .order("created_at", { ascending: false });

    if (!error && data) setItems(data);
    setLoading(false);
  }

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const product = item.products;
        const store = item.stores;

        const text = `
          ${product?.sku || ""}
          ${product?.name || ""}
          ${product?.model || ""}
          ${product?.product_type || ""}
          ${item.color || ""}
          ${item.size || ""}
          ${store?.name || ""}
        `.toLowerCase();

        return (
          text.includes(search.toLowerCase()) &&
          (!storeFilter || store?.name === storeFilter) &&
          (!typeFilter || product?.product_type === typeFilter)
        );
      })
      .sort((a, b) => {
        const productDiff = String(a.products?.name || "").localeCompare(
          String(b.products?.name || ""),
          "ar"
        );
        if (productDiff !== 0) return productDiff;

        const colorDiff = String(a.color || "").localeCompare(
          String(b.color || ""),
          "ar"
        );
        if (colorDiff !== 0) return colorDiff;

        return sortBySize(a, b);
      });
  }, [items, search, storeFilter, typeFilter]);

  const stats = useMemo(() => {
    const statsItems = storeFilter
      ? items.filter((item) => item.stores?.name === storeFilter)
      : items;

    const totalPieces = statsItems.reduce(
      (sum, item) => sum + Number(item.stock_quantity || 0),
      0
    );

    const availablePieces = statsItems
      .filter((i) => i.is_active && i.stock_quantity > 0)
      .reduce((sum, item) => sum + Number(item.stock_quantity || 0), 0);

    const lowVariants = statsItems.filter(
      (i) => i.is_active && i.stock_quantity > 0 && i.stock_quantity <= 5
    ).length;

    const outVariants = statsItems.filter(
      (i) => i.is_active && i.stock_quantity <= 0
    ).length;

    return { totalPieces, availablePieces, lowVariants, outVariants };
  }, [items, storeFilter]);

  function getStockStatus(item: any) {
    if (!item.is_active) return { text: "موقوف", className: "text-neutral-400" };
    if (item.stock_quantity <= 0) return { text: "نفد", className: "text-red-400" };
    if (item.stock_quantity <= 5) return { text: "كمية منخفضة", className: "text-yellow-400" };
    return { text: "متوفر", className: "text-green-400" };
  }

  async function handleAddStock() {
    if (!selectedItem) return;

    const qty = Number(addQty);

    if (!Number.isInteger(qty) || qty <= 0) {
      setMessage("اكتب كمية صحيحة أكبر من صفر");
      return;
    }

    const { data: currentVariant, error: currentError } = await supabase
      .from("product_variants")
      .select("id, stock_quantity")
      .eq("id", selectedItem.id)
      .single();

    if (currentError || !currentVariant) {
      setMessage(
        "تعذر قراءة الكمية الحالية: " +
          (currentError?.message || "المقاس غير موجود")
      );
      return;
    }

    const beforeQty = Number(currentVariant.stock_quantity || 0);

    if (stockOperation === "subtract" && qty > beforeQty) {
      setMessage(`لا يمكن خصم ${qty} لأن الكمية الحالية ${beforeQty} فقط`);
      return;
    }

    const signedChange = stockOperation === "add" ? qty : -qty;
    const afterQty = beforeQty + signedChange;

    const { data: updatedVariant, error: updateError } = await supabase
      .from("product_variants")
      .update({ stock_quantity: afterQty })
      .eq("id", selectedItem.id)
      .select("id, stock_quantity")
      .single();

    if (updateError || !updatedVariant) {
      setMessage(
        "خطأ في تحديث المخزون: " +
          (updateError?.message || "لم يتم تحديث أي صف")
      );
      return;
    }

    if (Number(updatedVariant.stock_quantity) !== afterQty) {
      setMessage("لم يتم حفظ الكمية الجديدة في قاعدة البيانات");
      return;
    }

    const { error: movementError } = await supabase
      .from("inventory_movements")
      .insert({
        variant_id: selectedItem.id,
        movement_type:
          stockOperation === "add" ? "add_stock" : "remove_stock",
        quantity_change: signedChange,
        quantity_before: beforeQty,
        quantity_after: afterQty,
        reason:
          stockOperation === "add"
            ? "إضافة كمية من صفحة المخزون"
            : "خصم كمية من صفحة المخزون",
      });

    if (movementError) {
      const { error: rollbackError } = await supabase
        .from("product_variants")
        .update({ stock_quantity: beforeQty })
        .eq("id", selectedItem.id);

      setMessage(
        rollbackError
          ? "فشل تسجيل حركة المخزون وفشل التراجع عن التعديل: " +
              movementError.message
          : "تم إلغاء التعديل لأن تسجيل حركة المخزون فشل: " +
              movementError.message
      );
      await loadInventory();
      return;
    }

    setMessage(
      stockOperation === "add"
        ? "تمت إضافة الكمية بنجاح"
        : "تم خصم الكمية بنجاح"
    );
    setSelectedItem(null);
    setStockOperation("add");
    setAddQty("");
    await loadInventory();
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">المخزون</h1>
          <p className="mt-2 text-neutral-400">
            إدارة المنتجات والكميات والأسعار
          </p>
        </div>

        <a
          href="/products/new"
          className="rounded-xl bg-white px-5 py-3 font-bold text-black"
        >
          + إضافة منتج
        </a>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-neutral-400">إجمالي القطع في المخزن</p>
          <h2 className="mt-2 text-3xl font-bold">{stats.totalPieces}</h2>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-neutral-400">القطع المتوفرة</p>
          <h2 className="mt-2 text-3xl font-bold text-green-400">{stats.availablePieces}</h2>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-neutral-400">مقاسات كمية منخفضة</p>
          <h2 className="mt-2 text-3xl font-bold text-yellow-400">{stats.lowVariants}</h2>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-neutral-400">مقاسات نفدت</p>
          <h2 className="mt-2 text-3xl font-bold text-red-400">{stats.outVariants}</h2>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <input
          className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
          placeholder="بحث باسم المنتج / الكود / اللون / المقاس"
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
            <option key={store.id} value={store.name}>
              {store.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl bg-neutral-900 p-4"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">كل الأنواع</option>
          <option value="بيجامة">بيجامة</option>
          <option value="عباية">عباية</option>
          <option value="بدلة">بدلة</option>
          <option value="حقيبة">حقيبة</option>
          <option value="حذاء">حذاء</option>
          <option value="أخرى">أخرى</option>
        </select>

        <button
          onClick={() => {
            setSearch("");
            setStoreFilter("");
            setTypeFilter("");
          }}
          className="rounded-xl border border-neutral-700 p-4"
        >
          مسح الفلاتر
        </button>
      </div>

      {message && <p className="mb-4 text-yellow-400">{message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900">
        <table className="w-full min-w-[1200px] text-right">
          <thead className="bg-neutral-800 text-sm text-neutral-300">
            <tr>
              <th className="p-4">الصورة</th>
              <th className="p-4">الكود</th>
              <th className="p-4">المنتج</th>
              <th className="p-4">الموديل</th>
              <th className="p-4">النوع</th>
              <th className="p-4">اللون</th>
              <th className="p-4">المقاس</th>
              <th className="p-4">الكمية</th>
              <th className="p-4">التكلفة</th>
              <th className="p-4">البيع</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">المتجر</th>
              <th className="p-4">الإجراءات</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="p-8 text-center text-neutral-400">
                  جاري تحميل المخزون...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-8 text-center text-neutral-400">
                  لا توجد منتجات في المخزون
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const product = item.products;
                const status = getStockStatus(item);

                return (
                  <tr key={item.id} className="border-t border-neutral-800">
                    <td className="p-4">
                      {product?.main_image_url ? (
                        <img
                          src={product.main_image_url}
                          alt={product?.name || "product"}
                          className="h-16 w-16 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-neutral-800 text-xs text-neutral-500">
                          بدون صورة
                        </div>
                      )}
                    </td>

                    <td className="p-4">{product?.sku || "-"}</td>
                    <td className="p-4 font-bold">{product?.name || "-"}</td>
                    <td className="p-4">{product?.model || "-"}</td>
                    <td className="p-4">{product?.product_type || "-"}</td>
                    <td className="p-4">{item.color}</td>
                    <td className="p-4">{item.size}</td>
                    <td className="p-4 font-bold">{item.stock_quantity}</td>
                    <td className="p-4">{item.cost_price} د.ل</td>
                    <td className="p-4">{item.sale_price} د.ل</td>
                    <td className={`p-4 font-bold ${status.className}`}>
                      {status.text}
                    </td>
                    <td className="p-4">{item.stores?.name || "-"}</td>
                    <td className="p-4">
                      <button
                        onClick={() => setSelectedItem(item)}
                        className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-black"
                      >
                        تعديل المخزون
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 p-6">
            <h2 className="mb-2 text-2xl font-bold">تعديل المخزون</h2>

            <p className="mb-6 text-neutral-400">
              {selectedItem.products?.name} - {selectedItem.color} - {selectedItem.size}
            </p>

            <p className="mb-3 text-sm text-neutral-400">
              الكمية الحالية: {selectedItem.stock_quantity}
            </p>

            <select
              className="mb-3 w-full rounded-xl bg-neutral-800 p-4"
              value={stockOperation}
              onChange={(e) =>
                setStockOperation(e.target.value as "add" | "subtract")
              }
            >
              <option value="add">➕ إضافة للمخزون</option>
              <option value="subtract">➖ خصم من المخزون</option>
            </select>

            <input
              className="mb-3 w-full rounded-xl bg-neutral-800 p-4"
              type="number"
              min="1"
              step="1"
              placeholder="الكمية"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
            />

            <div className="mb-6 rounded-xl bg-neutral-800 p-4">
              بعد التعديل:{" "}
              <span className="font-bold">
                {Math.max(
                  0,
                  Number(selectedItem.stock_quantity || 0) +
                    (stockOperation === "add" ? 1 : -1) *
                      Number(addQty || 0)
                )}
              </span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddStock}
                className="flex-1 rounded-xl bg-white p-3 font-bold text-black"
              >
                حفظ
              </button>

              <button
                onClick={() => {
                  setSelectedItem(null);
                  setStockOperation("add");
                  setAddQty("");
                }}
                className="flex-1 rounded-xl border border-neutral-700 p-3"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
