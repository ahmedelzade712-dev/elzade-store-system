"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const COLORS = [
  "أسود",
  "أبيض",
  "كحلي",
  "وردي",
  "موف",
  "بيج",
  "رمادي",
  "أحمر",
  "أخضر",
  "بني",
  "سماوي",
  "زيتي",
  "كيوي",
  "فسفوري",
  "بني غامق",
  "فوشيا",
  "نود",
  "برغندي",
  "أزرق",
  "بنفسجي",
  "جيشي",
  "موف هادي",
  "كريمي",
  "بطاطي",
  "بيبي بلو",
  "قهوي غامق",
  "بني محروق",
  "نيروزي",
  "برتقالي",
  "أصفر",
  "كشميري",
  "زهري",
  "عنابي",
];

const SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  ...Array.from({ length: 25 }, (_, i) => String(i + 36)),
];

const PRODUCT_TYPES = ["بيجامة", "عباية", "بدلة", "حقيبة", "حذاء", "أخرى"];

export default function NewProductPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [storeId, setStoreId] = useState("");
  const [sku, setSku] = useState("");
  const [designCode, setDesignCode] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [description, setDescription] = useState("");
  const [visualFeatures, setVisualFeatures] = useState("");
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
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .order("name");

      if (error) {
        setMessage("تعذر تحميل المتاجر: " + error.message);
        return;
      }

      setStores(data || []);
    }

    loadStores();
  }, []);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("الملف المختار يجب أن يكون صورة");
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImageFile(file);
    setPreview(URL.createObjectURL(file));
    setMessage("");
  }

  function updateSizeQuantity(size: string, quantity: string) {
    setSizeRows((prev) =>
      prev.map((row) => (row.size === size ? { ...row, quantity } : row))
    );
  }

  function resetForm() {
    setSku("");
    setDesignCode("");
    setName("");
    setModel("");
    setDescription("");
    setVisualFeatures("");
    setProductType("");
    setColor("");
    setCostPrice("");
    setSalePrice("");
    setFabric("");
    setImageFile(null);

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setPreview("");
    setSizeRows(SIZES.map((size) => ({ size, quantity: "" })));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (saving) return;

    setMessage("");

    const requiredMissing =
      !storeId ||
      !designCode.trim() ||
      !name.trim() ||
      !productType ||
      !color ||
      !fabric.trim() ||
      !description.trim() ||
      !visualFeatures.trim() ||
      !costPrice ||
      !salePrice ||
      !imageFile;

    if (requiredMissing) {
      setMessage(
        "يجب تعبئة المتجر، كود التصميم، اسم المنتج، النوع، اللون، الخامة، وصف المنتج، العلامات المميزة للـAI، التكلفة، سعر البيع، وصورة المنتج"
      );
      return;
    }

    if (selectedSizeRows.length === 0) {
      setMessage("يجب إدخال كمية لمقاس واحد على الأقل");
      return;
    }

    const numericCostPrice = Number(costPrice);
    const numericSalePrice = Number(salePrice);

    if (
      !Number.isFinite(numericCostPrice) ||
      numericCostPrice < 0 ||
      !Number.isFinite(numericSalePrice) ||
      numericSalePrice < 0
    ) {
      setMessage("التكلفة وسعر البيع يجب أن يكونا أرقامًا صحيحة");
      return;
    }

    setSaving(true);
    setMessage("جاري حفظ المنتج...");

    const finalSku = sku.trim() || `PRD-${Date.now()}`;
    let imageUrl = "";
    let uploadedFileName = "";
    let createdProductId = "";

    try {
      const fileExt = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
      uploadedFileName = `${Date.now()}-${finalSku}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(uploadedFileName, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error("خطأ في رفع الصورة: " + uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(uploadedFileName);

      imageUrl = publicUrlData.publicUrl;

      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          store_id: storeId,
          sku: finalSku,
          design_code: designCode.trim(),
          name: name.trim(),
          model: model.trim() || null,
          description: description.trim(),
          visual_features: visualFeatures.trim(),
          product_type: productType,
          fabric: fabric.trim(),
          main_image_url: imageUrl,
          default_cost_price: numericCostPrice,
          default_sale_price: numericSalePrice,
          is_active: true,
        })
        .select("id")
        .single();

      if (productError || !product) {
        throw new Error("خطأ في حفظ المنتج: " + (productError?.message || "خطأ غير معروف"));
      }

      createdProductId = product.id;

      const variantsToInsert = selectedSizeRows.map((row) => ({
        store_id: storeId,
        product_id: product.id,
        color,
        size: row.size,
        stock_quantity: Number(row.quantity),
        cost_price: numericCostPrice,
        sale_price: numericSalePrice,
        image_url: imageUrl,
        is_active: true,
      }));

      const { error: variantError } = await supabase
        .from("product_variants")
        .insert(variantsToInsert);

      if (variantError) {
        throw new Error("خطأ في حفظ المقاسات: " + variantError.message);
      }

      setMessage("تم حفظ المنتج وكل المقاسات في المخزون بنجاح");
      resetForm();
    } catch (error: any) {
      if (createdProductId) {
        await supabase.from("products").delete().eq("id", createdProductId);
      }

      if (uploadedFileName) {
        await supabase.storage.from("product-images").remove([uploadedFileName]);
      }

      setMessage(error?.message || "حدث خطأ أثناء حفظ المنتج");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-neutral-950 p-8 text-white">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">إضافة منتج إلى المخزون</h1>
          <p className="mt-2 text-neutral-400">
            أدخل بيانات اللون الحالي بدقة. استخدم نفس كود التصميم لكل ألوان نفس التصميم.
          </p>
        </div>

        <a
          href="/products"
          className="rounded-xl border border-neutral-700 px-5 py-3"
        >
          عرض المنتجات
        </a>
      </div>

      <form onSubmit={handleSubmit} className="grid max-w-6xl grid-cols-1 gap-6">
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-xl font-bold">البيانات الأساسية</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">المتجر *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                required
              >
                <option value="">اختر المتجر</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">كود المنتج</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="اختياري - يضاف تلقائيًا إذا تركته فارغًا"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">كود التصميم *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: LIENE-R-001"
                value={designCode}
                onChange={(e) => setDesignCode(e.target.value)}
                required
              />
              <span className="text-xs text-neutral-500">
                جميع ألوان نفس التصميم يجب أن تحمل نفس الكود.
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">اسم المنتج *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: بدلة لينو"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">نوع المنتج *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                required
              >
                <option value="">اختر نوع المنتج</option>
                {PRODUCT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">الموديل / القصة</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="اختياري - مثال: Oversize"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">الخامة *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: لينو / ستان / قطن"
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">اللون *</span>
              <select
                className="rounded-xl bg-neutral-800 p-4"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                required
              >
                <option value="">اختر اللون</option>
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-2 text-xl font-bold">بيانات تساعد الـAI على فهم التصميم</h2>
          <p className="mb-4 text-sm text-neutral-400">
            الصورة هي المرجع الأساسي. هذه الحقول تساعد الـAI عند وجود تصميمات متشابهة.
          </p>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">وصف المنتج *</span>
              <textarea
                className="min-h-28 rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: بدلة لينو بقصة واسعة، ياقة V، رابطة جانبية، بدون أزرار ظاهرة، بنطال واسع"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">العلامات المميزة للـAI *</span>
              <textarea
                className="min-h-24 rounded-xl bg-neutral-800 p-4"
                placeholder="مثال: ياقة V | رابطة جانبية | بدون أزرار | أكمام واسعة | بنطال واسع"
                value={visualFeatures}
                onChange={(e) => setVisualFeatures(e.target.value)}
                required
              />
              <span className="text-xs text-neutral-500">
                اكتب فقط العلامات البصرية التي تميز التصميم. لا تكرر اللون هنا.
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="mb-4 text-xl font-bold">السعر</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">تكلفة القطعة *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                type="number"
                min="0"
                step="0.01"
                placeholder="تكلفة القطعة"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-neutral-300">سعر البيع *</span>
              <input
                className="rounded-xl bg-neutral-800 p-4"
                type="number"
                min="0"
                step="0.01"
                placeholder="سعر البيع"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <label className="mb-3 block font-bold">صورة المنتج / اللون *</label>
          <p className="mb-4 text-sm text-neutral-400">
            ضع أوضح صورة لهذا اللون. الصورة نفسها ستُستخدم لاحقًا كمرجع بصري للـAI.
          </p>

          <input type="file" accept="image/*" onChange={handleImageChange} required />

          {preview && (
            <img
              src={preview}
              alt="Preview"
              className="mt-4 h-64 w-64 rounded-xl object-cover"
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

        {message && (
          <div className="rounded-xl border border-yellow-700 bg-yellow-950/30 p-4 text-yellow-300">
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-white p-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "جاري الحفظ..." : "حفظ المنتج في المخزون"}
        </button>
      </form>
    </main>
  );
}
