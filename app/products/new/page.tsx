"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const COLORS = [
  "أسود", "أبيض", "كحلي", "وردي", "موف", "بيج", "رمادي", "أحمر", "أخضر", "بني",
  "سماوي", "زيتي", "كيوي", "فسفوري", "بني غامق", "فوشيا", "نود", "برغندي",
];

const SIZES = [
  "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL",
  ...Array.from({ length: 25 }, (_, i) => String(i + 36)),
];

const PRODUCT_TYPES = ["بيجامة", "عباية", "بدلة", "حقيبة", "حذاء", "أخرى"];

export default function NewProductPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const [storeId, setStoreId] = useState("");
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [productType, setProductType] = useState("");
  const [color, setColor] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [fabric, setFabric] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  const [sizeRows, setSizeRows] = useState(
    SIZES.map((size) => ({ size, quantity: "" }))
  );

  const selectedSizeRows = useMemo(() => {
    return sizeRows.filter((row) => Number(row.quantity) > 0);
  }, [sizeRows]);

  useEffect(() => {
    async function loadStores() {
      const { data } = await supabase
        .from("stores")
        .select("id, name")
        .order("name");

      setStores(data || []);
    }

    loadStores();
  }, []);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function updateSizeQuantity(size: string, quantity: string) {
    setSizeRows((prev) =>
      prev.map((row) => (row.size === size ? { ...row, quantity } : row))
    );
  }

  function resetForm() {
    setSku("");
    setName("");
    setModel("");
    setProductType("");
    setColor("");
    setCostPrice("");
    setSalePrice("");
    setFabric("");
    setImageFile(null);
    setPreview("");
    setSizeRows(SIZES.map((size) => ({ size, quantity: "" })));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("جاري حفظ المنتج...");

    if (!storeId || !name || !productType || !color || !costPrice || !salePrice) {
      setMessage("يجب تعبئة المتجر، اسم المنتج، النوع، اللون، التكلفة، وسعر البيع");
      return;
    }

    if (selectedSizeRows.length === 0) {
      setMessage("يجب إدخال كمية لمقاس واحد على الأقل");
      return;
    }

    const finalSku = sku || `PRD-${Date.now()}`;
    let imageUrl = "";

    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${Date.now()}-${finalSku}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, imageFile);

      if (uploadError) {
        setMessage("خطأ في رفع الصورة: " + uploadError.message);
        return;
      }

      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);

      imageUrl = data.publicUrl;
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        store_id: storeId,
        sku: finalSku,
        name,
        model: model || null,
        product_type: productType,
        fabric: fabric || null,
        main_image_url: imageUrl || null,
        default_cost_price: Number(costPrice),
        default_sale_price: Number(salePrice),
        is_active: true,
      })
      .select()
      .single();

    if (productError) {
      setMessage("خطأ في حفظ المنتج: " + productError.message);
      return;
    }

    const variantsToInsert = selectedSizeRows.map((row) => ({
      store_id: storeId,
      product_id: product.id,
      color,
      size: row.size,
      stock_quantity: Number(row.quantity),
      cost_price: Number(costPrice),
      sale_price: Number(salePrice),
      image_url: imageUrl || null,
      is_active: true,
    }));

    const { error: variantError } = await supabase
      .from("product_variants")
      .insert(variantsToInsert);

    if (variantError) {
      setMessage("تم حفظ المنتج، لكن حدث خطأ في حفظ المقاسات: " + variantError.message);
      return;
    }

    setMessage("تم حفظ المنتج وكل المقاسات في المخزون بنجاح");
    resetForm();
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">إضافة منتج إلى المخزون</h1>
          <p className="mt-2 text-neutral-400">
            أدخل المنتج مرة واحدة، ثم أضف كميات المقاسات في نفس الصفحة
          </p>
        </div>

        <a href="/products" className="rounded-xl border border-neutral-700 px-5 py-3">
          عرض المنتجات
        </a>
      </div>

      <form onSubmit={handleSubmit} className="grid max-w-6xl grid-cols-1 gap-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <select
            className="rounded-xl bg-neutral-900 p-4"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">اختر المتجر</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>

          <input
            className="rounded-xl bg-neutral-900 p-4"
            placeholder="كود المنتج اختياري - يضاف تلقائيًا إذا تركته فارغًا"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />

          <input
            className="rounded-xl bg-neutral-900 p-4"
            placeholder="اسم المنتج مثل: Dior"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="rounded-xl bg-neutral-900 p-4"
            placeholder="الموديل اختياري مثل: Oversize"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />

          <select
            className="rounded-xl bg-neutral-900 p-4"
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
          >
            <option value="">نوع المنتج</option>
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl bg-neutral-900 p-4"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          >
            <option value="">اختر اللون</option>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            className="rounded-xl bg-neutral-900 p-4"
            type="number"
            placeholder="تكلفة القطعة"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
          />

          <input
            className="rounded-xl bg-neutral-900 p-4"
            type="number"
            placeholder="سعر البيع"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />

          <input
            className="rounded-xl bg-neutral-900 p-4 md:col-span-2"
            placeholder="الخامة اختياري"
            value={fabric}
            onChange={(e) => setFabric(e.target.value)}
          />
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <label className="mb-3 block text-neutral-300">صورة المنتج / اللون</label>
          <input type="file" accept="image/*" onChange={handleImageChange} />
          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="mt-4 h-56 w-56 rounded-xl object-cover"
            />
          )}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">المقاسات والكميات</h2>
              <p className="mt-1 text-sm text-neutral-400">
                اكتب الكمية فقط للمقاسات المتوفرة. المقاسات الفارغة لن تُحفظ.
              </p>
            </div>

            <p className="rounded-xl bg-neutral-800 px-4 py-2 text-sm">
              المقاسات المدخلة: {selectedSizeRows.length}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {sizeRows.map((row) => (
              <div key={row.size} className="rounded-xl bg-neutral-800 p-3">
                <label className="mb-2 block font-bold">{row.size}</label>
                <input
                  className="w-full rounded-lg bg-neutral-900 p-3"
                  type="number"
                  min="0"
                  placeholder="الكمية"
                  value={row.quantity}
                  onChange={(e) => updateSizeQuantity(row.size, e.target.value)}
                />
              </div>
            ))}
          </div>
        </section>

        {message && <p className="text-yellow-400">{message}</p>}

        <button className="rounded-xl bg-white p-4 font-bold text-black">
          حفظ المنتج في المخزون
        </button>
      </form>
    </main>
  );
}
