"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const PRODUCT_TYPES = ["بيجامة", "عباية", "بدلة", "حقيبة", "حذاء", "أخرى"];

const STOCK_REASONS = [
  "بضاعة جديدة",
  "تالف",
  "جرد المخزون",
  "تصحيح خطأ",
  "استخدام للتصوير",
  "هدية",
  "فقدان",
  "نقل أو تسوية مخزون",
  "سبب آخر",
];

type StockOperation = "add" | "subtract";

type StockInput = {
  operation: StockOperation;
  quantity: string;
};

export default function ProductsPage() {

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

  const [variants, setVariants] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");

  const [stockItem, setStockItem] = useState<any>(null);
  const [savingStock, setSavingStock] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const [stockInputs, setStockInputs] = useState<Record<string, StockInput>>({});
  const [stockReason, setStockReason] = useState("");
  const [stockNote, setStockNote] = useState("");

  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editType, setEditType] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editFabric, setEditFabric] = useState("");
  const [editCostPrice, setEditCostPrice] = useState("");
  const [editSalePrice, setEditSalePrice] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setMessage("");

    const { data: storesData } = await supabase
      .from("stores")
      .select("id, name")
      .order("name");

    setStores(storesData || []);

    const { data, error } = await supabase
      .from("product_variants")
      .select(`
        id,
        store_id,
        product_id,
        color,
        size,
        stock_quantity,
        sale_price,
        cost_price,
        image_url,
        is_active,
        stores(id, name),
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

    if (error) {
      setMessage("خطأ في تحميل المنتجات: " + error.message);
    } else {
      setVariants(data || []);
    }

    setLoading(false);
  }

  const groupedProducts = useMemo(() => {
    const map = new Map<string, any>();

    variants.forEach((v) => {
      const productId = v.product_id || v.products?.id;
      const key = `${productId}-${v.color}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          product_id: productId,
          variant_ids: [],
          product: v.products,
          store: v.stores,
          store_id: v.store_id,
          color: v.color,
          image: v.image_url || v.products?.main_image_url,
          sizes: [],
          total_stock: 0,
          sale_price: v.sale_price,
          cost_price: v.cost_price,
          is_active: v.is_active,
        });
      }

      const item = map.get(key);

      item.variant_ids.push(v.id);
      item.sizes.push({
        variant_id: v.id,
        size: v.size,
        quantity: Number(v.stock_quantity || 0),
      });

      item.total_stock += Number(v.stock_quantity || 0);
    });

    return Array.from(map.values()).map((item) => ({
      ...item,
      sizes: [...item.sizes].sort(sortBySize),
    }));
  }, [variants]);

  const filteredProducts = useMemo(() => {
    return groupedProducts.filter((item) => {
      const text = `
        ${item.product?.sku || ""}
        ${item.product?.name || ""}
        ${item.product?.model || ""}
        ${item.product?.product_type || ""}
        ${item.color || ""}
        ${item.store?.name || ""}
      `.toLowerCase();

      return (
        text.includes(search.toLowerCase()) &&
        (!storeFilter || item.store_id === storeFilter)
      );
    });
  }, [groupedProducts, search, storeFilter]);

  function openStockAdjustment(item: any) {
    const inputs: Record<string, StockInput> = {};

    item.sizes.forEach((sizeRow: any) => {
      inputs[sizeRow.variant_id] = {
        operation: "add",
        quantity: "",
      };
    });

    setStockItem(item);
    setStockInputs(inputs);
    setStockReason("");
    setStockNote("");
    setMessage("");
  }

  function closeStockAdjustment() {
    if (savingStock) return;

    setStockItem(null);
    setStockInputs({});
    setStockReason("");
    setStockNote("");
  }

  function updateStockInput(
    variantId: string,
    field: keyof StockInput,
    value: string
  ) {
    setStockInputs((previous) => ({
      ...previous,
      [variantId]: {
        operation: previous[variantId]?.operation || "add",
        quantity: previous[variantId]?.quantity || "",
        [field]: value,
      },
    }));
  }

  function openEdit(item: any) {
    setEditItem(item);
    setEditName(item.product?.name || "");
    setEditModel(item.product?.model || "");
    setEditType(item.product?.product_type || "");
    setEditColor(item.color || "");
    setEditFabric(item.product?.fabric || "");
    setEditCostPrice(String(item.cost_price || ""));
    setEditSalePrice(String(item.sale_price || ""));
    setMessage("");
  }

  async function handleStockAdjustment() {
    if (!stockItem || savingStock) return;

    const changes = stockItem.sizes
      .map((sizeRow: any) => {
        const input = stockInputs[sizeRow.variant_id];
        const enteredQuantity = Number(input?.quantity || 0);

        return {
          ...sizeRow,
          operation: input?.operation || "add",
          enteredQuantity,
        };
      })
      .filter((row: any) => row.enteredQuantity > 0);

    if (changes.length === 0) {
      setMessage("اكتب كمية لمقاس واحد على الأقل");
      return;
    }

    if (!stockReason) {
      setMessage("يجب اختيار سبب تعديل المخزون");
      return;
    }

    if (stockReason === "سبب آخر" && !stockNote.trim()) {
      setMessage("اكتب ملاحظة توضح سبب تعديل المخزون");
      return;
    }

    for (const row of changes) {
      if (!Number.isInteger(row.enteredQuantity)) {
        setMessage(`كمية المقاس ${row.size} يجب أن تكون رقمًا صحيحًا`);
        return;
      }

      if (
        row.operation === "subtract" &&
        row.enteredQuantity > Number(row.quantity || 0)
      ) {
        setMessage(
          `لا يمكن خصم ${row.enteredQuantity} من المقاس ${row.size} لأن الكمية الحالية ${row.quantity} فقط`
        );
        return;
      }
    }

    setSavingStock(true);
    setMessage("جاري تعديل المخزون...");

    try {
      for (const row of changes) {
        const beforeQty = Number(row.quantity || 0);
        const signedChange =
          row.operation === "add"
            ? row.enteredQuantity
            : -row.enteredQuantity;
        const afterQty = beforeQty + signedChange;

        const { error: updateError } = await supabase
          .from("product_variants")
          .update({ stock_quantity: afterQty })
          .eq("id", row.variant_id);

        if (updateError) {
          throw new Error(
            `خطأ في تحديث المقاس ${row.size}: ${updateError.message}`
          );
        }

        const fullReason = stockNote.trim()
          ? `${stockReason} - ${stockNote.trim()}`
          : stockReason;

        const { error: movementError } = await supabase
          .from("inventory_movements")
          .insert({
            variant_id: row.variant_id,
            movement_type:
              row.operation === "add" ? "add_stock" : "remove_stock",
            quantity_change: signedChange,
            quantity_before: beforeQty,
            quantity_after: afterQty,
            reason: fullReason,
          });

        if (movementError) {
          await supabase
            .from("product_variants")
            .update({ stock_quantity: beforeQty })
            .eq("id", row.variant_id);

          throw new Error(
            `تم إلغاء تعديل المقاس ${row.size} لأن تسجيل حركة المخزون فشل: ${movementError.message}`
          );
        }
      }

      setStockItem(null);
      setStockInputs({});
      setStockReason("");
      setStockNote("");
      setMessage("تم تعديل المخزون وتسجيل الحركة بنجاح");
      await loadData();
    } catch (error: any) {
      setMessage(error?.message || "حدث خطأ أثناء تعديل المخزون");
      await loadData();
    } finally {
      setSavingStock(false);
    }
  }

  async function handleEditProduct() {
    if (!editItem) return;

    if (!editName || !editType || !editColor || !editCostPrice || !editSalePrice) {
      setMessage("يجب تعبئة الاسم، النوع، اللون، التكلفة، وسعر البيع");
      return;
    }

    setMessage("جاري تعديل المنتج...");

    const { error: productError } = await supabase
      .from("products")
      .update({
        name: editName,
        model: editModel || null,
        product_type: editType,
        fabric: editFabric || null,
        default_cost_price: Number(editCostPrice),
        default_sale_price: Number(editSalePrice),
      })
      .eq("id", editItem.product_id);

    if (productError) {
      setMessage("خطأ في تعديل بيانات المنتج: " + productError.message);
      return;
    }

    const { error: variantsError } = await supabase
      .from("product_variants")
      .update({
        color: editColor,
        cost_price: Number(editCostPrice),
        sale_price: Number(editSalePrice),
      })
      .in("id", editItem.variant_ids);

    if (variantsError) {
      setMessage("خطأ في تعديل المقاسات: " + variantsError.message);
      return;
    }

    setEditItem(null);
    setMessage("تم تعديل المنتج بنجاح");
    await loadData();
  }

  async function handleDeleteProduct() {
    if (!deleteItem) return;

    setMessage("جاري حذف المنتج...");

    const { error: variantsError } = await supabase
      .from("product_variants")
      .delete()
      .in("id", deleteItem.variant_ids);

    if (variantsError) {
      setMessage("خطأ في حذف المقاسات: " + variantsError.message);
      return;
    }

    const { data: remainingVariants } = await supabase
      .from("product_variants")
      .select("id")
      .eq("product_id", deleteItem.product_id)
      .limit(1);

    if (!remainingVariants || remainingVariants.length === 0) {
      await supabase
        .from("products")
        .delete()
        .eq("id", deleteItem.product_id);
    }

    setDeleteItem(null);
    setMessage("تم حذف المنتج بنجاح");
    await loadData();
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">المنتجات</h1>
          <p className="mt-2 text-neutral-400">
            عرض المنتجات مجمعة حسب المنتج واللون
          </p>
        </div>

        <a
          href="/products/new"
          className="rounded-xl bg-white px-5 py-3 font-bold text-black"
        >
          + إضافة منتج
        </a>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <input
          className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
          placeholder="بحث باسم المنتج / الكود / اللون"
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

        <button
          className="rounded-xl border border-neutral-700 p-4"
          onClick={() => {
            setSearch("");
            setStoreFilter("");
          }}
        >
          مسح الفلاتر
        </button>
      </div>

      {message && <p className="mb-4 text-yellow-400">{message}</p>}

      {loading ? (
        <div className="rounded-2xl bg-neutral-900 p-8 text-center text-neutral-400">
          جاري تحميل المنتجات...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-2xl bg-neutral-900 p-8 text-center text-neutral-400">
          لا توجد منتجات
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {filteredProducts.map((item) => (
            <div
              key={item.key}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            >
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.product?.name || "product"}
                  className="mb-4 h-56 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="mb-4 flex h-56 w-full items-center justify-center rounded-xl bg-neutral-800 text-neutral-500">
                  بدون صورة
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xl font-bold">{item.product?.name || "-"}</p>
                <p className="text-sm text-neutral-400">
                  {item.product?.model || "بدون موديل"} / {item.color}
                </p>
                <p className="text-sm text-neutral-400">
                  النوع: {item.product?.product_type || "-"}
                </p>
                <p className="text-sm text-neutral-400">
                  المتجر: {item.store?.name || "-"}
                </p>
                <p className="font-bold">السعر: {item.sale_price} د.ل</p>
                <p className="font-bold">إجمالي الكمية: {item.total_stock}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {item.sizes.map((s: any) => (
                  <span
                    key={s.variant_id}
                    className="rounded-lg bg-neutral-800 px-3 py-2 text-sm"
                  >
                    {s.size}: {s.quantity}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  onClick={() => openEdit(item)}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold"
                >
                  تعديل
                </button>

                <button
                  onClick={() => openStockAdjustment(item)}
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold"
                >
                  تعديل المخزون
                </button>

                <button
                  onClick={() => setDeleteItem(item)}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {stockItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
          <div className="mx-auto my-8 w-full max-w-3xl rounded-2xl bg-neutral-900 p-6">
            <h2 className="mb-2 text-2xl font-bold">تعديل المخزون</h2>
            <p className="mb-2 text-neutral-300">
              {stockItem.product?.name} / {stockItem.product?.model || "-"} / {stockItem.color}
            </p>
            <p className="mb-5 text-sm text-neutral-400">
              اختر إضافة أو خصم أمام كل مقاس، ثم اكتب الكمية المطلوبة.
            </p>

            <div className="max-h-[48vh] overflow-y-auto pr-1">
              <div className="grid gap-3">
                {stockItem.sizes.map((sizeRow: any) => {
                  const input = stockInputs[sizeRow.variant_id] || {
                    operation: "add",
                    quantity: "",
                  };

                  const preview =
                    Number(sizeRow.quantity || 0) +
                    (input.operation === "add" ? 1 : -1) *
                      Number(input.quantity || 0);

                  return (
                    <div
                      key={sizeRow.variant_id}
                      className="grid gap-3 rounded-xl bg-neutral-800 p-3 md:grid-cols-4 md:items-center"
                    >
                      <div>
                        <p className="text-lg font-bold">{sizeRow.size}</p>
                        <p className="text-sm text-neutral-400">
                          الحالي: {sizeRow.quantity}
                        </p>
                      </div>

                      <select
                        className="rounded-lg bg-neutral-900 p-3"
                        value={input.operation}
                        onChange={(e) =>
                          updateStockInput(
                            sizeRow.variant_id,
                            "operation",
                            e.target.value
                          )
                        }
                      >
                        <option value="add">➕ إضافة</option>
                        <option value="subtract">➖ خصم</option>
                      </select>

                      <input
                        className="rounded-lg bg-neutral-900 p-3"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="الكمية"
                        value={input.quantity}
                        onChange={(e) =>
                          updateStockInput(
                            sizeRow.variant_id,
                            "quantity",
                            e.target.value
                          )
                        }
                      />

                      <div
                        className={`rounded-lg p-3 text-center text-sm ${
                          preview < 0
                            ? "bg-red-950 text-red-300"
                            : "bg-neutral-900"
                        }`}
                      >
                        بعد التعديل: <span className="font-bold">{preview}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={stockReason}
                onChange={(e) => setStockReason(e.target.value)}
              >
                <option value="">اختر سبب التعديل *</option>
                {STOCK_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>

              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder={
                  stockReason === "سبب آخر"
                    ? "اكتب السبب بالتفصيل *"
                    : "ملاحظة إضافية (اختياري)"
                }
                value={stockNote}
                onChange={(e) => setStockNote(e.target.value)}
              />
            </div>

            <div className="sticky bottom-0 mt-6 flex gap-3 border-t border-neutral-800 bg-neutral-900 pt-4">
              <button
                onClick={handleStockAdjustment}
                disabled={savingStock}
                className="flex-1 rounded-xl bg-white p-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingStock ? "جاري الحفظ..." : "حفظ تعديل المخزون"}
              </button>
              <button
                onClick={closeStockAdjustment}
                disabled={savingStock}
                className="flex-1 rounded-xl border border-neutral-700 p-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-neutral-900 p-6">
            <h2 className="mb-5 text-2xl font-bold">تعديل المنتج</h2>

            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-xl bg-neutral-800 p-4" placeholder="اسم المنتج" value={editName} onChange={(e) => setEditName(e.target.value)} />
              <input className="rounded-xl bg-neutral-800 p-4" placeholder="الموديل" value={editModel} onChange={(e) => setEditModel(e.target.value)} />

              <select className="rounded-xl bg-neutral-800 p-4" value={editType} onChange={(e) => setEditType(e.target.value)}>
                <option value="">نوع المنتج</option>
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>

              <input className="rounded-xl bg-neutral-800 p-4" placeholder="اللون" value={editColor} onChange={(e) => setEditColor(e.target.value)} />

              <input className="rounded-xl bg-neutral-800 p-4" type="number" placeholder="تكلفة القطعة" value={editCostPrice} onChange={(e) => setEditCostPrice(e.target.value)} />
              <input className="rounded-xl bg-neutral-800 p-4" type="number" placeholder="سعر البيع" value={editSalePrice} onChange={(e) => setEditSalePrice(e.target.value)} />

              <input className="rounded-xl bg-neutral-800 p-4 md:col-span-2" placeholder="الخامة" value={editFabric} onChange={(e) => setEditFabric(e.target.value)} />
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={handleEditProduct} className="flex-1 rounded-xl bg-white p-3 font-bold text-black">
                حفظ التعديل
              </button>
              <button onClick={() => setEditItem(null)} className="flex-1 rounded-xl border border-neutral-700 p-3">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-neutral-900 p-6">
            <h2 className="mb-3 text-2xl font-bold text-red-400">حذف المنتج</h2>
            <p className="mb-6 text-neutral-300">
              هل أنت متأكد من حذف {deleteItem.product?.name} / {deleteItem.color}؟
            </p>

            <div className="flex gap-3">
              <button onClick={handleDeleteProduct} className="flex-1 rounded-xl bg-red-600 p-3 font-bold">
                نعم، حذف
              </button>
              <button onClick={() => setDeleteItem(null)} className="flex-1 rounded-xl border border-neutral-700 p-3">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
